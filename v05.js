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
