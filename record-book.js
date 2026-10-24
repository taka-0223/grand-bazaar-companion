// Player-authored farm records. Keep this independent of unrevealed Master entries:
// a Master name can be matched only after the player has typed it.
let recordBookView=null,recordBookEditor=null,recordBookExitPromise=null;

function normalizePlayerRecords(x){
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const r=obj(x.playerRecords),fields=obj(r.fields),barn=obj(r.barn),facilities=obj(r.facilities),tools=obj(r.tools),bazaar=obj(r.bazaar);
  x.playerRecords={
    ...r,
    fields:{...fields,note:typeof fields.note==='string'?fields.note:'',entries:Array.isArray(fields.entries)?fields.entries:[],
      crops:Array.isArray(fields.crops)?fields.crops:[]},
    barn:{...barn,animals:Array.isArray(barn.animals)?barn.animals:[],contestRankByAnimalId:obj(barn.contestRankByAnimalId)},
    bazaar:{...bazaar,rankName:typeof bazaar.rankName==='string'?bazaar.rankName:'',rankNumber:Number.isSafeInteger(bazaar.rankNumber)&&bazaar.rankNumber>0?bazaar.rankNumber:null},
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
  if(!view){recordBookReset();closeModal();return}
  recordBookView=view;
  renderRecordBookView();
}
function recordBookShell(title,description){
  return `<div class="recordBookSheetHead"><div><h3>${esc(title)}</h3><p class="small muted">${esc(description)}</p></div>
    <button class="recordBookBackButton" type="button" aria-label="記録画面を閉じる">✕</button></div>`;
}
function bindRecordBookBack(){
  $('#modalSheet .recordBookBackButton')?.addEventListener('click',()=>openRecordBook(null));
}
function recordBookPage(content){
  const previousSheet=$('#modalSheet');
  const keepScroll=previousSheet?.classList.contains('recordBookViewSheet')&&previousSheet.dataset.recordView===recordBookView;
  const previousTop=keepScroll?previousSheet.scrollTop:0;
  modal(content);
  $('#modalSheet').classList.add('recordBookViewSheet');
  $('#modalSheet').dataset.recordView=recordBookView;
  if(keepScroll)$('#modalSheet').scrollTop=previousTop;
}
function recordBookNextId(prefix){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9)}

function renderRecordBookHub(){
  const r=normalizePlayerRecords(state),people=knownResidentNames().length;
  const done=r.facilities.customEntries.filter(e=>e?.completed).length;
  const upgradeable=new Set(RECORD_MASTER.tools.filter(t=>t.upgradable).map(t=>t.id));
  const configured=Object.keys(r.tools.ownedStageById).filter(id=>upgradeable.has(id)).length+Object.keys(r.tools.customStageById).filter(id=>upgradeable.has(id)&&!Object.hasOwn(r.tools.ownedStageById,id)).length;
  const section=document.createElement('section');
  section.className='section recordBookHub';
  section.innerHTML=`<div class="section-head"><h2>記録・確認</h2><span class="tiny muted">自分の牧場の記録</span></div>
    <div class="recordBookGrid">
      <button class="recordBookLink" data-record-book="residents" type="button"><span>👤 住人</span><small>${people}人の記録</small></button>
      <button class="recordBookLink" data-record-book="fields" type="button"><span>🌱 畑</span><small>${r.fields.crops.filter(c=>Number(c?.count)>0).length}種類を栽培中</small></button>
      <button class="recordBookLink" data-record-book="barn" type="button"><span>🐄 小屋</span><small>${r.barn.animals.length}匹の記録</small></button>
      <button class="recordBookLink" data-record-book="facilities" type="button"><span>🏡 牧場</span><small>アップデート ${done}/${r.facilities.customEntries.length}件完了</small></button>
      <button class="recordBookLink" data-record-book="tools" type="button"><span>🛠 道具</span><small>${configured}種類の記録</small></button>
    </div>`;
  $('#inbox').append(section);
  section.querySelectorAll('[data-record-book]').forEach(b=>b.addEventListener('click',()=>openRecordBook(b.dataset.recordBook)));
}

