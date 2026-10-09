import test from 'node:test';
import assert from 'node:assert/strict';
import {createMasterResolver,adaptKnownGrandBazaarMaster,adaptExplicitInventory} from '../lib/grand-bazaar-master-adapter.mjs';
import {compareGeneratedKnownPlans,generateKnownSequentialCandidates} from '../lib/known-economy-candidate-generator.mjs';
import {evaluateKnownPlan} from '../lib/known-economy.mjs';
import {fixtureGrandBazaarMaster,knownApple,baseline,knownPlayer} from './grand-bazaar-master-fixture.mjs';
const clone=x=>structuredClone(x);
const make=(master=fixtureGrandBazaarMaster(),knowledge=knownApple,model=baseline)=>
 adaptKnownGrandBazaarMaster(master,knowledge,model);
const apple='entities:apple',seedling='entities:apple_seedling',grape='entities:red_grapes';

test('canonical refs match windmill entities, not Japanese name guesses',()=>{
 const r=createMasterResolver(fixtureGrandBazaarMaster());
 assert.equal(r.canonical({domain:'windmill_items',id:'wmitem_7a66863a'}),apple);
 assert.equal(r.canonical({domain:'windmill_items',id:'wmitem_bb743df1'}),seedling);
 assert.equal(r.canonical({domain:'entities',id:'red_grapes'}),grape);
 assert.equal(r.canonical({domain:'unknown',id:'abc'}),'unknown:abc');
});

test('actual Master-style apple -> seedling yields +680G over direct sale baseline',()=>{
 const adapted=make();
 const player=knownPlayer(adapted,{[apple]:1});
 assert.equal(adapted.view.items.length,2);
 assert.equal(adapted.view.routes.length,1);
 assert.deepEqual(adapted.view.quotes.map(x=>x.unit_sell_g),[170,850]);
 const res=compareGeneratedKnownPlans(adapted,player,{focus_item_id:apple,max_depth:1});
 assert.equal(res.status,'ok');
 assert.equal(res.scope,'evaluated_known_candidates_only');
 assert.equal(res.ranked[0].net_gain_vs_direct_sale_g,680);
 assert.equal(res.ranked[0].resource_unit_minutes['windmill:yellow'],180);
 assert.equal(res.ranked.at(-1).net_gain_vs_direct_sale_g,0);
 assert.equal(res.coverage,'depth_bounded_not_global');
});

test('group cooking + known shop purchase may beat alternatives on same inventory and capital',()=>{
 const disclosure={
  known_item_refs:[{domain:'entities',id:'red_grapes'},{domain:'entities',id:'lemon'},
    {domain:'windmill_items',id:'wmitem_5dfc7369'},{domain:'cooking_recipes',id:'grape_jam'}],
  known_cooking_recipe_ids:['grape_jam'],known_windmill_recipe_ids:[],
  known_sale_quote_refs:[{domain:'entities',id:'red_grapes'},{domain:'entities',id:'lemon'},
    {domain:'cooking_recipes',id:'grape_jam'}],
  observed_shop_offers:[{id:'observed_sugar',shop_id:'shop_miguel_town',
    item_ref:{domain:'windmill_items',id:'wmitem_5dfc7369'},quantity:1,price_g:420,max_uses:3}],
  known_shop_ids:['shop_miguel_town'],known_facility_ids:['kitchen'],known_resource_ids:[]
 };
 const a=make(fixtureGrandBazaarMaster(),disclosure,{...baseline,horizon_minutes:500});
 assert.equal(a.view.routes.length,2);
 const player=knownPlayer(a,{[grape]:1,'entities:lemon':1},500);
 const ranked=compareGeneratedKnownPlans(a,player,{focus_item_id:grape,max_depth:2,max_nodes:100});
 assert.equal(ranked.ranked[0]?.net_gain_vs_direct_sale_g,277);
 assert.equal(ranked.ranked[0]?.cash_spent_g,420);
 assert.equal(ranked.ranked[0]?.steps.length,2);
 assert.equal(ranked.ranked[0]?.steps[0].kind,'buy');
 assert.equal(ranked.ranked[0]?.steps[1].kind,'cook');
});

