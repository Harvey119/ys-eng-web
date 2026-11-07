// 서비스 워커: 홈 화면 설치 조건 + 앱 파일을 이 기기에 보관해 인터넷 없이도 열리게 (오프라인 BCR_P)
//   페이지 · flutter_bootstrap.js · 그 밖의 앱 파일: 네트워크 먼저, 끊겼을 때만 보관본
//     온라인이면 늘 새 파일을 받으므로 업데이트 방식은 그대로 (bust_cache.py)
//   main.dart.js?v= · 해시 이름 글꼴 · gstatic(canvaskit · 한글 글꼴): 내용이 바뀌면 주소도 바뀌어 보관본 먼저
//     새 버전을 받으면 같은 파일의 예전 버전(main.dart.js · 해시 글꼴 · canvaskit)은 지운다
//   캐시 이름은 버전 없이 고정 (바꾸면 업데이트 때 오프라인 보관이 통째로 비어 BCR_P 가 안 열린다)
//   Supabase 등 그 밖의 주소는 건드리지 않는다
//   보관은 앱을 한 번 열 때 받은 파일들로 채워진다 (업데이트 뒤 인터넷이 될 때 한 번은 열어야 한다)
const CACHE = 'eum-app-v1';
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

// noCache: 브라우저 HTTP 캐시를 거치지 않고 서버에 확인 (페이지 · flutter_bootstrap.js = 새 버전 주소가 여기서 온다)
async function networkFirst(req, key, noCache = false) {
  const cache = await caches.open(CACHE);
  try {
    const res = await (noCache ? fetch(req, { cache: 'no-cache' }) : fetch(req));
    if (storable(res)) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

const HASHED = /\.[0-9a-f]{10}\.(otf|ttf)$/;

// 같은 파일의 다른 버전끼리 같은 값: ?v= 파일은 경로, 해시 이름 글꼴은 해시를 뺀 이름,
// canvaskit 은 엔진 해시 폴더를 뺀 경로. 그 밖(한글 글꼴 등)은 null = 지우지 않음
function familyOf(url) {
  if (url.hostname === 'www.gstatic.com') {
    const m = url.pathname.match(/^\/flutter-canvaskit\/[^/]+\/(.+)$/);
    return m ? 'ck:' + m[1] : null;
  }
  if (!url.href.startsWith(SCOPE)) return null;
  if (url.searchParams.has('v')) return 'v:' + url.pathname;
  if (HASHED.test(url.pathname)) return 'h:' + url.pathname.replace(HASHED, '.$1');
  return null;
}

async function cacheFirst(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) {
    // 새 버전을 받으면 같은 파일의 예전 버전은 지운다 (새 것을 받은 뒤에만 지워 오프라인 보관은 늘 한 벌 남음)
    const fam = familyOf(url);
    if (fam) {
      for (const k of await cache.keys()) {
        if (k.url !== req.url && familyOf(new URL(k.url)) === fam) await cache.delete(k);
      }
    }
    await cache.put(req, res.clone());
  }
  return res;
}

// 앱 푸시 (091): {title, body, url, tag}. 누르면 열린 E:UM 창으로 가서 그 화면, 없으면 새 창
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'E:UM', {
      body: d.body || '',
      icon: 'icons/Icon-192.png',
      badge: 'icons/Icon-192.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  // 앱 주소는 # 방식 (https://ys-eng.kr/#/me/contracts)
  const target = SCOPE + '#' + path;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const mine = list.find((c) => c.url.startsWith(SCOPE));
      if (mine) {
        await mine.focus();
        // 다시 불러오지 않고 화면만 옮긴다 (index.html 이 받아 주소 # 를 바꿈)
        mine.postMessage({ eum: 'open', path });
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});

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
      networkFirst(req, SCOPE, true).catch(
        () => new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
    return;
  }
  const fixed = gstatic || url.searchParams.has('v') || HASHED.test(url.pathname);
  const boot = mine && url.pathname.endsWith('/flutter_bootstrap.js');
  event.respondWith(fixed ? cacheFirst(req, url) : networkFirst(req, req, boot));
});
