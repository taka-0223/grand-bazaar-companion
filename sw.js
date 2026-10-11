const CACHE='grand-bazaar-pwa-v01113-1';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
const REMOTE=[
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/i18n.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/ingredients.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/groups.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/processed-goods.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/recipes.js'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const p of CORE){try{const u=new URL(p,self.location.href);u.searchParams.set('__build','0.11.13');const r=await fetch(u.toString(),{cache:'reload'});if(r.ok)await c.put(p,r.clone())}catch(_){}}for(const u of REMOTE){try{const r=await fetch(u,{mode:'cors',cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch(_){}}})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('grand-bazaar-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(e.request.mode==='navigate'){
  const current=new URL(e.request.url);
  const scope=new URL(self.registration.scope);
  const home=new URL('./index.html',scope);
  const isHome=current.origin===scope.origin &&
    (current.pathname===scope.pathname||current.pathname===home.pathname);
  if(isHome){
    // Preserve the existing fast, offline-first PWA home behavior.
    e.respondWith((async()=>{
      const cached=(await caches.match('./index.html'))||
        (await caches.match('./'));
      if(cached)return cached;
      try{return await fetch(e.request)}catch(_){return Response.error()}
    })());
  }else{
    // A separate opt-in page must never be rewritten to the app's home.
    // Cache successful same-origin navigation for offline re-use after
    // the first online visit. Never cache Player State or POST bodies.
    e.respondWith((async()=>{
      const cached=await caches.match(e.request);
      let response;
      try{response=await fetch(e.request)}catch(_){response=null}
      if(response?.ok&&current.origin===scope.origin){
        try{const cache=await caches.open(CACHE);
          await cache.put(e.request,response.clone())}catch(_){}
      }
      return response||cached||Response.error();
    })());
  }
  return;
}e.respondWith((async()=>{const cached=await caches.match(e.request);const net=fetch(e.request).then(async r=>{if(r&&r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}).catch(()=>null);return cached||await net||Response.error();})());});
