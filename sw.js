const CACHE='grand-bazaar-pwa-v090-1';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
const REMOTE=[
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/i18n.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/ingredients.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/groups.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/processed-goods.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/recipes.js'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const p of CORE){try{const u=new URL(p,self.location.href);u.searchParams.set('__build','0.9.0');const r=await fetch(u.toString(),{cache:'reload'});if(r.ok)await c.put(p,r.clone())}catch(_){}}for(const u of REMOTE){try{const r=await fetch(u,{mode:'cors',cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch(_){}}})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('grand-bazaar-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(e.request.mode==='navigate'){e.respondWith((async()=>{const cached=(await caches.match('./index.html'))||(await caches.match('./'));if(cached)return cached;try{return await fetch(e.request)}catch(_){return Response.error()}})());return;}e.respondWith((async()=>{const cached=await caches.match(e.request);const net=fetch(e.request).then(async r=>{if(r&&r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}).catch(()=>null);return cached||await net||Response.error();})());});
