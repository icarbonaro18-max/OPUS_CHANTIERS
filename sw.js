/* Only application resources in this scope. Never cache Graph, tokens or customer files. */
const PREFIX='opus-chantiers-shell:'+self.registration.scope+':';
const BUILD=null;
const CACHE=PREFIX+'3.6.14-fiabilite'+(BUILD?':'+BUILD.hash:'');
const SCOPE=new URL(self.registration.scope);

async function matchesRevision(response,expected){
 if(!response||response.status!==200||response.redirected)return false;
 const hash=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
 return btoa(String.fromCharCode(...new Uint8Array(hash)))===expected;
}

async function downloadAsset(url,hash){
 const response=await fetch(url,{cache:'reload',redirect:'error'});
 if(!await matchesRevision(response,hash))throw Error('Ressource OPUS non confirmée : '+url.pathname);
 return response;
}

self.addEventListener('install',e=>e.waitUntil((async()=>{
 if(!BUILD)throw Error('Le service worker OPUS doit être compilé.');
 const assets=Object.entries(BUILD.assets),target=await caches.open(CACHE);
 const previous=(await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE).reverse();
 const sources=[target,...await Promise.all(previous.map(name=>caches.open(name)))];
 async function installAsset([path,hash]){
  const url=new URL(path,SCOPE);
  // An interrupted attempt and older OPUS releases may already hold the
  // exact body. Never use a cached response on its URL or version name alone.
  for(const source of sources){
   let stored;
   try{
    stored=await source.match(url);
    if(!await matchesRevision(stored,hash))continue;
   }catch{continue;} // A damaged cache entry can be fetched again.
   if(source!==target)await target.put(url,stored);
   return;
  }
  await target.put(url,await downloadAsset(url,hash));
 }
 for(let i=0;i<assets.length;i+=6){
  const batch=await Promise.allSettled(assets.slice(i,i+6).map(installAsset));
  const failed=batch.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
 }
 // No automatic skipWaiting: an existing form must not change version mid-edit.
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k.startsWith(PREFIX)&&k!==CACHE)await caches.delete(k);
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==SCOPE.origin||!u.pathname.startsWith(SCOPE.pathname))return;
 let relative=u.pathname.slice(SCOPE.pathname.length);
 if(!relative||relative.endsWith('/'))relative+='index.html';
 const hash=BUILD?.assets['./'+relative];
 if(!hash)return; // Only built public assets. OAuth callbacks and APIs use the network.
 const canonical=new URL(relative,SCOPE);
 // Serve this installed version immediately; installing a new worker updates all assets together.
 e.respondWith((async()=>{
  const c=await caches.open(CACHE);
  const cached=await c.match(canonical);
  if(cached)return cached;
  try{const r=await downloadAsset(canonical,hash);await c.put(canonical,r.clone());return r;}
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
