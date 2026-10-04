/* =========================================================
   서비스 워커: 홈 화면 앱 설치 + 오프라인에서도 열리게
   - 우리 파일: 네트워크 먼저 → 실패하면(오프라인) 저장해둔 것 사용
     휴대폰 브라우저의 임시 저장(HTTP 캐시)을 건너뛰고 항상 서버에 확인해서
     옛날 파일과 새 파일이 섞이지 않게 함
   - 글꼴(CDN·구글 폰트): 저장해둔 것 먼저 → 없으면 네트워크
   ========================================================= */
const CACHE = 'my-calendar-v4';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/appointment.png',
  'icons/goal.png',
  'icons/goal-todo.png',
  'icons/goal-done.png',
  'icons/holiday.png',
  'icons/work.png',
  'icons/sunghoon.png',
  'icons/mascot/hachiware.png',
  'icons/mascot/chiikawa.png',
  'icons/mascot/usagi.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

// 예전 버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = request.mode === 'navigate'
      ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : new Request(request, { cache: 'no-cache' });
    const response = await fetch(fresh);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
