/**
 * 캔버스로 그리는 스프라이트 — 이미지 파일이 하나도 없다.
 *
 * 왜 파일을 안 쓰나: 인터넷 밈 고양이 사진은 대부분 저작권이 있고(Grumpy Cat 소송 등),
 * 과금이 붙은 앱에 쓰면 침해다. 그래서 저작권 걱정이 없는 원본 그림을 코드로 그린다.
 *
 * 싸구려로 보이지 않게 하는 핵심 네 가지:
 *   1. 단색 채우기 금지 — 밝은 면 / 기본면 / 그늘을 겹쳐 입체를 만든다
 *   2. 실루엣에 털 뭉치(fluff)를 넣어 매끈한 타원처럼 보이지 않게 한다
 *   3. 좌우를 미묘하게 비대칭으로 (귀 각도, 눈 크기)
 *   4. 표정을 고양이마다 다르게 — 성격이 보이면 같은 형태도 다르게 읽힌다
 *
 * 성능: 폰에서 적 80마리 + 타워 20개를 매 프레임 그리므로 그라디언트는 쓰지 않는다.
 * 겹친 단색 도형이 훨씬 싸고 결과도 충분히 좋다.
 */

import { registerSprite } from './content/registry.js'

// ───────────────────────────────────────────────────────────── 색 유틸

