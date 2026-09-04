/**
 * 화면 배경 발주서 — 9:14 구도 시안 3장.
 *
 * ── 왜 시안 그림인가 ────────────────────────────────────────────────────────
 * 다른 발주서는 격자에 칸을 그려 보냈다. 배경에는 그 방식이 안 통한다:
 *
 *   · 생성기는 준 그림의 **가로세로 비율을 지키고 넓이만 1.05MP 로 맞춘다.**
 *     그래서 안내판 모양(가로형) 시트를 보내면 가로형 안내판이 돌아온다.
 *   · 배경에는 '칸 밖'이 없다. 안내 글씨를 넣으면 그 글씨가 그림 안에 그려진다.
 *
 * 그래서 **글씨가 한 자도 없는 9:14 구도 시안**을 그린다. 색·덩어리·명암만 있는
 * 거친 그림이라, 생성기는 그것을 '다듬어야 할 밑그림'으로 읽는다. UI 가 덮는
 * 자리는 시안에서 미리 어둡게 깔아 둔다 — 말로 "비워 주세요"라고 하는 대신
 * 어두운 띠로 보여주면 결과도 그렇게 나온다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/bg-spec.mjs
 *
 * 결과물
 *   tools/out/26-bg-title.png    타이틀 화면 시안
 *   tools/out/26-bg-select.png   맵/챕터 선택 시안
 *   tools/out/26-bg-story.png    컷신 시안
 *   tools/out/26-bg-order.txt    같이 붙여넣을 글 (시안만으로 안 되는 것)
 */
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'tools/out')
mkdirSync(outDir, { recursive: true })

/** 받아야 할 크기. 생성기가 넓이는 1.05MP 로 줄이겠지만 비율은 이대로 온다. */
const W = 1152, H = 1792

/** UI 가 덮는 자리 (화면 높이의 비율). 시안에서 미리 어둡게 깐다. */
const COVER = {
  title: [[0.10, 0.28], [0.46, 0.80]],   // 로고 · 버튼 네 개
  select: [[0.14, 0.96]],                // 카드 목록이 거의 다 덮는다
  story: [[0.30, 0.52], [0.55, 0.92]],   // 화자 그림 · 대사 상자
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 })

