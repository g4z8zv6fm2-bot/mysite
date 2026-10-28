const CACHE='legendary-cleaners-v9';
const FILES=['./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.all(FILES.map(async url=>{try{const r=await fetch(url,{cache:'reload'});if(r.ok)await c.put(url,r)}catch(_){}}));await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;if(req.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/supabase-config.js')){event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));return;}event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return r})));});


self.addEventListener('push',event=>{
  let payload={title:'Legendary Cleaners update',body:'Your CRM has a new update.',url:'/'};
  try{if(event.data)payload={...payload,...event.data.json()}}catch(_){try{payload.body=event.data.text()}catch(__){}}
  event.waitUntil(self.registration.showNotification(payload.title||'Legendary Cleaners update',{
    body:payload.body||'Your CRM has a new update.',
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    tag:payload.tag||'legendary-cleaners-update',
    data:{url:payload.url||'/'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    for(const client of windows){if(new URL(client.url).origin===self.location.origin){client.navigate(target);return client.focus()}}
    return clients.openWindow(target);
  }));
});
