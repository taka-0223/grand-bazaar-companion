import test from 'node:test';
import assert from 'node:assert/strict';
import {projectKnownEconomy,evaluateKnownPlan,compareKnownPlans} from '../lib/known-economy.mjs';
import {fixture,copy,act,plan} from './economy-fixture.mjs';
const view = f => projectKnownEconomy(f.catalog,f.knowledge);
const run = (f,p) => evaluateKnownPlan(view(f),f.player,p,f.scenario);
const add = (f,r) => {f.catalog.routes.push(r);f.knowledge.route_ids.push(r.id);f.player.available_route_ids.push(r.id);};

// Accounting: one terminal comparison from a shared opening inventory/cash state.
test('direct-sale baseline with no operations has zero incremental benefit', () => {
  const f=fixture(),r=run(f,plan('direct'));assert.equal(r.status,'ok');
  assert.equal(r.net_gain_vs_direct_sale_g,0);assert.equal(r.gain_on_consumed_value_pct,null);
});
test('held material is charged at forgone known sale value, not zero', () => {
  const f=fixture(),r=run(f,plan('process',act('process')));
  assert.equal(r.net_gain_vs_direct_sale_g,15); // 100 - 80 - 5
  assert.equal(r.cash_spent_g,5);assert.equal(r.net_opening_inventory_reduction_value_g,80);
});
test('buying ingredient is counted as cash, not purchase price plus sale opportunity again', () => {
  const f=fixture(),r=run(f,plan('buy-cook',act('buy_ingredient'),act('cook')));
  assert.equal(r.status,'ok');assert.equal(r.net_gain_vs_direct_sale_g,85); //200-110-5
  assert.equal(r.cash_spent_g,115);assert.equal(r.net_opening_inventory_reduction_value_g,0);
});
test('multistep processing never double-counts intermediate material value', () => {
  const f=fixture(),r=run(f,plan('cook-held',act('process'),act('cook',60)));
  assert.equal(r.net_gain_vs_direct_sale_g,110); //200 - raw80 - costs10
  assert.equal(r.elapsed_minutes,61);assert.equal(r.cash_spent_g,10);
  assert.deepEqual(r.inventory_changes.map(x=>x.item_id),['dish','raw']);
});
test('historical seed/feed/acquisition spend does not change a forward decision', () => {
  const f=fixture(),p=plan('held',act('process'),act('cook',60)),a=run(f,p);
  f.player.historical_costs_g={raw:1000000};
  assert.deepEqual(run(f,p),a);
});
test('growth-buy seeds-processing-cooking chain accounts for leftover harvest separately', () => {
  const f=fixture(),r=run(f,plan('grow',act('buy_seed'),act('grow'),act('process',4320),act('cook',4380)));
  assert.equal(r.status,'ok');assert.equal(r.cash_spent_g,30);
  assert.equal(r.net_gain_vs_direct_sale_g,330); //200 dish + 2 surplus raw*80 -30
  assert.equal(r.cash_received_g,0); // not silently treating predicted sale as cash received
  assert.deepEqual(r.resource_unit_minutes,{field:4320,mill:60});
});
test('existing seed value versus a newly bought seed are distinct comparisons', () => {
  const f=fixture();f.player.inventory={seed:1};
  const r=run(f,plan('own-seed',act('grow')));
  assert.equal(r.cash_spent_g,0);assert.equal(r.net_gain_vs_direct_sale_g,230); //240-10
});
test('repeated harvest can be modeled by an explicit batch without inventing infinite yield', () => {
  const f=fixture();add(f,f.route('two_harvests','grow',{seed:1},{raw:7},4,4800,
    [{resource_id:'field',units:1,duration_minutes:4800}],{max_uses:1}));
  const r=run(f,plan('repeat-harvest',act('buy_seed'),act('two_harvests')));
  assert.equal(r.net_gain_vs_direct_sale_g,536); //7*80-20-4
  assert.equal(r.resource_unit_minutes.field,4800);
});
test('mixed held and purchased inputs draw from shared stock only once', () => {
  const f=fixture(),r=run(f,plan('mixed',act('buy_raw'),act('process'),act('process',60)));
  assert.equal(r.net_gain_vs_direct_sale_g,20); //2*100-80-90-10
});
test('coproduct is credited only via a confirmed terminal quote', () => {
  const f=fixture();add(f,f.route('byproduct_process','process',{raw:1},{ingredient:1,byproduct:1},5,1));
  const r=run(f,plan('byproduct',act('byproduct_process')));
  assert.equal(r.net_gain_vs_direct_sale_g,45); //100+30-80-5
});
test('same starting stock means simpler alternate opportunity is visible in the result', () => {
  const f=fixture();const r=compareKnownPlans(f.catalog,f.knowledge,f.player,[
    plan('direct'),plan('simple',act('simple')),plan('cooked',act('process'),act('cook',60))],f.scenario);
  assert.equal(r.best_plan_id,'cooked');
  assert.equal(r.ranked[0].net_gain_vs_direct_sale_g,110);
  assert.equal(r.ranked[0].gain_vs_best_other_evaluated_plan_g,50); //not +110 vs better simple
});
test('a highest gross-value plan can be worse after extra inputs/spending', () => {
  const f=fixture();f.catalog.quotes.find(q=>q.item_id==='dish').unit_sell_g=250;
  f.catalog.routes.find(r=>r.id==='cook').cash_cost_g=150;
  const r=compareKnownPlans(f.catalog,f.knowledge,f.player,[plan('simple',act('simple')),
    plan('expensive',act('process'),act('cook',60))],f.scenario);
  assert.equal(r.best_plan_id,'simple'); //60 versus 15
});
test('fully reimbursing original stock does not count that stock value twice', () => {
  const f=fixture();const r=run(f,plan('replace-raw',act('process'),act('buy_raw',60)));
  assert.equal(r.net_gain_vs_direct_sale_g,5); //100 new ingredient -95 cash, original raw restored
});

