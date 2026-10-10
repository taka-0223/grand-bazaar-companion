import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {
  prepareAppKnownEconomy,compareAppKnownEconomy
} from '../lib/app-player-economy-bridge.mjs';
import {LEGACY_ECONOMY_PROCESS_CROSSWALK as crosswalk} from '../lib/legacy-economy-process-crosswalk.mjs';

const path=process.env.GB_MASTER_FULL||'data/board-master.full.v1.json';
const live=existsSync(path);
const master=live?JSON.parse(readFileSync(path,'utf8')):null;
const apple={domain:'entities',id:'apple'};
const appleSeed={domain:'entities',id:'apple_seedling'};
const appleSeedSellAlias={domain:'windmill_items',id:'wmitem_bb743df1'};
const potatoSeed={domain:'entities',id:'potato_seeds'};
const potato={domain:'entities',id:'potato'};
const cheese={domain:'animal_processed_goods',id:'cheese'};
const yellow='windmill:yellow';
const red='windmill:red';
const baseScenario={horizon_minutes:500,scenario_id:'known_app_baseline',assumptions:{
  baseline_wind_time_confirmed:true,no_windmill_fee_confirmed:true,
  cooking_duration_minutes:0,no_cooking_fee_confirmed:true,cooking_output_is_one:true
}};
const baseState=()=>({schemaVersion:7,knownEntities:[],knownFacts:[],
  knownRecipes:[],knownProcesses:[],playerState:{},goals:[],
  requirements:{},requests:[],recipeMeta:{},season:'秋',
  updatedAt:'2026-10-10T00:00:00.000Z'});
const ctx=(verified={})=>({scenario:baseScenario,verified:{
  cash_g:500,confirm_baseline_only:true,available_route_ids:[],
  resource_capacities:{[yellow]:1,[red]:1},
  ...verified
}});
const prep=(state,verified={})=>prepareAppKnownEconomy(master,state,ctx(verified));
const markStored=count=>({seedCount:count,status:'stored',location:'warehouse',
  seedQuality:0.5,growing:false,growingCount:null});
const names=view=>view.items.map(x=>x.name_ja);

test('bridge rejects a future or corrupted Player State schema instead of guessing',()=>{
  assert.equal(prepareAppKnownEconomy({}, {...baseState(),schemaVersion:8}).status,'unsupported_player_schema');
  assert.equal(prepareAppKnownEconomy({}, {...baseState(),playerState:null}).status,'unsupported_player_schema');
});
test('bridge requires a horizon; no assumed next bazaar time',()=>{
  const x=prepareAppKnownEconomy({},baseState(),{scenario:{horizon_minutes:0}});
  assert.equal(x.status,'scenario_not_confirmed');
});

