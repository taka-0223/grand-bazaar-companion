import {
  listAppKnownEconomyDiscovery,compareAppKnownEconomy
} from '../lib/app-player-economy-bridge.mjs';
import {inspectAppKnownEconomyInputs} from '../lib/app-economy-input-contract.mjs';
import {createKnownEconomyLoader} from '../lib/known-economy-on-demand.mjs';
import {readDevicePlayerState,stateFromBackupText} from './state.mjs';
import {
  renderFacilityChoices,renderRouteChoices,renderResourceInputs,
  renderItemInputs,renderComparison,describeMissing
} from './view.mjs';

const $=id=>document.getElementById(id);
const loader=createKnownEconomyLoader();
let state=null,master=null,discovery=null,routeConfirmed=false;
let selectedRoutes=new Set(),selectedFacilities=new Set();
const stock=new Map(),prices=new Map(),baseQuotes=new Set(),capacities=new Map();
const shownRequirements=new Map();
const itemRef=key=>{const n=key.indexOf(':');return n<1?null:{
  domain:key.slice(0,n),id:key.slice(n+1)};};
const toQuantity=value=>{
  const s=String(value??'').trim();
  if(!/^\d+$/.test(s))return null;
  const n=Number(s);return Number.isSafeInteger(n)?n:null;
};
const status=message=>{$('sourceStatus').textContent=message};
const problem=message=>{$('validationMessage').textContent=message};
const show=(id,visible)=>{$(id).hidden=!visible};
function resetDerived(){
  routeConfirmed=false;
  selectedRoutes.clear();selectedFacilities.clear();
  stock.clear();prices.clear();baseQuotes.clear();capacities.clear();
  shownRequirements.clear();
  ['routesCard','detailsCard','resultCard'].forEach(id=>show(id,false));
}
async function acceptState(player,label){
  if(!player||player.schemaVersion!==7||
     !Array.isArray(player.knownEntities)||
     !Array.isArray(player.knownRecipes)||
     !Array.isArray(player.knownProcesses))
    throw new Error('player_schema_unsupported');
  // This is the first and only point at which the full Master is fetched.
  status('完全版Masterを照合しています…');
  const fetched=await loader.load();
  const items=listAppKnownEconomyDiscovery(fetched,player);
  if(items.status!=='ready')throw new Error('player_schema_unsupported');
  master=fetched;state=player;discovery=items;
  resetDerived();
  const select=$('focusItem');
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.textContent='品物を選んでください';placeholder.value='';
  select.append(placeholder);
  for(const item of items.items){
    const o=document.createElement('option');o.value=item.item_id;
    o.textContent=item.label_ja;select.append(o);
  }
  $('horizon').value='';$('acceptBaseline').checked=false;
  $('cash').value='';$('confirmGoals').checked=false;
  $('confirmRequests').checked=false;
  renderFacilityChoices($('facilityChoices'),items.facilities,selectedFacilities);
  show('setupCard',true);
  status(label+'を読み込みました。登録済みの品物から比較対象を選んでください。');
  problem('');
}
async function withLoading(action,label){
  $('useDevice').disabled=true;
  try{await acceptState(await action(),label);}
  catch(err){
    const errors={
      player_schema_unsupported:'このバックアップ形式は未対応です。作戦ボードから新しいJSONを出力してください。',
      backup_invalid:'正しいJSONバックアップを選んでください。',
      economy_master_unavailable:'Masterを取得できません。通信状態を確認し、もう一度試してください。',
      economy_master_invalid:'完全版Masterの検証に失敗しました。更新を確認してください。'
    };
    status(errors[err?.message]||'読み取りに失敗しました。JSONバックアップを選び直してください。');
  }finally{$('useDevice').disabled=false}
}
$('useDevice').addEventListener('click',()=>withLoading(async()=>{
  const result=await readDevicePlayerState();
  if(!result)throw new Error('backup_invalid');
  return result;
},'この端末の保存データ'));
$('backupFile').addEventListener('change',event=>{
  const file=event.target.files?.[0];if(!file)return;
  withLoading(async()=>{
    if(file.size>2*1024*1024)throw new Error('backup_invalid');
    return stateFromBackupText(await file.text());
  },'JSONバックアップ');
});
function config(){
  const n=toQuantity($('horizon').value);
  if(n===null||n<1)return null;
  const yes=$('acceptBaseline').checked;
  return {scenario_id:'economy_pilot_v08',horizon_minutes:n,
    assumptions:{
      baseline_wind_time_confirmed:yes,
      no_windmill_fee_confirmed:yes,
      cooking_duration_minutes:0,
      no_cooking_fee_confirmed:yes,
      cooking_output_is_one:yes
    }};
}
function verified(){
  const c=toQuantity($('cash').value);
  const confirmed_stock_rows=[...stock].map(([key,quantity])=>({
    ref:itemRef(key),quantity})).filter(r=>r.ref);
  const confirmedQuotes=[...baseQuotes].map(itemRef).filter(Boolean);
  const observed_sale_quotes=[...prices].map(([key,unit_sell_g])=>({
    ref:itemRef(key),unit_sell_g})).filter(r=>r.ref);
  return {
    ...(c!==null?{cash_g:c}:{}),
    confirm_baseline_only:$('acceptBaseline').checked,
    known_facility_ids:[...selectedFacilities],
    known_resource_ids:[...selectedFacilities].filter(x=>x.startsWith('windmill:')),
    ...(routeConfirmed?{available_route_ids:[...selectedRoutes]}:{}),
    resource_capacities:Object.fromEntries(capacities),
    known_sale_quote_refs:confirmedQuotes,
    observed_sale_quotes,
    confirmed_stock_rows,
    review_goal_allocations:$('confirmGoals').checked,
    review_request_materials:$('confirmRequests').checked,
    // Missing inventory is NEVER asserted to be zero or fully enumerated.
    confirm_all_inventory_recorded:false
  };
}
function inspect(){
  return inspectAppKnownEconomyInputs(master,state,{
    focus_ref:itemRef($('focusItem').value),scenario:config(),verified:verified()
  });
}
$('chooseRoutes').addEventListener('click',()=>{
  if(!state||!master)return;
  if(!$('focusItem').value){problem('比較したい品物を選んでください。');return}
  if(!config()||!$('acceptBaseline').checked){
    problem('比較時間と基準価格の前提を確認してください。');return;
  }
  selectedFacilities=new Set([...document.querySelectorAll('[data-facility]:checked')]
    .map(el=>el.dataset.facility));
  selectedRoutes.clear();routeConfirmed=false;
  shownRequirements.clear();stock.clear();prices.clear();baseQuotes.clear();
  capacities.clear();
  const result=inspect();
  renderRouteChoices($('routeChoices'),result.route_choices||[],selectedRoutes);
  show('routesCard',true);show('detailsCard',false);show('resultCard',false);
  problem('');
});
$('confirmRoutes').addEventListener('click',()=>{
  selectedRoutes=new Set([...document.querySelectorAll('[data-route]:checked')]
    .map(el=>el.dataset.route));
  routeConfirmed=true;
  renderResourceInputs($('resourceInputs'),discovery.facilities,
    selectedFacilities,capacities);
  show('detailsCard',true);show('resultCard',false);
  updateRequirements();
});
function updateRequirements(){
  const result=inspect();
  for(const d of result.missing||[])if(d?.item_id){
    const id=d.code+'|'+d.item_id;
    shownRequirements.set(id,d);
  }
  renderItemInputs($('itemInputs'),[...shownRequirements.values()],
    stock,prices,baseQuotes);
  return result;
}
$('detailsCard').addEventListener('input',event=>{
  const el=event.target,value=toQuantity(el.value);
  for(const [attribute,target] of [
    ['stock',stock],['quote',prices],['resource',capacities]
  ])if(el.dataset[attribute]){
    const id=el.dataset[attribute];
    if(value===null)target.delete(id);else target.set(id,value);
  }
});
$('detailsCard').addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.masterQuote){
    if(el.checked)baseQuotes.add(el.dataset.masterQuote);
    else baseQuotes.delete(el.dataset.masterQuote);
  }
});
$('runComparison').addEventListener('click',()=>{
  if(!state||!master||!routeConfirmed)return;
  const readiness=inspect();
  updateRequirements();
  if(!selectedRoutes.size){
    problem('今回使える加工候補が選ばれていません。直接売却だけを「最善」とは判定しません。');
    show('resultCard',false);return;
  }
  if(!readiness.can_compare){
    const details=describeMissing(readiness.missing);
    problem(details.join('\n')||'確認が不足しています。');
    show('resultCard',false);return;
  }
  const compared=compareAppKnownEconomy(master,state,{
    focus_ref:itemRef($('focusItem').value),scenario:config(),
    verified:verified(),max_depth:3,max_nodes:240,max_uses_per_route:2
  });
  problem('');
  renderComparison($('comparisonOutput'),compared,true);
  show('resultCard',true);
  $('resultCard').scrollIntoView({behavior:'smooth',block:'start'});
});
$('resetResult').addEventListener('click',()=>{
  show('resultCard',false);show('detailsCard',true);
  $('detailsCard').scrollIntoView({behavior:'smooth',block:'start'});
});
