/* Grand Bazaar Companion — Product Architecture v0.5 interaction shell */
(function(){
'use strict';

function v05Icon(source){return source==='request'?'🙏':source==='goal'?'🎯':source==='bazaar'?'🎪':source==='action'?'□':'•'}
function v05KnownResidentNames(){
  const names=new Set(Object.keys(state.residentProfiles||{}));
  for(const r of requestsState())if(r.requester)names.add(r.requester);
  return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,'ja'));
}
function v05AllResidentNames(){
  const names=new Set(v05KnownResidentNames());
  for(const days of Object.values(CAL_BIRTHDAYS||{}))for(const xs of Object.values(days||{}))for(const x of xs)names.add(x);
  for(const r of REQUEST_MASTER)if(r.requester)names.add(r.requester);
  return [...names];
}
function v05TodayLabel(){
  const c=calendarState(),t=c.today;
  if(!t||!t.season||!t.day)return '今日 未設定';
  return t.year+'年目 '+t.season+t.day+'日（'+CAL_WEEKDAYS[calWeekday(t.year,t.season,Number(t.day))]+'）';
}
function v05TouchRecent(type,id,label){
  state.ui=state.ui||{};
  const now=new Date().toISOString(),xs=Array.isArray(state.ui.v05RecentPages)?state.ui.v05RecentPages:[];
  state.ui.v05RecentPages=[{type:type,id:String(id),label:label,touchedAt:now}].concat(xs.filter(x=>!(x.type===type&&String(x.id)===String(id)))).slice(0,8);
  save().catch(function(){});
}
function v05OpenRecent(type,id){
  if(type==='crop')return showCrop(id);
  if(type==='recipe')return showRecipe(id);
  if(type==='request')return showRequestRecord(id);
  if(type==='goal')return showGoal(id);
  if(type==='resident')return openResidentCard(id);
}
function v05RequestSummary(r){
  const objs=r.objectives||[],pending=objs.filter(o=>!requestObjectiveDone(o));
  if(!objs.length)return '進行中';
  if(!pending.length)return '達成条件を満たしています';
  const o=pending[0],cur=requestObjectiveProgress(o),target=Math.max(1,Number(o.target)||1);
  let s='';
  if(o.type==='check')s=o.label;
  else if(o.type==='money_amount')s=o.label+' '+cur.toLocaleString()+' / '+target.toLocaleString()+'G';
  else s=o.label+' あと '+Math.max(0,target-cur);
  if(pending.length>1)s+=' ・ほか'+(pending.length-1);
  return s;
}
function v05GoalSummary(g){
  const rs=state.requirements[g.id]||[],pending=rs.filter(r=>(Number(r.have)||0)<(Number(r.need)||0));
  if(pending.length){const r=pending[0];return 'あと '+r.label+' '+Math.max(0,(Number(r.need)||0)-(Number(r.have)||0))+(pending.length>1?' ・ほか'+(pending.length-1):'')}
  const acts=state.actions.filter(a=>a.goalId===g.id&&!a.done);
  if(acts.length)return '□ '+acts[0].text+(acts.length>1?' ・ほか'+(acts.length-1):'');
  return '完了できます';
}
function v05ProgressItems(){
  const out=[];
  for(const r of requestsState()){
    if(r.archived||r.status==='completed')continue;
    out.push({source:'request',id:r.id,title:r.title,summary:v05RequestSummary(r),pinned:false,updatedAt:r.updatedAt||r.createdAt||''});
  }
  for(const g of state.goals||[]){
    if(g.status==='done')continue;
    const bazaar=isBazaarGoal(g),b=goalBazaar(g),t=calendarState().today;
    let dateScore=9999;
    if(b&&t&&t.season&&t.day)dateScore=calAbs(b.year,b.season,b.day)-calAbs(t.year,t.season,Number(t.day));
    out.push({source:bazaar?'bazaar':'goal',id:g.id,title:g.title,summary:v05GoalSummary(g),pinned:state.actions.some(a=>a.goalId===g.id&&!a.done&&a.pinned),later:g.status==='someday',dateScore:dateScore,updatedAt:g.updatedAt||g.createdAt||''});
  }
  for(const a of state.actions||[]){
    if(a.done||a.goalId)continue;
    out.push({source:'action',id:a.id,title:a.text,summary:'やること',pinned:!!a.pinned,later:false,dateScore:9999,updatedAt:a.updatedAt||a.createdAt||''});
  }
  out.sort(function(a,b){
    return Number(b.pinned)-Number(a.pinned)||Number(a.later)-Number(b.later)||(a.dateScore??9999)-(b.dateScore??9999)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
  });
  return out;
}
function v05CanComplete(item){
  if(item.source==='request'){
    const r=requestsState().find(x=>x.id===item.id);return !!r&&(r.objectives||[]).length>0&&(r.objectives||[]).every(requestObjectiveDone);
  }
  if(item.source==='goal'||item.source==='bazaar'){
    const g=state.goals.find(x=>x.id===item.id);if(!g)return false;
    const rs=state.requirements[g.id]||[],acts=state.actions.filter(a=>a.goalId===g.id);
    return rs.every(r=>(Number(r.have)||0)>=(Number(r.need)||0))&&acts.every(a=>a.done);
  }
  return false;
}
function v05ProgressControl(item){
  if(v05CanComplete(item))return '<button class="v05-progress-control complete v05ProgressComplete" data-source="'+item.source+'" data-id="'+esc(item.id)+'">'+(item.source==='request'?'達成':'完了')+'</button>';
  if(item.source==='action')return '<button class="v05-progress-control v05ProgressStep" data-source="action" data-id="'+esc(item.id)+'">✓</button>';
  if(item.source==='request'){
    const r=requestsState().find(x=>x.id===item.id),pending=(r?.objectives||[]).filter(o=>!requestObjectiveDone(o));
    if(pending.length===1){const o=pending[0],i=(r.objectives||[]).indexOf(o);if(o.type==='check')return '<button class="v05-progress-control v05ProgressStep" data-source="request" data-id="'+esc(item.id)+'" data-index="'+i+'">✓</button>';if(o.type==='item_quantity'||o.type==='action_count')return '<button class="v05-progress-control v05ProgressStep" data-source="request" data-id="'+esc(item.id)+'" data-index="'+i+'">+1</button>';}
  }
  if(item.source==='goal'||item.source==='bazaar'){
    const rs=state.requirements[item.id]||[],pending=rs.filter(r=>(Number(r.have)||0)<(Number(r.need)||0));
    if(pending.length===1){const i=rs.indexOf(pending[0]);return '<button class="v05-progress-control v05ProgressStep" data-source="goal" data-id="'+esc(item.id)+'" data-index="'+i+'">+1</button>'}
  }
  return '<span style="color:var(--muted);font-weight:900">›</span>';
}
function v05ProgressCard(item){
  return '<div class="card v05-progress-card"><div class="v05-progress-main clickable v05ProgressOpen" data-source="'+item.source+'" data-id="'+esc(item.id)+'"><div class="v05-progress-icon">'+v05Icon(item.source)+'</div><div class="v05-progress-text"><div class="v05-progress-title">'+esc(item.title)+(item.pinned?'<span class="v05-progress-star">★</span>':'')+'</div><div class="v05-progress-summary">'+esc(item.summary||'')+'</div></div>'+v05ProgressControl(item)+'</div></div>';
}
function v05OpenProgress(source,id){
  if(source==='request')return showRequestRecord(id);
  if(source==='goal'||source==='bazaar')return showGoal(id);
  if(source==='action')return openAction(null,id);
}
function v05BindProgress(){
  $$('.v05ProgressOpen').forEach(function(x){x.onclick=function(){v05OpenProgress(x.dataset.source,x.dataset.id)}});
  $$('.v05ProgressStep').forEach(function(b){b.onclick=async function(e){
    e.stopPropagation();const source=b.dataset.source,id=b.dataset.id,idx=Number(b.dataset.index||0);
    if(source==='action'){const a=state.actions.find(x=>x.id===id);if(a)a.done=true}
    if(source==='request'){
      const r=requestsState().find(x=>x.id===id),o=r?.objectives?.[idx];if(o){if(o.type==='check'){o.current=1;o.target=1}else{o.current=Math.min(Math.max(1,Number(o.target)||1),requestObjectiveProgress(o)+1)}r.updatedAt=new Date().toISOString()}
    }
    if(source==='goal'){
      const r=(state.requirements[id]||[])[idx];if(r)r.have=Math.min(Number(r.need)||0,(Number(r.have)||0)+1);
    }
    await save();if($('#plan').classList.contains('active'))plan();if($('#home').classList.contains('active'))home();
  }});
  $$('.v05ProgressComplete').forEach(function(b){b.onclick=async function(e){
    e.stopPropagation();const source=b.dataset.source,id=b.dataset.id;
    if(source==='request')await withUndo('お願いの達成を元に戻せます',function(){const r=requestsState().find(x=>x.id===id);if(r){r.status='completed';r.completedAt=new Date().toISOString()}});
    else await withUndo('目標の完了を元に戻せます',function(){const g=state.goals.find(x=>x.id===id);if(g)g.status='done'});
    if($('#plan').classList.contains('active'))plan();if($('#home').classList.contains('active'))home();
  }});
}
function v05Upcoming(){
  const c=calendarState(),t=c.today,out=[];if(!t||!t.season||!t.day)return out;
  const known=new Set(v05KnownResidentNames()),start=calAbs(t.year,t.season,Number(t.day));
  for(let d=0;d<=7;d++){
    const x=calFromAbs(start+d),entries=dayEntries(x.year,x.season,x.day).filter(e=>e.type!=='birthday'||known.has(e.resident));
    for(const e of entries){out.push({delta:d,label:e.label,icon:e.icon,day:x.season+x.day+'日'});if(out.length>=4)return out}
  }
  return out;
}

