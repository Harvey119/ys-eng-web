// 서비스 워커: 홈 화면 설치 조건 + 앱 파일을 이 기기에 보관해 인터넷 없이도 열리게 (오프라인 BCR_P)
//   페이지 · flutter_bootstrap.js · 그 밖의 앱 파일: 네트워크 먼저, 끊겼을 때만 보관본
//     온라인이면 늘 새 파일을 받으므로 업데이트 방식은 그대로 (bust_cache.py)
//   main.dart.js?v= · 해시 이름 글꼴 · gstatic(canvaskit · 한글 글꼴): 내용이 바뀌면 주소도 바뀌어 보관본 먼저
//   Supabase 등 그 밖의 주소는 건드리지 않는다
//   보관은 앱을 한 번 열 때 받은 파일들로 채워진다 (업데이트 뒤 인터넷이 될 때 한 번은 열어야 한다)
const CACHE = 'siteline-app-v1';
const SCOPE = self.registration.scope;
const OFFLINE_PAGE =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
  '<p style="font-family:sans-serif;padding:24px">인터넷에 연결되어 있지 않습니다. 연결을 확인한 뒤 다시 열어 주세요.</p>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

const storable = (res) => res && (res.ok || res.type === 'opaque');

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (storable(res)) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) {
    // 새 main.dart.js 를 받으면 예전 것은 지운다
    if (url.pathname.endsWith('/main.dart.js')) {
      for (const k of await cache.keys()) {
        if (new URL(k.url).pathname.endsWith('/main.dart.js')) await cache.delete(k);
      }
    }
    await cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mine = req.url.startsWith(SCOPE);
  const gstatic = url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.gstatic.com';
  if (!mine && !gstatic) return;
  if (mine && url.pathname.endsWith('/sw.js')) return;

  // 페이지: 어느 주소로 열어도 같은 index.html 이라 시작 주소 하나로 보관
  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, SCOPE).catch(
        () => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
    return;
  }
  const fixed =
    gstatic || url.searchParams.has('v') || /\.[0-9a-f]{10}\.(otf|ttf)$/.test(url.pathname);
  event.respondWith(fixed ? cacheFirst(req, url) : networkFirst(req, req));
});
