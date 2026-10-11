import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// These tests exercise the real, inline PWA render dispatcher without a browser.
// No extra UI runtime dependency is introduced.
const html=readFileSync('index.html','utf8');
const start=html.indexOf('const MASTER=JSON.parse');
assert.ok(start>=0,'Application bootstrap missing');
const js=html.slice(start,html.indexOf('</script>',start));
const sourceLine=(prefix)=>js.split('\n').find(x=>x.startsWith(prefix));
const dispatcher=[
  sourceLine('const SCREEN_RENDERERS='),
  sourceLine('function renderScreen('),
  sourceLine('function render(){')
].join('\n');
assert.ok(dispatcher.includes('function render(){'),'Active-screen render function missing');
const homeNav=js.match(/function openHomeNav\(dest\)\{[^}]+\}/)?.[0];
assert.ok(homeNav,'Home-to-tab navigation function missing');
const navStart=js.lastIndexOf("document.querySelectorAll('.navbtn').forEach");
const navEnd=js.indexOf(';render();hydrate();',navStart);
assert.ok(navStart>0 && navEnd>navStart,'Bottom navigation handler missing');
const navSnippet=js.slice(navStart,navEnd+1);

function harness(active='home',normalized=false){
  const trace=[],header={value:null};
  const tab={dataset:{nav:active},onclick:null};
  const state={season:'冬',marker:'first'};
  const mock={
    state,INITIAL:{},migrate:s=>s,clone:s=>structuredClone(s),
    reconcileKnownPlantMaster:()=>normalized,
    normalizeLegacyBazaarGoals:()=>false,
    normalizeIngredientGroupKnowledge:()=>false,
    syncLinkedRequestMasterDetails:()=>false,
    syncRecipeKnowledge:()=>trace.push('syncRecipeKnowledge'),
    calendarState:()=>({today:{season:'冬',day:null}}),
    calendarHasToday:()=>false,
    $:q=>q==='.navbtn.active'?tab:q==='#seasonSelect'?header:null,
    setSeasonSelectClass:()=>{},
    syncHeaderSeasonUi:()=>{},
    home:()=>trace.push('home'),
    crops:()=>trace.push('crops'),
    recipesScreen:()=>trace.push('recipes'),
    plan:()=>trace.push('plan'),
    inbox:()=>trace.push('inbox'),
    show:id=>trace.push('show:'+id),
    updateSaveStatus:()=>trace.push('status'),
    save:()=>trace.push('save'),
    PERF_DIAG:{begin:()=>0,record:()=>{}},
    document:{querySelectorAll:()=>[tab]}
  };
  const context={...mock};
  runInNewContext(dispatcher+'\n'+homeNav+'\n'+navSnippet,context);
  return {trace,tab,header,context,run:x=>runInNewContext(x,context)};
}
const screens=['home','crops','recipes','plan','inbox'];

test('render() only rebuilds the selected screen, including initial home',()=>{
  for(const id of screens){
    const h=harness(id);
    h.run('render()');
    const drawn=h.trace.filter(x=>screens.includes(x));
    assert.deepEqual(drawn,[id],id+' should render exactly once');
    assert.ok(h.trace.indexOf('syncRecipeKnowledge')<h.trace.indexOf(id));
    assert.ok(h.trace.indexOf(id)<h.trace.indexOf('show:'+id));
    assert.equal(h.header.value,'冬');
    assert.equal(h.trace.includes('save'),false);
  }
});

test('normalization still performs state saving without redrawing hidden tabs',()=>{
  const h=harness('plan',true);
  h.run('render()');
  assert.deepEqual(h.trace.filter(x=>screens.includes(x)),['plan']);
  assert.equal(h.trace.filter(x=>x==='save').length,1);
});

test('bottom navigation and home shortcuts render the destination once',()=>{
  const h=harness('home');
  h.tab.dataset.nav='crops';
  h.tab.onclick();
  assert.deepEqual(h.trace.filter(x=>screens.includes(x)),['crops']);
  assert.deepEqual(h.trace.filter(x=>x.startsWith('show:')),['show:crops']);

  h.trace.length=0;
  h.run("openHomeNav('inbox')");
  assert.deepEqual(h.trace,['show:inbox','inbox']);
});

test('revisiting a tab produces a fresh screen, not stale cached markup',()=>{
  const h=harness('home');
  h.tab.dataset.nav='plan';
  h.tab.onclick();
  h.tab.dataset.nav='home';
  h.tab.onclick();
  h.tab.dataset.nav='plan';
  h.tab.onclick();
  assert.deepEqual(h.trace.filter(x=>screens.includes(x)),['plan','home','plan']);
});

test('unknown detail route is not treated as a bottom navigation screen',()=>{
  const h=harness('home');
  h.run("renderScreen('detail')");
  assert.deepEqual(h.trace,[]);
  assert.ok(js.includes("show('plan');plan()"),
    'Existing programmatic plan navigation must still render the plan');
});
