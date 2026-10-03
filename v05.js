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
