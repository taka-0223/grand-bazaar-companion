// Player-authored farm records. Keep this independent of unrevealed Master entries:
// a Master name can be matched only after the player has typed it.
const RECORD_BOOK_RANKS=[
  {id:'',label:'未記録'},
  {id:'bronze',label:'ブロンズ'},
  {id:'silver',label:'シルバー'},
  {id:'gold',label:'ゴールド'}
];
let recordBookView=null,recordBookEditor=null,recordBookExitPromise=null;

function normalizePlayerRecords(x){
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const r=obj(x.playerRecords),fields=obj(r.fields),barn=obj(r.barn),facilities=obj(r.facilities),tools=obj(r.tools);
  x.playerRecords={
    ...r,
    fields:{...fields,note:typeof fields.note==='string'?fields.note:'',entries:Array.isArray(fields.entries)?fields.entries:[],
      crops:Array.isArray(fields.crops)?fields.crops:[]},
    barn:{...barn,animals:Array.isArray(barn.animals)?barn.animals:[],contestRankByAnimalId:obj(barn.contestRankByAnimalId)},
    facilities:{...facilities,discoveredIds:Array.isArray(facilities.discoveredIds)?facilities.discoveredIds:[],completedIds:Array.isArray(facilities.completedIds)?facilities.completedIds:[],discoveredShopIds:Array.isArray(facilities.discoveredShopIds)?facilities.discoveredShopIds:[],notesById:obj(facilities.notesById),customEntries:Array.isArray(facilities.customEntries)?facilities.customEntries:[]},
    tools:{...tools,ownedStageById:obj(tools.ownedStageById),discoveredUpgradeIds:Array.isArray(tools.discoveredUpgradeIds)?tools.discoveredUpgradeIds:[],
      notesById:obj(tools.notesById),customStageById:obj(tools.customStageById)}
  };
  return x.playerRecords;
}

function recordBookReset(){
  recordBookView=null;
  if(recordBookEditor){recordBookEditor.dispose();recordBookEditor=null}
}