function renderRecordBookView(){
  if(!recordBookView)return false;
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
  if(deferMemoNavigation(renderRecordResidents))return;
  const sort=state.ui.recordResidentSort==='birthday'?'birthday':'name',names=recordResidentNames(sort);
  recordBookPage(recordBookShell('住人','出会った人だけを一覧に表示します')+
    `<div class="recordBookToolbar"><div class="recordBookSort" role="group" aria-label="住人の並び順">
      <button type="button" class="recordSortButton ${sort==='name'?'active':''}" data-sort="name" aria-pressed="${sort==='name'}">名前順</button>
      <button type="button" class="recordSortButton ${sort==='birthday'?'active':''}" data-sort="birthday" aria-pressed="${sort==='birthday'}">誕生日順</button>
    </div><button class="btn secondary" id="recordResidentAdd" type="button">＋ 住人を登録</button></div>
    ${names.length?`<div class="recordBookList">${names.map(name=>{
      const bd=residentBirthday(name),profile=residentProfile(name);
      return `<button class="recordBookResident recordBookRow" type="button" data-resident-name="${esc(name)}"><span class="strong">${esc(name)}</span><span class="tiny muted">${bd?`${bd.season} ${bd.day}日`:'誕生日 未確認'}${profile.note?' · メモあり':''}　›</span></button>`;
    }).join('')}</div>`:'<div class="notice">まだ住人の記録がありません。自分で登録するか、お願い・カレンダーから住人を記録すると表示されます。</div>'}`);
  $$('.recordSortButton').forEach(b=>b.addEventListener('click',async()=>{
    if(b.dataset.sort===sort)return;
    const previous=state.ui.recordResidentSort;
    $$('.recordSortButton').forEach(x=>x.disabled=true);
    state.ui.recordResidentSort=b.dataset.sort;
    if(await save())renderRecordResidents();
    else{state.ui.recordResidentSort=previous;renderRecordResidents();toast('保存できませんでした')}
  }));
  $('#recordResidentAdd').addEventListener('click',recordBookAddResident);
  $$('.recordBookResident').forEach(b=>b.addEventListener('click',()=>openResidentCard(b.dataset.residentName,null,true)));
  bindRecordBookBack();
}
function recordBookAddResident(){
  modal(`<h3>住人を登録</h3><p class="small muted">ゲーム内で出会った住人の名前を入力してください。未発見の住人は候補に表示しません。</p>
    <div class="field"><label for="recordResidentName">名前</label><input id="recordResidentName" autocomplete="off" placeholder="住人の名前"></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordResidentCancel" type="button">キャンセル</button><button class="btn" id="recordResidentSave" type="button">登録</button></div>`);
  $('#recordResidentCancel').onclick=renderRecordResidents;
  $('#recordResidentSave').onclick=async()=>{
    const name=$('#recordResidentName').value.trim();
    if(!name){toast('名前を入力してください');return}
    const prior=state.residentProfiles[name];
    state.residentProfiles[name]={...residentProfile(name),registered:true,updatedAt:new Date().toISOString()};
    if(await save()){renderRecordResidents();toast('住人を登録しました')}
    else{if(prior)state.residentProfiles[name]=prior;else delete state.residentProfiles[name];toast('保存できませんでした。もう一度お試しください')}
  };
}