// Feasibility is a time line, not a static subtraction of ingredient names.
test('next-bazaar deadline rules out growth that cannot finish', () => {
  const f=fixture();f.scenario.horizon_minutes=100;
  assert.equal(run(f,plan('late',act('buy_seed'),act('grow'))).status,'deadline_missed');
});
test('intermediate output cannot be spent before it finishes', () => {
  const f=fixture();assert.equal(run(f,plan('early',act('process'),act('cook',59))).status,'insufficient_unreserved_stock');
});
test('intermediate output is usable at exact completion time', () => {
  const f=fixture();assert.equal(run(f,plan('boundary',act('process'),act('cook',60))).status,'ok');
});
test('instant purchases feed a same-time action in declared order', () => {
  const f=fixture();assert.equal(run(f,plan('instant',act('buy_ingredient'),act('cook'))).status,'ok');
});
test('same-time order matters: cooking before purchase does not use future material', () => {
  const f=fixture();assert.equal(run(f,plan('wrong-order',act('cook'),act('buy_ingredient'))).status,'insufficient_unreserved_stock');
});
test('cash must be available before later receipts, not merely profitable overall', () => {
  const f=fixture();f.player.cash_g=100;
  assert.equal(run(f,plan('low-cash',act('buy_ingredient'),act('cook'),act('sell_dish',1))).status,'insufficient_cash');
});
test('actual sales release cash; terminal valuation does not', () => {
  const f=fixture();f.player.cash_g=40;
  const r=run(f,plan('sale-finances',act('sell_raw'),act('buy_ingredient'),act('cook'),act('sell_dish',1)));
  assert.equal(r.status,'ok');assert.equal(r.cash_received_g,280);assert.equal(r.peak_funding_g,35);
  assert.equal(r.net_gain_vs_direct_sale_g,85); //280-115-80
});
test('two plans cannot both consume the same one-unit stock in a combined plan', () => {
  const f=fixture();assert.equal(run(f,plan('double-use',act('simple'),act('process',20))).status,'insufficient_unreserved_stock');
});
test('reserved request/seed stock is protected even for a profitable recipe', () => {
  const f=fixture();f.player.reserved={raw:1};
  assert.equal(run(f,plan('reserved',act('simple'))).status,'insufficient_unreserved_stock');
});
test('known available shop offers still have purchase quotas', () => {
  const f=fixture();assert.equal(run(f,plan('quota',act('buy_ingredient'),act('buy_ingredient'),act('buy_ingredient'))).status,'route_quota_exceeded');
});
test('shop not currently available is not inferred open merely from discovery', () => {
  const f=fixture();f.player.available_route_ids=[];
  assert.equal(run(f,plan('closed',act('buy_raw'))).status,'known_route_not_available_now');
});
test('known seasonal/weekday windows must contain the whole operation', () => {
  const f=fixture();f.catalog.routes.find(r=>r.id==='grow').availability_windows=[{start:0,end:4000}];
  assert.equal(run(f,plan('season-end',act('buy_seed'),act('grow'))).status,'outside_known_window');
});
test('two mills jobs cannot share a single occupied slot', () => {
  const f=fixture();f.player.inventory.raw=2;
  assert.equal(run(f,plan('overlap',act('process'),act('process',30))).status,'resource_capacity_exceeded');
});
test('adjacent jobs can share a single slot at an exact boundary', () => {
  const f=fixture();f.player.inventory.raw=2;
  assert.equal(run(f,plan('adjacent',act('process'),act('process',60))).status,'ok');
});
test('parallel free slots produce elapsed time, not the sum of all durations', () => {
  const f=fixture();f.player.inventory.raw=2;f.player.resource_capacities.mill=2;
  const r=run(f,plan('parallel',act('process'),act('process')));
  assert.equal(r.elapsed_minutes,60);assert.equal(r.resource_unit_minutes.mill,120);
});
test('field capacity constrains simultaneous crop plans', () => {
  const f=fixture();f.player.inventory={seed:2};
  assert.equal(run(f,plan('two-fields',act('grow'),act('grow'))).status,'resource_capacity_exceeded');
});
test('missing resource capacity is not infinite capacity', () => {
  const f=fixture();delete f.player.resource_capacities.mill;
  assert.equal(run(f,plan('mill-unknown',act('process'))).status,'resource_capacity_not_recorded');
});
test('recorded zero resource capacity is distinct from unrecorded capacity', () => {
  const f=fixture();f.player.resource_capacities.mill=0;
  assert.equal(run(f,plan('no-mill',act('process'))).status,'resource_capacity_exceeded');
});