// Match the existing memo editor's contract: a failed write keeps the visible draft.
async function leaveRecordBook(next){
  if(recordBookExitPromise)return recordBookExitPromise;
  const editor=recordBookEditor;
  if(editor?.composing){toast('文字の変換を確定してから操作してください');return false}
  recordBookExitPromise=(async()=>{
    try{
      if(editor&&!await editor.flush()){
        toast('保存できませんでした。入力を残しています。もう一度操作してください');
        return false;
      }
      if(editor){editor.dispose();if(recordBookEditor===editor)recordBookEditor=null}
      await next();
      return true;
    }catch(_){updateSaveStatus('保存失敗');toast('操作に失敗しました。もう一度お試しください');return false}
    finally{recordBookExitPromise=null}
  })();
  return recordBookExitPromise;
}
function deferRecordBookNavigation(next){
  if(!recordBookEditor)return false;
  void leaveRecordBook(next);
  return true;
}
function openRecordBook(view){
  if(deferMemoNavigation(()=>openRecordBook(view)))return;
  if(deferRecordBookNavigation(()=>openRecordBook(view)))return;
  recordBookView=view;
  inbox();
  window.scrollTo({top:0,behavior:'instant'});
}
function recordBookShell(title,description){
  return `<div class="recordBookBack"><button class="miniLink recordBookBackButton" type="button">← メモに戻る</button></div>
    <div class="pageHead"><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;
}
function bindRecordBookBack(){
  $('#inbox .recordBookBackButton')?.addEventListener('click',()=>openRecordBook(null));
}
function recordBookNextId(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9)}

function renderRecordBookHub(){
  const r=normalizePlayerRecords(state),people=knownResidentNames().length;
  const done=r.facilities.customEntries.filter(e=>e?.completed).length;
  const configured=Object.keys(r.tools.ownedStageById).length+Object.keys(r.tools.customStageById).filter(id=>!Object.hasOwn(r.tools.ownedStageById,id)).length;
  const section=document.createElement('section');
  section.className='section recordBookHub';
  section.innerHTML=`<div class="section-head"><h2>記録・確認</h2><span class="tiny muted">自分の牧場の記録</span></div>
    <div class="recordBookGrid">
      <button class="recordBookLink" data-record-book="residents" type="button"><span>👤 住人</span><small>${people}人の記録</small></button>
      <button class="recordBookLink" data-record-book="fields" type="button"><span>🌱 畑</span><small>${r.fields.crops.length}種類を栽培中</small></button>
      <button class="recordBookLink" data-record-book="barn" type="button"><span>🐄 小屋</span><small>${r.barn.animals.length}匹の記録</small></button>
      <button class="recordBookLink" data-record-book="facilities" type="button"><span>🏡 牧場</span><small>アップデート ${done}/${r.facilities.customEntries.length}件完了</small></button>
      <button class="recordBookLink" data-record-book="tools" type="button"><span>🛠 道具</span><small>${configured}種類の記録</small></button>
    </div>`;
  $('#inbox').append(section);
  section.querySelectorAll('[data-record-book]').forEach(b=>b.addEventListener('click',()=>openRecordBook(b.dataset.recordBook)));
}

function renderRecordBookView(){
  if(!recordBookView)return false;
  if(deferRecordBookNavigation(()=>inbox()))return true;
  if(recordBookView==='residents')renderRecordResidents();
  else if(recordBookView==='fields')renderRecordFields();
  else if(recordBookView==='barn')renderRecordBarn();
  else if(recordBookView==='facilities')renderRecordFacilities();
  else if(recordBookView==='tools')renderRecordTools();
  else{recordBookView=null;return false}
  return true;
}

// Only names derived from the player's notes, resident profiles, requests or
// recorded visits appear here. Never enumerate the entire birthday/Master list.
function recordResidentNames(sort='name'){
  const names=knownResidentNames();
  if(sort==='birthday')return names.sort((a,b)=>{
    const x=residentBirthday(a),y=residentBirthday(b);
    const day=v=>v?CAL_SEASONS.indexOf(v.season)*31+v.day:Infinity;
    return day(x)-day(y)||a.localeCompare(b,'ja');
  });
  return names.sort((a,b)=>a.localeCompare(b,'ja'));
}
function renderRecordResidents(){
  const sort=state.ui.recordResidentSort==='birthday'?'birthday':'name',names=recordResidentNames(sort);
  $('#inbox').innerHTML=recordBookShell('住人','出会った人だけを一覧に表示します')+
    `<div class="recordBookToolbar"><div class="recordBookSort" role="group" aria-label="住人の並び順">
      <button type="button" class="recordSortButton ${sort==='name'?'active':''}" data-sort="name" aria-pressed="${sort==='name'}">名前順</button>
      <button type="button" class="recordSortButton ${sort==='birthday'?'active':''}" data-sort="birthday" aria-pressed="${sort==='birthday'}">誕生日順</button>
    </div><button class="btn secondary" id="recordResidentAdd" type="button">＋ 住人を登録</button></div>
    ${names.length?`<div class="recordBookList">${names.map(name=>{
      const bd=residentBirthday(name),profile=residentProfile(name);
      return `<button class="recordBookResident recordBookRow" type="button" data-resident-name="${esc(name)}"><span class="strong">${esc(name)}</span><span class="tiny muted">${bd?`${bd.season} ${bd.day}日`:'誕生日 未確認'}${profile.note?' · メモあり':''}　›</span></button>`;
    }).join('')}</div>`:'<div class="notice">まだ住人の記録がありません。自分で登録するか、お願い・カレンダーから住人を記録すると表示されます。</div>'}`;
  $$('.recordSortButton').forEach(b=>b.addEventListener('click',async()=>{
    if(b.dataset.sort===sort)return;
    const previous=state.ui.recordResidentSort;
    $$('.recordSortButton').forEach(x=>x.disabled=true);
    state.ui.recordResidentSort=b.dataset.sort;
    if(await save())renderRecordResidents();
    else{state.ui.recordResidentSort=previous;renderRecordResidents();toast('保存できませんでした')}
  }));
  $('#recordResidentAdd').addEventListener('click',recordBookAddResident);
  $$('.recordBookResident').forEach(b=>b.addEventListener('click',()=>openResidentCard(b.dataset.residentName)));
  bindRecordBookBack();
}
function recordBookAddResident(){
  modal(`<h3>住人を登録</h3><p class="small muted">ゲーム内で出会った住人の名前を入力してください。未発見の住人は候補に表示しません。</p>
    <div class="field"><label for="recordResidentName">名前</label><input id="recordResidentName" autocomplete="off" placeholder="住人の名前"></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordResidentCancel" type="button">キャンセル</button><button class="btn" id="recordResidentSave" type="button">登録</button></div>`);
  $('#recordResidentCancel').onclick=closeModal;
  $('#recordResidentSave').onclick=async()=>{
    const name=$('#recordResidentName').value.trim();
    if(!name){toast('名前を入力してください');return}
    const prior=state.residentProfiles[name];
    state.residentProfiles[name]={...residentProfile(name),registered:true,updatedAt:new Date().toISOString()};
    if(await save()){closeModal();renderRecordResidents();toast('住人を登録しました')}
    else{if(prior)state.residentProfiles[name]=prior;else delete state.residentProfiles[name];toast('保存できませんでした。もう一度お試しください')}
  };
}

