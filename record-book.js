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
    fields:{...fields,note:typeof fields.note==='string'?fields.note:'',entries:Array.isArray(fields.entries)?fields.entries:[]},
    barn:{...barn,animals:Array.isArray(barn.animals)?barn.animals:[],contestRankByAnimalId:obj(barn.contestRankByAnimalId)},
    facilities:{...facilities,discoveredIds:Array.isArray(facilities.discoveredIds)?facilities.discoveredIds:[],completedIds:Array.isArray(facilities.completedIds)?facilities.completedIds:[],discoveredShopIds:Array.isArray(facilities.discoveredShopIds)?facilities.discoveredShopIds:[],notesById:obj(facilities.notesById),customEntries:Array.isArray(facilities.customEntries)?facilities.customEntries:[]},
    tools:{...tools,ownedStageById:obj(tools.ownedStageById),discoveredUpgradeIds:Array.isArray(tools.discoveredUpgradeIds)?tools.discoveredUpgradeIds:[],notesById:obj(tools.notesById)}
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
  const section=document.createElement('section');
  section.className='section recordBookHub';
  section.innerHTML=`<div class="section-head"><h2>記録・確認</h2><span class="tiny muted">自分の牧場の記録</span></div>
    <div class="recordBookGrid">
      <button class="recordBookLink" data-record-book="residents" type="button"><span>👤 住人</span><small>${people}人の記録</small></button>
      <button class="recordBookLink" data-record-book="fields" type="button"><span>🌱 畑</span><small>${r.fields.entries.length}件のメモ</small></button>
      <button class="recordBookLink" data-record-book="barn" type="button"><span>🐄 小屋</span><small>${r.barn.animals.length}匹の記録</small></button>
      <div class="recordBookLink recordBookSoon"><span>🏡 牧場</span><small>次回追加</small></div>
      <div class="recordBookLink recordBookSoon"><span>🛠 道具</span><small>次回追加</small></div>
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
    `<div class="recordBookToolbar"><label for="recordResidentSort">並び順</label><select id="recordResidentSort"><option value="name" ${sort==='name'?'selected':''}>名前順</option><option value="birthday" ${sort==='birthday'?'selected':''}>誕生日順</option></select><button class="btn secondary" id="recordResidentAdd" type="button">＋ 住人を登録</button></div>
    ${names.length?`<div class="recordBookList">${names.map(name=>{
      const bd=residentBirthday(name),profile=residentProfile(name);
      return `<button class="recordBookResident recordBookRow" type="button" data-resident-name="${esc(name)}"><span class="strong">${esc(name)}</span><span class="tiny muted">${bd?`${bd.season} ${bd.day}日`:'誕生日 未確認'}${profile.note?' · メモあり':''}　›</span></button>`;
    }).join('')}</div>`:'<div class="notice">まだ住人の記録がありません。自分で登録するか、お願い・カレンダーから住人を記録すると表示されます。</div>'}`;
  $('#recordResidentSort').addEventListener('change',async e=>{
    state.ui.recordResidentSort=e.target.value;
    if(await save())renderRecordResidents();
  });
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
  $('#inbox').innerHTML=recordBookShell('畑','場所や育て方を自由に書き留める専用メモ')+
    `<div class="card recordBookMainNote"><div class="row between"><label for="recordFieldMain">畑全体のメモ</label><span class="tiny muted">自動保存</span></div>
      <textarea id="recordFieldMain" class="recordBookTextarea" placeholder="例：手前は野菜、奥は果樹。次の季節に植えたいものなど">${esc(r.note)}</textarea></div>
    <div class="section"><div class="section-head"><h2>個別メモ</h2><button class="miniLink" id="recordFieldAdd" type="button">＋ 追加</button></div>
    ${r.entries.length?`<div class="recordBookList">${r.entries.map(e=>`<div class="recordBookFieldEntry recordBookRow"><button class="recordBookFieldOpen" type="button" data-id="${esc(e.id)}"><span class="strong">${esc(e.title||'名称未設定')}</span><span class="small muted">${esc(e.text||'メモなし')}</span></button></div>`).join('')}</div>`:'<p class="small muted">必要になった場所だけ追加できます。畑の数や区画は決め打ちしません。</p>'}</div>`;
  const main=$('#recordFieldMain');
  recordBookEditor=bindAutosave([main],async()=>{
    state.playerRecords.fields.note=main.value;
    return save();
  });
  $('#recordFieldAdd').onclick=()=>leaveRecordBook(()=>recordBookFieldSheet());
  $$('.recordBookFieldOpen').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookFieldSheet(b.dataset.id)));
  bindRecordBookBack();
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
        <div class="tiny muted recordBookRankLabel">品評会（この種類の記録）</div>
        <div class="recordBookRankButtons">${RECORD_BOOK_RANKS.map(o=>`<button type="button" class="recordRank ${rank===o.id?'active':''}" data-species="${esc(g.key)}" data-rank="${o.id}" aria-pressed="${rank===o.id?'true':'false'}">${o.label}</button>`).join('')}</div>
        <div class="recordBookAnimalList">${g.animals.map(a=>`<button type="button" class="recordBookAnimal recordBookRow" data-id="${esc(a.id)}"><span class="strong">${esc(a.nickname||a.speciesName)}</span><span class="tiny muted">${a.note?'メモあり · ':''}編集 ›</span></button>`).join('')}</div></section>`;
    }).join('')}</div>`:'<div class="notice">まだどうぶつの記録がありません。飼っている種類を自分で入力して登録できます。</div>'}`;
  $('#recordAnimalAdd').onclick=()=>recordBookAnimalSheet();
  $$('.recordBookAnimal').forEach(b=>b.onclick=()=>recordBookAnimalSheet(b.dataset.id));
  $$('.recordRank').forEach(b=>b.onclick=async()=>{
    const key=b.dataset.species,prior=r.contestRankByAnimalId[key];
    if(b.dataset.rank)r.contestRankByAnimalId[key]=b.dataset.rank;
    else delete r.contestRankByAnimalId[key];
    if(await save())renderRecordBarn();
    else{if(prior===undefined)delete r.contestRankByAnimalId[key];else r.contestRankByAnimalId[key]=prior;toast('保存できませんでした。もう一度お試しください')}
  });
  bindRecordBookBack();
}
function recordBookAnimalSheet(id=null){
  const r=state.playerRecords.barn,animal=r.animals.find(a=>a.id===id);
  modal(`<h3>${animal?'どうぶつを編集':'どうぶつを登録'}</h3>
    <p class="small muted">ゲーム内で飼っている種類を入力してください。未発見の種類は候補に出しません。</p>
    <div class="field"><label for="recordAnimalSpecies">種類（必須）</label><input id="recordAnimalSpecies" value="${esc(animal?.speciesName||'')}" autocomplete="off" placeholder="例：ニワトリ"></div>
    <div class="field" style="margin-top:8px"><label for="recordAnimalNickname">名前（任意）</label><input id="recordAnimalNickname" value="${esc(animal?.nickname||'')}" placeholder="ゲーム内で付けた名前"></div>
    <div class="field" style="margin-top:8px"><label for="recordAnimalNote">メモ（任意）</label><textarea id="recordAnimalNote" placeholder="育成方針など">${esc(animal?.note||'')}</textarea></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordAnimalCancel">キャンセル</button>${animal?'<button class="btn ghost" id="recordAnimalDelete">削除</button>':''}<button class="btn" id="recordAnimalSave">保存</button></div>`);
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
