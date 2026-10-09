// SYNTHETIC fixtures. These are not actual game prices, recipes, yields, or times.
export const copy = x => JSON.parse(JSON.stringify(x));
export function fixture() {
  const items = [
    ['seed','架空の種'],['raw','架空の原料'],['ingredient','架空の加工材料'],
    ['dish','架空の料理'],['quick','架空の簡単加工品'],['byproduct','架空の副産物'],
  ].map(([id,name_ja]) => ({id,name_ja}));
  const route = (id,kind,inputs,outputs,cost=0,duration=0,usage=[],extra={}) => ({
    id,name_ja:id,kind,inputs:Object.entries(inputs).map(([item_id,quantity]) => ({item_id,quantity})),
    outputs:Object.entries(outputs).map(([item_id,quantity]) => ({item_id,quantity})),
    cash_cost_g:cost,cash_receipts_g:0,duration_minutes:duration,effort_actions:1,
    max_uses:null,availability_windows:[{start:0,end:10000}],resource_usage:usage,
    requires_fact_ids:[],confidence:'confirmed',...extra,
  });
  const mill = duration_minutes => [{resource_id:'mill',units:1,duration_minutes}];
  const routes = [
    route('buy_seed','buy',{}, {seed:1},20,0,[],{shop_id:'shop',max_uses:10}),
    route('buy_raw','buy',{}, {raw:1},90,0,[],{shop_id:'shop',max_uses:3}),
    route('buy_ingredient','buy',{}, {ingredient:1},110,0,[],{shop_id:'shop',max_uses:2}),
    route('grow','grow',{seed:1},{raw:3},0,4320,
      [{resource_id:'field',units:1,duration_minutes:4320}],{facility_id:'field',max_uses:5}),
    route('process','process',{raw:1},{ingredient:1},5,60,mill(60),{facility_id:'mill'}),
    route('cook','cook',{ingredient:1},{dish:1},5,1,[],{facility_id:'kitchen'}),
    route('simple','process',{raw:1},{quick:1},0,20,mill(20),{facility_id:'mill'}),
    route('sell_raw','sell',{raw:1},{},0,0,[],{cash_receipts_g:80,shop_id:'shop',max_uses:5}),
    route('sell_dish','sell',{dish:1},{},0,0,[],{cash_receipts_g:200,shop_id:'shop',max_uses:1}),
  ];
  const prices = {seed:10,raw:80,ingredient:100,dish:200,quick:140,byproduct:30};
  const quotes = items.map(x => ({id:'q_'+x.id,item_id:x.id,unit_sell_g:prices[x.id],
    scenario_id:'same_bazaar',requires_fact_ids:[],confidence:'confirmed'}));
  const catalog = {items,routes,quotes};
  const knowledge = {item_ids:items.map(x => x.id),route_ids:routes.map(x => x.id),
    quote_ids:quotes.map(x => x.id),shop_ids:['shop'],facility_ids:['field','mill','kitchen'],
    resource_ids:['field','mill'],fact_ids:[]};
  const player = {cash_g:300,inventory:{raw:1},inventory_is_complete:true,reserved:{},
    available_route_ids:routes.map(r => r.id),resource_capacities:{field:1,mill:1}};
  const scenario = {id:'same_bazaar',horizon_minutes:5000,
    terminal_valuation:'full_sale_at_known_quotes'};
  return {catalog,knowledge,player,scenario,route};
}
export const act = (route_id,start_minute=0) => ({route_id,start_minute});
export const plan = (id,...actions) => ({id,actions});