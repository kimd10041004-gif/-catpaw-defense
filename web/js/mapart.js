/**
 * 지도 아트 — 길 질감과 막힌 칸 소품.
 *
 * framesets.js 와 같은 생각이되 훨씬 작다. 프레임 개념이 없고, 대신 canvas 패턴을
 * 만들어 캐시한다.
 *
 * 왜 패턴인가: canvas 의 strokeStyle 은 색 문자열뿐 아니라 CanvasPattern 도 받는다.
 * 그래서 **길의 기하를 한 글자도 건드리지 않고** 단색만 질감으로 바꿀 수 있다.
 * 길 모양은 여전히 코드가 웨이포인트에서 계산하므로 그림과 실제 경로가 어긋나는
 * 사고가 원리적으로 불가능하다. (통짜 배경 그림 대신 이 방식을 고른 이유다 —
 * 실제로 받아본 통짜 그림은 길이 최대 64% 어긋나 있었다.)
 *
 * 캐릭터 아트와 달리 로드 완료 콜백이 필요 없다. 캔버스는 매 프레임 다시 그리므로
 * 그림이 늦게 와도 다음 프레임부터 저절로 반영된다.
 */

import { registerMapArt, registerProp, listMapArt, listProps, getMapArt, getProp }
  from './content/registry.js'

/** 질감 한 장이 덮는 칸 수. 크게 잡으면 반복이 덜 보이고 대신 흐려진다. */
export const PATCH_TILES = 2

/* 바닥은 더 크게 깐다.
 *
 * 바닥은 거울 반사 super-tile 로 깔리는데(mirrorTile), 2칸으로 잡으면 super-tile 이
 * 4칸이라 9×14 격자에 2.3×3.5 번 반복된다 — 아스팔트 웅덩이 같은 진한 무늬가
 * 나비 모양으로 되풀이되는 게 눈에 띈다. 3칸으로 늘리면 super-tile 이 6칸이라
 * 1.5×2.3 번으로 줄어든다. 대가는 흐려짐(271px 원본이 태블릿에서 약 2배 확대)인데,
 * 바닥은 길·고양이·해충 뒤에 깔리는 배경이라 이쪽이 낫다.                     */
export const FLOOR_PATCH_TILES = 3

registerMapArt('alley', { path: 'art/path-alley.png', floor: 'art/floor-alley.png' })
// 부엌만 질감을 훨씬 옅게 얹는다. 흑백 체크는 대비가 극단이라 기본값(0.72)으로도
// 길·고양이보다 시끄럽고, 거울 반사 이음매에서 체크 리듬이 어긋나는 게 그대로 보인다.
// 옅게 깔면 '체크 무늬 부엌 바닥'이라는 정보는 남고 소음만 사라진다.
registerMapArt('kitchen', {
  path: 'art/path-kitchen.png', floor: 'art/floor-kitchen.png', floorAlpha: 0.34,
})
registerMapArt('rooftop', { path: 'art/path-rooftop.png', floor: 'art/floor-rooftop.png' })
registerMapArt('warehouse', { path: 'art/path-warehouse.png', floor: 'art/floor-warehouse.png' })
registerMapArt('basement', { path: 'art/path-basement.png', floor: 'art/floor-basement.png' })
registerMapArt('attic', { path: 'art/path-attic.png', floor: 'art/floor-attic.png' })

registerProp('crate', { src: 'art/prop-crate.png' })
registerProp('pot', { src: 'art/prop-pot.png' })
registerProp('jar', { src: 'art/prop-jar.png' })
registerProp('sack', { src: 'art/prop-sack.png' })
registerProp('barrel', { src: 'art/prop-barrel.png' })
registerProp('furniture', { src: 'art/prop-furniture.png' })

/** src → { img, bounds } . 로드에 성공한 것만 들어간다 = 없으면 폴백 */
const loaded = new Map()
let started = false

/**
 * 불투명한 부분의 경계를 잰다.
 *
 * 소품을 칸 바닥에 앉히려면 그림에서 물체가 실제로 어디까지인지 알아야 한다.
 * 키잉이 프레임 가장자리에 아주 옅은 알파를 남기므로 128 을 기준으로 자른다.
 * 이걸 자동으로 재면 소품을 추가할 때 상수를 손으로 넣지 않아도 된다.
 */