test('actual Master has pinned crosswalk with stable cheese/seedling IDs',
 {skip:!live},()=>{
  assert.equal(crosswalk.process_output_links.cheese.recipe_id,'wmrec_red_ca032579');
  assert.equal(crosswalk.process_output_links.apple_seedling.recipe_id,'wmrec_yellow_6f3bc973');
  assert.equal(crosswalk.known_fact_links.process_seedling_apple.recipe_id,'wmrec_yellow_6f3bc973');
  assert.equal(crosswalk.verified_against_main_index_sha.length,40);
});
test('empty Player State leaks no catalogue names, recipes, or quotes',
 {skip:!live},()=>{
   const s=baseState(),x=prep(s);
   assert.equal(x.status,'ready');
   assert.deepEqual(x.adapted.view.items,[]);
   assert.deepEqual(x.adapted.view.routes,[]);
   assert.deepEqual(x.adapted.view.quotes,[]);
   assert.deepEqual(x.player.inventory,{});
   assert.equal(x.player.inventory_is_complete,false);
});
test('knowing a recipe does not automatically disclose its unknown ingredients',
 {skip:!live},()=>{
  const s=baseState();s.knownRecipes=['grape_jam'];
  const x=prep(s,{known_facility_ids:['kitchen']});
  assert.equal(x.adapted.view.items.length,1);
  assert.deepEqual(names(x.adapted.view),['ぶどうジャム']);
  assert.deepEqual(x.adapted.view.routes,[]);
});
test('archiving a learned recipe does not erase knowledge, but excludes its route by default',
 {skip:!live},()=>{
  const s=baseState();
  s.knownRecipes=['grape_jam'];s.recipeMeta={grape_jam:{archived:true}};
  const x=prep(s,{known_facility_ids:['kitchen']});
  assert.deepEqual(names(x.adapted.view),['ぶどうジャム']);
  assert.equal(x.adapted.view.routes.length,0);
});
test('knowing an input ingredient alone never reveals unlearned recipe output',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  const x=prep(s);
  assert.deepEqual(names(x.adapted.view),['りんご']);
  assert.equal(x.adapted.view.routes.length,0);
});
test('unknown legacy process IDs remain absent with no existence hint',
 {skip:!live},()=>{
  const s=baseState();s.knownProcesses=['secret_future_recipe_xxyy'];
  const x=prep(s);
  assert.deepEqual(x.adapted.view.items,[]);
  assert.deepEqual(x.adapted.view.routes,[]);
});
test('learned cheese output maps through pinned external ID without revealing all processed goods',
 {skip:!live},()=>{
  const s=baseState();s.knownProcesses=['cheese'];
  const x=prep(s,{known_facility_ids:[red],known_resource_ids:[red]});
  assert.deepEqual(names(x.adapted.view),['チーズ']);
  assert.equal(x.adapted.view.routes.length,0); // milk ingredient not yet known
});
test('known cheese and milk yield its pinned concrete red windmill route',
 {skip:!live},()=>{
  const s=baseState();s.knownProcesses=['cheese'];s.knownEntities=['milk'];
  const x=prep(s,{known_facility_ids:[red],known_resource_ids:[red]});
  assert.equal(x.adapted.view.routes.length,1);
  assert.equal(x.adapted.view.routes[0].kind,'process');
  assert.equal(x.adapted.view.routes[0].outputs[0].item_id,'animal_processed_goods:cheese');
});
test('appending a hidden extra recipe for the same output cannot change a discovered process route',
 {skip:!live},()=>{
  const s=baseState();s.knownProcesses=['cheese'];s.knownEntities=['milk'];
  const opt=ctx({known_facility_ids:[red],known_resource_ids:[red]});
  const before=prepareAppKnownEconomy(master,s,opt);
  const extra=structuredClone(master);
  const clone=structuredClone(master.windmill_recipes.find(x=>x.id==='wmrec_red_ca032579'));
  clone.id='wmrec_red_hidden_new_99';clone.base_processing_minutes=1;
  extra.windmill_recipes.push(clone);
  const after=prepareAppKnownEconomy(extra,s,opt);
  assert.deepEqual(after.adapted.view,before.adapted.view);
});
test('an undiscovered profitable future recipe does not change existing known projection',
 {skip:!live},()=>{
  const s=baseState();s.knownProcesses=['cheese'];s.knownEntities=['milk'];
  const opt=ctx({known_facility_ids:[red],known_resource_ids:[red]});
  const before=prepareAppKnownEconomy(master,s,opt);
  const m=structuredClone(master);
  for(let n=0;n<50;n++)m.windmill_recipes.push({
    id:'unseen_'+n,output_item_id:'wmitem_f3f35d5e',
    windmill:'red',output_quantity:999999,base_processing_minutes:0,
    inputs:[],provenance:{confidence:'confirmed'}
  });
  assert.deepEqual(prepareAppKnownEconomy(m,s,opt).adapted.view,before.adapted.view);
});
test('a known seedling FACT is converted to the explicit Master windmill recipe',
 {skip:!live},()=>{
  const s=baseState();
  s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const x=prep(s,{known_facility_ids:[yellow],known_resource_ids:[yellow]});
  assert.equal(x.adapted.view.routes.length,1);
  assert.equal(x.adapted.view.routes[0].duration_minutes,180);
  assert.deepEqual(x.adapted.view.routes[0].inputs,[{item_id:'entities:apple',quantity:1}]);
  assert.deepEqual(x.adapted.view.routes[0].outputs,[{item_id:'entities:apple_seedling',quantity:1}]);
});
test('legacy seedCount stored under APPLE means seedlings, never harvested apples',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];s.playerState={apple:markStored(13)};
  const x=prep(s);
  assert.equal(x.player.inventory['entities:apple_seedling'],13);
  assert.equal(x.player.inventory['entities:apple'],undefined);
  assert(names(x.adapted.view).includes('りんごの苗'));
});
test('legacy potato.seedCount maps to potato_seeds, not edible potatoes',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['potato'];s.playerState={potato:markStored(7)};
  const x=prep(s);
  assert.equal(x.player.inventory['entities:potato_seeds'],7);
  assert.equal(x.player.inventory['entities:potato'],undefined);
});
test('legacy mushroom quantity maps to spores, not harvested mushrooms',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['shiitake_mushroom'];
  s.playerState={shiitake_mushroom:markStored(3)};
  const x=prep(s);
  assert.equal(x.player.inventory['mushroom_spores:shiitake_spores'],3);
  assert.equal(x.player.inventory['mushrooms:shiitake_mushroom'],undefined);
});
test('seedCount in processing is excluded from immediately sellable stock',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple_seedling'];
  s.playerState={apple_seedling:{...markStored(4),status:'processing',location:'yellow_windmill'}};
  const x=prep(s);
  assert.equal(x.player.inventory['entities:apple_seedling'],undefined);
  assert(x.notices.includes('processing_stock_excluded'));
});
test('seedCount with an unset location is excluded',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple_seedling'];
  s.playerState={apple_seedling:{...markStored(4),status:'',location:''}};
  const x=prep(s);
  assert.equal(x.player.inventory['entities:apple_seedling'],undefined);
  assert(x.notices.includes('storage_location_unconfirmed'));
});
test('growingCount is not a count of harvested sellable goods',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  s.playerState={apple:{growing:true,growingCount:13,seedCount:null,
    location:'warehouse',status:'stored'}};
  const x=prep(s);
  assert.deepEqual(x.player.inventory,{});
});
test('untracked seedCount/null is unknown, not an automatic zero',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple_seedling'];
  s.playerState={apple_seedling:{...markStored(0),seedCount:null}};
  assert.equal(prep(s).player.inventory['entities:apple_seedling'],undefined);
});
test('explicit inventory overrides tracked seed counts without doubling',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple_seedling'];s.playerState={apple_seedling:markStored(8)};
  const x=prep(s,{confirmed_stock_rows:[{ref:appleSeed,quantity:2}]});
  assert.equal(x.player.inventory['entities:apple_seedling'],2);
});
test('duplicate legacy aliases cannot double-count the same seed bags',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['potato','potato_seeds'];
  s.playerState={potato:markStored(3),potato_seeds:markStored(3)};
  const x=prep(s);
  assert.equal(x.player.inventory['entities:potato_seeds'],undefined);
  assert(x.notices.includes('duplicate_plant_stock_aliases'));
});
test('explicitly unknown reference in manual inventory fails closed',
 {skip:!live},()=>{
  const x=prep(baseState(),{confirmed_stock_rows:[{
    ref:{domain:'entities',id:'does_not_exist_in_master'},quantity:2}]});
  assert.equal(x.status,'explicit_inventory_invalid');
});
test('duplicate canonical manual stock rows fail instead of summing possible duplicate lots',
 {skip:!live},()=>{
  const x=prep(baseState(),{confirmed_stock_rows:[
    {ref:apple,quantity:2},{ref:apple,quantity:5}]});
  assert.equal(x.status,'explicit_inventory_invalid');
});
test('quality difference is preserved as a baseline-only notice',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple_seedling'];
  s.playerState={apple_seedling:{...markStored(2),seedQuality:4}};
  assert(prep(s).notices.includes('item_quality_not_reflected_in_baseline_prices'));
});
test('recipe goal.have is progress, never real inventory',
 {skip:!live},()=>{
  const s=baseState();
  s.goals=[{id:'g1',title:'りんごを取り置く',status:'active'}];
  s.requirements={g1:[{targetType:'entity',targetId:'apple',need:5,have:5}]};
  s.knownEntities=['apple'];
  const x=prep(s);
  assert.deepEqual(x.player.inventory,{});
});
test('active goal protecting known held apple requires explicit allocation review',
 {skip:!live},()=>{
  const s=baseState();
  s.goals=[{id:'g1',title:'用意する',status:'active'}];
  s.requirements={g1:[{targetType:'entity',targetId:'apple',need:5,have:5}]};
  const v={confirmed_stock_rows:[{ref:apple,quantity:8}]};
  const x=prep(s,v);
  assert.equal(x.status,'needs_confirmation');
  assert(x.missing.includes('goal_allocations_need_review'));
  const y=prep(s,{...v,review_goal_allocations:true});
  assert.equal(y.status,'ready');
});
test('a target ingredient group blocks consumption without manual allocation review',
 {skip:!live},()=>{
  const s=baseState();s.goals=[{id:'g1',status:'active'}];
  s.requirements={g1:[{targetType:'group',targetId:'herb_a',need:2,have:0}]};
  const x=prep(s,{confirmed_stock_rows:[{ref:{domain:'resource_items',id:'mint'},quantity:2}]});
  assert(x.missing.includes('goal_allocations_need_review'));
});
test('a completed goal does not reserve its old requirements',
 {skip:!live},()=>{
  const s=baseState();s.goals=[{id:'g1',status:'done'}];
  s.requirements={g1:[{targetType:'entity',targetId:'apple',need:5,have:5}]};
  assert.equal(prep(s,{confirmed_stock_rows:[{ref:apple,quantity:8}]}).status,'ready');
});
test('uncompleted item delivery request also requires explicit review',
 {skip:!live},()=>{
  const s=baseState();s.requests=[{id:'r1',status:'active',objectives:[
    {type:'item_quantity',target:3,current:0,label:'収穫物'}
  ]}];
  const a=prep(s);
  assert(a.missing.includes('request_materials_need_review'));
  assert.equal(prep(s,{review_request_materials:true}).status,'ready');
});
test('completed request needs no resource allocation review',
 {skip:!live},()=>{
  const s=baseState();s.requests=[{id:'r1',status:'completed',objectives:[
    {type:'item_quantity',target:3,current:0,label:'収穫物'}
  ]}];
  assert.equal(prep(s).status,'ready');
});
test('completed shop unlock request does not invent observed shop opening or stock prices',
 {skip:!live},()=>{
  const s=baseState();s.requests=[{id:'open',status:'completed',
    masterId:'rqm_gw_120',objectives:[]}];
  const x=prep(s);
  assert.equal(x.adapted.knowledge.shop_ids.length,0);
  assert.equal(x.adapted.view.routes.filter(r=>r.kind==='buy').length,0);
});
test('a known item has no automatic sell-price quote',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  assert.equal(prep(s).adapted.view.quotes.length,0);
  assert.equal(prep(s,{known_sale_quote_refs:[apple]}).adapted.view.quotes.length,1);
});
test('cash in unknown app fields is NOT treated as verified cash',
 {skip:!live},()=>{
  const s=baseState();s.cash_g=999999;
  const x=prepareAppKnownEconomy(master,s,{
    scenario:baseScenario,verified:{confirm_baseline_only:true,available_route_ids:[]}
  });
  assert(x.missing.includes('cash_balance_not_confirmed'));
});
test('no assumption about inventory completeness without explicit confirmation',
 {skip:!live},()=>{
  const s=baseState();const x=prep(s,{confirm_all_inventory_recorded:true});
  assert(x.missing.includes('complete_inventory_claim_requires_explicit_rows'));
});
test('missing scenario-level baseline acknowledgement prevents recommendations',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  const x=prepareAppKnownEconomy(master,s,{scenario:baseScenario,verified:{
    cash_g:100,available_route_ids:[]
  }});
  assert(x.missing.includes('base_price_scenario_acknowledgement_required'));
});
test('the bridge is strictly read-only for its Player State and Master inputs',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  s.playerState={apple:markStored(13)};
  const before=JSON.stringify(s),beforeMaster=JSON.stringify(master);
  const output=prep(s,{known_facility_ids:[yellow],known_resource_ids:[yellow]});
  output.player.inventory['entities:apple']=999;
  output.adapted.view.items[0].name_ja='MODIFIED';
  assert.equal(JSON.stringify(s),before);
  assert.equal(JSON.stringify(master),beforeMaster);
});
test('unconfirmed route/resource capacities are not silently inferred',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const x=prep(s,{known_facility_ids:[yellow],known_resource_ids:[yellow]});
  const route=x.adapted.view.routes[0].id;
  const y=prepareAppKnownEconomy(master,s,{scenario:baseScenario,verified:{
    confirm_baseline_only:true,cash_g:500,
    known_facility_ids:[yellow],known_resource_ids:[yellow],
    available_route_ids:[route]
  }});
  assert(y.missing.includes('resource_capacity_not_confirmed'));
});
test('explicit known apple stock, seedling zero, and confirmed yellow route yield +680G baseline',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  s.knownFacts=['process_seedling_apple'];
  const verified={
    confirmed_stock_rows:[{ref:apple,quantity:13},{ref:appleSeed,quantity:0}],
    known_sale_quote_refs:[apple,appleSeedSellAlias],
    known_facility_ids:[yellow],known_resource_ids:[yellow],cash_g:0,
  };
  const first=prep(s,verified);
  assert.equal(first.adapted.view.routes.length,1);
  const route=first.adapted.view.routes[0].id;
  const result=compareAppKnownEconomy(master,s,{
    ...ctx({...verified,available_route_ids:[route]}),
    focus_ref:apple,max_depth:1
  });
  assert.equal(result.status,'ok');
  assert(result.best_plan_id?.startsWith('candidate:windmill:'));
  assert.equal(result.ranked[0].net_gain_vs_direct_sale_g,680);
  assert.equal(result.ranked[0].scope,'evaluated_known_plan_only');
});
test('harvested apples must be explicitly entered; seedling count cannot stand in',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];
  s.knownFacts=['process_seedling_apple'];
  s.playerState={apple:markStored(13)};
  const x=compareAppKnownEconomy(master,s,{
    ...ctx({
      known_facility_ids:[yellow],known_resource_ids:[yellow],
      known_sale_quote_refs:[apple,appleSeed]
    }),
    focus_ref:apple
  });
  assert(['focus_quantity_not_recorded','focus_not_discovered'].includes(x.status));
});
test('unconfirmed known output sale price never makes doing nothing a recommendation',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const verified={confirmed_stock_rows:[{ref:apple,quantity:13},{ref:appleSeed,quantity:0}],
    known_sale_quote_refs:[apple],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const route=prep(s,verified).adapted.view.routes[0].id;
  const result=compareAppKnownEconomy(master,s,{
    ...ctx({...verified,available_route_ids:[route]}),focus_ref:apple,max_depth:1
  });
  assert.equal(result.status,'known_valuation_incomplete');
  assert.equal(result.best_plan_id,undefined);
});

