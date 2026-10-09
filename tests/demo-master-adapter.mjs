import {fixtureGrandBazaarMaster,knownApple,knownPlayer,baseline} from './grand-bazaar-master-fixture.mjs';
import {adaptKnownGrandBazaarMaster} from '../lib/grand-bazaar-master-adapter.mjs';
import {compareGeneratedKnownPlans} from '../lib/known-economy-candidate-generator.mjs';
const master=fixtureGrandBazaarMaster();
const apple=adaptKnownGrandBazaarMaster(master,knownApple,baseline);
const appleResults=compareGeneratedKnownPlans(apple,knownPlayer(apple,{'entities:apple':1}),{
  focus_item_id:'entities:apple',max_depth:2
});
const disclosure={
  known_item_refs:[{domain:'entities',id:'red_grapes'},{domain:'entities',id:'lemon'},
  {domain:'windmill_items',id:'wmitem_5dfc7369'},{domain:'cooking_recipes',id:'grape_jam'}],
  known_cooking_recipe_ids:['grape_jam'],known_facility_ids:['kitchen'],
  known_shop_ids:['shop_miguel_town'],known_sale_quote_refs:[
    {domain:'entities',id:'red_grapes'},{domain:'entities',id:'lemon'},
    {domain:'cooking_recipes',id:'grape_jam'}],
  observed_shop_offers:[{id:'observed_sugar_420',shop_id:'shop_miguel_town',
     item_ref:{domain:'windmill_items',id:'wmitem_5dfc7369'},quantity:1,price_g:420}]
};
const jam=adaptKnownGrandBazaarMaster(master,disclosure,baseline);
const jamResults=compareGeneratedKnownPlans(jam,knownPlayer(jam,{
  'entities:red_grapes':1,'entities:lemon':1},500),{focus_item_id:'entities:red_grapes',max_depth:2});
console.log(JSON.stringify({
 assumptions:['No quality modification, trend or customer capacity effects',
  'Base sell prices are from Master-aligned reduced fixture',
  'Sugar shop price is a scenario-specific observed-price fixture, not a live store quote',
  'Only user-declared discovered items and routes are considered'],
 examples:[
  {name:'apple_to_seedling',best_gain_vs_direct_sale_g:appleResults.ranked[0]?.net_gain_vs_direct_sale_g,
   best_plan_steps:appleResults.ranked[0]?.steps,coverage:appleResults.coverage},
  {name:'grape_jam_with_bought_sugar',best_gain_vs_direct_sale_g:jamResults.ranked[0]?.net_gain_vs_direct_sale_g,
   best_plan_steps:jamResults.ranked[0]?.steps,coverage:jamResults.coverage}
 ]
},null,2));