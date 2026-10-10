import {LEGACY_ECONOMY_PROCESS_CROSSWALK} from './legacy-economy-process-crosswalk.mjs';
import {createMasterResolver} from './grand-bazaar-master-adapter.mjs';

/**
 * Read-only, privacy-minimized audit of a locally exported Player State backup.
 * Does not migrate saves, enumerate Master items, mutate data, or calculate profit.
 *
 * A schema-valid backup is NOT a complete inventory or an economy recommendation.
 * No user item IDs, goal titles, requests, notes or quantities are returned.
 */
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const ids=a=>Array.isArray(a)&&a.every(x=>typeof x==='string'&&x.length>0);
const active=s=>!['done','completed','archived','someday'].includes(s);
const base=status=>({
  audit_version:1,status,read_only:true,redacted:true,
  state_written:false,profit_comparison_performed:false
});
const distinct=a=>new Set(a).size;

export function auditPlayerBackup(raw,{master=null}={}){
  if(!object(raw))return base('invalid_backup_format');
  const wrapped=Object.hasOwn(raw,'format')||Object.hasOwn(raw,'state');
  let state=raw;
  if(wrapped){
    if(raw.format!=='grand-bazaar-companion-backup'||
       raw.formatVersion!==1||!object(raw.state))
      return base('unsupported_backup_envelope');
    state=raw.state;
  }
  if(!Number.isSafeInteger(state.schemaVersion))
    return base('invalid_player_schema');
  if(state.schemaVersion!==7)
    return {...base(state.schemaVersion<7?'legacy_schema_requires_fresh_export':'unsupported_future_schema'),
      schema_version:state.schemaVersion,
      guidance:'Export a current backup from the running app before doing an economy comparison.'};

  if(!ids(state.knownEntities)||!ids(state.knownRecipes)||
     !ids(state.knownProcesses)||!object(state.playerState)||
     (state.knownFacts!==undefined&&!ids(state.knownFacts))||
     (state.goals!==undefined&&!Array.isArray(state.goals))||
     (state.requests!==undefined&&!Array.isArray(state.requests))||
     (state.requirements!==undefined&&!object(state.requirements)))
    return base('invalid_player_schema');

  const stateRows=Object.values(state.playerState);
  if(stateRows.some(p=>!object(p)))return base('invalid_player_schema');
  const knownFacts=state.knownFacts||[];
  const issueCodes=[];
  for(const collection of [state.knownEntities,state.knownRecipes,
    state.knownProcesses,knownFacts]){
    if(distinct(collection)!==collection.length){
      issueCodes.push('duplicate_discovery_ids');
      break;
    }
  }

  let stockNumberKnown=0,untrackedCount=0,storedCount=0,
      processingCount=0,locationNeedsReview=0,invalidSeedCounts=0,
      qualityOutsideBaseline=0;
  for(const p of stateRows){
    // Processing is a state, not a count. Include processing rows even when
    // their quantity is unknown, while never interpreting unknown as zero.
    if(p.status==='processing')processingCount++;
    const q=p.seedCount;
    if(q===null||q===undefined){untrackedCount++;continue;}
    if(!integer(q)){invalidSeedCounts++;continue;}
    stockNumberKnown++;
    if(p.status==='stored'&&p.location==='warehouse')storedCount++;
    else if(p.status!=='processing')locationNeedsReview++;
    if(p.seedQuality!=null&&p.seedQuality!==0.5)qualityOutsideBaseline++;
  }
  if(invalidSeedCounts)issueCodes.push('invalid_seed_count_records');
  if(qualityOutsideBaseline)issueCodes.push('baseline_prices_ignore_recorded_quality');
  if(processingCount)issueCodes.push('processing_stock_not_ready');
  if(locationNeedsReview)issueCodes.push('storage_status_requires_review');

  const goals=(state.goals||[]).filter(g=>object(g)&&active(g.status));
  const requirements=state.requirements||{};
  const potentialGoals=goals.filter(g=>
    Array.isArray(requirements[g.id])&&requirements[g.id].some(r=>
      object(r)&&integer(r.need)&&r.need>0)).length;
  const requests=(state.requests||[]).filter(r=>
    object(r)&&active(r.status)&&Array.isArray(r.objectives)&&
    r.objectives.some(o=>object(o)&&o.type==='item_quantity'&&
      (!integer(o.current)||!integer(o.target)||o.current<o.target))).length;
  if(potentialGoals)issueCodes.push('goals_may_reserve_materials');
  if(requests)issueCodes.push('requests_may_reserve_materials');
  if(untrackedCount)issueCodes.push('untracked_seed_quantities');

  const report={
    ...base('schema_7_valid'),
    backup_type:wrapped?'official_export':'raw_state',
    schema_version:7,
    app_version:wrapped&&typeof raw.appVersion==='string'&&
      /^\d+(?:\.\d+){1,4}$/.test(raw.appVersion)?raw.appVersion:null,
    discovered_record_counts:{
      entities:state.knownEntities.length,
      recipes:state.knownRecipes.length,
      processed_goods:state.knownProcesses.length,
      facts:knownFacts.length
    },
    crop_state_record_counts:{
      total:stateRows.length,seed_quantity_recorded:stockNumberKnown,
      seed_quantity_untracked:untrackedCount,
      stored_seed_rows_pending_master_mapping:storedCount,
      processing_rows_excluded:processingCount,
      ambiguous_storage_rows:locationNeedsReview,
      invalid_seed_quantity_rows:invalidSeedCounts
    },
    possible_material_commitments:{
      goals_with_requirements:potentialGoals,
      incomplete_item_requests:requests
    },
    // Explicitly no harvested inventory, cash balance, sale-price, available
    // route, or equipment data is inferred from Player State v7.
    outside_player_state:{
      harvested_inventory:'needs_explicit_confirmation',
      cash_balance:'needs_explicit_confirmation',
      known_sale_prices:'needs_explicit_confirmation',
      route_and_equipment_availability:'needs_explicit_confirmation'
    },
    issue_codes:[...new Set(issueCodes)].sort(),
    master_reference_check:'not_run'
  };
  if(object(master)&&Array.isArray(master.entities)&&
     Array.isArray(master.cooking_recipes)&&Array.isArray(master.windmill_recipes)){
    const customIds=new Set((Array.isArray(state.customEntities)?
      state.customEntities:[]).map(x=>x?.id).filter(Boolean));
    const recipeIds=new Set(master.cooking_recipes.map(x=>x.id));
    const recipeById=new Map(master.windmill_recipes.map(x=>[x.id,x]));
    const resolver=createMasterResolver(master);
    const processes=LEGACY_ECONOMY_PROCESS_CROSSWALK.process_output_links;
    const domains=['entities','resource_items','animal_products',
      'animal_processed_goods','mushrooms','mushroom_spores',
      'windmill_items','cooking_recipes','flowers'];
    const domainIds=new Map(domains.map(domain=>[
      domain,new Set((Array.isArray(master[domain])?master[domain]:[])
        .map(x=>x?.id).filter(Boolean))
    ]));
    function verifiedLegacyProcess(id) {
      const link=processes[id],recipe=recipeById.get(link?.recipe_id);
      if(!recipe||!link?.output_ref)return false;
      const output={domain:'windmill_items',id:recipe.output_item_id};
      return !!resolver.row(output)&&!!resolver.row(link.output_ref)&&
        resolver.canonical(output)===resolver.canonical(link.output_ref);
    }
    let canonicalEntities=0,customEntities=0,unmappedEntities=0,
        otherDomainEntities=0,legacyOutputEntities=0,ambiguousEntities=0,
        knownRecipes=0,unmappedRecipes=0,
        linkedProcesses=0,unmappedProcesses=0;
    for(const id of state.knownEntities){
      const refs=domains.filter(d=>domainIds.get(d).has(id))
        .map(domain=>({domain,id}));
      const canonicals=new Set(refs.map(resolver.canonical).filter(Boolean));
      if(canonicals.size===1){
        canonicalEntities++;
        if(!domainIds.get('entities').has(id))otherDomainEntities++;
      } else if(canonicals.size>1){
        ambiguousEntities++;
      } else if(verifiedLegacyProcess(id)){
        canonicalEntities++;legacyOutputEntities++;
      } else if(customIds.has(id))customEntities++;
      else unmappedEntities++;
    }
    for(const id of state.knownRecipes){
      if(recipeIds.has(id))knownRecipes++;
      else unmappedRecipes++;
    }
    for(const id of state.knownProcesses){
      if(verifiedLegacyProcess(id))linkedProcesses++;
      else unmappedProcesses++;
    }
    let knownFacts=0,unmappedFacts=0,matchedRequests=0,unmatchedRequests=0;
    const factIds=new Set((Array.isArray(master.facts)?master.facts:[])
      .map(x=>x.id));
    for(const id of state.knownFacts||[]){
      if(factIds.has(id))knownFacts++;
      else unmappedFacts++;
    }
    if(Array.isArray(master.requests)){
      const requestIds=new Set(master.requests.map(x=>x.id));
      for(const req of state.requests||[]){
        if(typeof req?.masterId!=='string')continue;
        if(requestIds.has(req.masterId))matchedRequests++;
        else unmatchedRequests++;
      }
    }
    report.master_reference_check='aggregate_counts_only';
    report.master_linkage_counts={
      known_entities_in_master:canonicalEntities,
      known_entities_in_other_domains:otherDomainEntities,
      known_entities_via_pinned_process_alias:legacyOutputEntities,
      known_entities_ambiguous:ambiguousEntities,
      custom_entities_not_in_master:customEntities,
      known_entities_unmapped:unmappedEntities,
      known_recipes_in_master:knownRecipes,
      known_recipes_unmapped:unmappedRecipes,
      known_process_links:linkedProcesses,
      known_process_links_unmapped:unmappedProcesses,
      known_facts_in_master:knownFacts,
      known_facts_unmapped:unmappedFacts,
      known_requests_in_master:matchedRequests,
      known_requests_unmapped:unmatchedRequests
    };
    if(unmappedEntities||unmappedRecipes||unmappedProcesses||
       unmappedFacts||unmatchedRequests||ambiguousEntities)
      report.issue_codes.push('master_reference_mapping_needs_review');
    if(ambiguousEntities)report.issue_codes.push('ambiguous_discovery_registry_ref');
    report.issue_codes.sort();
  }
  return report;
}
