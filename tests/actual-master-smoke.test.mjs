/** Integration smoke test against the canonical full Master dataset.
 *  Skipped when the standalone archive lacks the repo's full Master.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {adaptKnownGrandBazaarMaster} from '../lib/grand-bazaar-master-adapter.mjs';
import {compareGeneratedKnownPlans} from '../lib/known-economy-candidate-generator.mjs';

const masterPath=process.env.GB_MASTER_FULL || 'data/board-master.full.v1.json';
const requireRoot=existsSync(masterPath);
const master=requireRoot ? JSON.parse(readFileSync(masterPath,'utf8')) : null;
const baseline={horizon_minutes:500,assumptions:{
 baseline_wind_time_confirmed:true,no_windmill_fee_confirmed:true,
 cooking_duration_minutes:0,no_cooking_fee_confirmed:true,cooking_output_is_one:true}};

test('live main Master: apple to seedling is a verified 180-minute known windmill route',
 {skip:!requireRoot},()=>{
  const a=adaptKnownGrandBazaarMaster(master,{
   known_item_refs:[{domain:'entities',id:'apple'},
    {domain:'entities',id:'apple_seedling'},
    {domain:'windmill_items',id:'wmitem_7a66863a'},
    {domain:'windmill_items',id:'wmitem_bb743df1'}],
   known_windmill_recipe_ids:['wmrec_yellow_6f3bc973'],
   known_sale_quote_refs:[{domain:'entities',id:'apple'},
    {domain:'windmill_items',id:'wmitem_bb743df1'}],
   known_facility_ids:['windmill:yellow'],known_resource_ids:['windmill:yellow']
  },baseline);
  assert.equal(a.view.routes.length,1);
  assert.equal(a.view.routes[0].duration_minutes,180);
  assert.equal(a.view.routes[0].inputs[0].item_id,'entities:apple');
  assert.equal(a.view.routes[0].outputs[0].item_id,'entities:apple_seedling');
  const player={cash_g:0,inventory:{'entities:apple':1},reserved:{},inventory_is_complete:true,
   available_route_ids:a.view.routes.map(x=>x.id),resource_capacities:{'windmill:yellow':1}};
  const result=compareGeneratedKnownPlans(a,player,{focus_item_id:'entities:apple',max_depth:1});
  assert.equal(result.best_plan_id?.startsWith('candidate:windmill:'),true);
  assert.equal(result.ranked[0].net_gain_vs_direct_sale_g,680);
 });

test('live main Master: known grape jam grouping and one observed sugar purchase route',
 {skip:!requireRoot},()=>{
  const a=adaptKnownGrandBazaarMaster(master,{
   known_item_refs:[{domain:'entities',id:'red_grapes'},
    {domain:'entities',id:'lemon'},
    {domain:'windmill_items',id:'wmitem_5dfc7369'},
    {domain:'cooking_recipes',id:'grape_jam'}],
   known_cooking_recipe_ids:['grape_jam'],
   known_sale_quote_refs:[{domain:'entities',id:'red_grapes'},
    {domain:'entities',id:'lemon'},
    {domain:'cooking_recipes',id:'grape_jam'}],
   known_facility_ids:['kitchen'],known_shop_ids:['shop_miguel_town'],
   observed_shop_offers:[{id:'test_case_sugar_price',shop_id:'shop_miguel_town',
    item_ref:{domain:'windmill_items',id:'wmitem_5dfc7369'},quantity:1,price_g:420}]
  },baseline);
  assert.equal(a.view.routes.filter(x=>x.kind==='cook').length,1);
  assert.equal(a.view.routes.filter(x=>x.kind==='buy').length,1);
  const player={cash_g:500,inventory:{'entities:red_grapes':1,'entities:lemon':1},reserved:{},
   inventory_is_complete:true,available_route_ids:a.view.routes.map(x=>x.id),resource_capacities:{}};
  const result=compareGeneratedKnownPlans(a,player,{focus_item_id:'entities:red_grapes',max_depth:2});
  assert.equal(result.ranked[0].net_gain_vs_direct_sale_g,277);
 });

test('live main Master: no player discoveries never exposes names/routes/quotes',
 {skip:!requireRoot},()=>{
   const a=adaptKnownGrandBazaarMaster(master,{},baseline);
   assert.equal(a.view.items.length,0);
   assert.equal(a.view.routes.length,0);
   assert.equal(a.view.quotes.length,0);
 });