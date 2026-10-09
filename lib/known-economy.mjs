/**
 * Known-only production economics — deterministic comparison kernel v0.1.
 * Pure functions: no DOM, persistence, network, raw-master UI, or game constants.
 * All examples/tests use SYNTHETIC data, not Story of Seasons prices/yields.
 *
 * An action represents ONE explicitly modeled batch. No assumption is made that
 * in-game time/yield scales linearly with quantity. Recipes, quotes, availability,
 * lot quality, and batch definitions must be verified by an upstream adapter.
 */
const clone = x => JSON.parse(JSON.stringify(x));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const idOk = x => typeof x === 'string' && x.length > 0;
const nat = x => Number.isSafeInteger(x) && x >= 0;
const pos = x => Number.isSafeInteger(x) && x > 0;
const amount = x => Number.isFinite(x) && x >= 0;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const kinds = new Set(['buy', 'grow', 'process', 'cook', 'sell']);
const asSet = x => new Set(Array.isArray(x) ? x.filter(idOk) : []);
const unavailable = () => ({status: 'not_available_in_known_scope'});
const round = n => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

function uniqueRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!idOk(row?.id) || seen.has(row.id)) throw new TypeError('Invalid known catalog');
    seen.add(row.id);
  }
}
function ingredientRows(rows) {
  return Array.isArray(rows) && rows.every(x => idOk(x?.item_id) && pos(x.quantity)) &&
    new Set(rows.map(x => x.item_id)).size === rows.length;
}

/**
 * The disclosure boundary is BEFORE optimization/evaluation, not after ranking.
 * Only approved fields are copied. Undiscovered records are ignored even if
 * malformed; hidden record additions/prices/labels cannot affect normal outputs.
 * Item discovery does NOT imply recipe, quote, shop, facility or offer discovery.
 */
export function projectKnownEconomy(catalog, knowledge = {}) {
  if (!catalog || !Array.isArray(catalog.items) || !Array.isArray(catalog.routes) ||
      !Array.isArray(catalog.quotes)) throw new TypeError('Invalid catalog');
  const itemIds = asSet(knowledge.item_ids), routeIds = asSet(knowledge.route_ids);
  const quoteIds = asSet(knowledge.quote_ids), shops = asSet(knowledge.shop_ids);
  const facilities = asSet(knowledge.facility_ids), facts = asSet(knowledge.fact_ids);
  const resources = asSet(knowledge.resource_ids);
  const disclosedItems = catalog.items.filter(x => x && itemIds.has(x.id));
  uniqueRows(disclosedItems);
  const items = disclosedItems.map(x => ({id: x.id, name_ja: String(x.name_ja || x.id)}))
    .sort((a,b) => order(a.id,b.id));
  const knownItems = new Set(items.map(x => x.id));
  const visibleRows = catalog.routes.filter(r => {
    if (!r || !routeIds.has(r.id)) return false;
    if (r.shop_id && !shops.has(r.shop_id)) return false;
    if (r.facility_id && !facilities.has(r.facility_id)) return false;
    if (!Array.isArray(r.inputs) || !Array.isArray(r.outputs) ||
        !Array.isArray(r.requires_fact_ids) || !Array.isArray(r.resource_usage)) return false;
    if (r.requires_fact_ids.some(id => !facts.has(id))) return false;
    if ([...r.inputs, ...r.outputs].some(x => !knownItems.has(x?.item_id))) return false;
    if (r.resource_usage.some(x => !resources.has(x?.resource_id))) return false;
    return true;
  });
  uniqueRows(visibleRows);
  const routes = visibleRows.map(r => {
    // Invalid/unconfirmed visible facts remain non-comparable, never free/instant.
    const safe = {id:r.id, name_ja:String(r.name_ja || r.id), kind:r.kind,
      inputs:r.inputs.map(x => ({item_id:x.item_id, quantity:x.quantity})),
      outputs:r.outputs.map(x => ({item_id:x.item_id, quantity:x.quantity})),
      cash_cost_g:r.cash_cost_g ?? null, cash_receipts_g:r.cash_receipts_g ?? null,
      duration_minutes:r.duration_minutes ?? null,
      effort_actions:r.effort_actions ?? null,
      max_uses:r.max_uses === null ? null : (r.max_uses ?? 'unknown'),
      availability_windows:Array.isArray(r.availability_windows) ?
        r.availability_windows.map(x => ({start:x.start, end:x.end})) : null,
      resource_usage:r.resource_usage.map(x => ({resource_id:x.resource_id,
        units:x.units, duration_minutes:x.duration_minutes})),
      confidence:r.confidence === 'confirmed' ? 'confirmed' : 'unconfirmed'};
    return safe;
  }).sort((a,b) => order(a.id,b.id));
  const visibleQuotes = catalog.quotes.filter(q => q && quoteIds.has(q.id) &&
    knownItems.has(q.item_id) && Array.isArray(q.requires_fact_ids) &&
    q.requires_fact_ids.every(id => facts.has(id)));
  uniqueRows(visibleQuotes);
  const quotes = visibleQuotes.map(q => ({id:q.id, item_id:q.item_id,
    scenario_id:q.scenario_id, unit_sell_g:q.unit_sell_g ?? null,
    confidence:q.confidence === 'confirmed' ? 'confirmed' : 'unconfirmed'}))
    .sort((a,b) => order(a.id,b.id));
  return {schema_version:1, scope:'known_facts_only', items, routes, quotes,
    resource_ids:[...resources].sort(order)};
}

