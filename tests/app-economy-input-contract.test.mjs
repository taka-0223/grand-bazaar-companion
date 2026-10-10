import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {inspectAppKnownEconomyInputs as inspect} from '../lib/app-economy-input-contract.mjs';
import {prepareAppKnownEconomy,compareAppKnownEconomy} from '../lib/app-player-economy-bridge.mjs';

const live=existsSync('data/board-master.full.v1.json');
const master=live?JSON.parse(readFileSync('data/board-master.full.v1.json','utf8')):null;
const apple={domain:'entities',id:'apple'};
const seedling={domain:'entities',id:'apple_seedling'};
const seedlingQuote={domain:'windmill_items',id:'wmitem_bb743df1'};
const yellow='windmill:yellow';
const scenario={horizon_minutes:500,scenario_id:'v04-test',assumptions:{
  baseline_wind_time_confirmed:true,no_windmill_fee_confirmed:true,
  cooking_duration_minutes:0,no_cooking_fee_confirmed:true,cooking_output_is_one:true
}};
const base=()=>({schemaVersion:7,knownEntities:[],knownFacts:[],
  knownProcesses:[],knownRecipes:[],playerState:{},goals:[],
  requirements:{},requests:[],recipeMeta:{}});
const verified=(extra={})=>({
  cash_g:0,confirm_baseline_only:true,available_route_ids:[],
  known_facility_ids:[],known_resource_ids:[],
  resource_capacities:{[yellow]:1},...extra
});
const input=(state,extra={},focus_ref=apple,customScenario=scenario)=>
  inspect(master,state,{focus_ref,scenario:customScenario,verified:verified(extra)});
const codes=x=>x.missing.map(y=>y.code);

test('input inspector fails closed on unknown schema without revealing Master',()=>{
  const s=base();s.schemaVersion=8;
  const x=inspect({},s,{focus_ref:apple,scenario,verified:verified()});
  assert.equal(x.status,'unsupported_player_schema');
  assert.deepEqual(x.route_choices,[]);
});
test('an unknown focus and a hidden existing focus are indistinguishable',
  {skip:!live},()=>{
  const a=input(base(),{},apple);
  const b=input(base(),{},{domain:'entities',id:'future_hidden'});
  assert.deepEqual(a,b);
  assert.equal(a.status,'focus_not_discovered');
});
test('no focus offers only items already disclosed by Player State',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  const a=inspect(master,s,{scenario,verified:verified()});
  assert.equal(a.status,'focus_required');
  assert.deepEqual(a.known_item_choices.map(x=>x.label_ja),['りんご']);
});
test('unconfirmed harvested stock, quotation and capacity are separate requirements',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  const a=input(s);
  assert(codes(a).includes('known_stock_quantity_not_confirmed'));
  assert(codes(a).includes('known_sale_price_not_confirmed'));
  assert(!a.can_compare);
  assert.equal(a.focus.label_ja,'りんご');
});
test('seedCount stored as seedlings never satisfies harvested apple quantity',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  s.playerState={apple:{seedCount:13,status:'stored',location:'warehouse',seedQuality:0.5}};
  const a=input(s);
  assert(codes(a).includes('known_stock_quantity_not_confirmed'));
  assert(!a.can_compare);
});
test('facility omissions are not silently interpreted as unavailable',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  const a=inspect(master,s,{focus_ref:apple,scenario,verified:{
    cash_g:0,confirm_baseline_only:true,available_route_ids:[],
    confirmed_stock_rows:[{ref:apple,quantity:3}],known_sale_quote_refs:[apple]
  }});
  assert(codes(a).includes('facility_access_not_confirmed'));
  assert(codes(a).includes('resource_access_not_confirmed'));
});
test('confirmed discovered apple to seedling scenario is ready, not a global optimum',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const checks={confirmed_stock_rows:[{ref:apple,quantity:13},{ref:seedling,quantity:0}],
    known_sale_quote_refs:[apple,seedlingQuote],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const initial=input(s,checks);
  assert.equal(initial.route_choices.length,1);
  const route=initial.route_choices[0].route_id;
  const done=input(s,{...checks,available_route_ids:[route]});
  assert.equal(done.status,'ready_for_bounded_comparison');
  assert.equal(done.can_compare,true);
  assert.deepEqual(done.missing,[]);
  const result=compareAppKnownEconomy(master,s,{
    focus_ref:apple,scenario,verified:verified({...checks,available_route_ids:[route]}),
    max_depth:1
  });
  assert.equal(result.status,'ok');
  assert.equal(result.ranked[0].net_gain_vs_direct_sale_g,680);
});
test('active goal protects future discovered output even if current stock is zero',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  s.goals=[{id:'g',status:'active'}];
  s.requirements={g:[{targetType:'entity',targetId:'apple_seedling',need:1,have:0}]};
  const checks={confirmed_stock_rows:[{ref:apple,quantity:1},{ref:seedling,quantity:0}],
    known_sale_quote_refs:[apple,seedlingQuote],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const route=input(s,checks).route_choices[0].route_id;
  const a=input(s,{...checks,available_route_ids:[route]});
  assert.equal(a.status,'needs_confirmation');
  assert(codes(a).includes('goal_allocations_need_review'));
});
test('unconfirmed route assumptions block the false best-direct-sale result',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const checks={confirmed_stock_rows:[{ref:apple,quantity:1},{ref:seedling,quantity:0}],
    known_sale_quote_refs:[apple,seedlingQuote],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const alt={...scenario,assumptions:{...scenario.assumptions,no_windmill_fee_confirmed:false}};
  const route=input(s,checks,apple,alt).route_choices[0].route_id;
  const a=input(s,{...checks,available_route_ids:[route]},apple,alt);
  assert(codes(a).includes('known_route_cost_time_or_availability_not_confirmed'));
  const result=compareAppKnownEconomy(master,s,{
    focus_ref:apple,scenario:alt,verified:verified({...checks,available_route_ids:[route]})
  });
  assert.equal(result.status,'known_route_assumptions_incomplete');
  assert.equal(result.best_plan_id,undefined);
});
test('even direct-sale-only focus requires an explicit sale quotation',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  const a=compareAppKnownEconomy(master,s,{
    focus_ref:apple,scenario,verified:verified({
      confirmed_stock_rows:[{ref:apple,quantity:2}]
    })
  });
  assert.equal(a.status,'known_valuation_incomplete');
});
test('hidden Master recipe append does not change input requirements',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];s.knownFacts=['process_seedling_apple'];
  const checks={confirmed_stock_rows:[{ref:apple,quantity:1}],
    known_facility_ids:[yellow],known_resource_ids:[yellow]};
  const before=input(s,checks);
  const extra=structuredClone(master);
  const hidden={...extra.windmill_recipes.find(x=>x.id==='wmrec_yellow_6f3bc973'),
    id:'unseen_v04_recipe',base_processing_minutes:1};
  extra.windmill_recipes.push(hidden);
  const after=inspect(extra,s,{focus_ref:apple,scenario,verified:verified(checks)});
  assert.deepEqual(after,before);
});
test('input readiness does not mutate Player State or Master',
  {skip:!live},()=>{
  const s=base();s.knownEntities=['apple'];
  const b=JSON.stringify(s),m=JSON.stringify(master);
  input(s,{confirmed_stock_rows:[{ref:apple,quantity:2}]});
  assert.equal(JSON.stringify(s),b);
  assert.equal(JSON.stringify(master),m);
});
