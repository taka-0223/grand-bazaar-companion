/** Rendering helpers: every displayed item or route is already encounter-gated. */
const html=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const positive=x=>Number.isFinite(x)?(x>0?'+':'')+x.toLocaleString('ja-JP'):'—';
export const escapeEconomyHtml=html;

export function renderFacilityChoices(target,facilities,selected=new Set()){
  target.innerHTML=facilities.length?facilities.map(f=>
    `<label class="checkrow"><input type="checkbox" data-facility="${html(f.facility_id)}" ${selected.has(f.facility_id)?'checked':''}><span>${html(f.label_ja)}</span></label>`).join(''):
    '<p class="muted">登録済みの加工方法から設備を特定できません。設備を確認してから利用してください。</p>';
}
export function renderRouteChoices(target,routes,selected=new Set()){
  target.innerHTML=routes.length?routes.map(r=>
    `<label class="checkrow"><input type="checkbox" data-route="${html(r.route_id)}" ${selected.has(r.route_id)?'checked':''}><span>${html(r.label_ja)} <small class="subtle">(${html(r.kind)})</small></span></label>`).join(''):
    '<p class="muted">今選択した設備で利用できる、登録済みの比較ルートはありません。</p>';
}
export function renderResourceInputs(target,facilities,selected,capacities){
  const resources=facilities.filter(f=>selected.has(f.facility_id)&&
    f.facility_id.startsWith('windmill:'));
  target.innerHTML=resources.length?
    '<h3>確認できた設備の同時使用枠</h3>'+
      resources.map(f=>`<div class="field"><label class="title" for="resource_${html(f.facility_id)}">${html(f.label_ja)}（枠数）</label><input id="resource_${html(f.facility_id)}" type="number" min="0" step="1" inputmode="numeric" data-resource="${html(f.facility_id)}" value="${capacities.has(f.facility_id)?html(capacities.get(f.facility_id)):''}" placeholder="未確認"></div>`).join(''):
    '';
}
export function renderItemInputs(target,missing,stock,prices,baselineRefs){
  const items=new Map();
  for(const d of missing)if(d?.item_id&&
    ['known_stock_quantity_not_confirmed','known_sale_price_not_confirmed'].includes(d.code)){
    const old=items.get(d.item_id)||{...d,stock:false,quote:false};
    if(d.code==='known_stock_quantity_not_confirmed')old.stock=true;
    if(d.code==='known_sale_price_not_confirmed')old.quote=true;
    items.set(d.item_id,old);
  }
  target.innerHTML=[...items.values()].map(d=>
    `<div class="itemrow" data-item-row="${html(d.item_id)}"><strong>${html(d.label_ja)}</strong>
      ${d.stock?`<div class="field"><label class="title">現在使える現物在庫（個）</label><input type="number" min="0" step="1" inputmode="numeric" placeholder="未確認" data-stock="${html(d.item_id)}" value="${stock.has(d.item_id)?html(stock.get(d.item_id)):''}"></div>`:''}
      ${d.quote?`<label class="checkrow"><input type="checkbox" data-master-quote="${html(d.item_id)}" ${baselineRefs.has(d.item_id)?'checked':''}><span>ゲーム内で確認済みの品物としてMaster基準売価を使う</span></label>
      <div class="field"><label class="title">または確認した売価（G）</label><input type="number" min="0" step="1" inputmode="numeric" placeholder="未確認" data-quote="${html(d.item_id)}" value="${prices.has(d.item_id)?html(prices.get(d.item_id)):''}"></div>`:''}
    </div>`).join('')||'<p class="muted">品目ごとの追加入力はありません。</p>';
}
const messages={
  base_price_scenario_acknowledgement_required:'基準価格シナリオの確認が必要です。',
  cash_balance_not_confirmed:'所持金を確認してください。',
  route_availability_not_confirmed:'利用可能な加工方法を確認してください。',
  facility_access_not_confirmed:'設備の利用状況を確認してください。',
  resource_access_not_confirmed:'設備の使用枠を確認してください。',
  resource_capacity_not_confirmed:'風車の使用可能枠を入力してください。',
  goal_allocations_need_review:'進行中の目標に使う材料を確認してください。',
  request_materials_need_review:'進行中のお願いで必要な材料を確認してください。',
  known_route_cost_time_or_availability_not_confirmed:'加工時間や追加費用などの前提が未確定です。',
  known_stock_quantity_not_confirmed:'現物在庫の個数を確認してください。',
  known_sale_price_not_confirmed:'ゲーム内で確認済みの売価が必要です。',
  known_inventory_incomplete:'利用する既知品目の在庫がまだ確認できません。',
  known_valuation_incomplete:'既知の加工経路に売価未確認の品物があります。',
  reservation_exceeds_confirmed_stock:'取り置き数が確認済み在庫を上回っています。',
  route_selection_needs_review:'有効な加工方法を選び直してください。'
};
export function describeMissing(missing){
  const unique=new Map();
  for(const x of missing||[]){
    const code=typeof x==='string'?x:x.code;
    if(!code)continue;
    const label=x?.label_ja;
    const key=code+'|'+(label||'');
    unique.set(key,(label?label+'：':'')+(messages[code]||'比較条件を追加確認してください。'));
  }
  return [...unique.values()];
}
export function renderComparison(target,comparison,hasRoutes){
  if(!hasRoutes){target.textContent='加工方法が未選択です。比較対象を選んでください。';return;}
  if(comparison.status!=='ok'){
    const details=describeMissing(comparison.missing||[comparison.status]);
    target.textContent=details.join('\n')||'比較を保留しました。条件を確認してください。';
    return;
  }
  const items=(comparison.ranked||[]).filter(p=>Array.isArray(p.steps)&&p.steps.length);
  if(!items.length){
    target.textContent='確認した範囲では実行できる加工候補がありません。直売が最も有利だと判定したわけではありません。';
    return;
  }
  target.innerHTML='<p class="muted">確認済みの経路だけを対象とした、直接売却との差額です。未発見の方法や売り切り・品質補正は含みません。</p>'+
  items.slice(0,4).map((plan,i)=>
    `<div class="itemrow"><div class="pill">評価した候補 ${i+1}</div><div class="value">${positive(plan.net_gain_vs_direct_sale_g)}G</div>
    <div class="muted">所要時間 ${html(plan.elapsed_minutes)}分・作業回数 ${html(plan.effort_actions)}</div>
    <div class="muted">${plan.steps.map(x=>html(x.name_ja)).join(' → ')}</div></div>`).join('')+
    '<p class="subtle">順次ルートの限定比較です。全候補の最適解を保証しません。</p>';
}