function routeConfirmed(r) {
  return r.confidence === 'confirmed' && kinds.has(r.kind) &&
    ingredientRows(r.inputs) && ingredientRows(r.outputs) &&
    nat(r.duration_minutes) && amount(r.cash_cost_g) && amount(r.cash_receipts_g) &&
    nat(r.effort_actions) && (r.max_uses === null || nat(r.max_uses)) &&
    Array.isArray(r.availability_windows) && r.availability_windows.every(w =>
      nat(w.start) && nat(w.end) && w.start <= w.end) &&
    r.resource_usage.every(u => idOk(u.resource_id) && pos(u.units) &&
      pos(u.duration_minutes) && u.duration_minutes <= r.duration_minutes) &&
    new Set(r.resource_usage.map(x => x.resource_id)).size === r.resource_usage.length;
}
function fullWindow(windows, start, finish) {
  return windows.some(w => start >= w.start && finish <= w.end);
}
function quoteLookup(view, scenarioId, itemId) {
  const all = view.quotes.filter(q => q.item_id === itemId && q.scenario_id === scenarioId);
  if (all.length !== 1 || all[0].confidence !== 'confirmed' ||
      !amount(all[0].unit_sell_g)) return null;
  return all[0].unit_sell_g;
}
function scenarioValid(s) {
  return s && idOk(s.id) && nat(s.horizon_minutes) &&
    s.terminal_valuation === 'full_sale_at_known_quotes';
}
function resourcesFeasible(reservations, capacities) {
  for (const [id, intervals] of reservations) {
    if (!nat(capacities?.[id])) return 'resource_capacity_not_recorded';
    const events = intervals.flatMap(u => [[u.start,u.units],[u.end,-u.units]])
      .sort((a,b) => a[0]-b[0] || a[1]-b[1]); // releases precede new starts
    let usage = 0;
    for (const [,delta] of events) { usage += delta; if (usage > capacities[id])
      return 'resource_capacity_exceeded'; }
  }
  return null;
}

/**
 * Evaluate one explicit time-stamped plan from a common opening position.
 * Returns accounting outcomes, not a claim of globally optimal farm operations.
 * Pending outputs cannot be consumed before completion. Cash is paid at start;
 * sale receipts arrive at completion. Reserved stock is never spendable.
 */
