/* Only application resources in this scope. Never cache Graph, tokens or customer files. */
const PREFIX='opus-chantiers-shell:'+self.registration.scope+':';
const CACHE=PREFIX+'3.6.6-archives-onedrive';
const SCOPE=new URL(self.registration.scope);
let ASSETS=['./','./index.html','./style.css','./app.js','./config.json','./lib/cloud.js','./lib/bridge.js','./lib/bridge.css','./lib/modules.json','./lib/demo.js','./lib/ops.js','./lib/ops-ui.js','./manifest.webmanifest','./assets/logo.png','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
// Build writes the complete local vendor/module precache list. Missing vendor -> installation fails safely.
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const r=await fetch(new URL('precache.json',SCOPE),{cache:'no-store'});
 if(r.ok)ASSETS=await r.json();
 const cache=await caches.open(CACHE);
 // Bound concurrent downloads and temporary buffers on mobile browsers.
 for(let i=0;i<ASSETS.length;i+=6)await cache.addAll(ASSETS.slice(i,i+6).map(p=>new Request(new URL(p,SCOPE),{cache:'reload'})));
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
 // Serve this installed version immediately; installing a new worker updates all assets together.
 e.respondWith((async()=>{
  const c=await caches.open(CACHE);
  const cached=(await c.match(canonical))||(relative===''?await c.match(new URL('index.html',SCOPE)):null);
  if(cached)return cached;
  try{const r=await fetch(e.request);if(r.ok&&!r.redirected)await c.put(canonical,r.clone());return r;}
  catch{return new Response('Ressource OPUS non mémorisée. Reconnectez-vous au réseau.',{status:503});}
 })());
});

// Server-triggered reminders work without an open OPUS tab.
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let p={};try{p=event.data?.json()||{};}catch{}
 const route=String(p.route||'');let safeRoute='';try{const u=new URL(route);if(u.origin==='https://www.google.com'&&u.pathname==='/maps/dir/')safeRoute=u.href;}catch{}
 await self.registration.showNotification(String(p.title||'OPUS · Rappel').slice(0,160),{body:String(p.body||'Un rendez-vous approche.').slice(0,700),icon:new URL('icon-192.png',SCOPE).href,tag:String(p.tag||'opus-reminder'),data:{route:safeRoute},actions:safeRoute?[{action:'route',title:'Ouvrir l’itinéraire'}]:[]});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const route=event.notification.data?.route;let target=SCOPE.href;if(route){try{const u=new URL(route);if(u.origin==='https://www.google.com'&&u.pathname==='/maps/dir/')target=u.href;}catch{}}await self.clients.openWindow(target);})());});

// A manual update only switches the shell when this is the sole OPUS window.
self.addEventListener('message',event=>{
 if(event.data?.type!=='OPUS_ACTIVATE'||!event.source?.url)return;
 const source=new URL(event.source.url);if(source.origin!==SCOPE.origin||!source.pathname.startsWith(SCOPE.pathname))return;
 event.waitUntil((async()=>{
  const clients=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>{const u=new URL(client.url);return u.origin===SCOPE.origin&&u.pathname.startsWith(SCOPE.pathname);});
  if(clients.some(client=>client.id!==event.source.id)){event.ports[0]?.postMessage({ok:false,message:'Fermez les autres fenêtres OPUS puis réessayez la mise à jour.'});return;}
  event.ports[0]?.postMessage({ok:true});await self.skipWaiting();
 })());
});