test('a known but uncounted output prevents announcing baseline as the best plan',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const verified={confirmed_stock_rows:[{ref:apple,quantity:13}],
    known_sale_quote_refs:[apple,appleSeed],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const route=prep(s,verified).adapted.view.routes[0].id;
  const result=compareAppKnownEconomy(master,s,{
    ...ctx({...verified,available_route_ids:[route]}),focus_ref:apple,max_depth:1
  });
  assert.equal(result.status,'known_inventory_incomplete');
  assert.equal(result.best_plan_id,undefined);
});
test('unknown focus does not disclose existence in the Master',
 {skip:!live},()=>{
  const s=baseState();
  const a=compareAppKnownEconomy(master,s,{...ctx(),focus_ref:{domain:'entities',id:'future_secret'}});
  assert.equal(a.status,'focus_not_discovered');
});
test('explicit reservations cannot exceed confirmed stock',
 {skip:!live},()=>{
  const s=baseState();
  const a=prep(s,{
    confirmed_stock_rows:[{ref:apple,quantity:2}],
    confirmed_reserved_rows:[{ref:apple,quantity:5}]
  });
  assert.equal(a.status,'needs_confirmation');
  assert(a.missing.includes('reservation_exceeds_confirmed_stock'));
});


test('an active goal reserves FUTURE known output even when current stock is zero',
 {skip:!live},()=>{
  const s=baseState();
  s.knownEntities=['apple'];
  s.knownFacts=['process_seedling_apple'];
  s.goals=[{id:'save-seedling',status:'active',title:'苗木を準備'}];
  s.requirements={'save-seedling':[
    {targetType:'entity',targetId:'apple_seedling',need:1,have:0}
  ]};
  const inputs={
    confirmed_stock_rows:[{ref:apple,quantity:1},{ref:appleSeed,quantity:0}],
    known_facility_ids:[yellow],known_resource_ids:[yellow],
    known_sale_quote_refs:[apple,appleSeedSellAlias],
    cash_g:0
  };
  // With no available route, an empty future output is not yet involved.
  const discovery=prep(s,inputs);
  assert.equal(discovery.adapted.view.routes.length,1);
  const routeId=discovery.adapted.view.routes[0].id;
  const guarded=prep(s,{...inputs,available_route_ids:[routeId]});
  assert.equal(guarded.status,'needs_confirmation');
  assert(guarded.missing.includes('goal_allocations_need_review'));
  const evaluated=compareAppKnownEconomy(master,s,{
    ...ctx({...inputs,available_route_ids:[routeId]}),
    focus_ref:apple,max_depth:1
  });
  assert.equal(evaluated.status,'needs_confirmation');
  assert.equal(evaluated.best_plan_id,undefined);
  // Manual review may explicitly authorize a proposed trade-off.
  const reviewed=prep(s,{
    ...inputs,available_route_ids:[routeId],review_goal_allocations:true
  });
  assert.equal(reviewed.status,'ready');
});