// Unknown game facts, quality and sale assumptions are never zero-cost defaults.
test('missing cost is not free', () => {
  const f=fixture();delete f.catalog.routes.find(r=>r.id==='process').cash_cost_g;
  assert.equal(run(f,plan('unknown-cost',act('process'))).status,'known_inputs_unconfirmed');
});
test('missing duration is not instant', () => {
  const f=fixture();delete f.catalog.routes.find(r=>r.id==='process').duration_minutes;
  assert.equal(run(f,plan('unknown-duration',act('process'))).status,'known_inputs_unconfirmed');
});
test('missing stock quota is not unlimited', () => {
  const f=fixture();delete f.catalog.routes.find(r=>r.id==='buy_raw').max_uses;
  assert.equal(run(f,plan('unknown-limit',act('buy_raw'))).status,'known_inputs_unconfirmed');
});
test('conflicting yield/recipe values are not silently adopted', () => {
  const f=fixture();f.catalog.routes.find(r=>r.id==='grow').confidence='source_conflict';
  assert.equal(run(f,plan('uncertain-yield',act('buy_seed'),act('grow'))).status,'known_inputs_unconfirmed');
});
test('missing terminal price allows cash view but no economic ranking', () => {
  const f=fixture();f.knowledge.quote_ids=f.knowledge.quote_ids.filter(id=>id!=='q_ingredient');
  const r=run(f,plan('no-price',act('process')));
  assert.equal(r.status,'valuation_incomplete');assert.equal(r.cash_spent_g,5);
  assert.equal(r.net_gain_vs_direct_sale_g,null);assert.deepEqual(r.missing_known_quote_item_ids,['ingredient']);
});
test('known zero sale price is still a valid zero', () => {
  const f=fixture();f.catalog.quotes.find(q=>q.item_id==='ingredient').unit_sell_g=0;
  const r=run(f,plan('zero',act('process')));assert.equal(r.status,'ok');
  assert.equal(r.net_gain_vs_direct_sale_g,-85);
});
test('conflicting known sale quotes block comparison instead of selecting a convenient value', () => {
  const f=fixture();f.catalog.quotes.push({...f.catalog.quotes.find(q=>q.item_id==='ingredient'),id:'q_alt',unit_sell_g:999});
  f.knowledge.quote_ids.push('q_alt');assert.equal(run(f,plan('conflict',act('process'))).status,'valuation_incomplete');
});
test('untouched stock lacking a sale quote does not obstruct an unrelated comparison', () => {
  const f=fixture();f.knowledge.quote_ids=f.knowledge.quote_ids.filter(id=>id!=='q_byproduct');
  f.player.inventory.byproduct=20;
  assert.equal(run(f,plan('unrelated',act('process'))).status,'ok');
});
test('a different star-quality lot is not interchangeable by matching item name', () => {
  const f=fixture();f.catalog.items.push({id:'raw_high_quality',name_ja:'架空の原料'});
  f.knowledge.item_ids.push('raw_high_quality');f.player.inventory={raw_high_quality:1};
  assert.equal(run(f,plan('wrong-grade',act('process'))).status,'insufficient_unreserved_stock');
});
test('a quote under another sale/quality/bonus scenario is not usable', () => {
  const f=fixture();f.catalog.quotes.find(q=>q.item_id==='ingredient').scenario_id='other_quality';
  assert.equal(run(f,plan('wrong-price-basis',act('process'))).status,'valuation_incomplete');
});
test('terminal liquidation assumption must be explicit, not guaranteed market proceeds', () => {
  const f=fixture();delete f.scenario.terminal_valuation;
  assert.equal(run(f,plan('unstated',act('process'))).status,'scenario_not_confirmed');
});
test('unrecorded quantities in a partial inventory are not inferred to be zero', () => {
  const f=fixture();f.player.inventory_is_complete=false;
  assert.equal(run(f,plan('partial',act('process'))).status,'inventory_quantity_not_recorded');
  f.player.inventory.ingredient=0;assert.equal(run(f,plan('partial',act('process'))).status,'ok');
});

