import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert.ok(start>=0&&end>start,a);return html.slice(start,end)}
const storage=section('let dbPromise=null;','function bindAutosave(');
const editors=section('function bindAutosave(','async function hydrate(');
const undo=section('function showUndo(','function show(id)');
const capture=section('function captureStatus(','function confirmDelete(');
const drag=section('function bindSheetDrag(){','function syncKeyboardInset(');
const modal=section('let modalGeneration=','async function storageHealth(');
const hydrate=section('async function hydrate(){','const APP_ENTITY_LABELS=');
const reorder=section('function moveActionInPlan(','function bindActionReorder(');
const importSource=section('function importJson(','function activeScreenId(');
const homeNav=section('function openHomeNav(','const CAL_SEASONS=');
const navStart=html.lastIndexOf("document.querySelectorAll('.navbtn').forEach");
const navSource=html.slice(navStart,html.indexOf(';render();hydrate();',navStart)+1);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const escape=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){return {schemaVersion:7,updatedAt:'2026-01-01T00:00:00Z',ui:{memoFilter:'active'},
  captures:[{id:'a',text:'  元の本文\n★  ',status:'active',children:[{id:'child',text:'元の子',done:false}]},
    {id:'b',text:'別のメモ',status:'active',children:[]}],
  goals:[],actions:[{id:'one',text:'1',done:false},{id:'two',text:'2',done:false}],requirements:{},
  playerState:{synthetic:{count:3}},knownRecipes:['synthetic']};}
