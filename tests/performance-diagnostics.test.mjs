import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('// PERFORMANCE_DIAGNOSTICS_BEGIN');
const end=html.indexOf('// PERFORMANCE_DIAGNOSTICS_END',start);
assert.ok(start>=0&&end>start,'Diagnostic code is missing');
const diagSource=html.slice(start,end);

function harness(options={}){
  let time=0;
  const nav={domContentLoadedEventEnd:options.domReady??120};
  const performance=options.disabled?undefined:{
    now:()=>time,
    getEntriesByType:()=>[nav]
  };
  const sandbox={state:{memo:'MY_PRIVATE_GAME_PROGRESS'},performance};
  const diag=runInNewContext(diagSource+'\nPERF_DIAG',sandbox);
  return {
    diag,
    setTime:value=>{time=value},
    now:()=>time,
    nav
  };
}

test('startup duration measures since performance origin and is recorded once',()=>{
  const h=harness({domReady:193.5});
  h.setTime(276.34);
  h.diag.markReady();
  h.setTime(1000);
  h.diag.markReady();
  const result=h.diag.report('0.11.13');
  assert.match(result,/起動完了.*276\.3 ms/);
  assert.match(result,/DOM準備.*193\.5 ms/);
  assert.match(result,/この起動中の計測/);
});

test('tab, render and save measurements return bounded statistics',()=>{
  const h=harness();
  h.setTime(50);
  const tab=h.diag.begin();
  h.setTime(64.456);
  h.diag.record('tab',tab);
  const draw=h.diag.begin();
  h.setTime(76.456);
  h.diag.record('render',draw);
  const save=h.diag.begin();
  h.setTime(116.456);
  h.diag.record('save',save);
  const result=h.diag.report('0.11.13');
  assert.match(result,/タブ移動: 1回.*14\.5 ms/);
  assert.match(result,/画面描画: 1回.*12\.0 ms/);
  assert.match(result,/保存完了: 1回.*40\.0 ms/);
});

test('long sessions retain only 40 recent samples',()=>{
  const h=harness();
  for(let n=1;n<=45;n++){
    h.setTime(n*100);
    const begin=h.diag.begin();
    h.setTime(n*100+n);
    h.diag.record('tab',begin);
  }
  const result=h.diag.report('0.11.13');
  assert.match(result,/タブ移動: 40回/);
  assert.match(result,/中央値 25\.0 ms/);
  assert.match(result,/P95 43\.0 ms/);
  assert.match(result,/最大 45\.0 ms/);
});

test('invalid categories, negative durations and missing Performance API never throw',()=>{
  const h=harness();
  h.setTime(30);
  h.diag.record('unknown',0);
  h.diag.record('tab',100);
  h.diag.record('tab',NaN);
  assert.match(h.diag.report('0.11.13'),/タブ移動: 未計測/);
  const absent=harness({disabled:true}).diag;
  assert.equal(absent.begin(),null);
  absent.markReady();
  absent.record('save',0);
  assert.match(absent.report('0.11.13'),/保存完了: 未計測/);
});

test('diagnostic reporting contains no Player State and performs no storage or upload',()=>{
  const h=harness();
  h.setTime(18);
  h.diag.markReady();
  const result=h.diag.report('0.11.13');
  assert.ok(!result.includes('MY_PRIVATE_GAME_PROGRESS'));
  assert.ok(!/localStorage|sessionStorage|indexedDB|fetch\s*\(|sendBeacon|XMLHttpRequest/.test(diagSource));
  assert.ok(!/state\./.test(diagSource));
});

test('instrumentation is connected to app events without changing storage schema',()=>{
  assert.ok(html.includes("function openHomeNav(dest){const t=PERF_DIAG.begin();"));
  assert.ok(html.includes("PERF_DIAG.record('tab',t)"));
  assert.ok(html.includes("PERF_DIAG.record('render',t)"));
  assert.ok(html.includes("PERF_DIAG.record('save',startedAt)"));
  assert.ok(html.includes('PERF_DIAG.markReady()'));
  assert.ok(html.includes('id="togglePerfDiagnostics"'));
  assert.ok(html.includes('id="refreshPerfDiagnostics"'));
  assert.ok(html.includes('id="copyPerfDiagnostics"'));
  assert.ok(html.includes("el.textContent=PERF_DIAG.report(APP_VERSION)"));
  assert.ok(html.includes("const STORAGE='gb-board-data'"));
  assert.ok(html.includes("const APP_VERSION='0.11.13'"));
});
