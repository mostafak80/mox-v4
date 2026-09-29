const CACHE='mox-v4-cloud-sync-20260929-1';
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
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  // Pass-through for Firebase, Google APIs, and auth requests
  if (url.origin.includes('firebaseio.com') ||
      url.origin.includes('googleapis.com') ||
      url.origin.includes('gstatic.com') ||
      url.origin.includes('firebaseapp.com')) {
    return;
  }

  // صفحات التنقل: Network first، ولو مفيش نت نرجع index.html فقط.
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }

  // ملفات التطبيق من نفس الدومين: Cache first ثم الشبكة.
  if(url.origin===self.location.origin){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response && response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});}
      return response;
    })));
    return;
  }

  // الموارد الخارجية لا نرجّع لها HTML عند الفشل حتى لا يحصل MIME error.
  event.respondWith(fetch(request).catch(()=>caches.match(request)));
});