test('a discovered mushroom shared by crop and mushroom registries remains a known cooking input',
 {skip:!live},()=>{
  const state=baseState();
  state.knownEntities=['rice','shiitake_mushroom'];
  state.knownRecipes=['mushroom_rice'];
  const x=prep(state,{known_facility_ids:['kitchen']});
  assert.equal(x.status,'ready');
  assert(x.adapted.view.items.some(i=>i.id==='mushrooms:shiitake_mushroom'));
  const routes=x.adapted.view.routes.filter(r=>r.kind==='cook');
  assert(routes.some(r=>r.inputs.some(i=>
    i.item_id==='mushrooms:shiitake_mushroom'&&i.quantity===3)));
  assert(!routes.some(r=>r.inputs.some(i=>i.item_id==='entities:shiitake_mushroom')));
});
test('an unlearned mushroom remains hidden despite the pinned cross-registry link',
 {skip:!live},()=>{
  const state=baseState();
  state.knownEntities=['rice'];state.knownRecipes=['mushroom_rice'];
  const x=prep(state,{known_facility_ids:['kitchen']});
  assert(!x.adapted.view.items.some(i=>i.id==='mushrooms:shiitake_mushroom'));
  assert(!x.adapted.view.routes.some(r=>r.kind==='cook'));
});
test('future same-name duplicate without a reviewed ID remains undisclosed',
 {skip:!live},()=>{
  const state=baseState();state.knownEntities=['rice','shiitake_mushroom'];
  state.knownRecipes=['mushroom_rice'];
  const before=prep(state,{known_facility_ids:['kitchen']});
  const altered=structuredClone(master);
  altered.mushrooms.push({id:'hidden_future_mushroom',name_ja:'しいたけ'});
  const after=prepareAppKnownEconomy(altered,state,ctx({known_facility_ids:['kitchen']}));
  assert.deepEqual(after.adapted.view,before.adapted.view);
});

