/**
 * 프레임 아트 로더 + "그림이냐 벡터냐" 판단 — 이 파일이 그 선택을 혼자 맡는다.
 *
 * render.js(전장)와 ui.js(상점·도감·타워 패널)가 같은 drawUnit()을 쓴다.
 * 두 곳에 같은 판단을 복사해두면 한쪽만 그림이 되는 사고가 난다 —
 * 실제로 처음엔 전장만 그림이고 상점 카드는 벡터로 남아 그림이 섞여 보였다.
 *
 * 원래 이 게임에는 이미지가 하나도 없었다. 밈 고양이 사진은 저작권이 있어서
 * (Grumpy Cat 소송 등) 과금이 붙은 앱에는 못 쓰고, 그래서 전부 코드로 그렸다.
 * 그 결과가 "납작한 벡터"였다. 이제 저작권 문제가 없는 그림이 생겼으니
 * 그걸 쓰고, 그림이 없을 때만 벡터로 떨어진다.
 *
 * 규칙 하나: **그림이 없거나 로드에 실패해도 게임은 그대로 돌아간다.**
 * getFrameImage()가 null 을 주면 render.js 가 기존 스프라이트로 그린다.
 * 그래서 art/ 폴더가 비어 있어도 부팅되고, 그림을 한 장씩 넣어도 된다.
 */

import { registerFrameSet, listFrameSets, getFrameSet, getSprite, getPose } from './content/registry.js'
import { frameForPhase, frameRect, frameDrawBox, FRAME_SLEEP } from './domain/frames.js'

/**
 * 5마리 모두 같은 규격이다 — tools/slice-sheet.mjs 가 같은 시트에서 잘랐고,
 * 실측한 내용 박스가 5마리 모두 ±3px 안에서 일치했다(cx 80~82, cy 72~75.5, h 105~110).
 * 새 캐릭터가 이 범위를 벗어나면 그 프레임셋만 body 를 따로 준다.
 */
const CAT = { frames: 5, w: 169, h: 169, body: { cx: 82, cy: 73, h: 107 } }

registerFrameSet('cat-cheese', { src: 'art/cat-cheese.png', ...CAT })
registerFrameSet('cat-calico', { src: 'art/cat-calico.png', ...CAT })
registerFrameSet('cat-siamese', { src: 'art/cat-siamese.png', ...CAT })
registerFrameSet('cat-black', { src: 'art/cat-black.png', ...CAT })
registerFrameSet('cat-chonk', { src: 'art/cat-chonk.png', ...CAT })

/**
 * 2차 발주로 받은 고양이. 칸이 198px 이라 1차(169px)보다 크고, 실측한 내용 박스도
 * 둘이 4~8px 달라서 한 상수로 묶지 않는다. frameDrawBox 가 body.h 로 정규화하므로
 * 해상도가 섞여도 화면에서의 크기는 1차와 똑같이 나온다.
 */
const CAT2 = { frames: 5, w: 198, h: 198 }

registerFrameSet('cat-mackerel', {
  src: 'art/cat-mackerel.png', ...CAT2, body: { cx: 94, cy: 100, h: 136 },
})
registerFrameSet('cat-bluerussian', {
  src: 'art/cat-bluerussian.png', ...CAT2, body: { cx: 86, cy: 103, h: 140 },
})

/**
 * 같은 2차 발주지만 시트를 두 번에 나눠 받아서 칸이 198 / 200 으로 2px 다르다.
 * 이 둘은 칸을 더 꽉 채워 그려져서 내용 박스도 훨씬 크다(166·171 대 136·140) —
 * body.h 로 정규화하므로 화면에서의 크기는 아홉 마리가 모두 같다.
 */
const CAT3 = { frames: 5, w: 200, h: 200 }

/*
 * 이 둘만 body 를 '대기'가 아니라 '거의 제자리'(3번째 칸)에서 쟀다.
 *
 * 턱시도냥의 대기 프레임에는 금색 아우라와 음표가 그려져 있어서 내용 박스가
 * 166px 까지 부푼다(다른 칸은 134). body.h 로 크기를 정규화하므로 그대로 쓰면
 * 아우라 크기에 맞춰 고양이 자체가 20% 작아진다. 효과가 없는 칸에서 재야
 * 아홉 마리의 몸 크기가 같아지고, 아우라는 그 위로 넘쳐 나오는 게 맞다.
 * 스핑크스냥은 꼬리 끝 한 줄이 박스를 24px 늘려서 같은 이유로 다시 쟀다.
 */