export function evaluateKnownPlan(view, player, plan, scenario) {
  if (!scenarioValid(scenario)) return {status:'scenario_not_confirmed'};
  if (!view || view.scope !== 'known_facts_only' || !Array.isArray(view.routes))
    return {status:'known_view_required'};
  if (!plan || !idOk(plan.id) || !Array.isArray(plan.actions))
    return {status:'invalid_plan'};
  const byRoute = new Map(view.routes.map(r => [r.id,r]));
  if (plan.actions.some(a => !a || !byRoute.has(a.route_id))) return unavailable();
  if (plan.actions.some(a => !nat(a.start_minute))) return {status:'invalid_plan'};
  const routes = plan.actions.map(a => byRoute.get(a.route_id));
  if (routes.some(r => !routeConfirmed(r))) return {status:'known_inputs_unconfirmed'};
  const itemSet = new Set(view.items.map(x => x.id));
  if (!player || !amount(player.cash_g) || !player.inventory || !player.reserved ||
      !Array.isArray(player.available_route_ids)) return {status:'player_state_incomplete'};
  const available = asSet(player.available_route_ids);
  if (routes.some(r => !available.has(r.id))) return {status:'known_route_not_available_now'};
  const affected = new Set(routes.flatMap(r => [...r.inputs, ...r.outputs].map(x => x.item_id)));
  if (player.inventory_is_complete !== true && [...affected].some(id => !own(player.inventory,id)))
    return {status:'inventory_quantity_not_recorded'};
  const stock = new Map(), initial = new Map(), reserved = new Map();
  for (const id of itemSet) {
    const q = own(player.inventory,id) ? player.inventory[id] : 0;
    const r = own(player.reserved,id) ? player.reserved[id] : 0;
    if (!nat(q) || !nat(r) || r > q) return {status:'invalid_player_quantities'};
    stock.set(id,q); initial.set(id,q); reserved.set(id,r);
  }
  const actions = plan.actions.map((a,i) => ({r:byRoute.get(a.route_id),
    start:a.start_minute, order:i})).sort((a,b) => a.start-b.start || a.order-b.order);
  const uses = new Map(), reservations = new Map(), resourceMinutes = new Map();
  for (const a of actions) {
    a.end = a.start + a.r.duration_minutes;
    if (!nat(a.end)) return {status:'invalid_plan'};
    if (a.end > scenario.horizon_minutes) return {status:'deadline_missed'};
    if (!fullWindow(a.r.availability_windows,a.start,a.end)) return {status:'outside_known_window'};
    const n = (uses.get(a.r.id)||0)+1; uses.set(a.r.id,n);
    if (a.r.max_uses !== null && n > a.r.max_uses) return {status:'route_quota_exceeded'};
    for (const u of a.r.resource_usage) {
      const list = reservations.get(u.resource_id)||[];
      list.push({start:a.start,end:a.start+u.duration_minutes,units:u.units});
      reservations.set(u.resource_id,list);
      resourceMinutes.set(u.resource_id,(resourceMinutes.get(u.resource_id)||0)+u.units*u.duration_minutes);
    }
  }
  const capError = resourcesFeasible(reservations,player.resource_capacities);
  if (capError) return {status:capError};
  let cash = player.cash_g, spent = 0, received = 0, peakFunding = 0, effort = 0;
  let pending = [];
  const steps = [];
  function complete(until) {
    const done = pending.filter(x => x.end <= until)
      .sort((a,b) => a.end-b.end || a.order-b.order);
    pending = pending.filter(x => x.end > until);
    for (const a of done) {
      for (const output of a.r.outputs) stock.set(output.item_id,stock.get(output.item_id)+output.quantity);
      cash += a.r.cash_receipts_g; received += a.r.cash_receipts_g;
    }
  }
  for (const a of actions) {
    complete(a.start);
    if (cash + 1e-8 < a.r.cash_cost_g) return {status:'insufficient_cash'};
    if (a.r.inputs.some(x => stock.get(x.item_id)-reserved.get(x.item_id) < x.quantity))
      return {status:'insufficient_unreserved_stock'};
    for (const input of a.r.inputs) stock.set(input.item_id,stock.get(input.item_id)-input.quantity);
    cash -= a.r.cash_cost_g; spent += a.r.cash_cost_g;
    peakFunding = Math.max(peakFunding, spent-received);
    effort += a.r.effort_actions;
    pending.push(a);
    steps.push({route_id:a.r.id, name_ja:a.r.name_ja, kind:a.r.kind,
      start_minute:a.start, finish_minute:a.end,
      cash_cost_g:a.r.cash_cost_g, cash_receipts_g:a.r.cash_receipts_g,
      inputs:clone(a.r.inputs), outputs:clone(a.r.outputs)});
    complete(a.start); // zero-duration bought goods may feed next same-time action
  }
  complete(scenario.horizon_minutes);
  const inventoryChanges = [], missing = [];
  let retainedValue = 0, consumedOpeningValue = 0;
  for (const id of [...itemSet].sort(order)) {
    const change = stock.get(id)-initial.get(id);
    if (change === 0) continue; // unrelated untouched unknown quotes must not block comparison
    const quote = quoteLookup(view,scenario.id,id);
    if (quote === null) missing.push(id);
    else if (change > 0) retainedValue += change*quote;
    else consumedOpeningValue += -change*quote;
    inventoryChanges.push({item_id:id,quantity_change:change,closing_quantity:stock.get(id),
      unit_sale_quote_g:quote});
  }
  const out = {status:missing.length ? 'valuation_incomplete' : 'ok', plan_id:plan.id,
    scenario_id:scenario.id, scope:'evaluated_known_plan_only',
    assumption:'remaining_inventory_fully_sellable_at_known_scenario_quotes',
    cash_spent_g:round(spent), cash_received_g:round(received),
    cash_change_g:round(received-spent), closing_cash_g:round(cash),
    peak_funding_g:round(Math.max(0,peakFunding)),
    elapsed_minutes:Math.max(0,...actions.map(a => a.end)), effort_actions:effort,
    resource_unit_minutes:Object.fromEntries([...resourceMinutes].sort(([a],[b]) => order(a,b))),
    inventory_changes:inventoryChanges, steps,
    terminal_inventory_gain_value_g:missing.length?null:round(retainedValue),
    net_opening_inventory_reduction_value_g:missing.length?null:round(consumedOpeningValue),
    net_gain_vs_direct_sale_g:missing.length?null:round(received-spent+retainedValue-consumedOpeningValue),
    gain_on_consumed_value_pct:null, missing_known_quote_item_ids:missing};
  const denominator = spent + consumedOpeningValue;
  if (!missing.length && denominator > 0)
    out.gain_on_consumed_value_pct = round(out.net_gain_vs_direct_sale_g/denominator*100);
  // All artifacts are detached; callers cannot mutate Master or Player State via result objects.
  return out;
}