const v05LegacyShow=show;
show=function(id){
  $$('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
  let nav=id;
  if(id==='crops'||id==='recipes'||id==='inbox')nav='inbox';
  if(id==='detail')nav=(DETAIL_CONTEXT==='crops'||DETAIL_CONTEXT==='recipes')?'inbox':'plan';
  $$('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.nav===nav));
  window.scrollTo({top:0,behavior:'instant'});
};
openHomeNav=function(dest){show(dest);if(dest==='plan')plan();else if(dest==='inbox')inbox();else if(dest==='crops')crops();else if(dest==='recipes')recipesScreen()};

home=function(){
  const items=v05ProgressItems(),pinned=items.filter(x=>x.pinned).slice(0,4),near=v05Upcoming(),recent=(state.ui?.v05RecentPages||[]).slice(0,3),memoCount=(state.captures||[]).filter(c=>captureStatus(c)==='active').length;
  let html='<div class="v05-today"><div><div class="v05-today-main">'+esc(v05TodayLabel())+'</div><div class="v05-sub">ゲームを再開する前に見る場所</div></div><button class="btn secondary smallbtn" id="v05OpenCalendar">暦</button></div>';
  if(pinned.length)html+='<div class="section"><div class="section-head"><h2>★ 今やる</h2></div>'+pinned.map(v05ProgressCard).join('')+'</div>';
  if(near.length)html+='<div class="section"><div class="section-head"><h2>近いもの</h2></div><div class="card">'+near.map(x=>'<div class="v05-near-row"><span>'+x.icon+' '+esc(x.label)+'</span><b>'+(x.delta===0?'今日':'あと'+x.delta+'日')+'</b></div>').join('')+'</div></div>';
  if(recent.length)html+='<div class="section"><div class="section-head"><h2>さっき触ったもの</h2></div><div class="v05-recent">'+recent.map(x=>'<button class="v05-recent-btn v05RecentOpen" data-type="'+esc(x.type)+'" data-id="'+esc(x.id)+'">'+esc(x.label)+'</button>').join('')+'</div></div>';
  html+='<div class="section"><div class="card clickable" id="v05OpenMemos"><div class="row between"><div><div class="small strong">📝 未整理メモ</div><div class="tiny muted" style="margin-top:4px">思いつきを後から意味づけする</div></div><b>'+memoCount+'件 ›</b></div></div></div>';
  $('#home').innerHTML=html;
  v05BindProgress();
  $('#v05OpenCalendar')?.addEventListener('click',async function(){state.ui.v05NotebookShelf='calendar';await save();show('inbox');inbox()});
  $('#v05OpenMemos')?.addEventListener('click',async function(){state.ui.v05NotebookShelf='memos';await save();show('inbox');inbox()});
  $$('.v05RecentOpen').forEach(x=>x.onclick=function(){v05OpenRecent(x.dataset.type,x.dataset.id)});
};

const v05LegacyPlan=plan;
plan=function(){
  const all=v05ProgressItems(),active=all.filter(x=>!x.later),later=all.filter(x=>x.later),showDone=!!state.ui.v05ShowDone;
  const doneGoals=(state.goals||[]).filter(g=>g.status==='done'),doneRequests=requestsState().filter(r=>r.status==='completed'&&!r.archived);
  let html='<div class="section"><div class="section-head"><div><div class="v05-title">進行中</div><div class="v05-sub">お願い・目標・バザール・やることを、種類で分けずに見る</div></div></div>'+(active.length?active.map(v05ProgressCard).join(''):'<div class="card empty">今進めているものはありません</div>')+'</div>';
  if(later.length)html+='<div class="section"><div class="section-head"><h2>あとで</h2></div>'+later.map(v05ProgressCard).join('')+'</div>';
  if(doneGoals.length||doneRequests.length){html+='<button class="miniLink" id="v05ToggleDone">'+(showDone?'済んだものを閉じる':'済んだもの '+(doneGoals.length+doneRequests.length)+'件')+'</button>';if(showDone)html+='<div class="section" style="margin-top:9px">'+doneRequests.map(r=>'<div class="card clickable v05DoneRequest" data-id="'+esc(r.id)+'"><div class="small strong">🙏 '+esc(r.title)+'</div></div>').join('')+doneGoals.map(g=>'<div class="card clickable v05DoneGoal" data-id="'+esc(g.id)+'"><div class="small strong">🎯 '+esc(g.title)+'</div></div>').join('')+'</div>'}
  $('#plan').innerHTML=html;
  v05BindProgress();
  $('#v05ToggleDone')?.addEventListener('click',async function(){state.ui.v05ShowDone=!showDone;await save();plan()});
  $$('.v05DoneRequest').forEach(x=>x.onclick=function(){showRequestRecord(x.dataset.id)});$$('.v05DoneGoal').forEach(x=>x.onclick=function(){showGoal(x.dataset.id)});
};

const v05LegacyInbox=inbox;
function v05ShelfBack(){state.ui.v05NotebookShelf='index';save().then(inbox)}
function v05NotebookIndex(){
  const residentCount=v05KnownResidentNames().length,requestCount=requestsState().filter(r=>r.status==='completed'||r.archived).length,memoCount=(state.captures||[]).length;
  $('#inbox').innerHTML='<div class="section"><div class="section-head"><div><div class="v05-title">ノート</div><div class="v05-sub">自分の牧場が覚えているもの</div></div></div><input id="v05NotebookSearch" class="search v05-notebook-search" placeholder="ノートを探す / 書く" readonly><div class="v05-shelves"><button class="v05-shelf" data-shelf="crops"><span class="v05-shelf-icon">🌱</span><div class="v05-shelf-name">作物と花</div><div class="v05-shelf-count">'+(state.knownEntities||[]).length+'件</div></button><button class="v05-shelf" data-shelf="recipes"><span class="v05-shelf-icon">🍳</span><div class="v05-shelf-name">料理</div><div class="v05-shelf-count">'+(state.knownRecipes||[]).length+'件</div></button><button class="v05-shelf" data-shelf="residents"><span class="v05-shelf-icon">👤</span><div class="v05-shelf-name">住人</div><div class="v05-shelf-count">'+residentCount+'人</div></button><button class="v05-shelf" data-shelf="requests"><span class="v05-shelf-icon">🙏</span><div class="v05-shelf-name">お願いの記録</div><div class="v05-shelf-count">'+requestCount+'件</div></button><button class="v05-shelf" data-shelf="memos"><span class="v05-shelf-icon">📝</span><div class="v05-shelf-name">メモ</div><div class="v05-shelf-count">'+memoCount+'件</div></button><button class="v05-shelf" data-shelf="calendar"><span class="v05-shelf-icon">📅</span><div class="v05-shelf-name">暦</div><div class="v05-shelf-count">'+esc(v05TodayLabel())+'</div></button></div></div>';
  $('#v05NotebookSearch').onclick=function(){openWrite('search')};
  $$('.v05-shelf').forEach(function(b){b.onclick=async function(){const shelf=b.dataset.shelf;state.ui.v05NotebookShelf=shelf;await save();if(shelf==='crops'){show('crops');crops()}else if(shelf==='recipes'){show('recipes');recipesScreen()}else inbox()}});
}
function v05ResidentsShelf(){
  const xs=v05KnownResidentNames();
  $('#inbox').innerHTML='<button class="back v05-back" id="v05ShelfBack">‹ ノート</button><div class="section"><div class="section-head"><h2>住人</h2></div><div class="v05-inline-list">'+(xs.length?xs.map(n=>'<div class="card clickable v05ResidentOpen" data-name="'+esc(n)+'"><div class="row between"><div class="small strong">👤 '+esc(n)+'</div><b>›</b></div></div>').join(''):'<div class="card empty">まだ記録した住人はいません</div>')+'</div></div>';
  $('#v05ShelfBack').onclick=v05ShelfBack;$$('.v05ResidentOpen').forEach(x=>x.onclick=function(){openResidentCard(x.dataset.name)});
}
function v05RequestsShelf(){
  const xs=requestsState().filter(r=>r.status==='completed'||r.archived);
  $('#inbox').innerHTML='<button class="back v05-back" id="v05ShelfBack">‹ ノート</button><div class="section"><div class="section-head"><h2>お願いの記録</h2></div>'+(xs.length?xs.map(requestCardHtml).join(''):'<div class="card empty">完了したお願いはまだありません</div>')+'</div>';
  $('#v05ShelfBack').onclick=v05ShelfBack;$$('.requestOpen').forEach(b=>b.onclick=function(){showRequestRecord(b.dataset.id)});
}
function v05CalendarShelf(){
  $('#inbox').innerHTML='<button class="back v05-back" id="v05ShelfBack">‹ ノート</button>'+seasonCalendarHtml();
  $('#v05ShelfBack').onclick=v05ShelfBack;bindCalendar();
}
inbox=function(){
  const shelf=state.ui.v05NotebookShelf||'index';
  if(shelf==='memos'){v05LegacyInbox();$('#inbox').insertAdjacentHTML('afterbegin','<button class="back v05-back" id="v05ShelfBack">‹ ノート</button>');$('#v05ShelfBack').onclick=v05ShelfBack;return}
  if(shelf==='residents')return v05ResidentsShelf();
  if(shelf==='requests')return v05RequestsShelf();
  if(shelf==='calendar')return v05CalendarShelf();
  return v05NotebookIndex();
};

const v05LegacyCrops=crops;
crops=function(){
  v05LegacyCrops();
  $('#crops').insertAdjacentHTML('afterbegin','<button class="back v05-back" id="v05CropShelfBack">‹ ノート</button>');
  $('#v05CropShelfBack').onclick=async function(){state.ui.v05NotebookShelf='index';await save();show('inbox');inbox()};
  const add=$('#addKnown');if(add){add.textContent='＋ 書く';add.onclick=function(){openWrite('crop')}};
};
const v05LegacyRecipes=recipesScreen;
recipesScreen=function(){
  v05LegacyRecipes();
  $('#recipes').insertAdjacentHTML('afterbegin','<button class="back v05-back" id="v05RecipeShelfBack">‹ ノート</button>');
  $('#v05RecipeShelfBack').onclick=async function(){state.ui.v05NotebookShelf='index';await save();show('inbox');inbox()};
  const add=$('#addKnownRecipe');if(add){add.textContent='＋ 書く';add.onclick=function(){openWrite('recipe')}};
};

function v05KnownWriteCandidates(raw){
  const q=norm(raw),out=[],seen=new Set();if(!q)return out;
  const push=function(type,id,label,icon,sub){const k=type+'|'+id;if(seen.has(k))return;seen.add(k);out.push({type:type,id:String(id),label:label,icon:icon,sub:sub||'',exact:norm(label)===q})};
  for(const id of state.knownEntities||[]){const label=name(id);if(norm(label).includes(q))push('crop',id,label,iconFor(ent(id)),'ノートにある')}
  for(const id of state.knownRecipes||[]){const label=rname(id);if(norm(label).includes(q))push('recipe',id,label,'🍳','ノートにある')}
  for(const n of v05KnownResidentNames())if(norm(n).includes(q))push('resident',n,n,'👤','ノートにある');
  for(const r of requestsState())if(requestNorm(r.title).includes(requestNorm(raw)))push('request',r.id,r.title,'🙏',r.status==='completed'?'済んだお願い':'進行中のお願い');
  for(const g of state.goals||[])if(norm(g.title).includes(q))push('goal',g.id,g.title,'🎯',g.status==='done'?'済んだ目標':'進行中');
  for(const c of state.captures||[])if(norm(c.text).includes(q))push('memo',c.id,c.text,'📝','メモ');
  return out.sort((a,b)=>Number(b.exact)-Number(a.exact)||a.label.localeCompare(b.label,'ja')).slice(0,8);
}
function v05NewConnections(raw){
  const out=[],q=norm(raw);if(!q)return out;
  const existingMasterIds=new Set(requestsState().map(r=>r.masterId).filter(Boolean));
  const req=requestMasterExactMatches(raw,'');if(req.length===1&&!existingMasterIds.has(req[0].id))out.push({type:'requestMaster',id:req[0].id,label:req[0].title,icon:'🙏',sub:req[0].requester+'のお願い'});
  const recipes=RECIPE_ROWS.length?RECIPE_ROWS:Object.values(FALLBACK_RECIPES);const rr=recipes.find(x=>norm(rname(x.id))===q||norm(x.id)===q);if(rr&&!state.knownRecipes.includes(rr.id))out.push({type:'recipeMaster',id:rr.id,label:rname(rr.id),icon:'🍳',sub:'料理として記録'});
  const e=findByName(raw);if(e&&!state.knownEntities.includes(e.id)&&(isCropEntity(e)||isFruitEntity(e)||isFlower(e)||isMushroom(e)))out.push({type:'entityMaster',id:e.id,label:name(e.id),icon:iconFor(e),sub:'品目として記録'});
  const rn=v05AllResidentNames().find(n=>norm(n)===q);if(rn&&!v05KnownResidentNames().includes(rn))out.push({type:'residentMaster',id:rn,label:rn,icon:'👤',sub:'住人として記録'});
  return out;
}
function v05OpenKnown(c){
  closeModal();if(c.type==='crop')showCrop(c.id);else if(c.type==='recipe')showRecipe(c.id);else if(c.type==='resident')openResidentCard(c.id);else if(c.type==='request')showRequestRecord(c.id);else if(c.type==='goal')showGoal(c.id);else if(c.type==='memo')openCapture(c.id);
}
async function v05SaveMemo(text){
  const now=new Date().toISOString();state.captures.unshift({id:'c'+Date.now(),text:text,status:'active',processed:false,children:[],createdAt:now,updatedAt:now});await save();closeModal();toast('メモしました');if($('#inbox').classList.contains('active'))inbox();else home();
}
async function v05CreateGoal(text){
  const id='g'+Date.now();state.goals.unshift({id:id,title:text,status:'active',blocker:'',kind:'goal',tags:[],season:state.season||'',createdAt:new Date().toISOString()});state.requirements[id]=[];await save();closeModal();showGoal(id);toast('進行中に追加しました');
}
async function v05CreateAction(text){
  state.actions.unshift({id:'a'+Date.now(),text:text,done:false,goalId:null,pinned:false,createdAt:new Date().toISOString()});await save();closeModal();show('plan');plan();toast('やることに追加しました');
}
async function v05RecordEntity(id){
  const e=ent(id);if(!state.knownEntities.includes(id))state.knownEntities.push(id);const p=player(id),ms=masterSeasonsForId(id);if(!(p.knownSeasons||[]).length&&ms.length)p.knownSeasons=ms;p.updatedAt=new Date().toISOString();await save();closeModal();showCrop(id);toast('ノートにつながりました');
}
async function v05RecordRecipe(id){
  const r=recipeData(id);if(!r)return;if(!state.knownRecipes.includes(id))state.knownRecipes.push(id);for(const x of r.ingredient||[])addKnownConcrete(x);await save();closeModal();showRecipe(id);toast('ノートにつながりました');
}
async function v05RecordResident(nameValue){
  state.residentProfiles=state.residentProfiles||{};state.residentProfiles[nameValue]=state.residentProfiles[nameValue]||{};await save();closeModal();openResidentCard(nameValue);toast('住人をノートに記録しました');
}
function v05RequestRecordSheet(master){
  const earlier=requestEarlierStepCandidates(master);
  modal('<h3>🙏 '+esc(master.title)+'</h3><div class="tiny muted">'+esc(master.requester)+'</div>'+requestMasterPreview(master)+(earlier.length?'<div class="card" style="margin-top:10px"><div class="switchline"><div><div class="small strong">以前のお願いも記録する</div><div class="tiny">過去'+earlier.length+'件を補完します。完了日は記録しません。</div></div><label class="switch"><input id="v05BackfillRequest" type="checkbox" checked><span class="slider"></span></label></div></div>':'')+'<div class="stack" style="margin-top:12px"><button class="btn" id="v05RequestActive">進行中として記録</button><button class="btn secondary" id="v05RequestDone">完了済みとして記録</button><button class="btn ghost" onclick="closeModal()">戻る</button></div>');
  const commit=async function(status){const now=new Date().toISOString(),done=status==='completed',r={id:'rq'+Date.now(),title:master.title,requester:master.requester,status:status,note:'',reward:master.reward||'',masterId:master.id,objectives:done?requestMasterCompletedObjectives(master):requestMasterCloneObjectives(master),createdAt:now,updatedAt:now};if(done)r.completedAt=now;const backfill=!!$('#v05BackfillRequest')?.checked;let n=0;await withUndo('お願い登録を元に戻せます',function(){state.requests.unshift(r);if(backfill)n=applyEarlierRequestHistory(master,now)});closeModal();showRequestRecord(r.id);toast(n?'お願いと過去'+n+'件を記録しました':'お願いを記録しました')};
  $('#v05RequestActive').onclick=function(){commit('active')};$('#v05RequestDone').onclick=function(){commit('completed')};
}
function v05CreateCustomEntity(raw){
  modal('<h3>「'+esc(raw)+'」を品目として記録</h3><div class="field"><label>種類</label><select id="v05CustomKind"><option value="crop">作物</option><option value="fruit">果樹</option><option value="flower">花</option><option value="custom">きのこ・その他</option></select></div><div class="sheet-actions"><button class="btn secondary" onclick="closeModal()">戻る</button><button class="btn" id="v05CustomSave">記録</button></div>');
  $('#v05CustomSave').onclick=async function(){const id='user_'+Date.now(),e={id:id,name_ja:raw,kind:$('#v05CustomKind').value,attributes:{},provenance:{source:'user'}};state.customEntities.push(e);state.knownEntities.push(id);player(id).updatedAt=new Date().toISOString();await save();closeModal();showCrop(id);toast('品目として記録しました')};
}
function v05ConnectCandidate(c){
  if(c.type==='requestMaster')return v05RequestRecordSheet(requestMasterById.get(c.id));
  if(c.type==='entityMaster')return v05RecordEntity(c.id);
  if(c.type==='recipeMaster')return v05RecordRecipe(c.id);
  if(c.type==='residentMaster')return v05RecordResident(c.id);
}
function v05RenderWrite(mode){
  const input=$('#v05WriteInput'),box=$('#v05WriteResults'),raw=input.value.trim();if(!raw){box.innerHTML='<div class="v05-empty-compact">見つけたもの、やりたいこと、忘れたくないことをそのまま書けます。</div>';return}
  const known=v05KnownWriteCandidates(raw),fresh=v05NewConnections(raw);
  let html='';
  if(known.length)html+='<div class="v05-write-section"><div class="v05-write-label">ノートにある</div><div class="card">'+known.map((c,i)=>'<button class="v05-write-row v05WriteKnown" data-i="'+i+'"><span>'+c.icon+'</span><span class="main">'+esc(c.label)+'<span class="sub">'+esc(c.sub)+'</span></span><span>開く ›</span></button>').join('')+'</div></div>';
  if(fresh.length)html+='<div class="v05-write-section"><div class="v05-write-label">新しくつながる</div><div class="card">'+fresh.map((c,i)=>'<button class="v05-write-row v05WriteFresh" data-i="'+i+'"><span>'+c.icon+'</span><span class="main">'+esc(c.label)+'<span class="sub">'+esc(c.sub)+'</span></span><span>記録する</span></button>').join('')+'</div></div>';
  html+='<div class="v05-write-action"><button class="btn secondary" id="v05AsMemo">📝 メモ</button><button class="btn secondary" id="v05AsGoal">🎯 進める</button><button class="btn secondary" id="v05AsAction">□ やること</button>'+(mode==='crop'?'<button class="btn secondary" id="v05AsCustom">🌱 品目</button>':'')+'</div>';
  box.innerHTML=html;
  $$('.v05WriteKnown').forEach(b=>b.onclick=function(){v05OpenKnown(known[Number(b.dataset.i)])});
  $$('.v05WriteFresh').forEach(b=>b.onclick=function(){v05ConnectCandidate(fresh[Number(b.dataset.i)])});
  $('#v05AsMemo').onclick=function(){v05SaveMemo(raw)};$('#v05AsGoal').onclick=function(){v05CreateGoal(raw)};$('#v05AsAction').onclick=function(){v05CreateAction(raw)};if($('#v05AsCustom'))$('#v05AsCustom').onclick=function(){v05CreateCustomEntity(raw)};
}
window.openWrite=function(mode){
  mode=mode||'capture';modal('<h3>'+(mode==='search'?'ノートを探す':'書く')+'</h3><div class="field"><input id="v05WriteInput" class="search v05-write-input" autocomplete="off" placeholder="名前やメモをそのまま入力"></div><div id="v05WriteResults"></div><div class="tiny muted" style="margin-top:10px">未来の候補は出しません。確実につながらない入力は、そのままメモにできます。</div>');
  const input=$('#v05WriteInput');input.oninput=function(){v05RenderWrite(mode)};input.onkeydown=function(e){if(e.key!=='Enter'||e.isComposing)return;e.preventDefault();const raw=input.value.trim();if(!raw)return;const known=v05KnownWriteCandidates(raw).filter(c=>c.exact),fresh=v05NewConnections(raw);if(known.length===1)v05OpenKnown(known[0]);else if(!known.length&&fresh.length===1)v05ConnectCandidate(fresh[0]);else v05SaveMemo(raw)};v05RenderWrite(mode);setTimeout(function(){input.focus()},40);
};
openQuickAdd=function(){openWrite('capture')};

const v05LegacyShowCrop=showCrop;showCrop=function(id){v05TouchRecent('crop',id,name(id));return v05LegacyShowCrop(id)};
const v05LegacyShowRecipe=showRecipe;showRecipe=function(id){v05TouchRecent('recipe',id,rname(id));return v05LegacyShowRecipe(id)};
const v05LegacyShowGoal=showGoal;showGoal=function(id){const g=state.goals.find(x=>x.id===id);if(g)v05TouchRecent('goal',id,g.title);return v05LegacyShowGoal(id)};
const v05LegacyShowRequest=showRequestRecord;showRequestRecord=function(id){const r=requestsState().find(x=>x.id===id);if(r)v05TouchRecent('request',id,r.title);return v05LegacyShowRequest(id)};
const v05LegacyResident=openResidentCard;openResidentCard=function(n,day){v05TouchRecent('resident',n,n);return v05LegacyResident(n,day)};

function v05InstallNav(){
  const old=document.querySelector('#app > #quickAdd');if(old)old.remove();
  const nav=$('.bottomnav');if(!nav)return;
  nav.innerHTML='<button class="navbtn active" data-nav="home"><span>☀️</span>きょう</button><button class="navbtn" data-nav="plan"><span>▶</span>進行中</button><button id="v05Write" class="navwrite" aria-label="書く">＋<small>書く</small></button><button class="navbtn" data-nav="inbox"><span>📖</span>ノート</button>';
  $$('.navbtn').forEach(function(b){b.onclick=function(){show(b.dataset.nav);if(b.dataset.nav==='home')home();if(b.dataset.nav==='plan')plan();if(b.dataset.nav==='inbox')inbox()}});$('#v05Write').onclick=function(){openWrite('capture')};
}

v05InstallNav();
state.ui=state.ui||{};if(!state.ui.v05NotebookShelf)state.ui.v05NotebookShelf='index';
home();plan();inbox();show('home');
})();