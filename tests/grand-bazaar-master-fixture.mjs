// Reduced schema fixture with values checked against the repository's embedded Master.
// Additional shop offer price is an explicit observed fixture, NOT an exhaustive shop catalog.
export function fixtureGrandBazaarMaster(){
 const E=(id,name_ja,kind,attributes)=>({id,name_ja,kind,attributes});
 return {
 meta:{target_game_version:'1.5.0'},
 entities:[
   E('apple','りんご','fruit',{price:170,grow_days:14,base_yield:7,seasons:['autumn','winter']}),
   E('apple_seedling','りんごの苗','seedling',{bag_price:1190}),
   E('red_grapes','ぶどう','fruit',{price:175}),
   E('red_grape_seedling','ぶどうの苗','seedling',{bag_price:1260}),
   E('lemon','レモン','fruit',{price:135}),
 ],
 windmill_items:[
   {id:'wmitem_7a66863a',name_ja:'りんご',canonical_ref:{domain:'entities',id:'apple'}},
   {id:'wmitem_bb743df1',name_ja:'りんごの苗',canonical_ref:{domain:'entities',id:'apple_seedling'},base_sell_price:850},
   {id:'wmitem_8207d652',name_ja:'ぶどう',canonical_ref:{domain:'entities',id:'red_grapes'}},
   {id:'wmitem_fd3af699',name_ja:'ぶどうの苗',canonical_ref:{domain:'entities',id:'red_grape_seedling'},base_sell_price:900},
   {id:'wmitem_5dfc7369',name_ja:'砂糖',base_sell_price:300},
 ],
 windmill_recipes:[
   {id:'wmrec_yellow_6f3bc973',windmill:'yellow',output_item_id:'wmitem_bb743df1',output_quantity:1,
    base_processing_minutes:180,inputs:[{type:'item',item_id:'wmitem_7a66863a',quantity:1}],provenance:{confidence:'confirmed'}},
   {id:'wmrec_yellow_be36265b',windmill:'yellow',output_item_id:'wmitem_fd3af699',output_quantity:1,
    base_processing_minutes:180,inputs:[{type:'item',item_id:'wmitem_8207d652',quantity:1}],provenance:{confidence:'confirmed'}}
 ],
 windmill_groups:[],
 cooking_recipes:[
   {id:'grape_jam',name_ja:'ぶどうジャム',base_sell_price:1007,required_utensil:'none',required_slots:[
     {type:'group',group_id:'cookgrp_family_red_grapes',quantity:1},
     {type:'item',ref:{domain:'windmill_items',id:'wmitem_5dfc7369',name_ja:'砂糖'},quantity:1},
     {type:'group',group_id:'cookgrp_family_lemon',quantity:1}],provenance:{confidence:'confirmed'}},
   {id:'herb_salad',name_ja:'ハーブサラダ',base_sell_price:137,required_utensil:'none',required_slots:[
     {type:'group',group_id:'cookgrp_ext_herb_a',quantity:2}],provenance:{confidence:'confirmed'}}
 ],
 cooking_groups:[
   {id:'cookgrp_family_red_grapes',members:[{domain:'entities',id:'red_grapes',name_ja:'ぶどう'}]},
   {id:'cookgrp_family_lemon',members:[{domain:'entities',id:'lemon',name_ja:'レモン'}]},
   {id:'cookgrp_ext_herb_a',members:[{domain:'resource_items',id:'mint',name_ja:'ミント'},
                                    {domain:'resource_items',id:'chamomile',name_ja:'カモミール'}]}
 ],
 resource_items:[{id:'mint',name_ja:'ミント',base_sell_price:50},
                 {id:'chamomile',name_ja:'カモミール',base_sell_price:50}],
 };
}
export const knownApple={
 known_item_refs:[{domain:'entities',id:'apple'},{domain:'entities',id:'apple_seedling'},
   {domain:'windmill_items',id:'wmitem_7a66863a'},{domain:'windmill_items',id:'wmitem_bb743df1'}],
 known_windmill_recipe_ids:['wmrec_yellow_6f3bc973'],
 known_sale_quote_refs:[{domain:'entities',id:'apple'},{domain:'windmill_items',id:'wmitem_bb743df1'}],
 known_facility_ids:['windmill:yellow'],known_resource_ids:['windmill:yellow'],
 known_shop_ids:[],known_fact_ids:[],
};
export const baseline={horizon_minutes:500,assumptions:{baseline_wind_time_confirmed:true,
  no_windmill_fee_confirmed:true,cooking_duration_minutes:0,no_cooking_fee_confirmed:true,cooking_output_is_one:true}};
export function knownPlayer(adapted,inventory,cash=500){
 return {cash_g:cash,inventory,inventory_is_complete:true,reserved:{},
  available_route_ids:adapted.view.routes.map(x=>x.id),
  resource_capacities:{'windmill:yellow':1,'windmill:blue':1,'windmill:red':1}};
}