/** #rrggbb 를 amount(-1~1)만큼 밝게(+) 또는 어둡게(-) */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = amount < 0 ? 0 : 255
    return Math.round((t - v) * Math.abs(amount) + v)
  })
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`
}

function ellipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 털 뭉치가 있는 실루엣. 매끈한 타원 대신 울퉁불퉁한 가장자리를 만든다 —
 * 이것만으로 "도형"이 "동물"처럼 보이기 시작한다.
 */
function fluff(ctx, cx, cy, rx, ry, bumps, color, phase = 0) {
  ctx.fillStyle = color
  ctx.beginPath()
  const steps = bumps * 6
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    const wob = 1 + Math.sin(a * bumps + phase) * 0.055
    const x = cx + Math.cos(a) * rx * wob
    const y = cy + Math.sin(a) * ry * wob
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

/** 바닥 그림자 */
function groundShadow(ctx, r, squash = 0.30, alpha = 0.26) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(0, r * 0.86, r * 0.88, r * squash, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 0~1 사이를 오가는 눈 깜빡임. 개체마다 다른 리듬을 갖도록 seed를 받는다. */
function blink(t, seed) {
  const cycle = 3.4 + (seed % 7) * 0.42
  const phase = (t + seed) % cycle
  return phase < 0.13 ? 1 - Math.abs(phase - 0.065) / 0.065 : 0
}

// ───────────────────────────────────────────────────────────── 고양이

/**
 * 표정 — 고양이마다 성격이 보이게. palette.face 로 고른다.
 *  wide   눈 크게 뜬 신난 얼굴 (치즈냥)
 *  grumpy 반쯤 감은 심드렁한 얼굴 (삼색냥)
 *  cold   가늘고 차가운 눈 (샴냥)
 *  smug   한쪽 눈을 접은 능글맞은 얼굴 (검은냥)
 *  sleepy 졸린 식빵 얼굴 (뚱냥)
 */
function drawEyes(ctx, r, hy, p, face, lidT) {
  const eyeColor = p.eye || '#2f7d32'
  const dark = '#12161c'

  for (const side of [-1, 1]) {
    const ex = side * r * 0.245
    const ey = hy + r * 0.03
    // 좌우 미묘한 크기 차 — 완벽한 대칭은 인공적으로 보인다
    const scale = side < 0 ? 1 : 0.96

    if (face === 'cold') {
      // 가늘게 뜬 눈: 아몬드형
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(ex, ey, r * 0.17 * scale, r * 0.105, side * 0.16, 0, Math.PI * 2)
      ctx.fill()
      ellipse(ctx, ex, ey, r * 0.075, r * 0.095, eyeColor)
      ellipse(ctx, ex, ey, r * 0.032, r * 0.085, dark)
    } else if (face === 'smug' && side > 0) {
      // 한쪽만 접은 눈 — 능글맞은 인상의 핵심
      ctx.strokeStyle = dark
      ctx.lineWidth = r * 0.055
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(ex, ey + r * 0.04, r * 0.15, Math.PI * 1.08, Math.PI * 1.92)
      ctx.stroke()
    } else {
      const rx = face === 'wide' ? 0.185 : 0.165
      const ry = face === 'sleepy' ? 0.10 : face === 'grumpy' ? 0.135 : 0.185
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(ex, ey, r * rx * scale, r * ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ellipse(ctx, ex, ey + r * 0.01, r * 0.095, r * (ry * 0.72), eyeColor)
      ellipse(ctx, ex, ey + r * 0.01, r * 0.042, r * (ry * 0.62), dark)
      // 눈동자 하이라이트 두 개 — 하나만 찍으면 밋밋하다
      ellipse(ctx, ex - r * 0.045, ey - r * 0.055, r * 0.032, r * 0.032, 'rgba(255,255,255,0.95)')
      ellipse(ctx, ex + r * 0.05, ey + r * 0.05, r * 0.018, r * 0.018, 'rgba(255,255,255,0.55)')
    }

    // 눈꺼풀 — 눈 모양으로 클립하고 위에서 내려오게 그린다.
    // (원을 눈 위에 얹으면 눈이 통째로 사라져 '감은 눈'이 되어버린다)
    const lid = Math.max(lidT, face === 'grumpy' ? 0.45 : face === 'sleepy' ? 0.60 : 0)
    if (lid > 0.01) {
      const lrx = r * 0.21
      const lry = r * 0.21
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(ex, ey, lrx, lry, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = p.fur
      ctx.fillRect(ex - lrx, ey - lry, lrx * 2, lry * 2 * lid)
      // 눈꺼풀 경계선이 있어야 '감고 있다'가 또렷하게 읽힌다
      ctx.strokeStyle = shade(p.fur, -0.35)
      ctx.lineWidth = r * 0.035
      ctx.beginPath()
      ctx.moveTo(ex - lrx, ey - lry + lry * 2 * lid)
      ctx.lineTo(ex + lrx, ey - lry + lry * 2 * lid)
      ctx.stroke()
      ctx.restore()
    }

    // 눈썹 — 심술/능글 표정은 눈보다 눈썹이 더 크게 좌우한다
    if (face === 'grumpy' || face === 'smug') {
      ctx.strokeStyle = shade(p.stripe || p.fur, -0.32)
      ctx.lineWidth = r * 0.055
      ctx.lineCap = 'round'
      const inner = face === 'grumpy' ? 0.10 : (side < 0 ? 0.02 : 0.12)
      ctx.beginPath()
      ctx.moveTo(ex - side * r * 0.14, ey - r * (0.24 + inner))
      ctx.lineTo(ex + side * r * 0.15, ey - r * 0.20)
      ctx.stroke()
    }
  }
}

function drawCat(ctx, o) {
  const { x, y, r, palette: p, angle = -Math.PI / 2, t = 0 } = o
  const recoil = (o.extra && o.extra.recoil) || 0
  const face = p.face || 'wide'
  const seed = (o.extra && o.extra.seed) || 0

  const fur = p.fur
  const furLight = shade(fur, 0.18)
  const furDark = shade(fur, -0.20)
  const lean = Math.cos(angle) * 0.11 * r
  const bob = Math.sin(t * 2.1 + seed) * r * 0.028

  ctx.save()
  ctx.translate(x, y + bob)
  groundShadow(ctx, r)
  ctx.translate(lean - Math.cos(angle) * recoil * r * 0.13, -Math.sin(angle) * recoil * r * 0.13)

  // ── 꼬리 (몸 뒤) — 끝으로 갈수록 가늘어지게 두 번 그린다
  const wag = Math.sin(t * 2.6 + seed) * 0.55
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = furDark
  ctx.lineWidth = r * 0.21
  ctx.beginPath()
  ctx.moveTo(-r * 0.52, r * 0.46)
  ctx.quadraticCurveTo(-r * (1.18 + wag * 0.12), r * (0.20 - wag * 0.22), -r * (0.94 + wag * 0.1), -r * (0.30 + wag * 0.18))
  ctx.stroke()
  ctx.strokeStyle = fur
  ctx.lineWidth = r * 0.145
  ctx.stroke()
  ctx.restore()

  // ── 몸통: 기본면 → 밝은 면 → 그늘 → 배
  fluff(ctx, 0, r * 0.34, r * 0.70, r * 0.62, 7, fur, seed)
  ellipse(ctx, -r * 0.16, r * 0.18, r * 0.44, r * 0.40, furLight)
  ellipse(ctx, r * 0.26, r * 0.56, r * 0.40, r * 0.30, furDark)
  fluff(ctx, 0, r * 0.46, r * 0.40, r * 0.40, 6, p.belly, seed + 2)

  // 삼색 무늬
  if (p.patch) {
    ctx.save()
    // 클립은 몸통보다 살짝 작게 잡는다. fluff 는 가장자리가 ±5% 출렁이므로
    // 같은 크기로 자르면 무늬가 실루엣 밖으로 삐져나와 떠 보인다.
    ctx.beginPath()
    ctx.ellipse(0, r * 0.34, r * 0.64, r * 0.57, 0, 0, Math.PI * 2)
    ctx.clip()
    ellipse(ctx, -r * 0.40, r * 0.10, r * 0.32, r * 0.28, p.patch)
    ellipse(ctx, r * 0.34, r * 0.46, r * 0.24, r * 0.22, p.stripe)
    ctx.restore()
  }

  // ── 앞발 (젤리까지)
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * 0.31, r * 0.84, r * 0.20, r * 0.14, p.belly)
    ellipse(ctx, s * r * 0.31, r * 0.86, r * 0.10, r * 0.065, shade(p.belly, -0.22))
  }

  // ── 머리
  const hy = -r * 0.36

  // 귀 — 좌우 각도를 살짝 다르게 (완전 대칭은 인공적이다)
  const twitch = Math.sin(t * 5.5 + seed * 2) > 0.94 ? 0.16 : 0
  for (const s of [-1, 1]) {
    const tilt = s < 0 ? -0.06 : 0.10 + twitch
    ctx.save()
    ctx.translate(s * r * 0.45, hy - r * 0.36)
    ctx.rotate(tilt * s)
    ctx.fillStyle = fur
    ctx.beginPath()
    ctx.moveTo(-r * 0.24, r * 0.24)
    ctx.quadraticCurveTo(-r * 0.14, -r * 0.42, r * 0.16, -r * 0.30)
    ctx.quadraticCurveTo(r * 0.26, r * 0.02, r * 0.20, r * 0.26)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = p.ear || '#f2a6b3'
    ctx.beginPath()
    ctx.moveTo(-r * 0.12, r * 0.18)
    ctx.quadraticCurveTo(-r * 0.06, -r * 0.24, r * 0.10, -r * 0.18)
    ctx.quadraticCurveTo(r * 0.15, r * 0.02, r * 0.11, r * 0.19)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // 머리 — 볼 털 뭉치까지 한 번에
  fluff(ctx, 0, hy, r * 0.63, r * 0.55, 8, fur, seed + 1)
  ellipse(ctx, -r * 0.16, hy - r * 0.14, r * 0.36, r * 0.30, furLight)
  ellipse(ctx, r * 0.22, hy + r * 0.24, r * 0.32, r * 0.20, furDark)

  // 이마 줄무늬 (무늬 없는 고양이만)
  if (p.stripe && !p.patch) {
    ctx.strokeStyle = p.stripe
    ctx.lineWidth = r * 0.065
    ctx.lineCap = 'round'
    for (const dx of [-0.17, 0, 0.17]) {
      ctx.beginPath()
      ctx.moveTo(dx * r, hy - r * 0.42)
      ctx.quadraticCurveTo(dx * r * 1.35, hy - r * 0.30, dx * r * 1.5, hy - r * 0.18)
      ctx.stroke()
    }
  }

  drawEyes(ctx, r, hy, p, face, blink(t, seed))

  // ── 주둥이 · 코 · 입
  ellipse(ctx, -r * 0.10, hy + r * 0.30, r * 0.17, r * 0.13, shade(p.belly, 0.05))
  ellipse(ctx, r * 0.10, hy + r * 0.30, r * 0.17, r * 0.13, shade(p.belly, 0.05))

  ctx.fillStyle = '#e07d8d'
  ctx.beginPath()
  ctx.moveTo(0, hy + r * 0.25)
  ctx.lineTo(-r * 0.08, hy + r * 0.16)
  ctx.quadraticCurveTo(0, hy + r * 0.12, r * 0.08, hy + r * 0.16)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(35,26,26,0.6)'
  ctx.lineWidth = r * 0.045
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (face === 'grumpy') {
    // 입꼬리를 내려 심드렁하게
    ctx.moveTo(-r * 0.16, hy + r * 0.40)
    ctx.quadraticCurveTo(0, hy + r * 0.31, r * 0.16, hy + r * 0.40)
  } else {
    ctx.moveTo(0, hy + r * 0.25)
    ctx.lineTo(0, hy + r * 0.31)
    ctx.arc(-r * 0.085, hy + r * 0.31, r * 0.085, 0, Math.PI)
    ctx.moveTo(0, hy + r * 0.31)
    ctx.arc(r * 0.085, hy + r * 0.31, r * 0.085, Math.PI, 0, true)
  }
  ctx.stroke()

  // 혀 — 신난 얼굴만 가끔 내민다 (블렙)
  if (face === 'wide' && Math.sin(t * 0.9 + seed) > 0.72) {
    ellipse(ctx, 0, hy + r * 0.44, r * 0.075, r * 0.10, '#f28ba0')
  }

  // ── 수염 — 직선이 아니라 곡선이어야 자연스럽다
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = r * 0.028
  for (const s of [-1, 1]) {
    for (const dy of [-0.05, 0.045, 0.14]) {
      ctx.beginPath()
      ctx.moveTo(s * r * 0.20, hy + r * 0.26)
      ctx.quadraticCurveTo(s * r * 0.55, hy + r * (0.26 + dy * 0.5), s * r * 0.86, hy + r * (0.26 + dy))
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ───────────────────────────────────────────────────────────── 적

/** 설치류 — 생쥐 / 시궁쥐 / 쥐왕 / 마왕 쥐가 팔레트로만 구분된다 */
function drawRodent(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const body = p.body
  const bodyDark = shade(body, -0.18)
  const step = Math.sin(t * 12) * r * 0.06

  ctx.save()
  ctx.translate(x, y)
  groundShadow(ctx, r)
  if (Math.cos(angle) < 0) ctx.scale(-1, 1)

  // 꼬리
  ctx.strokeStyle = p.tail || bodyDark
  ctx.lineWidth = r * 0.14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.60, r * 0.12)
  ctx.quadraticCurveTo(-r * 1.5, r * 0.06 + step, -r * 1.22, -r * 0.56)
  ctx.stroke()

  // 뒷다리
  ellipse(ctx, -r * 0.28, r * 0.62 + step, r * 0.21, r * 0.14, bodyDark)
  ellipse(ctx, r * 0.26, r * 0.62 - step, r * 0.21, r * 0.14, bodyDark)

  // 몸통
  fluff(ctx, 0, r * 0.10, r * 0.72, r * 0.52, 6, body, 1)
  ellipse(ctx, -r * 0.18, -r * 0.08, r * 0.40, r * 0.28, shade(body, 0.15))
  fluff(ctx, r * 0.08, r * 0.28, r * 0.44, r * 0.28, 5, p.belly, 3)

  // 귀
  ellipse(ctx, -r * 0.14, -r * 0.42, r * 0.27, r * 0.27, body)
  ellipse(ctx, -r * 0.14, -r * 0.42, r * 0.15, r * 0.15, p.ear || '#e0a3ad')

  // 머리 · 주둥이
  fluff(ctx, r * 0.52, -r * 0.06, r * 0.43, r * 0.37, 6, body, 2)
  ellipse(ctx, r * 0.42, -r * 0.18, r * 0.22, r * 0.16, shade(body, 0.14))
  ellipse(ctx, r * 0.90, r * 0.05, r * 0.21, r * 0.16, p.belly)
  ellipse(ctx, r * 1.05, r * 0.06, r * 0.075, r * 0.062, '#e07a8a')

  // 눈 — 흰자 없이 검은 구슬눈이 설치류다운 인상을 준다
  const lid = blink(t, r * 7)
  if (lid < 0.5) {
    ellipse(ctx, r * 0.58, -r * 0.15, r * 0.095, r * 0.095, '#15181d')
    ellipse(ctx, r * 0.61, -r * 0.19, r * 0.034, r * 0.034, '#ffffff')
  } else {
    ctx.strokeStyle = '#15181d'
    ctx.lineWidth = r * 0.05
    ctx.beginPath(); ctx.moveTo(r * 0.50, -r * 0.15); ctx.lineTo(r * 0.66, -r * 0.15); ctx.stroke()
  }

  // 앞니 — 설치류 실루엣의 결정타
  ctx.fillStyle = '#fff6e8'
  ctx.fillRect(r * 0.94, r * 0.14, r * 0.07, r * 0.13)

  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = r * 0.026
  for (const dy of [-0.07, 0.03]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.94, r * 0.02)
    ctx.quadraticCurveTo(r * 1.2, r * (0.02 + dy * 0.6), r * 1.44, r * (0.02 + dy))
    ctx.stroke()
  }

  // 마왕 뿔
  if (p.horn) {
    ctx.fillStyle = p.horn
    for (const s of [[0.24, -0.44], [0.64, -0.48]]) {
      ctx.beginPath()
      ctx.moveTo(r * s[0], r * s[1])
      ctx.quadraticCurveTo(r * (s[0] - 0.10), r * (s[1] - 0.78), r * (s[0] + 0.17), r * (s[1] - 0.95))
      ctx.quadraticCurveTo(r * (s[0] + 0.15), r * (s[1] - 0.40), r * (s[0] + 0.23), r * s[1])
      ctx.closePath()
      ctx.fill()
    }
  }

  // 보스 왕관
  if (p.crown) {
    ctx.fillStyle = p.crown
    ctx.beginPath()
    ctx.moveTo(r * 0.22, -r * 0.44)
    ctx.lineTo(r * 0.34, -r * 0.80)
    ctx.lineTo(r * 0.50, -r * 0.53)
    ctx.lineTo(r * 0.66, -r * 0.88)
    ctx.lineTo(r * 0.80, -r * 0.51)
    ctx.lineTo(r * 0.80, -r * 0.36)
    ctx.lineTo(r * 0.22, -r * 0.30)
    ctx.closePath()
    ctx.fill()
    ellipse(ctx, r * 0.51, -r * 0.62, r * 0.055, r * 0.055, '#ff5c7a')
  }
  ctx.restore()
}

/** 바퀴 — 납작한 몸, 앞가슴 방패, 뒤로 꺾인 다리 여섯, 긴 더듬이 */
function drawRoach(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  ctx.save()
  ctx.translate(x, y)
  groundShadow(ctx, r, 0.24, 0.20)
  ctx.rotate(angle)

  const legDark = shade(p.leg, -0.1)

  // 다리 여섯 — 관절에서 뒤로 꺾여야 벌레처럼 보인다
  ctx.strokeStyle = legDark
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i += 1) {
    const bx = r * (0.34 - i * 0.42)          // 앞→뒤
    const sweep = r * (0.30 + i * 0.16)        // 뒤로 갈수록 길게
    const w = Math.sin(t * 24 + i * 2.1) * r * 0.16
    for (const s of [-1, 1]) {
      ctx.lineWidth = r * 0.075
      ctx.beginPath()
      ctx.moveTo(bx, s * r * 0.24)
      const kx = bx - sweep * 0.45
      const ky = s * r * 0.56
      ctx.lineTo(kx, ky)                       // 무릎
      ctx.lineTo(kx - sweep * 0.55 + w, s * r * 0.88)
      ctx.stroke()
    }
  }

  // 몸통 — 가로로 납작하게
  ellipse(ctx, -r * 0.05, 0, r * 0.92, r * 0.50, p.body)
  // 딱지날개 (겉날개) — 가운데 봉합선이 보여야 한다
  ellipse(ctx, -r * 0.16, 0, r * 0.74, r * 0.44, p.shell)
  ctx.strokeStyle = shade(p.shell, -0.28)
  ctx.lineWidth = r * 0.05
  ctx.beginPath()
  ctx.moveTo(-r * 0.86, 0)
  ctx.lineTo(r * 0.42, 0)
  ctx.stroke()
  // 광택
  ctx.save()
  ctx.globalAlpha = 0.45
  ellipse(ctx, -r * 0.34, -r * 0.16, r * 0.30, r * 0.11, shade(p.shell, 0.38))
  ctx.restore()

  // 앞가슴 방패 — 머리를 덮는 판. 바퀴의 가장 큰 특징이다.
  ellipse(ctx, r * 0.44, 0, r * 0.36, r * 0.40, shade(p.body, -0.08))
  ctx.save()
  ctx.globalAlpha = 0.4
  ellipse(ctx, r * 0.40, -r * 0.14, r * 0.20, r * 0.11, shade(p.body, 0.35))
  ctx.restore()

  // 머리
  ellipse(ctx, r * 0.76, 0, r * 0.20, r * 0.22, legDark)
  for (const s of [-1, 1]) ellipse(ctx, r * 0.80, s * r * 0.09, r * 0.05, r * 0.05, '#f0e2c8')

  // 더듬이 — 몸보다 길고 앞으로 뻗는다
  ctx.strokeStyle = legDark
  ctx.lineWidth = r * 0.05
  for (const s of [-1, 1]) {
    const wobble = Math.sin(t * 7 + s) * r * 0.14
    ctx.beginPath()
    ctx.moveTo(r * 0.84, s * r * 0.10)
    ctx.quadraticCurveTo(r * 1.35, s * r * 0.34 + wobble, r * 1.72, s * r * 0.16 + wobble)
    ctx.stroke()
  }

  if (p.crown) {
    ctx.fillStyle = p.crown
    ctx.beginPath()
    ctx.moveTo(r * 0.16, -r * 0.44)
    ctx.lineTo(r * 0.28, -r * 0.90)
    ctx.lineTo(r * 0.44, -r * 0.56)
    ctx.lineTo(r * 0.60, -r * 0.92)
    ctx.lineTo(r * 0.72, -r * 0.46)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** 박쥐 — 막날개의 뼈대까지 그린다 */
function drawBat(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const flap = Math.sin(t * 11)
  ctx.save()
  ctx.translate(x, y)

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(0, r * 1.55, r * 0.60, r * 0.19, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (Math.cos(angle) < 0) ctx.scale(-1, 1)

  for (const s of [-1, 1]) {
    ctx.fillStyle = p.wing
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.10)
    ctx.quadraticCurveTo(s * r * 0.85, -r * (0.70 + flap * 0.45), s * r * 1.45, -r * (0.05 + flap * 0.35))
    ctx.quadraticCurveTo(s * r * 1.00, r * (0.25 - flap * 0.10), s * r * 0.78, r * 0.02)
    ctx.quadraticCurveTo(s * r * 0.60, r * (0.30 - flap * 0.10), s * r * 0.38, r * 0.04)
    ctx.closePath()
    ctx.fill()
    // 날개 뼈대
    ctx.strokeStyle = shade(p.wing, -0.25)
    ctx.lineWidth = r * 0.045
    for (const f of [0.55, 0.85]) {
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.10)
      ctx.quadraticCurveTo(s * r * 0.7 * f, -r * (0.5 + flap * 0.35) * f, s * r * 1.3 * f, -r * (0.02 + flap * 0.3) * f)
      ctx.stroke()
    }
  }

  fluff(ctx, 0, 0, r * 0.44, r * 0.50, 6, p.body, 4)
  ellipse(ctx, -r * 0.12, -r * 0.14, r * 0.24, r * 0.24, shade(p.body, 0.16))

  ctx.fillStyle = p.body
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.10, -r * 0.36)
    ctx.quadraticCurveTo(s * r * 0.22, -r * 0.92, s * r * 0.40, -r * 0.30)
    ctx.closePath()
    ctx.fill()
  }
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * 0.17, -r * 0.06, r * 0.10, r * 0.10, p.eye)
    ellipse(ctx, s * r * 0.19, -r * 0.09, r * 0.035, r * 0.035, '#ffffff')
  }
  // 송곳니
  ctx.fillStyle = '#fff6e8'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.07, r * 0.16)
    ctx.lineTo(s * r * 0.13, r * 0.16)
    ctx.lineTo(s * r * 0.10, r * 0.30)
    ctx.closePath()
    ctx.fill()
  }

  if (p.crown) {
    ctx.fillStyle = p.crown
    ctx.beginPath()
    ctx.moveTo(-r * 0.32, -r * 0.52)
    ctx.lineTo(-r * 0.20, -r * 0.98)
    ctx.lineTo(0, -r * 0.66)
    ctx.lineTo(r * 0.20, -r * 0.98)
    ctx.lineTo(r * 0.32, -r * 0.52)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** 두더지 — 장갑판과 발톱으로 '단단함'을 읽히게 */
function drawMole(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const dig = Math.sin(t * 9) * r * 0.08
  ctx.save()
  ctx.translate(x, y)
  groundShadow(ctx, r, 0.28, 0.28)
  if (Math.cos(angle) < 0) ctx.scale(-1, 1)

  fluff(ctx, 0, r * 0.16, r * 0.80, r * 0.62, 7, p.body, 5)
  ellipse(ctx, -r * 0.22, -r * 0.06, r * 0.42, r * 0.32, shade(p.body, 0.14))

  // 등껍질 장갑 — 판마다 하이라이트를 넣어 금속처럼
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, r * 0.16, r * 0.80, r * 0.62, 0, 0, Math.PI * 2)
  ctx.clip()
  for (let i = -1; i <= 1; i += 1) {
    ellipse(ctx, i * r * 0.42, -r * 0.14, r * 0.31, r * 0.25, p.armor)
    ellipse(ctx, i * r * 0.42 - r * 0.08, -r * 0.22, r * 0.18, r * 0.10, shade(p.armor, 0.28))
  }
  ctx.restore()

  ctx.strokeStyle = p.claw
  ctx.lineWidth = r * 0.115
  ctx.lineCap = 'round'
  for (const dy of [-0.10, 0.10, 0.30]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.70, r * (0.42 + dy * 0.4))
    ctx.quadraticCurveTo(r * 0.95, r * (0.34 + dy), r * (1.12 + dig / r), r * (0.28 + dy))
    ctx.stroke()
  }

  // 머리를 몸에서 떼어내 목을 만든다 — 안 그러면 그냥 돌덩이로 보인다
  ellipse(ctx, r * 0.58, r * 0.10, r * 0.40, r * 0.36, shade(p.body, -0.14))
  fluff(ctx, r * 0.66, r * 0.04, r * 0.34, r * 0.30, 5, shade(p.body, 0.10), 6)
  // 밝은 주둥이 — 얼굴이 어디인지 즉시 읽히게
  ellipse(ctx, r * 0.90, r * 0.12, r * 0.24, r * 0.17, shade(p.body, 0.30))
  ellipse(ctx, r * 1.02, r * 0.13, r * 0.14, r * 0.11, p.nose)
  ellipse(ctx, r * 0.99, r * 0.10, r * 0.055, r * 0.038, shade(p.nose, 0.35))

  // 눈 — 거의 감긴 실눈
  ctx.strokeStyle = '#15181d'
  ctx.lineWidth = r * 0.055
  ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.58, r * (0.00 + s * 0.11))
    ctx.lineTo(r * 0.78, r * (0.00 + s * 0.11))
    ctx.stroke()
  }

  // 대장 투구
  if (p.crest) {
    ctx.fillStyle = p.crest
    ctx.beginPath()
    ctx.ellipse(r * 0.12, -r * 0.36, r * 0.54, r * 0.34, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = shade(p.crest, 0.25)
    ctx.beginPath()
    ctx.ellipse(r * 0.02, -r * 0.44, r * 0.26, r * 0.13, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = p.crest
    ctx.fillRect(r * 0.07, -r * 0.86, r * 0.10, r * 0.46)
    ctx.beginPath()
    ctx.moveTo(r * 0.12, -r * 0.92)
    ctx.lineTo(r * 0.38, -r * 1.16)
    ctx.lineTo(r * 0.15, -r * 1.18)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

registerSprite('cat', drawCat)
registerSprite('rodent', drawRodent)
registerSprite('roach', drawRoach)
registerSprite('bat', drawBat)
registerSprite('mole', drawMole)

export { drawCat, drawRodent, drawRoach, drawBat, drawMole, shade }