test('known recipe but item unknown does not expose its name, output or route',()=>{
 const disclosure={...knownApple,known_cooking_recipe_ids:['grape_jam']};
 const adapted=make(fixtureGrandBazaarMaster(),disclosure);
 assert.equal(adapted.view.routes.length,1);
 assert.ok(!JSON.stringify(adapted).includes('ぶどうジャム'));
});

test('having an item does not automatically reveal its recipe or its sell quote',()=>{
 const d=clone(knownApple);d.known_windmill_recipe_ids=[];d.known_sale_quote_refs=[];
 const a=make(fixtureGrandBazaarMaster(),d);
 assert.equal(a.view.items.length,2);
 assert.equal(a.view.routes.length,0);
 assert.equal(a.view.quotes.length,0);
});

test('hidden 200 highly profitable recipes and one hidden quote cannot perturb disclosed results',()=>{
 const baselineResult=compareGeneratedKnownPlans(make(),knownPlayer(make(),{[apple]:1}),{focus_item_id:apple,max_depth:2});
 const extended=fixtureGrandBazaarMaster();
 for(let i=0;i<200;i++) {
  extended.windmill_items.push({id:'hidden'+i,name_ja:'未発見の未来商品'+i,base_sell_price:1000000000});
  extended.windmill_recipes.push({id:'hidden_recipe'+i,windmill:'yellow',
   inputs:[{type:'item',item_id:'wmitem_7a66863a',quantity:1}],
   output_item_id:'hidden'+i,output_quantity:1,base_processing_minutes:1,
   provenance:{confidence:'confirmed'}});
 }
 const a=make(extended);
 assert.deepEqual(compareGeneratedKnownPlans(a,knownPlayer(a,{[apple]:1}),{focus_item_id:apple,max_depth:2}),baselineResult);
});

test('an unknown recipe ID does not leak existence via errors or diagnostics',()=>{
 const a=make(fixtureGrandBazaarMaster(),{...knownApple,known_windmill_recipe_ids:['hidden_A']});
 const b=make(fixtureGrandBazaarMaster(),{...knownApple,known_windmill_recipe_ids:['does_not_exist']});
 assert.deepEqual(a,b);
});

test('unknown sell quote is never assumed free',()=>{
 const d=clone(knownApple);
 d.known_sale_quote_refs=d.known_sale_quote_refs.filter(r=>r.id!=='wmitem_bb743df1');
 const a=make(fixtureGrandBazaarMaster(),d);
 const r=compareGeneratedKnownPlans(a,knownPlayer(a,{[apple]:1}),{focus_item_id:apple,max_depth:1});
 assert.equal(r.best_plan_id,'candidate:baseline');
 assert.ok(r.unranked.some(x=>x.status==='valuation_incomplete'));
});

test('windmill monetary cost and timing must be explicitly confirmed, never inferred as zero',()=>{
 const d={...baseline,assumptions:{}};
 const a=make(fixtureGrandBazaarMaster(),knownApple,d);
 assert.equal(a.view.routes[0].confidence,'unconfirmed');
 const r=compareGeneratedKnownPlans(a,knownPlayer(a,{[apple]:1}),{focus_item_id:apple});
 assert.equal(r.best_plan_id,'candidate:baseline');
});

test('resource constraint and cutoff limit generated sequential candidates',()=>{
 const a=make(); const p=knownPlayer(a,{[apple]:1});p.resource_capacities['windmill:yellow']=0;
 const res=compareGeneratedKnownPlans(a,p,{focus_item_id:apple});
 assert.equal(res.ranked.length,1);
 const late=make(fixtureGrandBazaarMaster(),knownApple,{...baseline,horizon_minutes:100});
 assert.equal(compareGeneratedKnownPlans(late,knownPlayer(late,{[apple]:1}),{focus_item_id:apple}).ranked.length,1);
});

test('inventory adjustment combines canonical alias IDs',()=>{
 const x=adaptExplicitInventory(fixtureGrandBazaarMaster(),[
  {ref:{domain:'entities',id:'apple'},quantity:2},
  {ref:{domain:'windmill_items',id:'wmitem_7a66863a'},quantity:3}
 ],[{ref:{domain:'entities',id:'apple'},quantity:1}]);
 assert.deepEqual(x,{inventory:{[apple]:5},reserved:{[apple]:1}});
});