/**
 * Compare plans sharing an identical opening state, deadline and sale context.
 * Unknown plans are excluded before ID validation, limits, ranking and summaries.
 * Hidden counts/labels are never returned. Equal scores have stable public-ID order.
 * Completeness is intentionally scoped to evaluated known candidates, not all recipes.
 */
export function compareKnownPlans(catalog, knowledge, player, plans, scenario) {
  const view = projectKnownEconomy(catalog,knowledge);
  if (!Array.isArray(plans)) return {status:'invalid_plans'};
  const routeIds = new Set(view.routes.map(r => r.id));
  const allowed = plans.filter(p => p && Array.isArray(p.actions) &&
    p.actions.every(a => a && routeIds.has(a.route_id)));
  // Duplicate ID error cannot be triggered by undiscovered alternatives.
  try { uniqueRows(allowed); } catch { return {status:'invalid_known_plan_ids'}; }
  const results = allowed.map(p => ({id:p.id,result:evaluateKnownPlan(view,player,p,scenario)}));
  const ranked = results.filter(x => x.result.status==='ok').map(x => x.result)
    .sort((a,b) => b.net_gain_vs_direct_sale_g-a.net_gain_vs_direct_sale_g || order(a.plan_id,b.plan_id));
  const rankedWithDiff = ranked.map(r => {
    const others = ranked.filter(x => x.plan_id!==r.plan_id);
    return {...r, gain_vs_best_other_evaluated_plan_g:others.length ?
      round(r.net_gain_vs_direct_sale_g-others[0].net_gain_vs_direct_sale_g) : null};
  });
  // Failures contain only disclosed plan IDs and fixed error enums, never raw Master details.
  return {status:'ok', scope:'evaluated_known_candidates_only',
    recommendation_status:ranked.length?'comparison_available':'no_comparable_known_plan',
    best_plan_id:ranked[0]?.plan_id??null, ranked:rankedWithDiff,
    unranked:results.filter(x => x.result.status!=='ok')
      .map(x => ({plan_id:x.id,status:x.result.status})).sort((a,b) => order(a.plan_id,b.plan_id))};
}