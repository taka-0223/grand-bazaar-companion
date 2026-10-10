#!/usr/bin/env node
/**
 * Local-only, non-destructive backup audit. Nothing is uploaded or written.
 * Usage: node tools/audit-player-backup.mjs /private/path/to/backup.json
 * stdout includes only aggregate counts and fixed diagnostic codes.
 */
import {readFileSync,statSync} from 'node:fs';
import {auditPlayerBackup} from '../lib/player-backup-audit.mjs';

const say=x=>process.stdout.write(JSON.stringify(x,null,2)+'\n');
const fail=status=>{
  say({audit_version:1,status,read_only:true,redacted:true,state_written:false});
  process.exitCode=2;
};
if(process.argv.length!==3||['--help','-h'].includes(process.argv[2])){
  process.stdout.write('Usage: node tools/audit-player-backup.mjs <local-backup.json>\n');
  process.exitCode=process.argv.length===3?0:2;
}else{
  try {
    const file=process.argv[2],stat=statSync(file);
    if(!stat.isFile()||stat.size>8*1024*1024||stat.size===0)
      fail('backup_file_unavailable_or_too_large');
    else {
      let payload;
      try{payload=JSON.parse(readFileSync(file,'utf8'));}
      catch{payload=null;}
      const result=auditPlayerBackup(payload);
      say(result);
      if(result.status!=='schema_7_valid')process.exitCode=2;
    }
  }catch{
    // Never disclose filesystem paths or private backup contents in errors.
    fail('backup_file_unavailable_or_too_large');
  }
}