registerFrameSet('cat-tuxedo', {
  src: 'art/cat-tuxedo.png', ...CAT3, body: { cx: 87, cy: 126, h: 134 },
})
registerFrameSet('cat-sphynx', {
  src: 'art/cat-sphynx.png', ...CAT3, body: { cx: 91, cy: 120, h: 146 },
})

/**
 * 해충은 프레임 3장(걷기 A · 걷기 B · 멈춤)이다. 고양이와 달리 발사 모션이 없고,
 * 피격 번쩍임·보호막·광폭화 고리·엘리트 왕관은 코드가 그리므로 프레임이 필요 없다.
 *
 * hPerR / cyPerR 은 '이 캐릭터가 벡터로 그려질 때 쓰던 세로 폭과 중심'이다.
 * 실측값이라 그림으로 바꿔도 크기와 발 높이가 그대로 유지된다
 * (도구: 스프라이트를 오프스크린에 그려 알파 경계를 잰다).
 */
const PEST = { frames: 3, w: 209, h: 209 }

registerFrameSet('enemy-mouse', {
  src: 'art/enemy-mouse.png', ...PEST,
  body: { cx: 100, cy: 94, h: 105 }, hPerR: 1.85, cyPerR: 0.23,
})
registerFrameSet('enemy-roach', {
  src: 'art/enemy-roach.png', ...PEST,
  body: { cx: 115, cy: 95, h: 98 }, hPerR: 2.02, cyPerR: 0.085,
})
registerFrameSet('enemy-rat', {
  src: 'art/enemy-rat.png', ...PEST,
  body: { cx: 102, cy: 99, h: 97 }, hPerR: 1.85, cyPerR: 0.23,
})
registerFrameSet('enemy-bat', {
  src: 'art/enemy-bat.png', ...PEST,
  body: { cx: 102, cy: 115, h: 121 }, hPerR: 2.37, cyPerR: 0.55,
})
registerFrameSet('enemy-mole', {
  src: 'art/enemy-mole.png', ...PEST,
  body: { cx: 106, cy: 107, h: 79 }, hPerR: 1.63, cyPerR: 0.32,
})

/**
 * 2차 발주로 받은 해충 4종. 칸이 222px 이다.
 *
 * hPerR / cyPerR 은 이 넷이 그림 없이 빌려 쓰던 스프라이트의 값을 그대로 쓴다
 * (비둘기는 박쥐, 나머지 셋은 바퀴). 그래야 그림이 붙어도 화면에서의 크기와
 * 발 높이가 안 바뀐다 — 밸런스를 눈으로 다시 잡을 필요가 없다.
 */
const PEST2 = { frames: 3, w: 222, h: 222 }

registerFrameSet('enemy-pigeon', {
  src: 'art/enemy-pigeon.png', ...PEST2,
  body: { cx: 104, cy: 109, h: 192 }, hPerR: 2.37, cyPerR: 0.55,
})
registerFrameSet('enemy-fireant', {
  src: 'art/enemy-fireant.png', ...PEST2,
  body: { cx: 113, cy: 141, h: 100 }, hPerR: 2.02, cyPerR: 0.085,
})
registerFrameSet('enemy-worm', {
  src: 'art/enemy-worm.png', ...PEST2,
  body: { cx: 104, cy: 126, h: 103 }, hPerR: 2.02, cyPerR: 0.085,
})
registerFrameSet('enemy-earwig', {
  src: 'art/enemy-earwig.png', ...PEST2,
  body: { cx: 111, cy: 140, h: 106 }, hPerR: 2.02, cyPerR: 0.085,
})

/**
 * 보스 시트는 캐릭터 뒤에 푸른 후광이 깔려 있었다. 그걸 파내면서 그림에 구워진
 * 바닥 그림자도 같이 지워졌다(tools/slice-sheet.mjs 참고). 그래서 이쪽만 코드가
 * 그림자를 그린다 — 값은 각 스프라이트가 쓰던 것과 같다.
 * 크기(hPerR)도 '그림자를 뺀 몸만'의 실측값을 쓴다.
 */
const RODENT_SHADOW = { cy: 0.86, rx: 0.88, ry: 0.30, alpha: 0.26 }

