import {prepareAppKnownEconomy} from './app-player-economy-bridge.mjs';
import {createMasterResolver} from './grand-bazaar-master-adapter.mjs';

// Compare readiness is computed from already-disclosed App records only.
export function inspectAppKnownEconomyInputs(master,state,options={}) {
  const prepared=prepareAppKnownEconomy(master,state,options);
  return {status:prepared.status,scope:'discovered_known_only',read_only:true};
}
