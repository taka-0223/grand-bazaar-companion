/**
 * Strictly read-only access to the existing App's local mirror / IndexedDB.
 * Never opens a new DB, migrates a schema or writes a backup.
 */
const DB='gb-board-db',KEY='gb-board-data';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);

function safeParse(raw){
  if(typeof raw!=='string'||raw.length>2*1024*1024)return null;
  try {const parsed=JSON.parse(raw);return object(parsed)?parsed:null;}
  catch {return null;}
}

export function stateFromBackupText(text){
  const parsed=safeParse(text);
  if(!parsed)throw new Error('backup_invalid');
  if(parsed.format!==undefined||parsed.state!==undefined){
    if(parsed.format!=='grand-bazaar-companion-backup'||
       parsed.formatVersion!==1||!object(parsed.state))
      throw new Error('backup_invalid');
    return parsed.state;
  }
  return parsed;
}

export async function readExistingIndexedDB(api=globalThis.indexedDB){
  if(typeof api?.databases!=='function')return null;
  let dbs;
  try {dbs=await api.databases();}
  catch {return null;}
  if(!Array.isArray(dbs)||!dbs.some(x=>x.name===DB))return null;
  return new Promise(resolve=>{
    let settled=false;
    const finish=x=>{if(!settled){settled=true;resolve(x)}};
    let request;
    try{request=api.open(DB);}catch{return finish(null)}
    request.onupgradeneeded=()=>{
      // Even if a database is deleted concurrently, never create one.
      try{request.transaction?.abort();}catch{}
      finish(null);
    };
    request.onerror=()=>finish(null);
    request.onblocked=()=>finish(null);
    request.onsuccess=()=>{
      const db=request.result;
      if(settled){db.close();return}
      if(!db.objectStoreNames.contains('kv')){db.close();return finish(null)}
      try{
        const tx=db.transaction('kv','readonly');
        const get=tx.objectStore('kv').get('state');
        get.onsuccess=()=>{const value=get.result;db.close();finish(object(value)?value:null)};
        get.onerror=()=>{db.close();finish(null)};
        tx.onabort=()=>{db.close();finish(null)};
      }catch{db.close();finish(null)}
    };
  });
}

export async function readDevicePlayerState({
  local=globalThis.localStorage,idb=globalThis.indexedDB
}={}){
  let mirror=null;
  try{mirror=safeParse(local?.getItem(KEY));}catch{}
  const durable=await readExistingIndexedDB(idb);
  if(!durable)return mirror;
  if(!mirror)return durable;
  // The app writes both stores; select the newer recorded state.
  // Never treat the backup timestamp as the game date.
  const a=typeof durable.updatedAt==='string'?durable.updatedAt:'';
  const b=typeof mirror.updatedAt==='string'?mirror.updatedAt:'';
  return b>a?mirror:durable;
}