function solidBounds(img) {
  const cv = document.createElement('canvas')
  cv.width = img.naturalWidth
  cv.height = img.naturalHeight
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1
  for (let j = 0; j < cv.height; j += 1) {
    for (let i = 0; i < cv.width; i += 1) {
      if (d[(j * cv.width + i) * 4 + 3] < 128) continue
      if (i < x0) x0 = i
      if (i > x1) x1 = i
      if (j < y0) y0 = j
      if (j > y1) y1 = j
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w: cv.width, h: cv.height }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function load(src) {
  const img = new Image()
  // 서브경로(/assets/ 같은 곳)에 올려도 맞게 풀리도록 문서 기준으로 해석한다
  img.src = new URL(src, document.baseURI).href
  const decode = img.decode ? img.decode() : Promise.resolve()
  decode.then(
    () => loaded.set(src, { img, bounds: solidBounds(img) }),
    // 파일이 없는 상태는 정상이다 — 아직 안 들어온 지도일 수 있다
    () => console.info(`지도 아트가 없어 단색으로 그립니다 (${src})`),
  )
}

/** 부팅 때 한 번. 기다리지 않는다 — 늦게 와도 다음 프레임에 반영된다. */
export function loadMapArt() {
  if (started) return
  started = true
  if (typeof Image !== 'function') return   // 브라우저가 아닌 환경(테스트)
  for (const a of listMapArt()) {
    if (a.path) load(a.path)
    // 바닥은 아직 안 온 맵이 있을 수 있다 — 없으면 load()가 조용히 넘어가고
    // getFloorPattern 이 null 을 주면 render 가 지금처럼 체커보드를 그린다.
    if (a.floor) load(a.floor)
  }
  for (const p of listProps()) load(p.src)
}

// 패턴은 만드는 데 2.3µs 라 성능 때문에 캐시하는 게 아니다. 타일 크기가 바뀌면
// 다시 만들어야 한다는 사실을 한 곳에 가두려고 캐시한다.
let patternCache = new Map()
let patternKey = ''

/**
 * 거울 반사 super-tile. 원본을 좌우·상하로 뒤집어 2×2 로 붙이면 **네 변이 서로의
 * 거울이라 어떤 그림이든 이어붙임이 완벽해진다** (왼쪽 끝 열 == 오른쪽 끝 열).
 *
 * 왜 필요한가: 받은 바닥 질감 여섯 장이 전부 양 끝이 안 맞물린다 — 실측하니
 * 양 끝 차이가 '붙어 있는 두 열의 차이'의 2.5~15배였다. 그대로 깔면 두 칸마다
 * 격자 줄이 보인다. 발주서에 이어붙임 예까지 그려 보냈는데도 두 장 모두 실패했다
 * (생성기가 못 맞춘다). 그림을 더 받는 것보다 코드로 푸는 게 확실하다.
 *
 * 대가: 무늬에 좌우·상하 대칭이 생긴다. 아스팔트·콘크리트·합판처럼 결이 없는
 * 질감에서는 안 보이고, 벽돌·체크처럼 규칙적인 무늬에서는 자세히 보면 보인다.
 * 줄이 쭉 가는 것보다는 낫다.
 */
function mirrorTile(img) {
  const w = img.naturalWidth, h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w * 2; cv.height = h * 2
  const c = cv.getContext('2d')
  c.drawImage(img, 0, 0)
  c.save(); c.translate(w * 2, 0); c.scale(-1, 1); c.drawImage(img, 0, 0); c.restore()
  c.save(); c.translate(0, h * 2); c.scale(1, -1); c.drawImage(img, 0, 0); c.restore()
  c.save(); c.translate(w * 2, h * 2); c.scale(-1, -1); c.drawImage(img, 0, 0); c.restore()
  return cv
}

/**
 * 격자에 맞춰 붙는 반복 패턴. 그림이 없으면 null → 호출한 쪽이 단색으로 그린다.
 * ox/oy 를 넣어야 질감이 격자에 맞춰 붙는다.
 *
 * 길과 바닥이 같은 함수를 쓴다. 캐시 키에 종류를 넣지 않으면 한 맵에서 길과 바닥이
 * 서로를 덮어쓴다 — 둘 다 mapId 로만 찾기 때문이다.
 */
function patternFor(kind, mapId, ctx, tile, ox, oy) {
  const art = getMapArt(mapId)
  const src = art && art[kind]
  if (!src) return null
  const entry = loaded.get(src)
  if (!entry) return null

  const key = `${Math.round(tile * 100)}|${Math.round(ox * 10)}|${Math.round(oy * 10)}`
  if (key !== patternKey) { patternCache = new Map(); patternKey = key }
  const cacheKey = `${kind}:${mapId}`
  if (patternCache.has(cacheKey)) return patternCache.get(cacheKey)

  // 바닥만 거울 반사로 깐다. 길은 좁은 띠로 그려져서 대칭이 눈에 띄고,
  // 이어붙임도 이미 손봐서 받았다.
  let source = entry.img
  if (kind === 'floor') {
    if (!entry.mirror) entry.mirror = mirrorTile(entry.img)
    source = entry.mirror
  }

  const pat = ctx.createPattern(source, 'repeat')
  if (pat && pat.setTransform && typeof DOMMatrix === 'function') {
    // 한 장(원본)이 PATCH_TILES 칸을 덮게 맞춘다. super-tile 은 그 두 배 크기라
    // 같은 배율을 쓰면 저절로 2×PATCH_TILES 칸을 덮는다 — 반복이 그만큼 덜 보인다.
    const patch = kind === 'floor' ? FLOOR_PATCH_TILES : PATCH_TILES
    pat.setTransform(new DOMMatrix()
      .translate(ox, oy)
      .scale((tile * patch) / entry.img.naturalWidth))
  }
  patternCache.set(cacheKey, pat)
  return pat
}

/** 길 질감 패턴. 없으면 null. */
export function getPathPattern(mapId, ctx, tile, ox, oy) {
  return patternFor('path', mapId, ctx, tile, ox, oy)
}

/**
 * 바닥 질감을 테마색 위에 얹는 세기. 1 이면 질감 그대로.
 *
 * 기본 0.72 는 눈으로 정했다 — 질감을 100% 로 깔면 바닥이 길·고양이보다 시끄럽다.
 * 바닥은 배경이라 제일 조용해야 한다. 유난히 센 질감은 맵 정의에서 따로 낮춘다.
 */
export function getFloorAlpha(mapId) {
  const art = getMapArt(mapId)
  return (art && Number.isFinite(art.floorAlpha)) ? art.floorAlpha : 0.72
}

/** 바닥 질감 패턴. 없으면 null → 지금까지처럼 테마색 체커보드를 그린다. */
export function getFloorPattern(mapId, ctx, tile, ox, oy) {
  return patternFor('floor', mapId, ctx, tile, ox, oy)
}

/** 소품 이미지 + 불투명 경계. 없으면 null. */
export function getPropArt(name) {
  const def = getProp(name)
  if (!def) return null
  return loaded.get(def.src) || null
}

/** 스모크 테스트에서 몇 장 붙었는지 확인하려고 노출한다. */
export function loadedMapArtKeys() { return [...loaded.keys()] }