test('known mixed herbs can satisfy 2-unit group in several distinct concrete ways',()=>{
 const d={known_item_refs:[
  {domain:'resource_items',id:'mint'},{domain:'resource_items',id:'chamomile'},
  {domain:'cooking_recipes',id:'herb_salad'}],
  known_cooking_recipe_ids:['herb_salad'],known_facility_ids:['kitchen']};
 const a=make(fixtureGrandBazaarMaster(),d,baseline);
 assert.equal(a.view.routes.length,3); // mint×2, chamomile×2, mint+chamomile
 const opts=a.view.routes.map(r=>r.inputs.map(x=>x.quantity).sort().join(',')).sort();
 assert.deepEqual(opts,['1,1','2','2']);
});

test('cook alternatives never grow beyond bounded per-recipe fanout',()=>{
 const d={known_item_refs:[{domain:'resource_items',id:'mint'},{domain:'resource_items',id:'chamomile'},
  {domain:'cooking_recipes',id:'herb_salad'}],known_cooking_recipe_ids:['herb_salad'],known_facility_ids:['kitchen']};
 const a=make(fixtureGrandBazaarMaster(),d,{...baseline,max_variants_per_recipe:2});
 assert.equal(a.view.routes.length,2);
});

test('empty or partially registered knowledge cannot invent purchase offers',()=>{
 const d={...knownApple,observed_shop_offers:[{id:'foo',shop_id:'not_known',
  item_ref:{domain:'entities',id:'apple'},quantity:1,price_g:1}]};
 assert.equal(make(fixtureGrandBazaarMaster(),d).view.routes.length,1);
});

test('known price sources cannot override observed quotes',()=>{
 const d={...knownApple,observed_sale_quotes:[{ref:{domain:'entities',id:'apple'},unit_sell_g:200}]};
 const a=make(fixtureGrandBazaarMaster(),d);
 assert.equal(a.view.quotes.find(x=>x.item_id===apple).unit_sell_g,200);
});

test('no disclosure should lead to completely empty known view even with full Master',()=>{
 const a=make(fixtureGrandBazaarMaster(),{},baseline);
 assert.deepEqual(a.view.items,[]);assert.deepEqual(a.view.routes,[]);assert.deepEqual(a.view.quotes,[]);
});

test('unknown focus and no focus inventory use generic conditions',()=>{
 const a=make();
 assert.equal(generateKnownSequentialCandidates(a.view,knownPlayer(a,{[apple]:1}),a.scenario,
  {focus_item_id:'hidden:item'}).status,'not_available_in_known_scope');
 assert.equal(generateKnownSequentialCandidates(a.view,knownPlayer(a,{}),a.scenario,
  {focus_item_id:apple}).status,'focus_quantity_not_recorded');
});

test('observed full-batch cultivation models a seedling-to-harvest path without guessing new yields',()=>{
 const disclosure={
  known_item_refs:[{domain:'entities',id:'red_grape_seedling'},
   {domain:'windmill_items',id:'wmitem_fd3af699'},
   {domain:'entities',id:'red_grapes'}],
  known_sale_quote_refs:[{domain:'windmill_items',id:'wmitem_fd3af699'},
   {domain:'entities',id:'red_grapes'}],
  known_facility_ids:['field'],known_resource_ids:['field'],
  observed_growth_batches:[{id:'grape_tree_harvest_observed',
   seed_ref:{domain:'entities',id:'red_grape_seedling'},
   produce_ref:{domain:'entities',id:'red_grapes'},seed_quantity:1,produce_quantity:7,
   duration_minutes:14*1440,field_units:1,effort_actions:14,
   availability_windows:[{start:0,end:22*1440}],observed_and_confirmed:true}]
 };
 const a=make(fixtureGrandBazaarMaster(),disclosure,{...baseline,horizon_minutes:22*1440});
 const p=knownPlayer(a,{'entities:red_grape_seedling':1});p.resource_capacities.field=1;
 const res=compareGeneratedKnownPlans(a,p,{focus_item_id:'entities:red_grape_seedling',max_depth:1});
 assert.equal(res.ranked[0].net_gain_vs_direct_sale_g,7*175-900);
 assert.equal(res.ranked[0].resource_unit_minutes.field,14*1440);
 assert.equal(res.ranked[0].effort_actions,14);
});

