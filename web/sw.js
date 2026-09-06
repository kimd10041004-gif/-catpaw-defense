/**
 * 서비스 워커 — 첫 방문에 모든 파일을 캐시해 두고, 이후에는 캐시에서 먼저 꺼낸다.
 * 덕분에 홈 화면에 추가한 뒤에는 비행기 모드에서도 게임이 그대로 돌아간다.
 *
 * ▶ 파일을 추가했다면 ASSETS 에 넣는다 (sw.test 가 빠진 파일을 잡는다).
 * ▶ 캐시 이름은 앱 버전을 따른다 — 손으로 올리지 말고 `node tools/bump-version.mjs patch`.
 *   배포마다 최소 patch 를 올려야 설치된 PWA 가 새 파일을 받는다 (version.test 가 대조한다).
 *
 * 안드로이드 APK 안에서는 main.js 가 이 워커를 등록하지 않는다 — 에셋이 이미 로컬이라 보태는 게 없고,
 * 업데이트 뒤 옛 APK 파일을 서빙할 수 있는 유일한 것이 이 캐시다.
 */

const CACHE_VERSION = 'catpaw-v1.0.0'

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
  'js/loading.js',
  'js/version.js',
  'js/build.js',
  'js/domain/tips.js',
  'js/domain/hints.js',
  'js/domain/curve.js',
  'js/domain/achievements.js',
  'js/domain/daily.js',
  'js/domain/platform.js',
  'js/domain/growth.js',
  'js/domain/rng.js',
  'js/domain/weekly.js',
  'js/domain/entitlements.js',
  'js/content/achievements.js',
  'js/content/challenges.js',
  'js/content/challenges-pack2.js',
  'js/content/skins.js',
  'js/content/skins-paid.js',
  'js/i18n/index.js',
  'js/i18n/en.js',
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
  'js/content/combos.js',
  'js/content/pets.js',
  'js/content/specialCombos.js',
  'js/content/objectives.js',
  'js/content/scenario.js',
  'js/content/scenario-act3.js',
  'js/domain/frames.js',
  'js/domain/objectives.js',
  // 프레임 아트. 오프라인에서 이게 없으면 고양이가 벡터로 떨어진다 — 깨지진 않지만
  // 온라인/오프라인에서 그림이 달라 보이므로 같이 담는다.
  'art/cat-cheese.png',
  'art/cat-calico.png',
  'art/cat-siamese.png',
  'art/cat-black.png',
  'art/cat-chonk.png',
  'art/cat-mackerel.png',
  'art/cat-bluerussian.png',
  'art/cat-tuxedo.png',
  'art/cat-sphynx.png',
  'art/enemy-mouse.png',
  'art/enemy-roach.png',
  'art/enemy-rat.png',
  'art/enemy-bat.png',
  'art/enemy-mole.png',
  'art/enemy-pigeon.png',
  'art/enemy-fireant.png',
  'art/enemy-worm.png',
  'art/enemy-earwig.png',
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

  // 바닥 질감
  'art/floor-alley.png',
  'art/floor-kitchen.png',
  'art/floor-rooftop.png',
  'art/floor-warehouse.png',
  'art/floor-basement.png',
  'art/floor-attic.png',
  // 막힌 칸 소품
  'art/prop-crate.png',
  'art/prop-pot.png',
  'art/prop-jar.png',
  'art/prop-sack.png',
  'art/prop-barrel.png',
  'art/prop-furniture.png',

  // 화면 배경. 알파가 필요 없어 JPEG 으로 구웠다 — 셋 합쳐 183KB 다
  // (PNG 였으면 3.3MB). 없으면 화면이 그라디언트로 떨어지고 게임은 그대로 돈다.
  'art/bg-title.jpg',
  'art/bg-select.jpg',
  'art/bg-story.jpg',
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
        .catch(async () => {
          // 오프라인. 페이지 이동이면 게임으로 보낸다. 그 밖(모듈·그림)은 index.html 을 돌려주면 안 된다 —
          // 자바스크립트 자리에 HTML 이 오면 문법 오류로 죽고, respondWith(undefined) 는 흰 화면이다.
          // 명시적 네트워크 오류 응답이 브라우저에 "못 받았다"를 정직하게 알린다.
          if (req.mode === 'navigate') {
            const page = await caches.match('index.html')
            if (page) return page
          }
          return Response.error()
        })
    }),
  )
})
