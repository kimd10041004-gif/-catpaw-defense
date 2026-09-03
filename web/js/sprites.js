/**
 * 캔버스 프리미티브로 그리는 스프라이트 — 이미지 파일이 하나도 없다.
 * 덕분에 APK 용량이 작고, 오프라인에서 로딩 실패가 날 여지가 없다.
 *
 * ▶ 새 모양을 추가하려면: 그리는 함수를 만들고 아래에서 registerSprite('키', 함수)로 등록한 뒤
 *   적/타워 정의의 sprite 필드에 그 키를 쓰면 된다.
 *
 * 모든 draw 함수의 계약:
 *   draw(ctx, o) — o = { x, y, r, palette, angle, t, flying, extra }
 *   x, y = 화면 픽셀 중심 / r = 화면 픽셀 반지름 / angle = 바라보는 방향(라디안) / t = 경과 시간(초)
 *   함수는 스스로 save/restore 하며, 호출자의 변환 상태를 바꾸지 않는다.
 */

import { registerSprite } from './content/registry.js'

/** 바닥 그림자 — 모든 캐릭터가 공중에 떠 보이지 않게 잡아준다 */
function shadow(ctx, r, squash = 0.32, alpha = 0.22) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(0, r * 0.82, r * 0.86, r * squash, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 채운 타원 한 방 */
function blob(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 고양이 — 모든 타워가 이 함수를 쓰고 팔레트로만 구분된다.
 * 몸은 항상 정면을 보고 앉아 있고, 눈동자와 몸의 기울기만 목표를 따라간다(타워답게 안정적으로 보이도록).
 * o.extra = { recoil: 0~1 발사 반동, patch: 삼색 무늬 여부 }
 */
function drawCat(ctx, o) {
  const { x, y, r, palette: p, angle = -Math.PI / 2, t = 0 } = o
  const recoil = (o.extra && o.extra.recoil) || 0
  const lean = Math.cos(angle) * 0.13 * r
  const bob = Math.sin(t * 2.2) * r * 0.03

  ctx.save()
  ctx.translate(x, y + bob)
  shadow(ctx, r)
  ctx.translate(lean - Math.cos(angle) * recoil * r * 0.12, -Math.sin(angle) * recoil * r * 0.12)

  // 꼬리 — 뒤쪽에서 살랑거린다
  ctx.save()
  ctx.strokeStyle = p.stripe || p.fur
  ctx.lineWidth = r * 0.20
  ctx.lineCap = 'round'
  const wag = Math.sin(t * 3.1) * 0.5
  ctx.beginPath()
  ctx.moveTo(-r * 0.55, r * 0.42)
  ctx.quadraticCurveTo(-r * (1.15 + wag * 0.12), r * (0.18 - wag * 0.2), -r * (0.92 + wag * 0.1), -r * (0.34 + wag * 0.16))
  ctx.stroke()
  ctx.restore()

  // 몸통
  blob(ctx, 0, r * 0.34, r * 0.68, r * 0.60, p.fur)
  blob(ctx, 0, r * 0.44, r * 0.40, r * 0.40, p.belly)

  // 삼색 무늬 (있는 팔레트만)
  if (p.patch) {
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, r * 0.34, r * 0.68, r * 0.60, 0, 0, Math.PI * 2)
    ctx.clip()
    blob(ctx, -r * 0.42, r * 0.10, r * 0.34, r * 0.30, p.patch)
    blob(ctx, r * 0.40, r * 0.55, r * 0.28, r * 0.26, p.stripe)
    ctx.restore()
  }

  // 앞발
  blob(ctx, -r * 0.30, r * 0.82, r * 0.19, r * 0.13, p.belly)
  blob(ctx, r * 0.30, r * 0.82, r * 0.19, r * 0.13, p.belly)

  // 머리
  const hy = -r * 0.36
  // 귀
  ctx.fillStyle = p.fur
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.52, hy - r * 0.18)
    ctx.lineTo(s * r * 0.70, hy - r * 0.76)
    ctx.lineTo(s * r * 0.20, hy - r * 0.48)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = p.ear || '#f2a6b3'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.48, hy - r * 0.26)
    ctx.lineTo(s * r * 0.60, hy - r * 0.62)
    ctx.lineTo(s * r * 0.30, hy - r * 0.44)
    ctx.closePath()
    ctx.fill()
  }

  blob(ctx, 0, hy, r * 0.62, r * 0.54, p.fur)

  // 이마 줄무늬
  if (p.stripe && !p.patch) {
    ctx.strokeStyle = p.stripe
    ctx.lineWidth = r * 0.07
    ctx.lineCap = 'round'
    for (const dx of [-0.16, 0, 0.16]) {
      ctx.beginPath()
      ctx.moveTo(dx * r, hy - r * 0.44)
      ctx.lineTo(dx * r * 1.5, hy - r * 0.22)
      ctx.stroke()
    }
  }

  // 눈 — 흰자 위 눈동자가 목표를 따라 움직인다
  const look = { x: Math.cos(angle) * r * 0.09, y: Math.sin(angle) * r * 0.07 }
  for (const s of [-1, 1]) {
    blob(ctx, s * r * 0.24, hy + r * 0.02, r * 0.155, r * 0.175, '#ffffff')
    blob(ctx, s * r * 0.24 + look.x, hy + r * 0.02 + look.y, r * 0.085, r * 0.115, p.eye || '#2f7d32')
    blob(ctx, s * r * 0.24 + look.x, hy + r * 0.02 + look.y, r * 0.038, r * 0.055, '#101418')
    blob(ctx, s * r * 0.24 + look.x - r * 0.03, hy - r * 0.03 + look.y, r * 0.028, r * 0.028, '#ffffff')
  }

  // 코와 입
  ctx.fillStyle = '#e58a97'
  ctx.beginPath()
  ctx.moveTo(0, hy + r * 0.22)
  ctx.lineTo(-r * 0.075, hy + r * 0.14)
  ctx.lineTo(r * 0.075, hy + r * 0.14)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(40,30,30,0.55)'
  ctx.lineWidth = r * 0.045
  ctx.beginPath()
  ctx.moveTo(0, hy + r * 0.22)
  ctx.lineTo(0, hy + r * 0.29)
  ctx.arc(-r * 0.08, hy + r * 0.29, r * 0.08, 0, Math.PI)
  ctx.moveTo(0, hy + r * 0.29)
  ctx.arc(r * 0.08, hy + r * 0.29, r * 0.08, Math.PI, 0, true)
  ctx.stroke()

  // 수염
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = r * 0.032
  for (const s of [-1, 1]) {
    for (const dy of [-0.04, 0.05, 0.14]) {
      ctx.beginPath()
      ctx.moveTo(s * r * 0.16, hy + r * 0.20)
      ctx.lineTo(s * r * 0.78, hy + r * (0.20 + dy))
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** 설치류 — 생쥐/시궁쥐/쥐왕이 공유한다. palette.crown이 있으면 왕관을 씌운다. */
function drawRodent(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const step = Math.sin(t * 12) * r * 0.06

  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r)
  ctx.rotate(Math.cos(angle) < 0 ? Math.PI : 0)
  ctx.scale(Math.cos(angle) < 0 ? -1 : 1, 1)

  // 꼬리
  ctx.strokeStyle = p.tail || p.body
  ctx.lineWidth = r * 0.13
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, r * 0.10)
  ctx.quadraticCurveTo(-r * 1.5, r * 0.05 + step, -r * 1.25, -r * 0.55)
  ctx.stroke()

  // 뒷다리
  blob(ctx, -r * 0.30, r * 0.62 + step, r * 0.20, r * 0.13, p.body)
  blob(ctx, r * 0.24, r * 0.62 - step, r * 0.20, r * 0.13, p.body)

  // 몸통
  blob(ctx, 0, r * 0.10, r * 0.72, r * 0.52, p.body)
  blob(ctx, r * 0.06, r * 0.26, r * 0.46, r * 0.30, p.belly)

  // 귀
  blob(ctx, -r * 0.16, -r * 0.40, r * 0.26, r * 0.26, p.body)
  blob(ctx, -r * 0.16, -r * 0.40, r * 0.15, r * 0.15, p.ear || '#e0a3ad')

  // 머리와 주둥이
  blob(ctx, r * 0.52, -r * 0.06, r * 0.42, r * 0.36, p.body)
  blob(ctx, r * 0.88, r * 0.04, r * 0.20, r * 0.15, p.belly)
  blob(ctx, r * 1.03, r * 0.05, r * 0.07, r * 0.06, '#e07a8a')

  // 눈
  blob(ctx, r * 0.58, -r * 0.14, r * 0.09, r * 0.09, '#15181d')
  blob(ctx, r * 0.61, -r * 0.17, r * 0.032, r * 0.032, '#ffffff')

  // 수염
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = r * 0.028
  for (const dy of [-0.06, 0.04]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.92, r * 0.02)
    ctx.lineTo(r * 1.42, r * (0.02 + dy))
    ctx.stroke()
  }

  // 보스 왕관
  if (p.crown) {
    ctx.fillStyle = p.crown
    ctx.beginPath()
    ctx.moveTo(r * 0.22, -r * 0.44)
    ctx.lineTo(r * 0.34, -r * 0.78)
    ctx.lineTo(r * 0.50, -r * 0.52)
    ctx.lineTo(r * 0.66, -r * 0.86)
    ctx.lineTo(r * 0.80, -r * 0.50)
    ctx.lineTo(r * 0.80, -r * 0.36)
    ctx.lineTo(r * 0.22, -r * 0.30)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** 바퀴 — 다리를 빠르게 움직인다 */
function drawRoach(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r, 0.28, 0.18)
  ctx.rotate(angle)

  ctx.strokeStyle = p.leg
  ctx.lineWidth = r * 0.10
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i += 1) {
    const w = Math.sin(t * 22 + i * 1.7) * r * 0.24
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(i * r * 0.34, s * r * 0.22)
      ctx.lineTo(i * r * 0.34 + w, s * r * 0.78)
      ctx.stroke()
    }
  }

  ctx.strokeStyle = p.leg
  ctx.lineWidth = r * 0.07
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.55, s * r * 0.16)
    ctx.quadraticCurveTo(r * 1.05, s * r * 0.40, r * 1.25, s * r * 0.16)
    ctx.stroke()
  }

  blob(ctx, 0, 0, r * 0.86, r * 0.58, p.body)
  blob(ctx, -r * 0.12, 0, r * 0.62, r * 0.44, p.shell)
  ctx.strokeStyle = p.leg
  ctx.lineWidth = r * 0.06
  ctx.beginPath()
  ctx.moveTo(-r * 0.70, 0)
  ctx.lineTo(r * 0.45, 0)
  ctx.stroke()
  ctx.restore()
}

