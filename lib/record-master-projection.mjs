// Tiny, reproducible offline catalog for the player-authored Record Book.
// Hidden Master rows must NEVER be enumerated in the UI without a player action.
const TOOL_ORDER=['hoe','watering_can','sickle','fishing_rod','hatchet','brush','milker','clippers'];
const FACILITY_SHOPS=['shop_wilbur','shop_garon','shop_arata'];

export function projectRecordMaster(full,toolCatalog,facilityCatalog,shopsCatalog){
  if(!Array.isArray(full?.entities)||!Array.isArray(toolCatalog?.tools)||
    !Array.isArray(toolCatalog?.upgrades)||!Array.isArray(facilityCatalog?.facility_upgrades)||
    !Array.isArray(shopsCatalog?.shops))throw new TypeError('Record Book Master catalog is missing');
  const upgradeable=new Map(toolCatalog.tools.map(t=>[t.id,t]));
  const tools=TOOL_ORDER.map(id=>{
    const base=full.entities.find(e=>e.id===id&&e.kind==='tool');
    if(!base)throw new Error('Missing tool '+id);
    const up=upgradeable.get(id);
    return {id,name_ja:up?.name_ja||base.name_ja,upgradable:!!up};
  });
  const upgrades=toolCatalog.upgrades.map(r=>({
    id:r.id,tool_id:r.tool_id,stage:r.stage,name_ja:r.name_ja,
    windmill:r.windmill,materials:r.materials.map(m=>({name_ja:m.ref.name_ja,quantity:m.quantity}))
  }));
  const facilities=facilityCatalog.facility_upgrades.map(r=>({
    id:r.id,shop_id:r.shop_id,label_ja:r.label_ja,name_ja:r.name_ja,
    kind:r.kind,price_g:r.price_g
  }));
  const shops=FACILITY_SHOPS.map(id=>{
    const s=shopsCatalog.shops.find(row=>row.id===id);
    if(!s)throw new Error('Missing upgrade shop '+id);
    return {id,name_ja:s.name_ja,owner_ja:s.owner_ja};
  });
  if(tools.length!==8||upgrades.length!==37||facilities.length!==38)
    throw new Error('Unexpected Record Book Master count');
  return {tools,upgrades,facilities,shops};
}
