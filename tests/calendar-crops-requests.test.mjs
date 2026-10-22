import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const scriptStart=html.indexOf('const MASTER=JSON.parse');
assert.ok(scriptStart>=0);
const app=html.slice(scriptStart,html.indexOf('</script>',scriptStart));
const full=JSON.parse(readFileSync('data/board-master.full.v1.json','utf8'));

test('calendar event guide covers every scheduled festival and bazaar',()=>{
  const start=app.indexOf('function festivalMap('),metaStart=app.indexOf('// Only already calendar-visible events'),end=app.indexOf('function hasFestival(',metaStart);
  assert.ok(start>=0 && metaStart>start && end>metaStart);
  const calendarFns=app.slice(start,metaStart),events=app.slice(metaStart,end);
  const names=[...calendarFns.matchAll(/add\([^,]+,'([^']+)'\)/g)].map(x=>x[1]);
  const guide=vm.runInNewContext(events+'\nEVENT_GUIDE',{esc:String});
  assert.ok(names.length>15,'Must include full seasonal schedule');
  for(const name of names){
    assert.ok(guide[name],name+' has no event guide');
    assert.ok(guide[name].time,name+' has no timing');
    assert.ok(guide[name].description,name+' has no description');
  }
  assert.equal(guide['カウントダウン'].time,'22:00〜23:59');
  assert.equal(guide['星夜祭'].time,'20:00〜23:59');
  assert.equal(guide['かぼちゃ祭り'].time,'11:00・13:00ごろ');
  assert.equal(guide['ぽかぽか祭り'].time,'6:00〜22:00');
  assert.equal(guide['バザール'].time,'10:00〜18:59');
  const sample=vm.runInNewContext(events+"\ncalendarEntryDetails({type:'festival',icon:'🎉',label:'星夜祭'})",{esc:String});
  assert.match(sample,/20:00/);
  assert.match(sample,/約束したパートナー/);
});
test('today events and calendar day details show times without altering festival scheduling',()=>{
  assert.ok(app.includes('entries.map(calendarEntryDetails)'));
  assert.ok(app.includes('info?.time?'));
  assert.ok(app.includes('function calendarEntryDetails('));
  assert.ok(app.includes('function hasFestival('));
  assert.ok(app.includes('function isBazaarDate('));
});
test('growing crops stand out in list and detail using existing Player State',()=>{
  assert.ok(html.includes('cropCompact cropOpen clickable ${p.growing?'));
  assert.ok(html.includes('class="cropGrowingBadge"'));
  assert.ok(html.includes('class="cropGrowingQuick"'));
  assert.ok(app.includes("growToggle?.classList.toggle('active',!!p.growing)"));
  assert.ok(app.includes("p.growing=$('#growing').checked"));
  assert.ok(app.includes("p.growingCount=p.growing?intOrNull($('#growingCount').value):null"));
});
test('request recognition is explicit and the requester has no tappable suggestions',()=>{
  assert.ok(html.includes('id="requestMatchButton"'));
  assert.ok(app.includes("$('#requestMatchButton').onclick=renderMaster"));
  assert.ok(app.includes("requestMasterMatches(title,requester).filter(m=>requestNorm(m.requester)===requestNorm(requester))"));
  assert.ok(!app.includes('residentNameCandidate'));
  assert.ok(!app.includes('requestMasterCandidate'));
  assert.ok(!app.includes('id="requestRequesterSuggestions"'));
  assert.ok(!app.includes('id="requestStatus"'));
  assert.ok(app.includes('class="requestObjectiveCurrent"'));
  assert.ok(app.includes('class="requestObjectiveStep requestObjectiveControls"'));
  assert.ok(app.includes('class="check requestObjectiveCheck"'));
});
test('Harold tea request matches both sourced title variants without showing unconfirmed requests',()=>{
  const master=full.requests.find(r=>r.id==='rqm_gw_108');
  assert.ok(master);
  assert.equal(master.title,'おいしい紅茶と仕事をしたい');
  assert.ok(master.aliases?.includes('おいしいお茶と仕事をしたい'));
  assert.equal(master.requester,'ハロルド');
  assert.equal(master.objectives[0].label,'任意のお茶缶（品質1）');
  assert.equal(master.reward,'カレー粉×10');

  const normStart=app.indexOf('function norm('),normEnd=app.indexOf('function findByName(',normStart);
  const reqStart=app.indexOf('function requestNorm('),reqEnd=app.indexOf('function requestObjectiveCanonicalShape(',reqStart);
  assert.ok(normStart>=0&&normEnd>normStart&&reqStart>=0&&reqEnd>reqStart);
  const context={REQUEST_MASTER:full.requests};
  vm.runInNewContext(app.slice(normStart,normEnd)+'\n'+app.slice(reqStart,reqEnd),context);
  const matches=(title,requester)=>Array.from(context.requestMasterMatches(title,requester),r=>r.id);

  assert.deepEqual(matches('おいしい紅茶と仕事をしたい','ハロルド'),[master.id]);
  assert.deepEqual(matches('おいしいお茶と仕事をしたい','ハロルド'),[master.id]);
  assert.deepEqual(matches('おいしいお茶','ハロルド'),[master.id]);
  assert.deepEqual(matches('おいしいお茶',''),[],'Incomplete title cannot expose an unknown request without requester');
  assert.deepEqual(matches('おいしいお茶と仕事をしたい','エンジュ'),[],'Requester must match');
  assert.deepEqual(matches('おいしい緑茶と仕事をしたい','ハロルド'),[],'Unregistered variations are not silently accepted');
  assert.deepEqual(matches('おいしい','ハロルド'),[],'Multiple possible requests remain hidden');
  assert.equal(context.requestTitleMatchesMasterValue('おいしいお茶と仕事をしたい',master),true);
});
test('flavor text is optional, user-editable, and never invented from missing Master fields',()=>{
  assert.ok(html.includes('id="requestFlavorText"'));
  assert.ok(app.includes("r.flavorText=$('#requestFlavorText').value"));
  assert.ok(app.includes("flavorText:$('#requestFlavorText').value"));
  assert.ok(app.includes("const flavor=String(m.flavorText||'').trim()"));
  assert.ok(app.includes("flavor=String(r.flavorText||requestMasterById.get(r.masterId)?.flavorText||'').trim()"));
  assert.ok(html.includes('class="card requestFlavorDisplay"'));
  assert.equal(full.requests.length,128);
  assert.equal(full.requests.some(r=>r.flavorText),false);
  assert.ok(app.includes("r.status='completed'"));
});


test('request quantities and checkboxes are tracked separately from resident reporting',()=>{
  const begin=app.indexOf('function requestTypeLabel('),end=app.indexOf('function requestCardHtml(',begin);
  const rowStart=app.indexOf('function requestObjectiveRow('),rowEnd=app.indexOf('function completeRequestById(',rowStart);
  assert.ok(begin>=0&&end>begin&&rowStart>=0&&rowEnd>rowStart);
  const context={esc:String};vm.runInNewContext(app.slice(begin,end)+app.slice(rowStart,rowEnd),context);
  const r={status:'active',objectives:[
    {type:'item_quantity',label:'牛乳',target:3,current:2},
    {type:'check',label:'住人の頼み',target:1,current:0}
  ]};
  assert.equal(context.requestReportReady(r),false);
  assert.match(context.requestObjectiveRow(r,r.objectives[0],0),/requestObjectiveCurrent/);
  assert.match(context.requestObjectiveRow(r,r.objectives[0],0),/value="2"/);
  assert.match(context.requestObjectiveRow(r,r.objectives[1],1),/requestObjectiveCheck/);
  r.objectives[0].current=3;r.objectives[1].current=1;
  assert.equal(context.requestReportReady(r),true);
  assert.ok(app.includes('requestReadyHint'));
  assert.ok(app.includes('報告して完了にする'));
  assert.ok(app.includes("r.status='completed'"),'Completing the request remains an explicit action');
});
test('weather, wind and calendar notes autosave without a Save button',()=>{
  const start=app.indexOf('function openCalendarDay('),end=app.indexOf('async function changeCalendarMonth(',start);
  const editor=app.slice(start,end);assert.ok(start>=0&&end>start);
  assert.match(editor,/const persistWeatherOnly=async\(\)=>\{writeCalendarWeather\(year,season,day,selectedWeather,selectedWind\);if\(!await save\(\)\)/);
  assert.equal(editor.split('void persistWeatherOnly()').length-1,2,'Both weather and wind should save on tap');
  assert.ok(!editor.includes('id="saveCalDay"'),'Redundant save action is removed');
  assert.ok(editor.includes('const noteAutosave=bindAutosave('));
  assert.ok(editor.includes('memoEditors.add(calendarNoteGuard)'),'Exit guard preserves unsaved input');
  assert.ok(editor.includes("noteField.addEventListener('input',stageNote)"));
  assert.ok(editor.includes("const back=()=>leaveMemoEditors(closeDay)"));
  assert.ok(editor.includes("const ok=await leaveMemoEditors(async()=>"),'Swipes save before changing dates');
  assert.ok(editor.includes("$('#setTodayBtn').onclick=()=>leaveMemoEditors("),'Today change flushes memo too');
});
test('crop growing toggle is small and available before stock details',()=>{
  const start=app.indexOf('function showCrop('),end=app.indexOf('function intOrNull(',start);
  const sheet=app.slice(start,end);
  assert.ok(sheet.indexOf('class="cropGrowingInline')<sheet.indexOf('id="seedCount"'));
  assert.ok(sheet.includes('id="growing"'));
  assert.ok(!sheet.includes('id="cropGrowingBanner"'));
  assert.ok(html.includes('#crops .filters,#recipes .filters{margin-bottom:12px}'));
  assert.ok(html.includes('#crops .filters.isScrolling'));
  assert.ok(html.includes('-webkit-tap-highlight-color:transparent'));
});

test('home shortages derive from the same editable request objectives and existing goal requirements',()=>{
  const start=app.indexOf('function homeShortageItems('),end=app.indexOf('function home(){',start);
  assert.ok(start>=0&&end>start);
  const state={
    requests:[
      {id:'req1',title:'冬のお願い',status:'active',objectives:[
        {type:'item_quantity',label:'ミルク',current:2,target:5},
        {type:'action_count',label:'挨拶',current:1,target:3},
        {type:'check',label:'確認済み',current:1,target:1}]},
      {id:'reqDone',title:'報告済み',status:'completed',objectives:[{type:'check',label:'対象外',current:0,target:1}]},
      {id:'reqArchive',title:'保管',archived:true,status:'active',objectives:[{type:'check',label:'対象外2',current:0,target:1}]}
    ],
    goals:[{id:'goal1',title:'道具強化',status:'active'}],
    requirements:{goal1:[{label:'木材',have:1,need:4,quality:'★2'}]}
  };
  const ctx={state,requestsState:()=>state.requests,
    requestObjectiveProgress:o=>o.type==='check'?(o.current?1:0):Math.max(0,Number(o.current)||0),
    planKind:()=> 'plan',esc:String};
  vm.runInNewContext(app.slice(start,end),ctx);
  let shortages=Array.from(ctx.homeShortageItems());
  assert.deepEqual(shortages.map(x=>x.label),['ミルク','挨拶','木材']);
  assert.match(ctx.homeShortageRowHtml(shortages[0]),/現在 <b>2<\/b>/);
  assert.match(ctx.homeShortageRowHtml(shortages[0]),/必要 <b>5<\/b>/);
  assert.match(ctx.homeShortageRowHtml(shortages[0]),/data-kind="request"/);
  state.requests[0].objectives[0].current=5;
  state.requests[0].objectives[1].current=3;
  shortages=Array.from(ctx.homeShortageItems());
  assert.deepEqual(shortages.map(x=>x.label),['木材'],'Fulfilled requests must disappear from shortage list before resident report');
  assert.ok(app.includes("showRequestRecord(x.dataset.id,'home')"),'Request shortage opens its request detail');
  assert.ok(app.includes("openGoalSheet(x.dataset.id,'home')"),'Goal shortage still opens its goal detail');
});


test('calendar note autosave flushes before closing and before switching days',async()=>{
  const saveStart=app.indexOf('function bindAutosave('),saveEnd=app.indexOf('// RAM-only editor lifecycle.',saveStart);
  const dayStart=app.indexOf('function openCalendarDay('),dayEnd=app.indexOf('async function changeCalendarMonth(',dayStart);
  assert.ok(saveStart>=0&&saveEnd>saveStart&&dayStart>=0&&dayEnd>dayStart);
  const listeners=()=>new Map();
  const element=(value='')=>{
    const calls=listeners();
    return{value,style:{},dataset:{},classList:{toggle(){}},addEventListener:(ev,fn)=>{
      if(!calls.has(ev))calls.set(ev,[]);calls.get(ev).push(fn)
    },removeEventListener:(ev,fn)=>calls.set(ev,(calls.get(ev)||[]).filter(x=>x!==fn)),
    dispatch:(ev)=>Promise.all((calls.get(ev)||[]).map(fn=>fn()))}
  };
  const notes={},weather={},saves=[],events=[],timers=new Map(),calendar={year:1,viewSeason:'冬',today:{year:1,season:'冬',day:4}};
  let seq=0,controls={},markup='';
  const ctx={
    state:{season:'冬'},memoRecipeReturn:null,memoEditors:new Set(),CALENDAR_RETURN_CONTEXT:'calendar',
    CAL_WEEKDAYS:['日','月','火','水','木','金','土'],WEATHER_TYPES:['晴れ','雨'],WIND_LEVELS:[0,1,2],
    calendarState:()=>calendar,calendarNotes:()=>notes,calendarWeather:()=>weather,
    calendarDayNeighbor:(_y,_s,day,delta)=>day+delta>0&&day+delta<=31?{year:1,season:'冬',day:day+delta}:null,
    calendarHasToday:()=>true,dayEntries:()=>[],calWeekday:()=>0,esc:String,
    weatherSymbol:w=>w,windName:n=>String(n),windMeterHtml:n=>String(n),
    writeCalendarWeather:(_y,_s,day,forecast,wind)=>weather[day]={weather:forecast,wind},
    deferMemoNavigation:()=>false,bindCalendarDaySwipe:()=>{},updateSaveStatus:()=>{},
    setTimeout:(fn)=>{const id=++seq;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id),
    async save(){saves.push(JSON.parse(JSON.stringify({notes,weather})));return true},
    modal(html){markup=html;controls={};
      for(const id of ['calMemo','calendarDayPrev','calendarDayNext','cancelCalDay','setTodayBtn']){
        controls['#'+id]=element(id==='calMemo'?String(notes[Number(markup.match(/の月 (\d+)日/)[1])]||''):'')
      }
      controls['.dayWeather']=[Object.assign(element(),{dataset:{weather:'晴れ'}}),Object.assign(element(),{dataset:{weather:'雨'}})];
      controls['.dayWind']=[0,1,2].map(n=>Object.assign(element(),{dataset:{wind:String(n)}}))
    },
    $:selector=>controls[selector]||null,
    $$:selector=>controls[selector]||[],
    async leaveMemoEditors(callback){
      for(const editor of [...this.memoEditors])if(!await editor.flush())return false;
      for(const editor of [...this.memoEditors])editor.dispose();
      await callback();return true
    },
    openCalendarSheet:()=>events.push('back to calendar'),closeModal:()=>events.push('close'),
    home:()=>{},render:()=>{},toast:()=>{},openResidentCard:()=>{}
  };
  vm.runInNewContext(app.slice(saveStart,saveEnd)+'\n'+app.slice(dayStart,dayEnd),ctx);
  ctx.openCalendarDay(5,{year:1,season:'冬'});
  assert.equal(ctx.memoEditors.size,1);
  assert.ok(!markup.includes('id="saveCalDay"'));
  controls['#calMemo'].value='一行目\n二行目';
  await controls['#calMemo'].dispatch('input');
  assert.equal(notes[5],'一行目\n二行目','Latest note is staged synchronously for beforeunload');
  assert.equal(saves.length,0,'Typing is debounced');
  await controls['#calendarDayNext'].onclick();
  assert.equal(saves[0].notes[5],'一行目\n二行目','Swipe must flush before changing dates');
  assert.equal(ctx.memoEditors.size,1,'New day editor becomes active');
  controls['#calMemo'].value='翌日メモ';
  await controls['#calMemo'].dispatch('input');
  await controls['#cancelCalDay'].onclick();
  assert.equal(saves.at(-1).notes[6],'翌日メモ','Back must flush current date');
  assert.deepEqual(events,['back to calendar']);
  assert.equal(ctx.memoEditors.size,0);
  assert.equal(timers.size,0,'No delayed save should target a discarded calendar editor');
});