test('legacy known output is a known product but does not grant the windmill recipe',
 {skip:!live},()=>{
  const s=baseState();
  s.knownEntities=['wheat','wheat_flour'];
  const view=prep(s,{known_facility_ids:[red],known_resource_ids:[red]});
  assert(view.adapted.view.items.some(x=>x.name_ja==='小麦粉'));
  assert.deepEqual(view.adapted.view.routes,[]);
});

test('legacy recipe cannot be discovered by adding an unrelated future Master output',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['wheat_flour'];
  const a=prep(s);
  const changed=structuredClone(master);
  changed.windmill_recipes.push({
    id:'future_wheat_flour_hidden',output_item_id:'wmitem_0290b993',
    windmill:'red',inputs:[],output_quantity:100,
    base_processing_minutes:1
  });
  const b=prepareAppKnownEconomy(changed,s,ctx());
  assert.deepEqual(b.adapted.view,a.adapted.view);
});

test('learned mushroom rice can use the already discovered porcini ingredient',
 {skip:!live},()=>{
  const s=baseState();
  s.knownEntities=['rice','porcini_mushroom'];
  s.knownRecipes=['mushroom_rice'];
  const x=prep(s,{known_facility_ids:['kitchen']});
  assert(x.adapted.view.items.some(i=>i.id==='mushrooms:porcini_mushroom'));
  const recipes=x.adapted.view.routes.filter(r=>r.kind==='cook');
  assert(recipes.some(r=>r.inputs.some(i=>
    i.item_id==='mushrooms:porcini_mushroom'&&i.quantity===3)));
  assert(!recipes.some(r=>r.inputs.some(i=>i.item_id.includes('morel'))));
});

