/**
 * On-demand full-Master reader for the optional economy screen.
 * No module evaluation or PWA startup triggers a network request.
 * Bump the query key whenever canonical Master semantics change.
 */
export function createKnownEconomyLoader(fetchImpl=globalThis.fetch) {
  let ongoing=null,loaded=false;
  return {
    isLoaded:()=>loaded,
    load(){
      if(ongoing)return ongoing;
      ongoing=(async()=>{
        if(typeof fetchImpl!=='function')throw new Error('economy_master_unavailable');
        const address=new URL('../data/board-master.full.v1.json?economy_rev=v08_20261010',
          import.meta.url);
        let reply;
        try {reply=await fetchImpl(address,{method:'GET',credentials:'same-origin'});}
        catch {throw new Error('economy_master_unavailable');}
        if(!reply?.ok)throw new Error('economy_master_unavailable');
        let master;
        try {master=await reply.json();}
        catch {throw new Error('economy_master_invalid');}
        if(!master||typeof master!=='object'||
           !['entities','facts','windmill_items','windmill_recipes',
             'cooking_recipes','cooking_groups','mushrooms'].every(
               key=>Array.isArray(master[key])))
          throw new Error('economy_master_invalid');
        loaded=true;
        return master;
      })().catch(err=>{ongoing=null;loaded=false;throw err;});
      return ongoing;
    }
  };
}