function renderRecordFields(){
  const r=normalizePlayerRecords(state).fields;
  const hasLegacy=!!r.note||r.entries.length>0;
  $('#inbox').innerHTML=recordBookShell('畑','育てているものと数を記録')+
    `<div class="recordBookToolbar"><span class="small muted">栽培中：${r.crops.length}種類</span><button class="btn secondary" id="recordCropAdd" type="button">＋ 栽培を登録</button></div>
    ${r.crops.length?`<div class="recordBookList">${r.crops.map(c=>`<button type="button" class="recordCropRow recordBookRow" data-id="${esc(c.id)}"><span class="strong">${esc(c.name)}</span><span class="recordCropCount">× ${Number(c.count)||0}　›</span></button>`).join('')}</div>`:
      '<div class="notice">栽培している作物や果樹を、自分で登録してください。畑の数や区画は決め打ちしません。</div>'}
    ${hasLegacy?`<details class="recordLegacyNotes"><summary>以前の畑メモ（内容は保存されています）</summary>
      <div class="card recordBookMainNote"><div class="row between"><label for="recordFieldMain">畑全体のメモ</label><span class="tiny muted">自動保存</span></div>
        <textarea id="recordFieldMain" class="recordBookTextarea">${esc(r.note)}</textarea></div>
      ${r.entries.length?`<div class="recordBookList">${r.entries.map(e=>`<div class="recordBookFieldEntry recordBookRow"><button class="recordBookFieldOpen" type="button" data-id="${esc(e.id)}"><span class="strong">${esc(e.title||'名称未設定')}</span><span class="small muted">${esc(e.text||'メモなし')}</span></button></div>`).join('')}</div>`:''}
    </details>`:''}`;
  $('#recordCropAdd').onclick=()=>leaveRecordBook(()=>recordBookCropSheet());
  $$('.recordCropRow').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookCropSheet(b.dataset.id)));
  const main=$('#recordFieldMain');
  if(main)recordBookEditor=bindAutosave([main],async()=>{
    state.playerRecords.fields.note=main.value;
    return save();
  });
  $$('.recordBookFieldOpen').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookFieldSheet(b.dataset.id)));
  bindRecordBookBack();
}
function recordBookCropSheet(id=null){
  const r=normalizePlayerRecords(state).fields,entry=r.crops.find(c=>c?.id===id);
  modal(`<h3>${entry?'栽培を編集':'栽培を登録'}</h3>
    <div class="field"><label for="recordCropName">作物・果樹の名前</label><input id="recordCropName" autocomplete="off" value="${esc(entry?.name||'')}" placeholder="自分が育てているもの"></div>
    <div class="field" style="margin-top:8px"><label for="recordCropCount">植えている数</label><input id="recordCropCount" type="number" inputmode="numeric" min="1" step="1" value="${entry?.count||1}"></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordCropCancel">キャンセル</button>${entry?'<button class="btn ghost" id="recordCropDelete">削除</button>':''}<button class="btn" id="recordCropSave">保存</button></div>`);
  $('#recordCropCancel').onclick=closeModal;
  $('#recordCropSave').onclick=async()=>{
    const name=$('#recordCropName').value.trim(),count=Number($('#recordCropCount').value);
    if(!name){toast('名前を入力してください');return}
    if(!Number.isSafeInteger(count)||count<1){toast('栽培数は1以上の整数で入力してください');return}
    if(r.crops.some(c=>c?.id!==id&&norm(c?.name||'')===norm(name))){toast('登録済みの作物です。数を編集してください');return}
    const before=clone(r.crops),updatedAt=new Date().toISOString();
    if(entry)Object.assign(entry,{name,count,updatedAt});
    else r.crops.push({id:recordBookNextId('crop'),name,count,updatedAt});
    if(await save()){closeModal();renderRecordFields()}
    else{r.crops=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordCropDelete').onclick=()=>{
    if(!confirm('この栽培記録を削除しますか？'))return;
    const before=clone(r.crops);r.crops=r.crops.filter(c=>c.id!==id);
    void save().then(ok=>{
      if(ok){closeModal();renderRecordFields()}
      else{r.crops=before;toast('保存できませんでした。もう一度お試しください')}
    });
  };
}
function recordBookFieldSheet(id=null){
  const entry=state.playerRecords.fields.entries.find(e=>e.id===id);
  modal(`<h3>${entry?'畑メモを編集':'畑メモを追加'}</h3>
    <div class="field"><label for="recordFieldTitle">タイトル</label><input id="recordFieldTitle" value="${esc(entry?.title||'')}" placeholder="自分で付けた場所の名前"></div>
    <div class="field" style="margin-top:8px"><label for="recordFieldText">メモ</label><textarea class="recordBookTextarea" id="recordFieldText" placeholder="育てているもの・次にしたいことなど">${esc(entry?.text||'')}</textarea></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordFieldCancel">キャンセル</button>${entry?'<button class="btn ghost" id="recordFieldDelete">削除</button>':''}<button class="btn" id="recordFieldSave">保存</button></div>`);
  $('#recordFieldCancel').onclick=closeModal;
  $('#recordFieldSave').onclick=async()=>{
    const title=$('#recordFieldTitle').value.trim(),body=$('#recordFieldText').value;
    if(!title){toast('タイトルを入力してください');return}
    const before=clone(state.playerRecords.fields.entries),time=new Date().toISOString();
    if(entry){entry.title=title;entry.text=body;entry.updatedAt=time}
    else state.playerRecords.fields.entries.push({id:recordBookNextId('field'),title,text:body,updatedAt:time});
    if(await save()){closeModal();renderRecordFields()}
    else{state.playerRecords.fields.entries=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordFieldDelete').onclick=()=>{
    if(!confirm('この畑メモを削除しますか？'))return;
    const before=clone(state.playerRecords.fields.entries);
    state.playerRecords.fields.entries=before.filter(e=>e.id!==id);
    void save().then(ok=>{
      if(ok){closeModal();renderRecordFields()}
      else{state.playerRecords.fields.entries=before;toast('保存できませんでした。もう一度お試しください')}
    });
  };
}

function recordBookSpecies(raw){
  const input=String(raw||'').trim();
  const matched=(MASTER.animals||[]).find(a=>norm(a.name_ja)===norm(input));
  return matched?{animalId:matched.id,speciesName:matched.name_ja}:{animalId:null,speciesName:input};
}
function recordBookSpeciesKey(animal){return animal.animalId||'custom:'+norm(animal.speciesName)}
function recordBookAnimalGroups(animals){
  const groups=new Map();
  for(const a of animals){
    const key=recordBookSpeciesKey(a);
    if(!groups.has(key))groups.set(key,{key,name:a.speciesName,animals:[]});
    groups.get(key).animals.push(a);
  }
  return [...groups.values()];
}
function renderRecordBarn(){
  const r=normalizePlayerRecords(state).barn,groups=recordBookAnimalGroups(r.animals);
  $('#inbox').innerHTML=recordBookShell('小屋','飼っているどうぶつと品評会の結果を記録')+
    `<div class="recordBookToolbar"><span class="small muted">登録：${r.animals.length}匹</span><button class="btn secondary" id="recordAnimalAdd">＋ どうぶつを登録</button></div>
    ${groups.length?`<div class="recordBookAnimalGroups">${groups.map(g=>{
      const rank=r.contestRankByAnimalId[g.key]||'';
      return `<section class="card recordBookAnimalGroup"><div class="row between"><span class="strong">${esc(g.name)}</span><span class="small muted">${g.animals.length}匹</span></div>
        <div class="recordBookRankCompact"><label class="tiny muted" for="rank-${esc(g.key)}">品評会</label>
        <select class="recordRankSelect" id="rank-${esc(g.key)}" data-species="${esc(g.key)}" aria-label="${esc(g.name)}の品評会">${RECORD_BOOK_RANKS.map(o=>`<option value="${o.id}" ${rank===o.id?'selected':''}>${o.label}</option>`).join('')}</select></div>
        <div class="recordBookAnimalList">${g.animals.map(a=>`<button type="button" class="recordBookAnimal recordBookRow" data-id="${esc(a.id)}"><span class="strong">${esc(a.nickname||a.speciesName)}</span><span class="tiny muted">${a.note?'メモあり · ':''}編集 ›</span></button>`).join('')}</div></section>`;
    }).join('')}</div>`:'<div class="notice">まだどうぶつの記録がありません。飼っている種類を自分で入力して登録できます。</div>'}`;
  $('#recordAnimalAdd').onclick=()=>recordBookAnimalSheet();
  $$('.recordBookAnimal').forEach(b=>b.onclick=()=>recordBookAnimalSheet(b.dataset.id));
  $$('.recordRankSelect').forEach(b=>b.onchange=async()=>{
    const key=b.dataset.species,prior=r.contestRankByAnimalId[key];
    b.disabled=true;
    if(b.value)r.contestRankByAnimalId[key]=b.value;
    else delete r.contestRankByAnimalId[key];
    if(await save())renderRecordBarn();
    else{if(prior===undefined)delete r.contestRankByAnimalId[key];else r.contestRankByAnimalId[key]=prior;b.disabled=false;b.value=prior||'';toast('保存できませんでした。もう一度お試しください')}
  });
  bindRecordBookBack();
}
function recordBookAnimalSheet(id=null){
  const r=state.playerRecords.barn,animal=r.animals.find(a=>a.id===id);
  const species=recordBookAnimalGroups(r.animals);
  modal(`<h3>${animal?'どうぶつを編集':'どうぶつを登録'}</h3>
    <p class="small muted">ゲーム内で飼っている種類を入力してください。未発見の種類は候補に出しません。</p>
    ${species.length?`<div class="recordBookKnownLabel small muted">登録済みの種類から選ぶ</div>
      <div class="recordKnownSpecies">${species.map(g=>`<button class="recordKnownButton ${g.name===animal?.speciesName?'active':''}" type="button" data-species-name="${esc(g.name)}">${esc(g.name)}</button>`).join('')}</div>`:''}
    <div class="field"><label for="recordAnimalSpecies">種類（必須）</label><input id="recordAnimalSpecies" value="${esc(animal?.speciesName||'')}" autocomplete="off" placeholder="例：ニワトリ"></div>
    <div class="field" style="margin-top:8px"><label for="recordAnimalNickname">名前（任意）</label><input id="recordAnimalNickname" value="${esc(animal?.nickname||'')}" placeholder="ゲーム内で付けた名前"></div>
    <div class="field" style="margin-top:8px"><label for="recordAnimalNote">メモ（任意）</label><textarea id="recordAnimalNote" placeholder="育成方針など">${esc(animal?.note||'')}</textarea></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordAnimalCancel">キャンセル</button>${animal?'<button class="btn ghost" id="recordAnimalDelete">削除</button>':''}<button class="btn" id="recordAnimalSave">保存</button></div>`);
  $$('.recordKnownButton').forEach(b=>b.onclick=()=>{
    $('#recordAnimalSpecies').value=b.dataset.speciesName;
    $$('.recordKnownButton').forEach(x=>x.classList.toggle('active',x===b));
  });
  $('#recordAnimalSpecies').addEventListener('input',()=>{
    $$('.recordKnownButton').forEach(b=>b.classList.toggle('active',b.dataset.speciesName===$('#recordAnimalSpecies').value.trim()));
  });
  $('#recordAnimalCancel').onclick=closeModal;
  $('#recordAnimalSave').onclick=async()=>{
    const species=recordBookSpecies($('#recordAnimalSpecies').value);
    if(!species.speciesName){toast('種類を入力してください');return}
    const before=clone(r.animals),time=new Date().toISOString();
    const changed={...species,nickname:$('#recordAnimalNickname').value.trim(),note:$('#recordAnimalNote').value,updatedAt:time};
    if(animal)Object.assign(animal,changed);
    else r.animals.push({id:recordBookNextId('animal'),...changed});
    if(await save()){closeModal();renderRecordBarn()}
    else{r.animals=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(animal)$('#recordAnimalDelete').onclick=()=>{
    if(!confirm('このどうぶつの記録を削除しますか？'))return;
    const before=clone(r.animals);r.animals=r.animals.filter(a=>a.id!==id);
    void save().then(ok=>{
      if(ok){closeModal();renderRecordBarn()}
      else{r.animals=before;toast('保存できませんでした。もう一度お試しください')}
    });
  };
}

// Facility upgrades are recorded by the player. The audited Master is used
// ONLY when the player has explicitly entered both the contractor and label.
function recordBookFacilityMatch(name,shopName){
  const shop=RECORD_MASTER.shops.find(s=>
    norm(s.owner_ja)===norm(shopName)||norm(s.name_ja)===norm(shopName));
  if(!shop)return null;
  return RECORD_MASTER.facilities.find(f=>f.shop_id===shop.id&&
    [f.label_ja,f.name_ja].some(label=>label&&norm(label)===norm(name)))||null;
}
function recordBookFacilityGroups(entries){
  const groups=new Map();
  for(const entry of entries){
    if(!entry||typeof entry!=='object')continue;
    const label=String(entry.shopName||'').trim()||'依頼先未記録';
    const key=norm(label);
    if(!groups.has(key))groups.set(key,{name:label,entries:[]});
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}
function recordBookRestorePart(target,backup){
  for(const key of Object.keys(target))delete target[key];
  Object.assign(target,backup);
}
function recordBookSyncFacilityIds(r,previousId=null){
  // Keep prepared canonical ID sets usable by future planning without
  // treating unseen Master facilities as player discoveries.
  if(previousId&&!r.customEntries.some(e=>e.masterId===previousId)){
    r.discoveredIds=r.discoveredIds.filter(id=>id!==previousId);
    r.completedIds=r.completedIds.filter(id=>id!==previousId);
  }
  for(const e of r.customEntries){
    if(!e.masterId)continue;
    if(!r.discoveredIds.includes(e.masterId))r.discoveredIds.push(e.masterId);
    if(e.shopId&&!r.discoveredShopIds.includes(e.shopId))r.discoveredShopIds.push(e.shopId);
    r.completedIds=r.completedIds.filter(id=>id!==e.masterId);
    if(e.completed)r.completedIds.push(e.masterId);
  }
}
function renderRecordFacilities(){
  const r=normalizePlayerRecords(state).facilities,groups=recordBookFacilityGroups(r.customEntries);
  const completed=r.customEntries.filter(e=>e?.completed).length;
  $('#inbox').innerHTML=recordBookShell('牧場','自分が確認したアップデートと完了状況')+
    `<div class="recordBookToolbar"><span class="small muted">完了 ${completed}/${r.customEntries.length}件</span>
      <button class="btn secondary" id="recordFacilityAdd" type="button">＋ アップデートを登録</button></div>
    ${groups.length?`<div class="recordFacilityGroups">${groups.map(g=>`
      <section class="card recordFacilityGroup"><div class="row between"><strong>${esc(g.name)}</strong>
        <span class="small muted">${g.entries.filter(e=>e.completed).length}/${g.entries.length}件完了</span></div>
      <div class="recordFacilityItems">${g.entries.map(e=>`<div class="recordFacilityItem">
        <button class="recordFacilityOpen" type="button" data-id="${esc(e.id)}"><span class="strong">${esc(e.title)}</span>
          <span class="tiny muted">${e.note?'メモあり · ':''}編集 ›</span></button>
        <button class="recordFacilityToggle ${e.completed?'done':''}" type="button" data-id="${esc(e.id)}" aria-pressed="${!!e.completed}">${e.completed?'✓ 完了':'未完了'}</button>
      </div>`).join('')}</div></section>`).join('')}</div>`:
      '<div class="notice">ゲーム内で確認した強化だけを追加できます。未発見の工事や依頼先の一覧は表示しません。</div>'}`;
  $('#recordFacilityAdd').onclick=()=>recordBookFacilitySheet();
  $$('.recordFacilityOpen').forEach(b=>b.onclick=()=>recordBookFacilitySheet(b.dataset.id));
  $$('.recordFacilityToggle').forEach(b=>b.onclick=async()=>{
    const entry=r.customEntries.find(e=>e.id===b.dataset.id);
    if(!entry)return;
    b.disabled=true;
    const backup=clone(r);
    entry.completed=!entry.completed;
    entry.updatedAt=new Date().toISOString();
    recordBookSyncFacilityIds(r);
    if(await save())renderRecordFacilities();
    else{recordBookRestorePart(r,backup);renderRecordFacilities();toast('保存できませんでした')}
  });
  bindRecordBookBack();
}
function recordBookFacilitySheet(id=null){
  const r=normalizePlayerRecords(state).facilities,entry=r.customEntries.find(e=>e?.id===id);
  const knownShops=[...new Set(r.customEntries.map(e=>e?.shopName?.trim()).filter(Boolean))];
  modal(`<h3>${entry?'アップデートを編集':'アップデートを登録'}</h3>
    <p class="small muted">ゲーム内で確認した内容を入力してください。未知の候補は表示しません。</p>
    ${knownShops.length?`<div class="recordBookKnownLabel small muted">登録済みの依頼先</div>
      <div class="recordKnownSpecies">${knownShops.map(name=>`<button type="button" class="recordKnownShop recordKnownButton" data-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>`:''}
    <div class="field"><label for="recordFacilityShop">依頼先（任意）</label><input id="recordFacilityShop" value="${esc(entry?.shopName||'')}" autocomplete="off" placeholder="ゲーム内で確認した依頼先"></div>
    <div class="field" style="margin-top:8px"><label for="recordFacilityName">アップデート名</label><input id="recordFacilityName" value="${esc(entry?.title||'')}" autocomplete="off" placeholder="例：自分が発見した強化"></div>
    <label class="recordInlineCheck"><input id="recordFacilityComplete" type="checkbox" ${entry?.completed?'checked':''}> 完了している</label>
    <div class="field" style="margin-top:8px"><label for="recordFacilityNote">メモ（任意）</label><textarea id="recordFacilityNote" placeholder="次にしたいことなど">${esc(entry?.note||'')}</textarea></div>
    ${entry?.masterId?`<p class="tiny muted">Master照合済み・参考価格 ${Number(RECORD_MASTER.facilities.find(f=>f.id===entry.masterId)?.price_g||0).toLocaleString('ja-JP')}G</p>`:''}
    <div class="sheet-actions"><button class="btn secondary" id="recordFacilityCancel">キャンセル</button>
      ${entry?'<button class="btn ghost" id="recordFacilityDelete">削除</button>':''}<button class="btn" id="recordFacilitySave">保存</button></div>`);
  $$('.recordKnownShop').forEach(b=>b.onclick=()=>{$('#recordFacilityShop').value=b.dataset.name});
  $('#recordFacilityCancel').onclick=closeModal;
  $('#recordFacilitySave').onclick=async()=>{
    const shopName=$('#recordFacilityShop').value.trim(),title=$('#recordFacilityName').value.trim();
    if(!title){toast('アップデート名を入力してください');return}
    const match=recordBookFacilityMatch(title,shopName);
    if(match&&r.customEntries.some(e=>e?.id!==id&&e.masterId===match.id)){
      toast('このアップデートは登録済みです');return;
    }
    const backup=clone(r),previousId=entry?.masterId||null;
    const changed={title,shopName,shopId:match?.shop_id||null,masterId:match?.id||null,
      completed:$('#recordFacilityComplete').checked,note:$('#recordFacilityNote').value,
      updatedAt:new Date().toISOString()};
    if(entry)Object.assign(entry,changed);
    else r.customEntries.push({id:recordBookNextId('facility'),...changed});
    recordBookSyncFacilityIds(r,previousId);
    $('#recordFacilitySave').disabled=true;
    if(await save()){closeModal();renderRecordFacilities()}
    else{recordBookRestorePart(r,backup);$('#recordFacilitySave').disabled=false;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordFacilityDelete').onclick=()=>{
    if(!confirm('このアップデート記録を削除しますか？'))return;
    const backup=clone(r);
    r.customEntries=r.customEntries.filter(e=>e.id!==id);
    recordBookSyncFacilityIds(r,entry.masterId);
    void save().then(ok=>{
      if(ok){closeModal();renderRecordFacilities()}
      else{recordBookRestorePart(r,backup);toast('保存できませんでした。もう一度お試しください')}
    });
  };
}

// List all eight base tools, as requested. Their future upgrade labels and
// requirements remain hidden until the player enters a matching name.
const RECORD_TOOL_STAGE_WORDS={
  copper:'銅',copper_plus:'銅＋',silver:'銀',silver_plus:'銀＋',
  gold:'金',gold_plus:'金＋',orichalcum:'オリハルコン',ultimate:'究極'
};
function recordBookToolResolve(toolId,input){
  const text=String(input||'').trim();
  if(!text)return {stage:null,custom:''};
  if(['未所持','持っていない'].some(v=>norm(v)===norm(text)))
    return {stage:'unowned',custom:''};
  const tool=RECORD_MASTER.tools.find(t=>t.id===toolId);
  if(!tool)return {stage:null,custom:text};
  const baseLabels=['初期','通常','ノーマル',tool.name_ja];
  if(toolId==='sickle')baseLabels.push('鎌');
  if(baseLabels.some(v=>norm(v)===norm(text)))return {stage:'base',custom:''};
  const match=RECORD_MASTER.upgrades.find(u=>u.tool_id===toolId&&
    (norm(u.name_ja)===norm(text)||norm(RECORD_TOOL_STAGE_WORDS[u.stage]||'')===norm(text)));
  return match?{stage:match.stage,custom:'',upgradeId:match.id}:{stage:null,custom:text};
}
function recordBookToolLabel(toolId,records){
  const grade=records.ownedStageById[toolId];
  if(grade==='unowned')return '未所持';
  if(grade==='base')return '初期';
  const found=RECORD_MASTER.upgrades.find(u=>u.tool_id===toolId&&u.stage===grade);
  if(found)return found.name_ja;
  return records.customStageById[toolId]||'未記録';
}
function recordBookDiscoveredForTool(id,records){
  const known=new Set(records.discoveredUpgradeIds);
  return RECORD_MASTER.upgrades.filter(u=>u.tool_id===id&&known.has(u.id));
}
function renderRecordTools(){
  const r=normalizePlayerRecords(state).tools;
  $('#inbox').innerHTML=recordBookShell('道具','現在のグレードと、見つけた強化素材を記録')+
    `<p class="small muted recordBookIntro">道具は全種類表示します。未発見のグレードや強化素材は、自分で登録するまで表示されません。</p>
    <div class="recordBookList">${RECORD_MASTER.tools.map(t=>{
      const discovered=recordBookDiscoveredForTool(t.id,r);
      return `<div class="recordToolItem"><button type="button" class="recordToolOpen recordBookRow" data-id="${esc(t.id)}">
        <span class="strong">${esc(t.name_ja)}</span><span class="small muted">${esc(recordBookToolLabel(t.id,r))}　›</span>
      </button>
      ${discovered.length?`<details class="recordToolKnownRecipes"><summary>確認済みの強化素材（${discovered.length}件）</summary>
        ${discovered.map(u=>`<div class="recordToolRecipe">
          <div class="row between"><b class="small">${esc(u.name_ja)}</b><button class="miniLink recordToolForget" type="button" data-id="${esc(u.id)}">記録を削除</button></div>
          <p class="tiny muted">${u.materials.map(m=>esc(m.name_ja)+' ×'+Number(m.quantity)).join(' ／ ')}</p>
        </div>`).join('')}</details>`:''}</div>`;
    }).join('')}</div>`;
  $$('.recordToolOpen').forEach(b=>b.onclick=()=>recordBookToolSheet(b.dataset.id));
  $$('.recordToolForget').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id,known=RECORD_MASTER.upgrades.find(u=>u.id===id);
    if(!known||!confirm('この強化の発見記録を削除しますか？'))return;
    const backup=clone(r);
    r.discoveredUpgradeIds=r.discoveredUpgradeIds.filter(x=>x!==id);
    if(await save())renderRecordTools();
    else{recordBookRestorePart(r,backup);renderRecordTools();toast('保存できませんでした')}
  });
  bindRecordBookBack();
}
function recordBookToolSheet(toolId){
  const r=normalizePlayerRecords(state).tools;
  const tool=RECORD_MASTER.tools.find(t=>t.id===toolId);
  if(!tool)return;
  const grade=recordBookToolLabel(toolId,r);
  const value=grade==='未記録'?'':grade;
  modal(`<h3>${esc(tool.name_ja)}の記録</h3>
    <p class="small muted">今持っている道具の名前・グレードを入力してください。未確認の強化候補は表示しません。</p>
    <div class="recordKnownSpecies">
      <button class="recordToolQuick recordKnownButton" data-value="初期" type="button">初期を所持</button>
      <button class="recordToolQuick recordKnownButton" data-value="未所持" type="button">未所持</button>
    </div>
    ${tool.upgradable?`<div class="field"><label for="recordToolGrade">現在の道具名・グレード</label>
      <input id="recordToolGrade" value="${esc(value)}" autocomplete="off" placeholder="取得した道具の名前"></div>
      <div class="field" style="margin-top:10px"><label for="recordToolDiscovered">素材を確認した強化名（任意・1件ずつ）</label>
        <input id="recordToolDiscovered" autocomplete="off" placeholder="ゲーム内で確認した強化名"></div>
      <p class="tiny muted">Masterの名前と一致した段階の素材だけを表示します。一致しない名前は現在のグレードとしても記録できます。</p>`:
      `<div class="field"><label for="recordToolGrade">所持状況</label>
        <input id="recordToolGrade" value="${esc(value)}" autocomplete="off" placeholder="初期 または 未所持"></div>`}
    <div class="field" style="margin-top:9px"><label for="recordToolNote">メモ（任意）</label><textarea id="recordToolNote" placeholder="次に確認したいことなど">${esc(r.notesById[toolId]||'')}</textarea></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordToolCancel">キャンセル</button>
      <button class="btn" id="recordToolSave">保存</button></div>`);
  $$('.recordToolQuick').forEach(b=>b.onclick=()=>{$('#recordToolGrade').value=b.dataset.value});
  $('#recordToolCancel').onclick=closeModal;
  $('#recordToolSave').onclick=async()=>{
    const grade=recordBookToolResolve(toolId,$('#recordToolGrade').value);
    const foundName=$('#recordToolDiscovered')?.value.trim()||'';
    const found=foundName?recordBookToolResolve(toolId,foundName):null;
    if(foundName&&!found?.upgradeId){
      toast('強化名がMasterと一致しません。ゲーム内の名前を確認してください');return;
    }
    const backup=clone(r);
    if(grade.stage)r.ownedStageById[toolId]=grade.stage;
    else delete r.ownedStageById[toolId];
    if(grade.custom)r.customStageById[toolId]=grade.custom;
    else delete r.customStageById[toolId];
    const note=$('#recordToolNote').value;
    if(note)r.notesById[toolId]=note;
    else delete r.notesById[toolId];
    for(const id of [grade.upgradeId,found?.upgradeId].filter(Boolean))
      if(!r.discoveredUpgradeIds.includes(id))r.discoveredUpgradeIds.push(id);
    $('#recordToolSave').disabled=true;
    if(await save()){closeModal();renderRecordTools()}
    else{recordBookRestorePart(r,backup);$('#recordToolSave').disabled=false;toast('保存できませんでした。もう一度お試しください')}
  };
}