test('undiscovered porcini and future same-name members cannot create cooking routes',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['rice'];s.knownRecipes=['mushroom_rice'];
  const old=prep(s,{known_facility_ids:['kitchen']});
  assert(!old.adapted.view.routes.some(x=>x.kind==='cook'));
  const hidden=structuredClone(master);
  hidden.mushrooms.push({id:'secret_future_mushroom',name_ja:'ポルチーニ'});
  const revised=prepareAppKnownEconomy(hidden,s,ctx({known_facility_ids:['kitchen']}));
  assert.deepEqual(revised.adapted.view,old.adapted.view);
});

test('real-save-shaped wheat seed record and active request cannot imply harvested stock',
 {skip:!live},()=>{
  const s=baseState();
  s.knownEntities=['wheat','wheat_flour'];
  s.knownProcesses=['wheat_flour'];
  s.playerState={wheat:{seedCount:9,seedQuality:5,status:'processing',
    location:'blue_windmill',growing:false,growingCount:null}};
  s.requests=[{status:'active',objectives:[{type:'item_quantity',target:20,current:0,
    category:'mushroom'}]}];
  const before=JSON.stringify(s);
  const result=prep(s,{known_facility_ids:[red],known_resource_ids:[red]});
  assert.equal(result.status,'needs_confirmation');
  assert(result.missing.includes('request_materials_need_review'));
  assert(result.notices.includes('processing_stock_excluded'));
  assert.equal(result.player.inventory['entities:wheat'],undefined);
  assert.equal(JSON.stringify(s),before);
});

