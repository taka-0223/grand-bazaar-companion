// Pure, read-only tool upgrade planner.
// Important: revealUnknown=false is the default. Do not expose undiscovered recipe data.
function assertCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.tools) || !Array.isArray(catalog.upgrades)) {
    throw new TypeError('Tool catalog must contain tools and upgrades arrays');
  }
}

export function planToolUpgrade(catalog, {
  toolId,
  fromStage = 'base',
  toStage,
  discoveredUpgradeIds = [],
  revealUnknown = false,
} = {}) {
  assertCatalog(catalog);
  const tool = catalog.tools.find(t => t.id === toolId);
  if (!tool) return {status:'unknown_tool'};
  const stages = tool.stages;
  const from = fromStage === 'base' ? -1 : stages.indexOf(fromStage);
  const to = stages.indexOf(toStage);
  if ((fromStage !== 'base' && from < 0) || to < 0) return {status:'unknown_stage'};
  if (to < from) return {status:'backwards_not_supported',toolId};
  const chain = stages.slice(from + 1, to + 1).map(s =>
    catalog.upgrades.find(u => u.tool_id === toolId && u.stage === s)
  );
  if (chain.some(s => !s)) return {status:'missing_master_record',toolId};
  const knownIds = new Set(discoveredUpgradeIds);
  if (!revealUnknown && chain.some(step => !knownIds.has(step.id))) {
    return {status:'not_discovered',toolId};
  }

  const sum = new Map(), byWindmill = {red:0,blue:0,yellow:0};
  let minutes=0;
  for (const step of chain) {
    minutes += step.base_processing_minutes;
    byWindmill[step.windmill] += step.base_processing_minutes;
    for (const item of step.materials) {
      const key=item.ref.domain+':'+item.ref.id;
      const existing=sum.get(key);
      if (existing) existing.quantity+=item.quantity;
      else sum.set(key,{ref:{...item.ref},quantity:item.quantity});
    }
  }
  return {
    status:'ok',toolId,fromStage,toStage,
    stages:chain.map(s => ({
      id:s.id,stage:s.stage,name_ja:s.name_ja,
      windmill:s.windmill,base_processing_minutes:s.base_processing_minutes,
      requires_purple_wonderstone:s.requires_purple_wonderstone,
      materials:s.materials.map(x=>({ref:{...x.ref},quantity:x.quantity}))
    })),
    total_base_processing_minutes:minutes,
    base_processing_minutes_by_windmill:byWindmill,
    requires_purple_wonderstone:chain.some(s=>s.requires_purple_wonderstone),
    material_totals:[...sum.values()].sort((a,b) =>
      a.ref.name_ja.localeCompare(b.ref.name_ja,'ja')
    )
  };
}

export function getDiscoveredUpgrade(catalog, {
  upgradeId,
  discoveredUpgradeIds = []
} = {}) {
  assertCatalog(catalog);
  if (!new Set(discoveredUpgradeIds).has(upgradeId)) return null;
  return catalog.upgrades.find(r => r.id === upgradeId) ?? null;
}