/**
 * 보스 넷은 2차 발주에서 한 마리당 한 장으로 다시 받았다. 칸이 396px 이라
 * 1차(209px)의 3.6배 넓이다 — 태블릿에서 2.9배 확대되던 것이 0.9배 안팎이 된다.
 * 마왕 쥐만 아직 1차 그림(209px)을 쓴다.
 */
const BOSS2 = { frames: 3, w: 396, h: 396 }

registerFrameSet('enemy-ratking', {
  src: 'art/enemy-ratking.png', ...BOSS2,
  body: { cx: 197, cy: 180, h: 279 }, hPerR: 1.64, cyPerR: -0.045,
  shadow: RODENT_SHADOW,
})
registerFrameSet('enemy-molelord', {
  src: 'art/enemy-molelord.png', ...BOSS2,
  body: { cx: 198, cy: 160, h: 289 }, hPerR: 1.98, cyPerR: -0.195,
  shadow: { cy: 0.86, rx: 0.88, ry: 0.28, alpha: 0.28 },
})
registerFrameSet('enemy-roachqueen', {
  src: 'art/enemy-roachqueen.png', ...BOSS2,
  body: { cx: 197, cy: 176, h: 304 }, hPerR: 1.84, cyPerR: -0.005,
  shadow: { cy: 0.86, rx: 0.88, ry: 0.24, alpha: 0.20 },
})
registerFrameSet('enemy-batlord', {
  src: 'art/enemy-batlord.png', ...BOSS2,
  body: { cx: 198, cy: 151, h: 292 }, hPerR: 1.49, cyPerR: -0.23,
  // 나는 적이라 그림자가 훨씬 아래에 작게 깔린다
  shadow: { cy: 1.55, rx: 0.60, ry: 0.19, alpha: 0.16 },
})
registerFrameSet('enemy-demonking', {
  src: 'art/enemy-demonking.png', ...PEST,
  body: { cx: 105, cy: 111, h: 126 }, hPerR: 2.2, cyPerR: -0.325,
  shadow: RODENT_SHADOW,
})

/** 로드가 끝난 것만 들어간다. 실패한 키는 아예 없다 = 폴백. */
const loaded = new Map()
let started = false
let pending = 0
let settled = false
const waiting = []

function settle() {
  if (pending > 0 || settled) return
  settled = true
  // 이미 그려진 UI(상점 카드 등)를 다시 그리게 한다. 안 하면 부팅 직후에 만들어진
  // 카드만 영원히 벡터로 남는다.
  while (waiting.length) waiting.shift()()
}

/**
 * 모든 프레임셋의 로드 시도가 끝나면 한 번 부른다(성공·실패 무관).
 * 이미 끝났으면 즉시 부른다.
 */
export function onFrameSetsReady(cb) {
  if (settled) cb()
  else waiting.push(cb)
}

/**
 * 등록된 프레임셋을 모두 받아온다. 부팅 때 한 번 부르고 기다리지 않는다 —
 * 그림이 늦게 와도 그때까지는 벡터로 그려지므로 첫 화면이 밀리지 않는다.
 *
 * decode()를 쓰는 이유: onload 만으로는 첫 drawImage 에서 디코딩이 일어나
 * 프레임이 한 번 튄다. 미리 디코딩해두면 그게 없다.
 */
export function loadFrameSets() {
  if (started) return
  started = true
  if (typeof Image !== 'function') { settled = true; return }   // 브라우저가 아닌 환경(테스트)

  for (const fs of listFrameSets()) {
    const img = new Image()
    // 단일 파일 번들(dist/*.html)은 art/ 폴더를 같이 옮길 수 없어서 tools/bundle.mjs 가
    // 그림을 data URI 로 실어 보낸다. 그게 있으면 그걸 쓴다.
    const inlined = globalThis.__catpawArt && globalThis.__catpawArt[fs.key]
    // 서브경로(/game/ 같은 곳)에 올려도 맞게 풀리도록 문서 기준으로 해석한다
    img.src = inlined || new URL(fs.src, document.baseURI).href
    const use = () => {
      // 스트립 폭이 정의와 다르면 좌표가 어긋난 그림을 그리게 된다.
      // 조용히 이상하게 그리는 것보다 폴백이 낫다.
      if (img.naturalWidth !== fs.w * fs.frames || img.naturalHeight !== fs.h) {
        console.warn(
          `프레임셋 '${fs.key}': 크기가 ${fs.w * fs.frames}×${fs.h} 이어야 하는데 ` +
          `${img.naturalWidth}×${img.naturalHeight} 입니다. 그림을 쓰지 않고 벡터로 그립니다.`,
        )
        return
      }
      loaded.set(fs.key, img)
    }
    pending += 1
    const decode = img.decode ? img.decode() : Promise.resolve()
    decode.then(use, () => {
      // 파일이 없는 상태는 정상이다 — 아트가 아직 안 들어온 캐릭터일 수 있다.
      console.info(`프레임셋 '${fs.key}' 그림이 없어 벡터로 그립니다 (${fs.src})`)
    }).then(() => { pending -= 1; settle() })
  }
  settle()   // 등록된 프레임셋이 하나도 없을 때
}