try {
  await page.goto('about:blank')
  const made = await page.evaluate(({ W, H, COVER }) => {
    const out = {}
    const mk = () => {
      const cv = document.createElement('canvas')
      cv.width = W; cv.height = H
      return [cv, cv.getContext('2d')]
    }
    /** 세로 그라디언트 */
    const vgrad = (c, stops) => {
      const g = c.createLinearGradient(0, 0, 0, H)
      for (const [at, col] of stops) g.addColorStop(at, col)
      return g
    }
    /** 들쭉날쭉한 건물 실루엣 한 줄 */
    const skyline = (c, baseY, h, color, seed, step) => {
      let r = seed
      const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648
      c.fillStyle = color
      c.beginPath()
      c.moveTo(0, H)
      let x = -40
      while (x < W + 40) {
        const w = step * (0.6 + rnd() * 0.9)
        const top = baseY - h * (0.35 + rnd() * 0.65)
        c.lineTo(x, top); c.lineTo(x + w, top)
        x += w
      }
      c.lineTo(W + 40, H); c.closePath(); c.fill()
      return rnd
    }
    /** 창문 불빛 — 실루엣 위에 흩뿌린다 */
    const windows = (c, y0, y1, n, seed, color, size) => {
      let r = seed
      const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648
      c.fillStyle = color
      for (let i = 0; i < n; i += 1) {
        c.globalAlpha = 0.35 + rnd() * 0.6
        c.fillRect(rnd() * W, y0 + rnd() * (y1 - y0), size, size * 1.4)
      }
      c.globalAlpha = 1
    }
    /** UI 가 덮을 자리를 어둡게 — "여기는 단순하게"를 그림으로 말한다 */
    const dim = (c, bands) => {
      for (const [a, z] of bands) {
        const g = c.createLinearGradient(0, H * a, 0, H * z)
        // 0.62 로 찍었더니 가로 줄무늬처럼 보였다 — 생성기가 그 줄을 그대로 그린다.
        // 분위기 있는 어둠 정도로만 남기고, '비워 달라'는 말은 같이 보내는 글이 한다.
        g.addColorStop(0, 'rgba(4,7,12,0)')
        g.addColorStop(0.30, 'rgba(4,7,12,.24)')
        g.addColorStop(0.70, 'rgba(4,7,12,.24)')
        g.addColorStop(1, 'rgba(4,7,12,0)')
        c.fillStyle = g
        c.fillRect(0, H * a, W, H * (z - a))
      }
    }

    // ── 1. 타이틀 — 밤 지붕 위에서 도시를 내려다보는 고양이 ────────────────
    {
      const [cv, c] = mk()
      c.fillStyle = vgrad(c, [[0, '#16233a'], [0.40, '#25344c'], [0.70, '#6b4a3e'], [1, '#2c3242']])
      c.fillRect(0, 0, W, H)
      // 달무리
      const halo = c.createRadialGradient(W * 0.74, H * 0.12, 10, W * 0.74, H * 0.12, W * 0.5)
      halo.addColorStop(0, 'rgba(255,214,150,.30)')
      halo.addColorStop(1, 'rgba(255,214,150,0)')
      c.fillStyle = halo; c.fillRect(0, 0, W, H)
      // 먼 도시 → 가까운 지붕
      skyline(c, H * 0.72, H * 0.20, '#1d2838', 7, 90)
      windows(c, H * 0.56, H * 0.70, 150, 11, '#ffcf87', 7)
      skyline(c, H * 0.84, H * 0.16, '#141c29', 23, 150)
      windows(c, H * 0.72, H * 0.82, 70, 29, '#ffb765', 9)
      // 안개
      const mist = c.createLinearGradient(0, H * 0.58, 0, H * 0.86)
      mist.addColorStop(0, 'rgba(160,180,205,0)')
      mist.addColorStop(0.5, 'rgba(160,180,205,.13)')
      mist.addColorStop(1, 'rgba(160,180,205,0)')
      c.fillStyle = mist; c.fillRect(0, H * 0.58, W, H * 0.28)
      // 앞쪽 지붕면 + 앉은 고양이 실루엣
      c.fillStyle = '#0e131d'
      c.beginPath(); c.moveTo(0, H * 0.93); c.lineTo(W, H * 0.89); c.lineTo(W, H); c.lineTo(0, H); c.fill()
      const cx = W * 0.30, cy = H * 0.885, s = H * 0.075
      c.beginPath()
      c.ellipse(cx, cy, s * 0.62, s * 0.78, 0, 0, Math.PI * 2)                 // 몸
      c.moveTo(cx + s * 0.30, cy - s * 0.62)
      c.ellipse(cx + s * 0.20, cy - s * 0.85, s * 0.42, s * 0.40, 0, 0, Math.PI * 2)  // 머리
      c.fill()
      c.beginPath()                                                            // 귀
      c.moveTo(cx - s * 0.06, cy - s * 1.12); c.lineTo(cx + s * 0.10, cy - s * 1.55); c.lineTo(cx + s * 0.26, cy - s * 1.10)
      c.moveTo(cx + s * 0.30, cy - s * 1.10); c.lineTo(cx + s * 0.48, cy - s * 1.48); c.lineTo(cx + s * 0.58, cy - s * 1.02)
      c.fill()
      c.strokeStyle = '#0e131d'; c.lineWidth = s * 0.16; c.lineCap = 'round'   // 꼬리
      c.beginPath(); c.moveTo(cx - s * 0.55, cy + s * 0.55)
      c.quadraticCurveTo(cx - s * 1.30, cy + s * 0.60, cx - s * 1.15, cy - s * 0.35)
      c.stroke()
      dim(c, COVER.title)
      out.title = cv.toDataURL('image/png')
    }

    // ── 2. 맵/챕터 선택 — 같은 동네를 멀리서. 큰 형태만 ────────────────────
    {
      const [cv, c] = mk()
      c.fillStyle = vgrad(c, [[0, '#1b2c4a'], [0.34, '#2d4064'], [0.64, '#5a5570'], [1, '#241f2c']])
      c.fillRect(0, 0, W, H)
      // 달. 첫 판에서 위쪽 3분의 1이 텅 비어 보였다 — 생성기가 기댈 것이 없으면
      // 그 자리를 제 마음대로 채운다. 걸어 둘 것을 하나 준다.
      const moon = c.createRadialGradient(W * 0.30, H * 0.15, 8, W * 0.30, H * 0.15, W * 0.46)
      moon.addColorStop(0, 'rgba(255,240,214,.32)')
      moon.addColorStop(1, 'rgba(255,240,214,0)')
      c.fillStyle = moon; c.fillRect(0, 0, W, H)
      c.fillStyle = '#f6e9cb'
      c.beginPath(); c.arc(W * 0.30, H * 0.15, W * 0.055, 0, Math.PI * 2); c.fill()
      // 겹겹이 멀어지는 스카이라인. 뒤쪽을 밝게 둔다(공기원근) — 층이 갈려 보인다
      skyline(c, H * 0.52, H * 0.26, '#2b3b57', 3, 130)
      windows(c, H * 0.34, H * 0.50, 70, 5, '#ffdca4', 9)
      skyline(c, H * 0.70, H * 0.22, '#1e2b40', 41, 190)
      windows(c, H * 0.56, H * 0.68, 45, 43, '#ffc47a', 11)
      skyline(c, H * 0.90, H * 0.18, '#131c2a', 61, 260)
      // 켜켜이 낀 안개 + 바닥 가로등 번짐. 아래쪽이 그냥 검은 판이 되는 것을 막는다
      const haze = c.createLinearGradient(0, H * 0.44, 0, H * 0.78)
      haze.addColorStop(0, 'rgba(150,175,210,0)')
      haze.addColorStop(0.5, 'rgba(150,175,210,.14)')
      haze.addColorStop(1, 'rgba(150,175,210,0)')
      c.fillStyle = haze; c.fillRect(0, H * 0.44, W, H * 0.34)
      const street = c.createLinearGradient(0, H * 0.80, 0, H)
      street.addColorStop(0, 'rgba(255,190,120,0)')
      street.addColorStop(1, 'rgba(255,190,120,.16)')
      c.fillStyle = street; c.fillRect(0, H * 0.80, W, H * 0.20)
      dim(c, COVER.select)
      out.select = cv.toDataURL('image/png')
    }

    // ── 3. 컷신 — 인물 없는 실내 한구석 ────────────────────────────────────
    {
      const [cv, c] = mk()
      c.fillStyle = vgrad(c, [[0, '#2b3446'], [0.55, '#1e2532'], [1, '#151b25']])
      c.fillRect(0, 0, W, H)
      // 벽과 바닥이 갈리는 선
      const floorY = H * 0.62
      c.fillStyle = '#232b3a'
      c.fillRect(0, floorY, W, H - floorY)
      // 창문에서 비스듬히 들어오는 빛
      c.save()
      c.fillStyle = '#2b3444'
      c.fillRect(W * 0.60, H * 0.10, W * 0.30, H * 0.26)     // 창틀
      c.fillStyle = '#4a5a72'
      c.fillRect(W * 0.62, H * 0.12, W * 0.26, H * 0.22)     // 유리
      c.strokeStyle = '#1b212d'; c.lineWidth = 10
      c.beginPath()
      c.moveTo(W * 0.75, H * 0.12); c.lineTo(W * 0.75, H * 0.34)
      c.moveTo(W * 0.62, H * 0.23); c.lineTo(W * 0.88, H * 0.23)
      c.stroke()
      // 바닥에 떨어진 빛 웅덩이
      const beam = c.createLinearGradient(W * 0.75, H * 0.12, W * 0.35, floorY + H * 0.14)
      beam.addColorStop(0, 'rgba(190,210,240,.22)')
      beam.addColorStop(1, 'rgba(190,210,240,0)')
      c.fillStyle = beam
      c.beginPath()
      c.moveTo(W * 0.62, H * 0.34); c.lineTo(W * 0.88, H * 0.34)
      c.lineTo(W * 0.58, floorY + H * 0.20); c.lineTo(W * 0.20, floorY + H * 0.14)
      c.closePath(); c.fill()
      c.restore()
      // 왼쪽 구석에 놓인 큰 덩어리 — 가구·상자 정도의 암시
      c.fillStyle = '#10151d'
      c.fillRect(0, H * 0.36, W * 0.26, floorY - H * 0.36)
      c.fillStyle = '#0d1219'
      c.fillRect(W * 0.05, floorY - H * 0.10, W * 0.16, H * 0.10)
      // 구석 어둠
      const vig = c.createRadialGradient(W * 0.5, H * 0.42, H * 0.10, W * 0.5, H * 0.5, H * 0.72)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,.38)')
      c.fillStyle = vig; c.fillRect(0, 0, W, H)
      dim(c, COVER.story)
      out.story = cv.toDataURL('image/png')
    }

    return out
  }, { W, H, COVER })

  const save = async (name, dataUrl) => {
    await writeFile(join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(`  ${name}   ${W}\u00d7${H} (9:14)`)
  }
  console.log('\uc2dc\uc548 3\uc7a5 \u2014 \uae00\uc528 \uc5c6\uc74c. \uadf8\ub300\ub85c \uc0dd\uc131\uae30\uc5d0 \ub123\uc73c\uc138\uc694')
  await save('26-bg-title.png', made.title)
  await save('26-bg-select.png', made.select)
  await save('26-bg-story.png', made.story)

  const txt = [
    '\ud654\uba74 \ubc30\uacbd 3\uc7a5 \u2014 \uc2dc\uc548\uacfc \uac19\uc774 \ubd99\uc5ec\ub123\uc744 \uae00',
    '',
    '\u203b 26-bg-*.png \ub294 \uad6c\ub3c4 \uc2dc\uc548\uc785\ub2c8\ub2e4. \uadf8\ub9bc\uc744 \ub123\uace0 \uc544\ub798 \uae00\uc744 \uac19\uc774 \uc8fc\uc138\uc694.',
    '  \uc2dc\uc548\uc758 \uc5b4\ub450\uc6b4 \ub760\ub294 \ubc84\ud2bc\u00b7\uce74\ub4dc\uac00 \ub36e\ub294 \uc790\ub9ac\uc785\ub2c8\ub2e4 \u2014 \uadf8\ub300\ub85c \uc5b4\ub461\uac8c \ub450\uc138\uc694.',
    '',
    '\u2500\u2500 \uc138 \uc7a5 \ubaa8\ub450 \u2500\u2500',
    '  \u00b7 \uc138\ub85c 9:14 \ube44\uc728 \uadf8\ub300\ub85c. \uc2dc\uc548\uacfc \uac19\uc740 \ube44\uc728\ub85c \ub9cc\ub4e4\uc5b4 \uc8fc\uc138\uc694',
    '  \u00b7 \ud55c \ubc88\uc5d0 \ud55c \uc7a5\uc529',
    '  \u00b7 \uadf8\ub9bc \uc548\uc5d0 \uae00\uc528\u00b7\ub85c\uace0\u00b7\ubc84\ud2bc\uc744 \uadf8\ub9ac\uc9c0 \ub9c8\uc138\uc694',
    '  \u00b7 \uc5b4\ub461\uace0 \ub300\ube44\ub97c \ub0ae\uac8c. \uc704\uc5d0 \ud770 \uae00\uc528\uac00 \uc62c\ub77c\uac11\ub2c8\ub2e4',
    '',
    '\u2500\u2500 1. 26-bg-title.png \u2500\u2500',
    '  \ubc24\uc911\uc758 \ub4b7\uace8\ubaa9. \ub0ae\uc740 \uc9c0\ubd95 \uc704\uc5d0 \uace0\uc591\uc774 \ud55c \ub9c8\ub9ac\uac00 \uc549\uc544 \ub3c4\uc2dc\ub97c',
    '  \ub0b4\ub824\ub2e4\ubcf4\ub294 \uc2e4\ub8e8\uc5e3. \uba40\ub9ac \ucc3d\ubb38 \ubd88\ube5b\uacfc \uac00\ub85c\ub4f1, \uc605\uc740 \uc548\uac1c.',
    '  \ub530\ub73b\ud55c \uc8fc\ud669\uacfc \uc9d9\uc740 \ub0a8\uc0c9. \uc2dc\uc548\uc758 \uad6c\ub3c4\ub97c \uc720\uc9c0\ud574 \uc8fc\uc138\uc694.',
    '',
    '\u2500\u2500 2. 26-bg-select.png \u2500\u2500',
    '  \uac19\uc740 \ub3d9\ub124\ub97c \uba40\ub9ac\uc11c \ubcf8 \ubc24 \ud48d\uacbd. \uc544\uc8fc \ub2e8\uc21c\ud558\uac8c \u2014 \ud070 \ud615\ud0dc\uc640 \uc0c9\ub9cc,',
    '  \ub514\ud14c\uc77c\uc740 \ube7c \uc8fc\uc138\uc694. \ud654\uba74\uc758 \ub300\ubd80\ubd84\uc744 \uce74\ub4dc\uac00 \ub36e\uc2b5\ub2c8\ub2e4.',
    '',
    '\u2500\u2500 3. 26-bg-story.png \u2500\u2500',
    '  \uc774\uc57c\uae30 \ud55c \uc7a5\uba74. \uc778\ubb3c\uc774\ub098 \ub3d9\ubb3c\uc740 \uadf8\ub9ac\uc9c0 \ub9c8\uc138\uc694 \u2014 \uc7a5\uc18c\ub9cc.',
    '  \ubd80\uc5cc \ud55c\uad6c\uc11d\uc774\ub098 \uc5b4\ub450\uc6b4 \uc9c0\ud558\uc2e4 \uac19\uc740, \uc0ac\uac74\uc774 \uc77c\uc5b4\ub0a0 \uac83 \uac19\uc740 \ube48 \uacf5\uac04.',
    '  \ucc3d\ubb38\uc5d0\uc11c \ube5b\uc774 \ube44\uc2a4\ub4ec\ud788 \ub4e4\uc5b4\uc624\uac8c. \uc704\ucabd 3\ubd84\uc758 1\uc5d0 \ubcfc\uac70\ub9ac\ub97c \ub450\uc138\uc694.',
    '',
  ].join('\n')
  await writeFile(join(outDir, '26-bg-order.txt'), txt, 'utf8')
  console.log('  26-bg-order.txt')
} finally {
  await browser.close()
}
