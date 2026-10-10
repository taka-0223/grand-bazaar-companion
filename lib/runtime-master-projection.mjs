// Build-time projection of the canonical Master into the PWA's synchronous startup data.
// The full Master remains in data/board-master.full.v1.json; this module is NOT shipped to the browser.
export const RUNTIME_MASTER_KEYS=Object.freeze([
  'meta','entities','facts','requests','cooking_effects','cooking_recipes'
]);
export function projectRuntimeMaster(full) {
  if(!full || typeof full!=='object' || !full.meta?.request_master?.player_state_migration)
    throw new Error('Canonical Master metadata is missing');
  for(const k of ['entities','facts','requests','cooking_effects','cooking_recipes'])
    if(!Array.isArray(full[k]))throw new Error('Missing Master domain: '+k);
  return {
    meta:{
      title:full.meta.title,
      status:full.meta.status,
      target_game_version:full.meta.target_game_version,
      generated_on:full.meta.generated_on,
      request_master:{
        audit_version:full.meta.request_master.audit_version,
        player_state_migration:full.meta.request_master.player_state_migration
      }
    },
    entities:full.entities,
    facts:full.facts,
    requests:full.requests,
    cooking_effects:full.cooking_effects,
    // Currently used only by recipeEffectLabel(): exact ID -> effect_id lookup.
    cooking_recipes:full.cooking_recipes.map(x=>({id:x.id,effect_id:x.effect_id}))
  };
}
