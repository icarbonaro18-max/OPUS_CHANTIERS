/* Only application resources in this scope. Never cache Graph, tokens or customer files. */
const PREFIX='opus-chantiers-shell:'+self.registration.scope+':';
const CACHE=PREFIX+'3.4.7-detail-heures-1';
const SCOPE=new URL(self.registration.scope);
let ASSETS=['./','./index.html','./style.css','./app.js','./config.json','./lib/cloud.js','./lib/bridge.js','./lib/bridge.css','./lib/modules.json','./lib/demo.js','./lib/ops.js','./lib/ops-ui.js','./manifest.webmanifest','./assets/logo.png','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
// Build writes the complete local vendor/module precache list. Missing vendor -> installation fails safely.
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const r=await fetch(new URL('precache.json',SCOPE),{cache:'no-store'});
 if(r.ok)ASSETS=await r.json();
 const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(p=>new Request(new URL(p,SCOPE),{cache:'reload'})));
 // No automatic skipWaiting: an existing form must not change version mid-edit.
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==SCOPE.origin||!u.pathname.startsWith(SCOPE.pathname))return;
 const relative=u.pathname.slice(SCOPE.pathname.length);
 if(relative==='auth.html')return; // Never cache an authentication response URL.
 const privatePath=/^(_OPUS|05_PDF_GENERES|06_PHOTOS)\//.test(relative);
 if(privatePath)return;
 const isApp=relative===''||['index.html','app.js','style.css','config.json','manifest.webmanifest','icon-512.png','icon-192.png','favicon-64.png','apple-touch-icon.png'].includes(relative)||/^(lib|vendor|modules|assets)\//.test(relative);
 if(!isApp)return;
 const canonical=new URL(u.pathname,SCOPE.origin).href;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(async r=>{if(r.ok && !r.redirected){const c=await caches.open(CACHE);await c.put(canonical,r.clone());}return r;}).catch(async()=>{const c=await caches.open(CACHE);return (await c.match(canonical))||(relative===''?await c.match(new URL('index.html',SCOPE)):null)||new Response('Application non disponible hors ligne. Reconnectez-vous au réseau.',{status:503});}));
 }else e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(e.request,{cache:'no-store'});if(r.ok&&!r.redirected)await c.put(canonical,r.clone());return r;}catch{const cached=await c.match(canonical);return cached||new Response('Ressource OPUS indisponible hors ligne.',{status:503});}})());
});
