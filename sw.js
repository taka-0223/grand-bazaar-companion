const CACHE='grand-bazaar-pwa-v06-2';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
const REMOTE=[
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/i18n.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/ingredients.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/groups.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/processed-goods.js',
'https://cdn.jsdelivr.net/gh/rickychiki/sos-grand-bazaar@52ca676f700ead4494992f17ff7175305b8a6ce3/data/recipes.js'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(CORE);for(const u of REMOTE){try{const r=await fetch(u,{mode:'cors'});if(r.ok)await c.put(u,r.clone())}catch(_){}}self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('grand-bazaar-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(e.request.mode==='navigate'){e.respondWith((async()=>{try{const r=await fetch(e.request);if(r.ok){const c=await caches.open(CACHE);await c.put('./index.html',r.clone())}return r}catch(_){return (await caches.match('./index.html'))||(await caches.match('./'))}})());return;}e.respondWith((async()=>{const cached=await caches.match(e.request);const net=fetch(e.request).then(async r=>{if(r&&r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}).catch(()=>null);return cached||await net||Response.error();})());});
