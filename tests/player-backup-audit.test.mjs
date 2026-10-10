import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditPlayerBackup} from '../lib/player-backup-audit.mjs';

const state=()=>({
  schemaVersion:7,knownEntities:[],knownRecipes:[],knownProcesses:[],
  knownFacts:[],playerState:{},goals:[],requests:[],requirements:{}
});
const wrapped=s=>({format:'grand-bazaar-companion-backup',formatVersion:1,
  appVersion:'0.11.11',exportedAt:'2026-10-10T03:00:00.000Z',state:s});
const audit=s=>auditPlayerBackup(wrapped(s));
test('official schema v7 envelope yields an aggregate, redacted report',()=>{
  const s=state();s.knownEntities=['secret_user_crop_id'];s.knownRecipes=['secret_recipe_id'];
  s.playerState={secret_user_crop_id:{seedCount:13,status:'stored',location:'warehouse',seedQuality:0.5}};
  const before=JSON.stringify(s);
  const r=audit(s),output=JSON.stringify(r);
  assert.equal(r.status,'schema_7_valid');
  assert.equal(r.backup_type,'official_export');
  assert.equal(r.discovered_record_counts.entities,1);
  assert.equal(r.crop_state_record_counts.stored_seed_rows_pending_master_mapping,1);
  assert.equal(r.outside_player_state.harvested_inventory,'needs_explicit_confirmation');
  assert(!output.includes('secret_'));
  assert(!output.includes('13'));
  assert.equal(JSON.stringify(s),before);
});
test('raw v7 state is accepted but not interpreted as a cash and stock snapshot',()=>{
  const s=state();const r=auditPlayerBackup(s);
  assert.equal(r.status,'schema_7_valid');
  assert.equal(r.backup_type,'raw_state');
  assert.equal(r.outside_player_state.cash_balance,'needs_explicit_confirmation');
});
test('old bootstrap v5 and migration-stage v6 require a fresh official export',()=>{
  for(const v of [5,6]){
    const s={...state(),schemaVersion:v};
    const r=audit(s);
    assert.equal(r.status,'legacy_schema_requires_fresh_export');
    assert.equal(r.schema_version,v);
    assert.equal(r.discovered_record_counts,undefined);
  }
});
test('future schema never receives guessed v7 semantics',()=>{
  const s={...state(),schemaVersion:8};
  assert.equal(audit(s).status,'unsupported_future_schema');
});
test('unknown wrappers and wrong content do not get silently unwrapped',()=>{
  const a={...wrapped(state()),format:'not-our-app'};
  assert.equal(auditPlayerBackup(a).status,'unsupported_backup_envelope');
  assert.equal(auditPlayerBackup({state:state()}).status,'unsupported_backup_envelope');
  assert.equal(auditPlayerBackup([]).status,'invalid_backup_format');
  assert.equal(auditPlayerBackup(null).status,'invalid_backup_format');
});
test('malformed v7 data fails closed rather than assigning zero counts',()=>{
  for(const bad of [
    {...state(),knownEntities:null},
    {...state(),knownRecipes:{a:true}},
    {...state(),playerState:[]},
    {...state(),playerState:{x:null}},
    {...state(),requirements:[]},
  ])assert.equal(audit(bad).status,'invalid_player_schema');
});
test('seedling record is not reported as harvested produce',()=>{
  const s=state();
  s.knownEntities=['apple'];s.playerState={
    apple:{seedCount:13,status:'stored',location:'warehouse',seedQuality:0.5}};
  const r=audit(s);
  assert.equal(r.crop_state_record_counts.stored_seed_rows_pending_master_mapping,1);
  assert.equal(r.outside_player_state.harvested_inventory,'needs_explicit_confirmation');
  assert(!Object.hasOwn(r,'harvested_apples'));
});
test('processing, unknown stock, malformed count and ambiguous location stay separated',()=>{
  const s=state();s.playerState={
    processing:{seedCount:7,status:'processing',location:'yellow_windmill'},
    unknown:{seedCount:null,status:'stored',location:'warehouse'},
    ambiguous:{seedCount:4,status:'',location:''},
    invalid:{seedCount:-1,status:'stored',location:'warehouse'},
    quality:{seedCount:2,status:'stored',location:'warehouse',seedQuality:3}
  };
  const r=audit(s);
  assert.equal(r.crop_state_record_counts.processing_rows_excluded,1);
  assert.equal(r.crop_state_record_counts.seed_quantity_untracked,1);
  assert.equal(r.crop_state_record_counts.ambiguous_storage_rows,1);
  assert.equal(r.crop_state_record_counts.invalid_seed_quantity_rows,1);
  assert(r.issue_codes.includes('baseline_prices_ignore_recorded_quality'));
  assert(r.issue_codes.includes('storage_status_requires_review'));
});
test('goal and request commitments are flagged without revealing titles, item IDs or notes',()=>{
  const s=state();
  s.goals=[{id:'g1',status:'active',title:'私の秘密の目標'}];
  s.requirements={g1:[{targetType:'entity',targetId:'secret_apple',need:3,have:1}]};
  s.requests=[{status:'active',objectives:[{type:'item_quantity',current:0,target:2,label:'秘密の住人'}]}];
  const r=audit(s);
  assert.equal(r.possible_material_commitments.goals_with_requirements,1);
  assert.equal(r.possible_material_commitments.incomplete_item_requests,1);
  assert(!JSON.stringify(r).includes('秘密'));
  assert(!JSON.stringify(r).includes('secret_apple'));
});
test('duplicate discovery IDs are reported only as a fixed diagnostic code',()=>{
  const s=state();s.knownEntities=['top_secret','top_secret'];
  const r=audit(s);
  assert(r.issue_codes.includes('duplicate_discovery_ids'));
  assert(!JSON.stringify(r).includes('top_secret'));
});
test('CLI reads a temporary private backup without writing it or printing its private data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gb-player-audit-'));
  try {
    const path=join(dir,'not-for-github.json');
    const s=state();s.knownEntities=['my_private_crop_name'];
    const content=JSON.stringify(wrapped(s));
    writeFileSync(path,content);
    const result=spawnSync(process.execPath,['tools/audit-player-backup.mjs',path],
      {encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).status,'schema_7_valid');
    assert(!result.stdout.includes('my_private_crop_name'));
    assert(!result.stdout.includes(path));
    assert.equal(readFileSync(path,'utf8'),content);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI never includes an inaccessible path in errors',()=>{
  const path='/private/secret/location-that-does-not-exist.json';
  const result=spawnSync(process.execPath,['tools/audit-player-backup.mjs',path],
    {encoding:'utf8'});
  assert.equal(result.status,2);
  assert.equal(JSON.parse(result.stdout).status,'backup_file_unavailable_or_too_large');
  assert(!result.stdout.includes(path));
});