// Noninterference: hidden alternatives do not affect public names, rank, count or reasons.
test('no discoveries means no item, route or quote enumerations', () => {
  const f=fixture(),v=projectKnownEconomy(f.catalog,{});
  assert.deepEqual(v,{schema_version:1,scope:'known_facts_only',items:[],routes:[],quotes:[],resource_ids:[]});
});
test('knowing an item does not disclose how to buy/grow/cook it', () => {
  const f=fixture();f.knowledge.route_ids=[];
  assert.equal(view(f).items.length,6);assert.equal(view(f).routes.length,0);
});
test('knowing a shop does not disclose its unseen offer', () => {
  const f=fixture();f.knowledge.route_ids=f.knowledge.route_ids.filter(id=>id!=='buy_ingredient');
  assert(!view(f).routes.some(r=>r.id==='buy_ingredient'));
});
test('a known route referencing an unknown ingredient is completely excluded', () => {
  const f=fixture();f.knowledge.item_ids=f.knowledge.item_ids.filter(id=>id!=='ingredient');
  assert(!view(f).routes.some(r=>['process','cook','buy_ingredient'].includes(r.id)));
});
test('name/route knowledge alone does not bypass an unknown prerequisite fact', () => {
  const f=fixture();f.catalog.routes.find(r=>r.id==='process').requires_fact_ids=['special_bonus'];
  assert(!view(f).routes.some(r=>r.id==='process'));
  f.knowledge.fact_ids.push('special_bonus');assert(view(f).routes.some(r=>r.id==='process'));
});
test('knowledge of product does not reveal unseen price', () => {
  const f=fixture();f.knowledge.quote_ids=[];assert.equal(view(f).quotes.length,0);
});
test('quote adjustment from an unknown decor/buff cannot change the result', () => {
  const f=fixture();f.catalog.quotes.find(q=>q.item_id==='ingredient').requires_fact_ids=['unknown_bonus'];
  const a=run(f,plan('bonus',act('process')));
  f.catalog.quotes.find(q=>q.item_id==='ingredient').unit_sell_g=999999;
  assert.deepEqual(run(f,plan('bonus',act('process'))),a);
});
test('hidden and nonexistent requested route return the same opaque result', () => {
  const f=fixture();f.knowledge.route_ids=f.knowledge.route_ids.filter(id=>id!=='simple');
  assert.deepEqual(run(f,plan('probe',act('simple'))),run(f,plan('probe',act('made_up'))));
});
test('raw Master acquisition/unlock/title metadata is never passed into the known view', () => {
  const f=fixture();f.catalog.items[0].secret_acquisition='SECRET_UNLOCK';
  f.catalog.routes[0].hidden_future_recipe='SECRET_FUTURE';
  f.catalog.quotes[0].later_shop='SECRET_SHOP';
  assert(!JSON.stringify(view(f)).includes('SECRET_'));
});
test('hundreds of hidden alternatives cannot change known comparison or leak existence/count', () => {
  const f=fixture(),plans=[plan('direct'),plan('simple',act('simple')),plan('cook',act('process'),act('cook',60))];
  const before=compareKnownPlans(f.catalog,f.knowledge,f.player,plans,f.scenario);
  for(let i=0;i<200;i++) {
    const r=f.route('hidden_'+i,'process',{raw:1},{dish:100000+i},0,0,[],{name_ja:'SECRET '+i});
    f.catalog.routes.push(r); // intentionally NOT disclosed
    plans.push(plan('hidden-plan-'+i,act(r.id)));
    assert.deepEqual(compareKnownPlans(f.catalog,f.knowledge,f.player,plans,f.scenario),before);
  }
});
test('malformed hidden data and duplicate hidden plan IDs do not poison known output', () => {
  const f=fixture(),p=[plan('direct')],a=compareKnownPlans(f.catalog,f.knowledge,f.player,p,f.scenario);
  f.catalog.items.push({id:'hidden',name_ja:'SECRET'}, {id:'hidden',name_ja:'SECRET'});
  f.catalog.routes.push({id:'secret'}, {id:'secret'});
  f.catalog.quotes.push({id:'hidden'}, {id:'hidden'});
  p.push(plan('direct',act('secret')),plan('direct',act('secret')));
  assert.deepEqual(compareKnownPlans(f.catalog,f.knowledge,f.player,p,f.scenario),a);
});
test('reordering the hidden and visible Master rows does not affect stable output', () => {
  const f=fixture(),p=[plan('simple',act('simple')),plan('direct')];
  const before=compareKnownPlans(f.catalog,f.knowledge,f.player,p,f.scenario);
  f.catalog.items.reverse();f.catalog.routes.reverse();f.catalog.quotes.reverse();
  assert.deepEqual(compareKnownPlans(f.catalog,f.knowledge,f.player,p,f.scenario),before);
});
test('output mutation and evaluation leave master, knowledge, player, plans and scenario unchanged', () => {
  const f=fixture(),p=[plan('process',act('process'))],before=copy({f,p});
  const output=compareKnownPlans(f.catalog,f.knowledge,f.player,p,f.scenario);
  output.ranked[0].steps[0].inputs[0].quantity=100000;
  assert.deepEqual(copy({f,p}),before);
});
test('ties are stable by visible plan ID, not source/catalog position', () => {
  const f=fixture();const r=compareKnownPlans(f.catalog,f.knowledge,f.player,[plan('z'),plan('a')],f.scenario);
  assert.equal(r.best_plan_id,'a');assert.deepEqual(r.ranked.map(x=>x.plan_id),['a','z']);
});
test('no comparison output claims an optimum over undiscovered or unenumerated plans', () => {
  const f=fixture(),r=compareKnownPlans(f.catalog,f.knowledge,f.player,[plan('direct')],f.scenario);
  assert.equal(r.scope,'evaluated_known_candidates_only');
  assert.equal(r.ranked[0].gain_vs_best_other_evaluated_plan_g,null);
  assert(!JSON.stringify(r).includes('hidden_count'));
});