/** 박쥐 — 날개가 펄럭이고, 공중이라 그림자를 멀리 둔다 */
function drawBat(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const flap = Math.sin(t * 11)
  ctx.save()
  ctx.translate(x, y)

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(0, r * 1.55, r * 0.62, r * 0.20, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.rotate(Math.cos(angle) < 0 ? Math.PI : 0)
  ctx.scale(Math.cos(angle) < 0 ? -1 : 1, 1)

  ctx.fillStyle = p.wing
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.10)
    ctx.quadraticCurveTo(s * r * 0.85, -r * (0.70 + flap * 0.45), s * r * 1.45, -r * (0.05 + flap * 0.35))
    ctx.quadraticCurveTo(s * r * 1.00, r * (0.25 - flap * 0.10), s * r * 0.78, r * 0.02)
    ctx.quadraticCurveTo(s * r * 0.60, r * (0.30 - flap * 0.10), s * r * 0.38, r * 0.04)
    ctx.closePath()
    ctx.fill()
  }

  blob(ctx, 0, 0, r * 0.42, r * 0.48, p.body)
  ctx.fillStyle = p.body
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * r * 0.10, -r * 0.36)
    ctx.lineTo(s * r * 0.30, -r * 0.86)
    ctx.lineTo(s * r * 0.38, -r * 0.30)
    ctx.closePath()
    ctx.fill()
  }
  for (const s of [-1, 1]) blob(ctx, s * r * 0.16, -r * 0.06, r * 0.09, r * 0.09, p.eye)
  ctx.restore()
}

