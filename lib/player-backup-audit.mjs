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

export function auditPlayerBackup(raw){
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
    const q=p.seedCount;
    if(q===null||q===undefined){untrackedCount++;continue;}
    if(!integer(q)){invalidSeedCounts++;continue;}
    stockNumberKnown++;
    if(p.status==='processing')processingCount++;
    else if(p.status==='stored'&&p.location==='warehouse')storedCount++;
    else locationNeedsReview++;
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
    app_version:wrapped&&typeof raw.appVersion==='string'?raw.appVersion:null,
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
    issue_codes:[...new Set(issueCodes)].sort()
  };
  return report;
}