class Element{
  constructor(id='',attrs={}){this.id=id;this.dataset={};this.value='';this.textContent='';this.listeners=new Map();this.style={};this.scrollTop=0;this.offsetHeight=600;this.scrollHeight=600;this.clientHeight=600;this.classes=new Set((attrs.class||'').split(' ').filter(Boolean));this.nodes=[];
    this.classList={add:(...ns)=>ns.forEach(n=>this.classes.add(n)),remove:(...ns)=>ns.forEach(n=>this.classes.delete(n)),contains:n=>this.classes.has(n),toggle:(n,on)=>{if(on??!this.classes.has(n))this.classes.add(n);else this.classes.delete(n)}};
    for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=decode(v);
    this.value=decode(attrs.value||'');this.checked='checked' in attrs;
  }
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn)}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn)}
  dispatch(type,props={}){const event={target:this,preventDefault(){this.defaultPrevented=true},stopPropagation(){},...props};const work=[...(this.listeners.get(type)||[])].map(fn=>fn(event));const method=this['on'+type];if(method)work.push(method(event));return Promise.all(work)}
  click(){return this.dispatch('click')}
  focus(){}
  blur(){return this.dispatch('blur')}
  querySelectorAll(q){return this.nodes.filter(el=>q.startsWith('#')?el.id===q.slice(1):el.classes.has(q.slice(1)))}
  querySelector(q){return this.querySelectorAll(q)[0]||null}
  closest(){return null}
  setPointerCapture(){}
  releasePointerCapture(){}
  set innerHTML(markup){this.markup=markup;this.nodes=[];const tag=/<(input|textarea|button|div)\b([^>]*)(?:>([^<]*)|\/?>)/g;let m;
    while((m=tag.exec(markup))){const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
      const el=new Element(attrs.id||'',attrs);el.textContent=decode(m[3]||'');if(m[1]==='textarea')el.value=el.textContent;this.nodes.push(el)}
  }
  get innerHTML(){return this.markup||''}
}
function harness({localFails=false,idbFails=false,names={}}={}){
  let localThrows=localFails,dbFails=idbFails;
  const local=new Map(),durable=new Map(),pending=[],timers=new Map(),trace=[];let timerId=0;
  const root={};for(const id of ['modal','modalSheet','inbox','undo','undoBtn','undoText','saveStatus'])root[id]=new Element(id);
  const document={querySelectorAll:q=>[...Object.values(root),...root.modalSheet.nodes,...root.inbox.nodes].filter(el=>q.startsWith('.')?el.classes.has(q.slice(1)):el.id===q.slice(1)),documentElement:{style:{setProperty(){}}}};
  const $=q=>q.startsWith('#')?(root[q.slice(1)]||root.modalSheet.querySelector(q)||root.inbox.querySelector(q)):document.querySelectorAll(q)[0];
  const indexedDB={open(){const req={};queueMicrotask(()=>{req.result={objectStoreNames:{contains:()=>true},close(){},transaction(_store,mode){const tx={};tx.objectStore=()=>({put(value,key){const record=clone(value);pending.push({record,key,resolve(ok=!dbFails){if(ok){durable.set(key,record);tx.oncomplete?.()}else tx.onerror?.()}})},get(key){const r={};queueMicrotask(()=>{r.result=durable.get(key)||null;r.onsuccess?.()});return r}});return tx}};req.onsuccess?.()});return req}};
  const window={indexedDB,addEventListener(){}};
  const ctx={state:fixture(),undoSnapshot:null,undoTimer:null,needsStableMigration:false,window,document,indexedDB,
    DBNAME:'gb-board-db',OLD_DBS:[],STORAGE:'gb-board-data',INITIAL:fixture(),
    localStorage:{setItem(k,v){if(localThrows)throw Error('quota');local.set(k,v)},getItem:k=>local.get(k)},
    $,$$:q=>document.querySelectorAll(q),clone,migrate:clone,captureMigrationSnapshot(){},
    PERF_DIAG:{begin:()=>0,record(){},markReady(){}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
    rname:id=>names[id]||id,toast:text=>trace.push(['toast',text]),esc:escape,touchRecent:()=>trace.push(['recent']),
    confirm:()=>true,confirmDelete:(_msg,fn)=>fn(),Element,getComputedStyle:()=>({overflowY:'visible'}),performance:{now:()=>100},
    seasonReminderInboxHtml:()=>'',bindSeasonReminderUi(){},
    show:id=>trace.push(['screen',id]),renderScreen:id=>trace.push(['draw',id]),
    syncLinkedRequestMasterDetails(){},alert:msg=>trace.push(['alert',msg]),
    FileReader:class{readAsText(f){this.result=f.data;this.onload()}},
    render(){ctx.state=clone(ctx.state);ctx.inbox();trace.push(['render'])}
  };Object.assign(window,{setTimeout:ctx.setTimeout,closeModal:undefined});
  // window is the vm global for the real closeModal assignment.
  Object.assign(ctx,{closeModal:(...args)=>window.closeModal(...args)});
  runInNewContext(section('function norm(', 'function findByName(')+storage+editors+undo+capture+drag+modal+hydrate+reorder+importSource+homeNav,ctx);
  const evaluate=src=>runInNewContext(src,ctx);
  return {ctx,root,$,local,durable,pending,timers,trace,evaluate,
    input(el,text){if(el.classes.has('subInlineEditable'))el.textContent=text;else el.value=text;return el.dispatch('input')},
    setFailures(localFail,dbFail){localThrows=localFail;dbFails=dbFail},
    async tick(){await new Promise(resolve=>setImmediate(resolve))},
    runTimers(ms=400){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn()}},
    async until(check){for(let i=0;i<60;i++){if(check())return;await this.tick()}assert.fail('Unresolved test condition')},
    async finishWrites(){for(let i=0;i<40;i++){await this.tick();const next=pending.find(p=>!p.done);if(next){next.done=true;next.resolve()}else if(!evaluate('memoExitPromise'))return}assert.fail('Writes did not settle')},
    async close(){const done=$('#closeCaptureEditor').click();await this.finishWrites();await done}
  };
}
const body=h=>h.$('#capText');
const current=h=>h.ctx.state.captures.find(c=>c.id==='a');
const saved=h=>JSON.parse(h.local.get('gb-board-data'));

export {harness,fixture,Element,body,current,saved,clone,html,navSource};