/** 로드된 이미지 또는 null. null 이면 호출한 쪽이 기존 스프라이트로 그린다. */
export function getFrameImage(key) {
  return (key && loaded.get(key)) || null
}

/** 스모크 테스트에서 몇 장 붙었는지 확인하려고 노출한다. */
export function loadedFrameSetKeys() { return [...loaded.keys()] }

/**
 * 고양이 한 마리를 그린다. 프레임 아트가 붙어 있으면 그림, 없으면 캔버스 스프라이트.
 *
 * opts: { x, y, r, angle, phase, idle, t, seed }
 *   phase 발사 직후 1 → 대기 0 (game.js 의 tower.recoil)
 *   idle  오래 안 쏘면 자는 프레임
 */
export function drawUnit(ctx, def, o) {
  const { x, y, r, angle = -Math.PI / 2, phase = 0, idle = false, t = 0, seed = 0 } = o
  const fs = def.frames ? getFrameSet(def.frames) : null
  const img = fs ? getFrameImage(def.frames) : null

  if (!fs || !img) {
    const draw = getSprite(def.sprite)
    if (!draw) return
    draw(ctx, {
      x, y, r, palette: o.palette || def.palette, angle, t, flying: o.flying,
      extra: { recoil: phase, seed, pose: def.pose, idle },
    })
    return
  }

  // 어느 프레임인지는 부르는 쪽이 정할 수 있다 — 고양이는 발사 진행도로,
  // 해충은 걷기 주기로 고른다. 안 주면 고양이 규칙을 쓴다.
  const index = o.frame !== undefined ? o.frame : (idle ? FRAME_SLEEP : frameForPhase(phase))
  const { sx, sy, sw, sh } = frameRect(fs, index)
  const box = frameDrawBox(fs, r)
  // 숨 쉬는 느낌 — 벡터 스프라이트가 쓰던 값과 같아서 둘이 같은 리듬으로 움직인다
  const bob = Math.sin(t * 2.1 + seed) * r * 0.028
  // 그림에 구워진 효과(앞발·룬 원·칼·잔상·속도선)가 전부 오른쪽을 본다.
  // 타깃이 왼쪽이면 통째로 반전해서 효과가 타깃 쪽을 향하게 한다.
  // 효과를 코드로 회전시켜 덧그리면 그림의 효과와 이중으로 보인다.
  const flip = Math.cos(angle) < 0

  ctx.save()
  ctx.translate(x, y + bob)
  // 그림에 바닥 그림자가 없는 프레임셋만 코드가 그린다. 반전 전에 그려야
  // 그림자가 좌우로 튀지 않는다.
  if (fs.shadow) {
    const sh2 = fs.shadow
    ctx.save()
    ctx.globalAlpha *= sh2.alpha
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.ellipse(0, r * sh2.cy, r * sh2.rx, r * sh2.ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (flip) ctx.scale(-1, 1)
  // 조준 방향으로 살짝 기운다. 반전한 좌표계 안이라 항상 '앞쪽'이 된다.
  ctx.translate(Math.abs(Math.cos(angle)) * r * 0.11, 0)
  ctx.drawImage(img, sx, sy, sw, sh, box.dx, box.dy, box.w, box.h)
  ctx.restore()

  // 그림에 없는 효과만 덧그린다. 지금은 샴냥 눈빛 하나뿐이고,
  // 이름 분기 대신 타워 정의의 effectOverArt 플래그로 고른다.
  if (def.effectOverArt && def.pose && !idle) {
    const pose = getPose(def.pose)
    if (!pose) return
    ctx.save()
    ctx.translate(x, y + bob)
    const opts = { r, phase, angle, palette: def.palette, t, hy: -r * 0.36 }
    pose(ctx, { ...opts, layer: 'back' })
    pose(ctx, { ...opts, layer: 'front' })
    ctx.restore()
  }
}