test('known wheat-to-flour route requires request allocation review and real wheat stock',
 {skip:!live},()=>{
  const s=baseState();s.knownEntities=['wheat','wheat_flour'];
  s.knownProcesses=['wheat_flour'];
  s.requests=[{status:'active',objectives:[
    {type:'item_quantity',target:20,current:0,category:'mushroom'}]}];
  const settings={known_facility_ids:[red],known_resource_ids:[red],
    known_sale_quote_refs:[
      {domain:'entities',id:'wheat'},
      {domain:'windmill_items',id:'wmitem_0290b993'}],
    confirmed_stock_rows:[
      {ref:{domain:'entities',id:'wheat'},quantity:2},
      {ref:{domain:'windmill_items',id:'wmitem_0290b993'},quantity:0}]
  };
  const first=prep(s,settings);
  assert.equal(first.adapted.view.routes.length,1);
  const route=first.adapted.view.routes[0].id;
  const held=prep(s,{...settings,available_route_ids:[route]});
  assert(held.missing.includes('request_materials_need_review'));
  const result=compareAppKnownEconomy(master,s,{
    ...ctx({...settings,available_route_ids:[route],
      review_request_materials:true,cash_g:0}),
    focus_ref:{domain:'entities',id:'wheat'},max_depth:1
  });
  assert.equal(result.status,'ok');
  assert.equal(result.ranked[0].net_gain_vs_direct_sale_g,75);
  assert.equal(result.ranked[0].scope,'evaluated_known_plan_only');
});