/** 두더지 — 등껍질 장갑과 큰 발톱으로 "단단해 보이게" */
function drawMole(ctx, o) {
  const { x, y, r, palette: p, angle = 0, t = 0 } = o
  const dig = Math.sin(t * 9) * r * 0.08
  ctx.save()
  ctx.translate(x, y)
  shadow(ctx, r, 0.30, 0.24)
  ctx.rotate(Math.cos(angle) < 0 ? Math.PI : 0)
  ctx.scale(Math.cos(angle) < 0 ? -1 : 1, 1)

  blob(ctx, 0, r * 0.16, r * 0.80, r * 0.62, p.body)

  // 등껍질 장갑판
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, r * 0.16, r * 0.80, r * 0.62, 0, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = p.armor
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath()
    ctx.ellipse(i * r * 0.42, -r * 0.14, r * 0.30, r * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 발톱
  ctx.strokeStyle = p.claw
  ctx.lineWidth = r * 0.11
  ctx.lineCap = 'round'
  for (const dy of [-0.10, 0.10, 0.30]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.70, r * (0.42 + dy * 0.4))
    ctx.lineTo(r * (1.10 + dig / r), r * (0.30 + dy))
    ctx.stroke()
  }

  // 얼굴
  blob(ctx, r * 0.62, r * 0.06, r * 0.34, r * 0.30, p.body)
  blob(ctx, r * 0.95, r * 0.12, r * 0.14, r * 0.11, p.nose)
  ctx.strokeStyle = '#15181d'
  ctx.lineWidth = r * 0.05
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(r * 0.58, r * (0.02 + s * 0.09))
    ctx.lineTo(r * 0.74, r * (0.02 + s * 0.09))
    ctx.stroke()
  }
  ctx.restore()
}

registerSprite('cat', drawCat)
registerSprite('rodent', drawRodent)
registerSprite('roach', drawRoach)
registerSprite('bat', drawBat)
registerSprite('mole', drawMole)

export { drawCat, drawRodent, drawRoach, drawBat, drawMole }