function renderRecordFields(){
  const r=normalizePlayerRecords(state).fields;
  const hasLegacy=!!r.note||r.entries.length>0;
  const current=r.crops.filter(c=>c&&!c.archived),archived=r.crops.filter(c=>c?.archived);
  const growing=current.filter(c=>Number(c.count)>0&&!c.harvested).length;
  recordBookPage(recordBookShell('畑','育てているものと数を記録')+
    `<div class="recordBookToolbar"><span class="small muted">育成中：${growing}種類</span><button class="btn secondary" id="recordCropAdd" type="button">＋ 作物・果樹を追加</button></div>
    ${current.length?`<div class="recordBookList">${current.map(c=>`<div class="recordCropItem ${c.harvested?'recordCropDone':''}" data-id="${esc(c.id)}">
      <div class="recordCropTop"><div class="recordCropIdentity"><button type="button" class="recordCropRow" data-id="${esc(c.id)}" aria-label="${esc(c.name)}を編集">
        <span class="strong">${esc(c.name)}</span><span class="tiny muted">${c.harvested?'✓ 収穫済み':'編集 ›'}</span></button>
        ${c.harvested?'':`<button class="recordCropHarvest" type="button" data-id="${esc(c.id)}">🌾 収穫</button>`}</div>
        <div class="recordCropStepper"><button class="recordCropAdjust" type="button" data-id="${esc(c.id)}" data-delta="-1" aria-label="${esc(c.name)}を1減らす">−</button>
          <b aria-label="栽培数">${Math.max(0,Number(c.count)||0)}</b><button class="recordCropAdjust" type="button" data-id="${esc(c.id)}" data-delta="1" aria-label="${esc(c.name)}を1増やす">＋</button></div></div>
      <div class="recordCropBottom">${c.harvested?`
        <span class="recordCropHarvestedLabel">✓ 収穫済み${c.harvestCount?`（${Number(c.harvestCount)}回）`:''}</span>
        <div class="recordCropActions"><button class="recordCropResume" type="button" data-id="${esc(c.id)}">↻ 再び育成中</button>
          <button class="recordCropArchive" type="button" data-id="${esc(c.id)}">アーカイブ</button></div>`:
        `<span class="tiny muted">${c.harvestCount?`これまで ${Number(c.harvestCount)}回収穫`:'収穫後も栽培数は変わりません'}</span>`}</div></div>`).join('')}</div>`:
      '<div class="notice">育てている作物や果樹を登録してください。畑の数や区画は決め打ちしません。収穫済みは必要なときにアーカイブできます。</div>'}
    ${archived.length?`<details class="recordCropArchived"><summary>アーカイブ済み（${archived.length}件）</summary>
      <div class="recordBookList">${archived.map(c=>`<div class="recordCropArchivedRow">
        <span>${esc(c.name)} <small>×${Math.max(0,Number(c.count)||0)}　${Number(c.harvestCount)||0}回収穫</small></span>
        <button class="recordCropRestore" data-id="${esc(c.id)}" type="button">復元</button>
      </div>`).join('')}</div></details>`:''}
    ${hasLegacy?`<details class="recordLegacyNotes"><summary>以前の畑メモ（内容は保存されています）</summary>
      <div class="card recordBookMainNote"><div class="row between"><label for="recordFieldMain">畑全体のメモ</label><span class="tiny muted">自動保存</span></div>
        <textarea id="recordFieldMain" class="recordBookTextarea">${esc(r.note)}</textarea></div>
      ${r.entries.length?`<div class="recordBookList">${r.entries.map(e=>`<div class="recordBookFieldEntry recordBookRow"><button class="recordBookFieldOpen" type="button" data-id="${esc(e.id)}"><span class="strong">${esc(e.title||'名称未設定')}</span><span class="small muted">${esc(e.text||'メモなし')}</span></button></div>`).join('')}</div>`:''}
    </details>`:''}`);
  $('#recordCropAdd').onclick=()=>leaveRecordBook(()=>recordBookCropSheet());
  $$('.recordCropRow').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookCropSheet(b.dataset.id)));
  $$('.recordCropAdjust').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookAdjustCrop(b.dataset.id,Number(b.dataset.delta))));
  $$('.recordCropHarvest').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookHarvestCrop(b.dataset.id)));
  $$('.recordCropResume').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookSetCropFlags(b.dataset.id,{harvested:false})));
  $$('.recordCropArchive').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookSetCropFlags(b.dataset.id,{archived:true})));
  $$('.recordCropRestore').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookSetCropFlags(b.dataset.id,{archived:false})));
  const main=$('#recordFieldMain');
  if(main)recordBookEditor=bindAutosave([main],async()=>{
    state.playerRecords.fields.note=main.value;
    return save();
  });
  $$('.recordBookFieldOpen').forEach(b=>b.onclick=()=>leaveRecordBook(()=>recordBookFieldSheet(b.dataset.id)));
  bindRecordBookBack();
}
async function recordBookAdjustCrop(id,delta){
  const r=state.playerRecords.fields,entry=r.crops.find(c=>c.id===id);
  if(!entry||![-1,1].includes(delta)||entry.archived)return;
  const old=clone(entry),count=Math.max(0,Math.min(999999,(Number(entry.count)||0)+delta));
  if(entry.count===count)return;
  entry.count=count;entry.updatedAt=new Date().toISOString();
  if(await save())renderRecordFields();
  else{Object.assign(entry,old);toast('保存できませんでした。もう一度お試しください')}
}
async function recordBookHarvestCrop(id){
  const entry=state.playerRecords.fields.crops.find(c=>c.id===id);
  if(!entry||entry.archived||entry.harvested)return;
  const old=clone(entry);
  const count=Math.max(0,Number(entry.harvestCount)||0);
  const ok=await withUndo('収穫を元に戻せます',()=>{
    entry.harvestCount=count+1;
    entry.harvested=true;
    entry.lastHarvestedAt=new Date().toISOString();
    entry.updatedAt=entry.lastHarvestedAt;
    // Old persistent undo metadata is obsolete: the common five-second Undo handles this operation.
    delete entry.harvestUndo;
  });
  if(ok)renderRecordFields();
  else{recordBookRestorePart(entry,old);toast('保存できませんでした。もう一度お試しください')}
}
async function recordBookSetCropFlags(id,flags){
  const entry=state.playerRecords.fields.crops.find(c=>c.id===id);
  if(!entry)return;
  if(flags.archived===true&&!entry.harvested)return;
  const backup=clone(entry);
  Object.assign(entry,flags,{updatedAt:new Date().toISOString()});
  if(await save())renderRecordFields();
  else{Object.assign(entry,backup);toast('保存できませんでした。もう一度お試しください')}
}
function recordBookUniqueKnownLabels(items){
  const names=new Map();
  for(const item of items||[]){
    const label=String(item||'').trim();
    if(label&&!names.has(norm(label)))names.set(norm(label),label);
  }
  return [...names.values()];
}
function recordBookTypedQuery(text){
  return String(text||'').normalize('NFKC').trim().replace(/倉庫/g,'そうこ').replace(/じょうろ/g,'じょうろ');
}
function recordBookMatchName(name,typed){
  const a=norm(String(name||'').replace(/倉庫/g,'そうこ')),b=norm(recordBookTypedQuery(typed));
  return !!b&&a.includes(b);
}
// A typed query is the player's intent. No Master rows are listed on focus/empty input.
// Unknown item names are not visible until an informative query narrows them.
function recordBookKnownCropNames(query=''){
  const r=normalizePlayerRecords(state).fields;
  const names=r.crops.map(c=>c?.name);
  for(const id of state.knownEntities||[]){
    if(!Object.prototype.hasOwnProperty.call(state.playerState||{},id))continue;
    const e=typeof ent==='function'?ent(id):(typeof baseById!=='undefined'?baseById.get(id):null);
    if(!e||!['crop','seed','fruit','seedling','flower','flower_seed','mushroom'].includes(e.kind))continue;
    const source=typeof cultivationSource==='function'?cultivationSource(e):e;
    const label=typeof name==='function'&&source?.id?name(source.id):source?.name_ja||e.name_ja||'';
    if(label)names.push(String(label).replace(/(?:の種|の苗|の菌)$/,''));
  }
  const filtered=recordBookUniqueKnownLabels(names);
  if(norm(query).length<2||typeof baseById==='undefined')return filtered;
  for(const e of baseById.values()){
    if(!e||!['crop','seed','fruit','seedling','flower','flower_seed','mushroom'].includes(e.kind))continue;
    const source=typeof cultivationSource==='function'?cultivationSource(e):e;
    const label=typeof name==='function'&&source?.id?name(source.id):source?.name_ja||e.name_ja||'';
    const cleaned=String(label).replace(/(?:の種|の苗|の菌|種菌)$/,'');
    if(cleaned&&recordBookMatchName(cleaned,query))filtered.push(cleaned);
  }
  return recordBookUniqueKnownLabels(filtered);
}
function recordBookKnownFacilityNames(query=''){
  const r=normalizePlayerRecords(state),fac=r.facilities;
  const known=fac.customEntries.map(e=>e?.title);
  const typed=recordBookTypedQuery(query);
  if(norm(typed).length<2)return recordBookUniqueKnownLabels(known);
  const rank=r.bazaar.rankNumber;
  const discovered=new Set([...(fac.discoveredIds||[]),...(fac.completedIds||[]),...fac.customEntries.map(e=>e?.masterId).filter(Boolean)]);
  for(const entry of RECORD_MASTER.facilities){
    // Only verified names, never descriptive labels masquerading as in-game wording.
    if(!entry.name_ja||!recordBookMatchName(entry.name_ja,typed))continue;
    const min=entry.unlock?.rank_min||1;
    // With no rank recorded, normal-story names can be found deliberately by typing.
    // Once the user records their rank, suppress unearned future tiers.
    if(!discovered.has(entry.id)&&((rank!=null&&min>rank)||(rank==null&&min>7)))continue;
    known.push(entry.name_ja);
  }
  return recordBookUniqueKnownLabels(known);
}
function recordBookKnownToolGrades(toolId,query=''){
  const r=normalizePlayerRecords(state).tools;
  const names=[r.customStageById[toolId]];
  const current=r.ownedStageById[toolId];
  if(current==='base')names.push('初期');
  if(current==='unowned')names.push('未所持');
  for(const upgrade of RECORD_MASTER.upgrades){
    if(upgrade.tool_id!==toolId)continue;
    const known=(r.discoveredUpgradeIds||[]).includes(upgrade.id)||upgrade.stage===current;
    if(known||norm(query).length>=1&&(recordBookMatchName(upgrade.name_ja,query)||
        recordBookMatchName(RECORD_TOOL_STAGE_WORDS[upgrade.stage],query))){
      names.push(upgrade.name_ja);
      if(RECORD_TOOL_STAGE_WORDS[upgrade.stage])names.push(RECORD_TOOL_STAGE_WORDS[upgrade.stage]);
    }
  }
  return recordBookUniqueKnownLabels(names);
}
function recordBookBindKnownSuggestions(inputId,candidates,{minChars=2,onChoose=null}={}){
  const input=$('#'+inputId),box=$('#'+inputId+'Suggestions');
  if(!input||!box)return {refresh(){}};
  let composing=false;
  const refresh=()=>{
    const query=recordBookTypedQuery(input.value||'');
    box.innerHTML='';
    if(composing||norm(query).length<minChars){box.hidden=true;return}
    const options=recordBookUniqueKnownLabels(candidates(query))
      .filter(label=>recordBookMatchName(label,query)&&norm(label)!==norm(query)).slice(0,6);
    if(!options.length){box.hidden=true;return}
    for(const label of options){
      const button=document.createElement('button');
      button.type='button';button.className='recordSuggestion';
      button.textContent=label;
      button.addEventListener('click',()=>{
        input.value=label;
        box.hidden=true;
        onChoose?.(label);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      box.append(button);
    }
    box.hidden=false;
  };
  input.addEventListener('compositionstart',()=>{composing=true;box.hidden=true});
  input.addEventListener('compositionend',()=>{composing=false;refresh()});
  input.addEventListener('input',refresh);
  input.addEventListener('focus',refresh);
  return {refresh};
}

function recordBookCropSheet(id=null){
  const r=normalizePlayerRecords(state).fields,entry=r.crops.find(c=>c?.id===id);
  modal(`<h3>${entry?'作物・果樹を編集':'作物・果樹を追加'}</h3>
    <div class="field"><label for="recordCropName">作物・果樹の名前</label><input id="recordCropName" autocomplete="off" value="${esc(entry?.name||'')}" placeholder="例：トマト"><p class="tiny muted">2文字以上で入力候補を表示します。自分で名前を入力しても登録できます。</p><div id="recordCropNameSuggestions" class="recordAutocomplete" aria-label="作物名の候補" hidden></div></div>
    <div class="field" style="margin-top:8px"><label for="recordCropCount">植えている数</label><input id="recordCropCount" type="number" inputmode="numeric" min="0" step="1" value="${entry?.count??1}"></div>
    ${entry?`<div class="field" style="margin-top:8px"><label for="recordCropHarvestCount">収穫した回数</label><input id="recordCropHarvestCount" type="number" inputmode="numeric" min="0" step="1" value="${Number(entry.harvestCount)||0}"></div>`:''}
    <div class="sheet-actions"><button class="btn secondary" id="recordCropCancel">キャンセル</button>${entry?'<button class="btn ghost" id="recordCropDelete">削除</button>':''}<button class="btn" id="recordCropSave">保存</button></div>`);
  recordBookBindKnownSuggestions('recordCropName',recordBookKnownCropNames);
  $('#recordCropCancel').onclick=renderRecordFields;
  $('#recordCropSave').onclick=async()=>{
    const name=$('#recordCropName').value.trim(),count=Number($('#recordCropCount').value);
    if(!name){toast('名前を入力してください');return}
    if(!Number.isSafeInteger(count)||count<0||count>999999){toast('栽培数は0〜999999の整数で入力してください');return}
    const harvestCount=entry?Number($('#recordCropHarvestCount').value):0;
    if(!Number.isSafeInteger(harvestCount)||harvestCount<0){toast('収穫回数は0以上の整数で入力してください');return}
    if(r.crops.some(c=>c?.id!==id&&!c.archived&&norm(c?.name||'')===norm(name))){toast('登録済みの作物です。数を編集してください');return}
    const before=clone(r.crops),updatedAt=new Date().toISOString();
    if(entry)Object.assign(entry,{name,count,harvestCount,updatedAt});
    else r.crops.push({id:recordBookNextId('crop'),name,count,harvestCount:0,updatedAt});
    if(await save()){renderRecordFields()}
    else{r.crops=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordCropDelete').onclick=()=>{
    if(!confirm('この栽培記録を削除しますか？'))return;
    const before=clone(r.crops);r.crops=r.crops.filter(c=>c.id!==id);
    void save().then(ok=>{
      if(ok){renderRecordFields()}
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
  $('#recordFieldCancel').onclick=renderRecordFields;
  $('#recordFieldSave').onclick=async()=>{
    const title=$('#recordFieldTitle').value.trim(),body=$('#recordFieldText').value;
    if(!title){toast('タイトルを入力してください');return}
    const before=clone(state.playerRecords.fields.entries),time=new Date().toISOString();
    if(entry){entry.title=title;entry.text=body;entry.updatedAt=time}
    else state.playerRecords.fields.entries.push({id:recordBookNextId('field'),title,text:body,updatedAt:time});
    if(await save()){renderRecordFields()}
    else{state.playerRecords.fields.entries=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordFieldDelete').onclick=()=>{
    if(!confirm('この畑メモを削除しますか？'))return;
    const before=clone(state.playerRecords.fields.entries);
    state.playerRecords.fields.entries=before.filter(e=>e.id!==id);
    void save().then(ok=>{
      if(ok){renderRecordFields()}
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
function recordBookMedalIcon(){
  return '<svg class="recordMedalIcon" viewBox="0 0 24 24" aria-hidden="true" fill="none">'+
    '<path d="m5 2 4 8 3-2-3-6ZM15 2l-3 6 3 2 4-8Z" fill="currentColor" opacity=".68"/>'+
    '<circle cx="12" cy="15" r="7" fill="currentColor" stroke="currentColor" stroke-width=".7"/>'+
    '<path d="m12 10.4 1.42 2.88 3.17.46-2.3 2.24.54 3.17L12 17.65l-2.83 1.5.54-3.17-2.3-2.24 3.17-.46Z" fill="#fff" opacity=".94"/>'+
    '</svg>';
}
function renderRecordBarn(){
  const r=normalizePlayerRecords(state).barn,groups=recordBookAnimalGroups(r.animals);
  recordBookPage(recordBookShell('小屋','どうぶつの成長と品評会を記録')+
    `<div class="recordBookToolbar"><span class="small muted">登録：${r.animals.length}匹</span></div>
    ${groups.length?`<div class="recordBookAnimalGroups">${groups.map(g=>{
      const rank=r.contestRankByAnimalId[g.key]||'';
      return `<section class="card recordBookAnimalGroup"><div class="recordBookGroupHead"><span class="strong">${esc(g.name)} <span class="tiny muted">${g.animals.length}匹</span></span>
        <div class="recordRankIcons" role="group" aria-label="${esc(g.name)}の品評会ランク">${[
          ['bronze','ブロンズ'],['silver','シルバー'],['gold','ゴールド']
        ].map(([id,label])=>`<button type="button" class="recordRankIcon ${rank===id?'lit':''}" data-species="${esc(g.key)}" data-rank="${id}" aria-label="${esc(g.name)}：${label}" title="${label}" aria-pressed="${rank===id}">${recordBookMedalIcon()}</button>`).join('')}</div></div>
        <div class="recordBookAnimalList">${g.animals.map(a=>`<button type="button" class="recordBookAnimal recordBookRow" data-id="${esc(a.id)}"><span class="strong">${esc(a.nickname||a.speciesName)}</span>
          <span class="tiny muted">${Number.isInteger(a.friendship)?`なかよし ${a.friendship}`:''}${Number.isInteger(a.relaxation)?`　のびのび ${a.relaxation}`:''}　›</span></button>`).join('')}</div>
        <button class="recordAnimalGroupAdd" data-species-name="${esc(g.name)}" type="button">＋ ${esc(g.name)}を追加</button></section>`;
    }).join('')}</div>`:'<div class="notice">まだどうぶつの記録がありません。飼っている種類から登録できます。</div>'}
    <button type="button" class="recordAnimalTypeAdd" id="recordAnimalTypeAdd">＋ 新しい種類を登録</button>`);
  $('#recordAnimalTypeAdd').onclick=()=>recordBookAnimalSheet();
  $$('.recordAnimalGroupAdd').forEach(b=>b.onclick=()=>recordBookAnimalSheet(null,b.dataset.speciesName));
  $$('.recordBookAnimal').forEach(b=>b.onclick=()=>recordBookAnimalSheet(b.dataset.id));
  $$('.recordRankIcon').forEach(b=>b.onclick=async()=>{
    const key=b.dataset.species,prior=r.contestRankByAnimalId[key];
    $$('.recordRankIcon').forEach(x=>{if(x.dataset.species===key)x.disabled=true});
    const newRank=prior===b.dataset.rank?'':b.dataset.rank;
    if(newRank)r.contestRankByAnimalId[key]=newRank;
    else delete r.contestRankByAnimalId[key];
    if(await save())renderRecordBarn();
    else{if(prior===undefined)delete r.contestRankByAnimalId[key];else r.contestRankByAnimalId[key]=prior;renderRecordBarn();toast('保存できませんでした。もう一度お試しください')}
  });
  bindRecordBookBack();
}
function recordBookAnimalSheet(id=null,speciesPreset=null){
  const r=state.playerRecords.barn,animal=r.animals.find(a=>a.id===id);
  const lockedName=animal?.speciesName||speciesPreset||'';
  const statOptions=value=>`<option value="">未記録</option>`+Array.from({length:11},(_,i)=>`<option value="${i}" ${value===i?'selected':''}>${i} / 10</option>`).join('');
  modal(`<h3>${animal?'どうぶつを編集':lockedName?`${esc(lockedName)}を追加`:'新しい種類を登録'}</h3>
    ${lockedName?`<p class="small muted">種類：${esc(lockedName)}</p>`:
      '<div class="field"><label for="recordAnimalSpecies">種類（必須）</label><input id="recordAnimalSpecies" autocomplete="off" placeholder="ゲームで迎えた種類"></div>'}
    <div class="field" style="margin-top:8px"><label for="recordAnimalNickname">名前</label><input id="recordAnimalNickname" value="${esc(animal?.nickname||'')}" placeholder="ゲーム内の名前"></div>
    <div class="grid2 recordAnimalStatsEdit" style="margin-top:8px">
      <div class="field"><label for="recordAnimalFriendship">なかよし度</label><select id="recordAnimalFriendship">${statOptions(animal?.friendship)}</select></div>
      <div class="field"><label for="recordAnimalRelaxation">のびのび度</label><select id="recordAnimalRelaxation">${statOptions(animal?.relaxation)}</select></div>
    </div>
    <div class="sheet-actions"><button class="btn secondary" id="recordAnimalCancel">キャンセル</button>${animal?'<button class="btn ghost" id="recordAnimalDelete">削除</button>':''}<button class="btn" id="recordAnimalSave">保存</button></div>`);
  $('#recordAnimalCancel').onclick=renderRecordBarn;
  $('#recordAnimalSave').onclick=async()=>{
    const species=recordBookSpecies(lockedName||$('#recordAnimalSpecies').value);
    if(!species.speciesName){toast('種類を入力してください');return}
    const before=clone(r.animals),time=new Date().toISOString();
    const readStat=id=>$('#'+id).value===''?null:Number($('#'+id).value);
    const changed={nickname:$('#recordAnimalNickname').value.trim(),
      friendship:readStat('recordAnimalFriendship'),relaxation:readStat('recordAnimalRelaxation'),updatedAt:time};
    if(animal)Object.assign(animal,changed);
    else r.animals.push({id:recordBookNextId('animal'),...species,...changed});
    if(await save()){renderRecordBarn()}
    else{r.animals=before;toast('保存できませんでした。もう一度お試しください')}
  };
  if(animal)$('#recordAnimalDelete').onclick=()=>{
    if(!confirm('このどうぶつの記録を削除しますか？'))return;
    const before=clone(r.animals);r.animals=r.animals.filter(a=>a.id!==id);
    void save().then(ok=>{
      if(ok){renderRecordBarn()}
      else{r.animals=before;toast('保存できませんでした。もう一度お試しください')}
    });
  };
}

// Shop and contractor are Master facts. The player selects/types ONLY the in-game
// work name; shop ID and canonical upgrade ID are inferred when unambiguous.
function recordBookFacilityMatches(name){
  const key=norm(name);
  if(!key)return [];
  return RECORD_MASTER.facilities.filter(f=>
    [f.name_ja,f.label_ja].some(label=>label&&norm(label)===key));
}
function recordBookFacilityMatch(name,legacyShopName=''){
  const matches=recordBookFacilityMatches(name);
  if(!legacyShopName)return matches.length===1?matches[0]:null;
  const shop=RECORD_MASTER.shops.find(s=>
    norm(s.owner_ja)===norm(legacyShopName)||norm(s.name_ja)===norm(legacyShopName));
  if(!shop)return null;
  return matches.find(f=>f.shop_id===shop.id)||null;
}
function recordBookFacilityGroups(entries){
  const groups=new Map();
  for(const entry of entries){
    if(!entry||typeof entry!=='object')continue;
    const facility=RECORD_MASTER.facilities.find(f=>f.id===entry.masterId);
    const shopId=entry.shopId||facility?.shop_id;
    const shop=RECORD_MASTER.shops.find(s=>s.id===shopId||norm(s.owner_ja)===norm(entry.shopName||''));
    const label=shop?.name_ja||String(entry.shopName||'').trim()||'その他の工事';
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
  const records=normalizePlayerRecords(state),r=records.facilities,bazaar=records.bazaar,groups=recordBookFacilityGroups(r.customEntries);
  const completed=r.customEntries.filter(e=>e?.completed).length;
  recordBookPage(recordBookShell('牧場','自分が確認したアップデートと完了状況')+
    `<div class="recordBazaarRank"><span class="small">🎪 バザールランク　<strong>${esc(bazaar.rankName||'未記録')}</strong></span><button class="miniLink" id="recordBazaarRankEdit" type="button">更新</button></div>
    <p class="tiny muted recordBazaarRankNote">ランクは進行状況の記録です。工事の表示は、ゲームで確認した内容だけに限定します。</p>
    <div class="recordBookToolbar"><span class="small muted">完了 ${completed}/${r.customEntries.length}件</span>
      <button class="btn secondary" id="recordFacilityAdd" type="button">＋ アップデートを登録</button></div>
    ${groups.length?`<div class="recordFacilityGroups">${groups.map(g=>`
      <section class="card recordFacilityGroup"><div class="row between"><strong>${esc(g.name)}</strong>
        <span class="small muted">${g.entries.filter(e=>e.completed).length}/${g.entries.length}件完了</span></div>
      <div class="recordFacilityItems">${g.entries.map(e=>`<div class="recordFacilityItem">
        <button class="recordFacilityOpen" type="button" data-id="${esc(e.id)}"><span class="strong">${esc(e.title)}</span>
          <span class="tiny muted">${e.note?'メモあり · ':''}編集 ›</span></button>
        <button class="recordFacilityToggle ${e.completed?'done':''}" type="button" data-id="${esc(e.id)}" aria-pressed="${!!e.completed}">${e.completed?'✓ 完了':'未完了'}</button>
      </div>`).join('')}</div></section>`).join('')}</div>`:
      '<div class="notice">ゲーム内で確認した強化だけを追加できます。未発見の工事や依頼先の一覧は表示しません。</div>'}`);
  $('#recordBazaarRankEdit').onclick=()=>recordBookBazaarRankSheet();
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
function recordBookBazaarRankResolve(text){
  const rankName=String(text||'').trim();
  if(!rankName)return {rankName:'',rankNumber:null};
  const known=(RECORD_MASTER.ranks||[]).find(r=>norm(r.name_ja)===norm(rankName));
  const asNumber=/^[1-9]\d*$/.test(rankName)?Number(rankName):null;
  const rankNumber=known?known.rank:(Number.isSafeInteger(asNumber)&&asNumber>0&&asNumber<=999?asNumber:null);
  return {rankName,rankNumber};
}
function recordBookBazaarRankSheet(){
  const bazaar=normalizePlayerRecords(state).bazaar;
  modal(`<h3>バザールランクを更新</h3>
    <p class="small muted">今のゲーム画面で確認したランク名（または数字）を入力してください。次のランクや未発見の工事は表示しません。</p>
    <div class="field"><label for="recordBazaarRankName">現在のバザールランク</label><input id="recordBazaarRankName" autocomplete="off" value="${esc(bazaar.rankName)}" placeholder="確認したランク名"></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordBazaarRankCancel">キャンセル</button><button class="btn" id="recordBazaarRankSave">保存</button></div>`);
  $('#recordBazaarRankCancel').onclick=renderRecordFacilities;
  $('#recordBazaarRankSave').onclick=async()=>{
    const backup=clone(bazaar);
    Object.assign(bazaar,recordBookBazaarRankResolve($('#recordBazaarRankName').value),{updatedAt:new Date().toISOString()});
    $('#recordBazaarRankSave').disabled=true;
    if(await save())renderRecordFacilities();
    else{recordBookRestorePart(bazaar,backup);$('#recordBazaarRankSave').disabled=false;toast('保存できませんでした')}
  };
}
function recordBookFacilitySheet(id=null){
  const r=normalizePlayerRecords(state).facilities,entry=r.customEntries.find(e=>e?.id===id);
  const rememberedShop=entry?.shopName||'';

  modal(`<h3>${entry?'アップデートを編集':'アップデートを登録'}</h3>
    <p class="small muted">ゲームで確認した工事名を入力してください。2文字以上入力すると、確認済みMasterの候補から探せます。</p>
    <div class="field"><label for="recordFacilityName">アップデート名</label>
      <input id="recordFacilityName" value="${esc(entry?.title||'')}" autocomplete="off" placeholder="例：そうこ、畑の土…">
      <div id="recordFacilityNameSuggestions" class="recordAutocomplete" aria-label="工事名の候補" hidden></div></div>
    <p id="recordFacilityAutoShop" class="tiny muted">${entry?.shopName?'関連するお店：'+esc(entry.shopName):'工事がMasterと一致すれば、お店は自動で判定します。'}</p>
    <label class="recordInlineCheck"><input id="recordFacilityComplete" type="checkbox" ${entry?.completed?'checked':''}> 完了している</label>
    <div class="field" style="margin-top:8px"><label for="recordFacilityNote">メモ（任意）</label><textarea id="recordFacilityNote" placeholder="次にしたいことなど">${esc(entry?.note||'')}</textarea></div>
    <div class="sheet-actions"><button class="btn secondary" id="recordFacilityCancel">キャンセル</button>
      ${entry?'<button class="btn ghost" id="recordFacilityDelete">削除</button>':''}<button class="btn" id="recordFacilitySave">保存</button></div>`);
  const updateShopHint=()=>{
    const name=$('#recordFacilityName').value;
    const match=recordBookFacilityMatch(name);
    const shop=RECORD_MASTER.shops.find(s=>s.id===match?.shop_id);
    $('#recordFacilityAutoShop').textContent=shop?`関連するお店：${shop.name_ja}`:'一致する工事があればお店を自動で判定します。';
  };
  recordBookBindKnownSuggestions('recordFacilityName',recordBookKnownFacilityNames,{onChoose:updateShopHint});
  $('#recordFacilityName').addEventListener('input',updateShopHint);
  $('#recordFacilityCancel').onclick=renderRecordFacilities;
  $('#recordFacilitySave').onclick=async()=>{
    const title=$('#recordFacilityName').value.trim();
    if(!title){toast('アップデート名を入力してください');return}
    const match=recordBookFacilityMatch(title,rememberedShop)||recordBookFacilityMatch(title);
    const masterShop=RECORD_MASTER.shops.find(s=>s.id===match?.shop_id);
    const shopName=masterShop?.owner_ja||rememberedShop;
    if(match&&r.customEntries.some(e=>e?.id!==id&&e.masterId===match.id)){
      toast('このアップデートは登録済みです');return;
    }
    const backup=clone(r),previousId=entry?.masterId||null;
    const changed={title,shopName,shopId:match?.shop_id||entry?.shopId||null,masterId:match?.id||null,
      completed:$('#recordFacilityComplete').checked,note:$('#recordFacilityNote').value,
      updatedAt:new Date().toISOString()};
    if(entry)Object.assign(entry,changed);
    else r.customEntries.push({id:recordBookNextId('facility'),...changed});
    recordBookSyncFacilityIds(r,previousId);
    $('#recordFacilitySave').disabled=true;
    if(await save()){renderRecordFacilities()}
    else{recordBookRestorePart(r,backup);$('#recordFacilitySave').disabled=false;toast('保存できませんでした。もう一度お試しください')}
  };
  if(entry)$('#recordFacilityDelete').onclick=()=>{
    if(!confirm('このアップデート記録を削除しますか？'))return;
    const backup=clone(r);
    r.customEntries=r.customEntries.filter(e=>e.id!==id);
    recordBookSyncFacilityIds(r,entry.masterId);
    void save().then(ok=>{
      if(ok){renderRecordFacilities()}
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
  const upgradeable=RECORD_MASTER.tools.filter(t=>t.upgradable);
  recordBookPage(recordBookShell('道具','現在のグレードを記録')+
    `<p class="small muted recordBookIntro">強化できる道具だけを表示します。グレード名を記録すると、対応する既知の素材情報をMasterから参照できます。</p>
    <div class="recordBookList">${upgradeable.map(t=>{
      const discovered=recordBookDiscoveredForTool(t.id,r);
      return `<div class="recordToolItem"><button type="button" class="recordToolOpen recordBookRow" data-id="${esc(t.id)}">
        <span class="strong">${esc(t.name_ja)}</span><span class="small muted">${esc(recordBookToolLabel(t.id,r))}　›</span>
      </button>
      ${discovered.length?`<details class="recordToolKnownRecipes"><summary>確認済みの強化素材（${discovered.length}件）</summary>
        ${discovered.map(u=>`<div class="recordToolRecipe">
          <b class="small">${esc(u.name_ja)}</b>
          <p class="tiny muted">${u.materials.map(m=>esc(m.name_ja)+' ×'+Number(m.quantity)).join(' ／ ')}</p>
        </div>`).join('')}</details>`:''}</div>`;
    }).join('')}</div>`);
  $$('.recordToolOpen').forEach(b=>b.onclick=()=>recordBookToolSheet(b.dataset.id));
  bindRecordBookBack();
}
function recordBookToolSheet(toolId){
  const r=normalizePlayerRecords(state).tools;
  const tool=RECORD_MASTER.tools.find(t=>t.id===toolId&&t.upgradable);
  if(!tool)return;
  const grade=recordBookToolLabel(toolId,r);
  const value=grade==='未記録'?'':grade;
  modal(`<h3>${esc(tool.name_ja)}のグレード</h3>
    <div class="field"><label for="recordToolGrade">現在のグレード名</label>
      <input id="recordToolGrade" value="${esc(value)}" autocomplete="off" placeholder="ゲーム内で確認したグレード"><div id="recordToolGradeSuggestions" class="recordAutocomplete" aria-label="記録済みグレードの候補" hidden></div></div>
    <p class="tiny muted">グレード名を入力すると候補が表示されます。空欄では未来の強化を表示しません。</p>
    <div class="sheet-actions"><button class="btn secondary" id="recordToolCancel">キャンセル</button>
      <button class="btn" id="recordToolSave">保存</button></div>`);
  recordBookBindKnownSuggestions('recordToolGrade',query=>recordBookKnownToolGrades(toolId,query),{minChars:1});
  $('#recordToolCancel').onclick=renderRecordTools;
  $('#recordToolSave').onclick=async()=>{
    const grade=recordBookToolResolve(toolId,$('#recordToolGrade').value);
    const backup=clone(r);
    if(grade.stage)r.ownedStageById[toolId]=grade.stage;
    else delete r.ownedStageById[toolId];
    if(grade.custom)r.customStageById[toolId]=grade.custom;
    else delete r.customStageById[toolId];
    if(grade.upgradeId&&!r.discoveredUpgradeIds.includes(grade.upgradeId))r.discoveredUpgradeIds.push(grade.upgradeId);
    $('#recordToolSave').disabled=true;
    if(await save())renderRecordTools();
    else{recordBookRestorePart(r,backup);$('#recordToolSave').disabled=false;toast('保存できませんでした。もう一度お試しください')}
  };
}