// Resource/budget tradeoff: the true optimum can change without any fact discovery.
test('same known make/buy candidates change recommendation with deadline, not hidden options', () => {
  const f=fixture(),plans=[plan('grow',act('buy_seed'),act('grow'),act('process',4320),act('cook',4380)),
    plan('buy',act('buy_ingredient'),act('cook'))];
  assert.equal(compareKnownPlans(f.catalog,f.knowledge,f.player,plans,f.scenario).best_plan_id,'grow');
  f.scenario.horizon_minutes=100;
  const short=compareKnownPlans(f.catalog,f.knowledge,f.player,plans,f.scenario);
  assert.equal(short.best_plan_id,'buy');assert.equal(short.unranked[0].status,'deadline_missed');
});
test('fixed setup payment is charged once as an explicit action, never hidden amortization', () => {
  const f=fixture();add(f,f.route('setup','buy',{}, {},70,0,[],{max_uses:1}));
  const r=run(f,plan('new-setup',act('setup'),act('process'),act('cook',60)));
  assert.equal(r.net_gain_vs_direct_sale_g,40); //110-70
  assert.equal(r.cash_spent_g,80);
});
test('invalid negative input quantities cannot create inventory', () => {
  const f=fixture();f.catalog.routes.find(r=>r.id==='process').inputs[0].quantity=-1;
  assert.equal(run(f,plan('bad',act('process'))).status,'known_inputs_unconfirmed');
});
test('invalid negative timestamps are rejected', () => {
  const f=fixture();assert.equal(run(f,plan('bad',act('process',-1))).status,'invalid_plan');
});
test('empty stock-zero cash route may make nothing but still must honor known route structure', () => {
  const f=fixture();f.player.cash_g=0;f.player.inventory={};
  assert.equal(run(f,plan('empty')).status,'ok');
  assert.equal(run(f,plan('no-funds',act('buy_seed'))).status,'insufficient_cash');
});
test('buying can beat cheaper self-production when the held raw material has a better simple use', () => {
  const f=fixture();add(f,f.route('sell_quick','sell',{quick:1},{},0,0,[],{cash_receipts_g:140,shop_id:'shop'}));
  const plans=[plan('self_make',act('process')),
    plan('sell_raw_then_buy',act('sell_raw'),act('buy_ingredient')),
    plan('simple_sell_then_buy',act('simple'),act('sell_quick',20),act('buy_ingredient',20))];
  const r=compareKnownPlans(f.catalog,f.knowledge,f.player,plans,f.scenario);
  assert.equal(r.best_plan_id,'simple_sell_then_buy');
  const byId=new Map(r.ranked.map(p=>[p.plan_id,p]));
  assert.equal(byId.get('self_make').cash_change_g,-5);
  assert.equal(byId.get('sell_raw_then_buy').cash_change_g,-30);
  assert.equal(byId.get('simple_sell_then_buy').cash_change_g,30);
  assert.equal(byId.get('simple_sell_then_buy').gain_vs_best_other_evaluated_plan_g,35);
  for(const p of r.ranked)assert.equal(p.inventory_changes.find(x=>x.item_id==='ingredient').closing_quantity,1);
});