test('unconfirmed or missing cultivation time/quantity never silently gives free growth',()=>{
 const d={known_item_refs:[{domain:'entities',id:'red_grape_seedling'},
  {domain:'entities',id:'red_grapes'}],known_facility_ids:['field'],known_resource_ids:['field'],
  observed_growth_batches:[{id:'growth',seed_ref:{domain:'entities',id:'red_grape_seedling'},
   produce_ref:{domain:'entities',id:'red_grapes'},seed_quantity:1,produce_quantity:7,
   duration_minutes:14*1440,field_units:1,effort_actions:1,
   availability_windows:[{start:0,end:21*1440}],observed_and_confirmed:false}]};
 const a=make(fixtureGrandBazaarMaster(),d,{...baseline,horizon_minutes:21*1440});
 assert.equal(a.view.routes.length,1);
 assert.equal(a.view.routes[0].confidence,'unconfirmed');
 const unknown=clone(d);
 delete unknown.observed_growth_batches[0].duration_minutes;
 assert.equal(make(fixtureGrandBazaarMaster(),unknown,{...baseline,horizon_minutes:21*1440}).view.routes.length,0);
});

test('observed sale events can fund known purchases but not before sale time',()=>{
 const d={
  known_item_refs:[{domain:'entities',id:'red_grapes'},{domain:'entities',id:'lemon'},
   {domain:'windmill_items',id:'wmitem_5dfc7369'},{domain:'cooking_recipes',id:'grape_jam'}],
  known_cooking_recipe_ids:['grape_jam'],known_sale_quote_refs:[{domain:'entities',id:'red_grapes'},
  {domain:'entities',id:'lemon'},{domain:'cooking_recipes',id:'grape_jam'}],
  known_facility_ids:['kitchen'],known_shop_ids:['shop_miguel_town','bazaar'],
  observed_shop_offers:[{id:'sugar',shop_id:'shop_miguel_town',
    item_ref:{domain:'windmill_items',id:'wmitem_5dfc7369'},quantity:1,price_g:420}],
  observed_sale_sessions:[{id:'sale_grape',shop_id:'bazaar',
    item_ref:{domain:'entities',id:'red_grapes'},quantity:1,unit_sell_g:175,
    availability_windows:[{start:0,end:500}],observed_and_confirmed:true}]
 };
 const a=make(fixtureGrandBazaarMaster(),d);
 assert.equal(a.view.routes.length,3);
 const sell=a.view.routes.find(x=>x.kind==='sell'),buy=a.view.routes.find(x=>x.kind==='buy'),cook=a.view.routes.find(x=>x.kind==='cook');
 const p=knownPlayer(a,{[grape]:2,'entities:lemon':1},300);
 assert.equal(evaluateKnownPlan(a.view,p,{id:'buy-first',actions:[
  {route_id:buy.id,start_minute:0},{route_id:sell.id,start_minute:0},
  {route_id:cook.id,start_minute:0}]},a.scenario).status,'insufficient_cash');
 const feasible=evaluateKnownPlan(a.view,p,{id:'sell-first',actions:[
  {route_id:sell.id,start_minute:0},{route_id:buy.id,start_minute:0},
  {route_id:cook.id,start_minute:0}]},a.scenario);
 assert.equal(feasible.status,'ok');
 assert.equal(feasible.cash_spent_g,420);
 assert.equal(feasible.cash_received_g,175);
 assert.equal(feasible.closing_cash_g,55);
});

test('future hidden quote sources do not alter disclosed base price',()=>{
 const orig=make();
 const hidden=fixtureGrandBazaarMaster();
 hidden.windmill_items.push({id:'secret_alias',name_ja:'秘密',
  canonical_ref:{domain:'entities',id:'apple'},base_sell_price:99999});
 assert.deepEqual(make(hidden).view.quotes,orig.view.quotes);
});