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
  assert.ok(html.includes('id="cropGrowingBanner"'));
  assert.ok(app.includes("growingBanner.classList.toggle('hidden',!p.growing)"));
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
  assert.ok(!app.includes('id="requestObjectiveCurrent"'));
  assert.ok(!app.includes('class="requestObjectiveStep"'));
  assert.ok(!app.includes('class="requestObjectiveCheck"'));
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
