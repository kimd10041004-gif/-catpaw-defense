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
      x, y, r, palette: def.palette, angle, t,
      extra: { recoil: phase, seed, pose: def.pose, idle },
    })
    return
  }

  const { sx, sy, sw, sh } = frameRect(fs, idle ? FRAME_SLEEP : frameForPhase(phase))
  const box = frameDrawBox(fs, r)
  // 숨 쉬는 느낌 — 벡터 스프라이트가 쓰던 값과 같아서 둘이 같은 리듬으로 움직인다
  const bob = Math.sin(t * 2.1 + seed) * r * 0.028
  // 그림에 구워진 효과(앞발·룬 원·칼·잔상·속도선)가 전부 오른쪽을 본다.
  // 타깃이 왼쪽이면 통째로 반전해서 효과가 타깃 쪽을 향하게 한다.
  // 효과를 코드로 회전시켜 덧그리면 그림의 효과와 이중으로 보인다.
  const flip = Math.cos(angle) < 0

  ctx.save()
  ctx.translate(x, y + bob)
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
