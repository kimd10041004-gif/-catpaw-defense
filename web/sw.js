/**
 * 서비스 워커 — 첫 방문에 모든 파일을 캐시해 두고, 이후에는 캐시에서 먼저 꺼낸다.
 * 덕분에 홈 화면에 추가한 뒤에는 비행기 모드에서도 게임이 그대로 돌아간다.
 *
 * ▶ 파일을 추가했다면 ASSETS에 넣고 CACHE_VERSION을 올려야 사용자에게 새 파일이 전달된다.
 */

const CACHE_VERSION = 'catpaw-v8'

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/main.js',
  'js/game.js',
  'js/render.js',
  'js/ui.js',
  'js/audio.js',
  'js/sprites.js',
  'js/framesets.js',
  'js/mapart.js',
  'js/domain/balance.js',
  'js/domain/mods.js',
  'js/domain/billing.js',
  'js/domain/shop.js',
  'js/domain/economy.js',
  'js/domain/elite.js',
  'js/domain/mana.js',
  'js/domain/path.js',
  'js/domain/save.js',
  'js/domain/settings.js',
  'js/domain/status.js',
  'js/domain/targeting.js',
  'js/domain/waves.js',
  'js/content/registry.js',
  'js/content/index.js',
  'js/content/towers.js',
  'js/content/enemies.js',
  'js/content/maps.js',
  'js/content/waveSets.js',
  'js/content/effects.js',
  'js/content/enemyAbilities.js',
  'js/content/specials.js',
  'js/content/objectives.js',
  'js/content/scenario.js',
  'js/domain/frames.js',
  'js/domain/objectives.js',
  // 프레임 아트. 오프라인에서 이게 없으면 고양이가 벡터로 떨어진다 — 깨지진 않지만
  // 온라인/오프라인에서 그림이 달라 보이므로 같이 담는다.
  'art/cat-cheese.png',
  'art/cat-calico.png',
  'art/cat-siamese.png',
  'art/cat-black.png',
  'art/cat-chonk.png',
  'art/enemy-mouse.png',
  'art/enemy-roach.png',
  'art/enemy-rat.png',
  'art/enemy-bat.png',
  'art/enemy-mole.png',
  'art/enemy-ratking.png',
  'art/enemy-molelord.png',
  'art/enemy-roachqueen.png',
  'art/enemy-batlord.png',
  'art/enemy-demonking.png',
  // 지도 길 질감 — 작고(장당 60KB 안팎) 없으면 길이 단색으로 보인다
  'art/path-alley.png',
  'art/path-kitchen.png',
  'art/path-rooftop.png',
  'art/path-warehouse.png',
  'art/path-basement.png',
  'art/path-attic.png',
  // 막힌 칸 소품
  'art/prop-crate.png',
  'art/prop-pot.png',
  'art/prop-jar.png',
  'art/prop-sack.png',
  'art/prop-barrel.png',
  'art/prop-furniture.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // 파일 하나가 실패해도 설치 자체가 무너지지 않게 개별로 담는다
      .then((cache) => Promise.allSettled(ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req)
        .then((res) => {
          // 같은 출처의 정상 응답만 캐시에 담는다
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone()
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match('index.html')) // 오프라인에서 새 경로를 열어도 게임으로 보낸다
    }),
  )
})
