/* 화면 파일만 저장해 둡니다(성도 자료는 저장하지 않음). 인터넷이 될 때는 항상 새 파일을 먼저 받습니다.
   꺼져 있을 때 알림: 서버가 보낸 짧은 문구("오늘 다시 연락할 분이 2명 있습니다")를 보여 주고, 누르면 앱을 엽니다. */
const CACHE = 'hamkke-5-1-0-design-2';
const ASSETS = ['./', './index.html', './styles.css', './theme.js', './config.js', './core.js', './store.js', './ui.js', './care.js', './newcomer.js', './messages.js', './admin.js', './visit.js', './newcomer-ui.js', './stats.js', './notify.js', './app.js', './vendor/xlsx.full.min.js', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './manifest.webmanifest', './manifest-visit.webmanifest', './manifest-new.webmanifest', './manifest-admin.webmanifest', './guide/'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // 서버(Supabase) 요청은 저장하지 않음
  // 'no-cache': 브라우저가 잠시 들고 있는 옛 파일 대신, 서버에 바뀐 파일이 있는지 매번 확인합니다(안 바뀌었으면 짧은 확인만).
  const fresh = e.request.mode === 'navigate' ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(fresh).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '함께 돌봄', { body: d.body || '확인할 알림이 있습니다.', icon: 'icon.svg', tag: d.tag || 'hamkke', data: { url: './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { for (const c of list) if ('focus' in c) return c.focus(); return self.clients.openWindow('./'); }));
});
