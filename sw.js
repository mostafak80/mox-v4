const CACHE='mox-v4-v12';
const APP_ASSETS=[
  './',
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './cloud-sync.js',
  './migration.js',
  './firebase.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './assets/logo.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  // Pass-through for Firebase, Google APIs, and auth requests (live traffic).
  if (url.origin.includes('firebaseio.com') ||
      url.origin.includes('googleapis.com') ||
      url.origin.includes('gstatic.com') ||
      url.origin.includes('firebaseapp.com')) {
    return;
  }

  // Same-origin app assets: network-first, fall back to cache when offline.
  // ignoreSearch lets '?v=9' requests match the pre-cached plain paths.
  if(url.origin===self.location.origin){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
          }
          return response;
        })
        .catch(()=>caches.match(request,{ignoreSearch:true}).then(cached=>cached||(request.mode==='navigate'?caches.match('./index.html'):null)))
    );
    return;
  }

  // External static resources (xlsx bundle, fonts): network-first with caching.
  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response && response.ok && (url.hostname.endsWith('jsdelivr.net') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('fonts.googleapis.com'))){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(()=>caches.match(request))
  );
});
