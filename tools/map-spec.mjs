/**
 * 지도 발주서 — 바닥 질감 6종.
 *
 * ── 왜 다시 만드는가 ────────────────────────────────────────────────────────
 * 2차 발주서(18-map-spec-*.png)를 보내 놓고 캐릭터 발주를 여덟 번 돌리면서
 * 그 발주서의 문제 둘을 알게 됐다.
 *
 *   1. **배경 3종은 이 방식으로 못 받는다.** 생성기는 내가 준 시트를 *재현*한다
 *      (가로세로 비율을 지키고 넓이만 1.05MP 로 맞춘다). 그런데 배경 발주서는
 *      772×670 가로형이었고 받아야 할 것은 1152×1792 세로형이다. 그대로 보내면
 *      가로형 안내판 그림이 돌아온다. → 배경은 **글로 주문한다**
 *      (tools/out/24-bg-order.txt).
 *   2. **바닥 칸이 250×150 직사각형이었다.** 이어붙일 질감은 정사각이어야 한다.
 *
 * ── 이 발주서가 지키는 것 ───────────────────────────────────────────────────
 *   · 칸은 정사각. 6칸 한 장
 *   · 금지 사항("길을 그리지 마세요")을 **글이 아니라 그림으로** 보여준다 —
 *     1차 바닥 시트가 폐기된 원인이 정확히 이것이다
 *   · 이어붙임이 뭔지도 그림으로 보여준다 (실제 길 질감을 2×2 로 깐다)
 *   · 글씨가 칸 폭을 넘으면 만들다가 멈춘다
 *   · 격자 비율 f 와 예상 셀 크기를 찍는다 (셀 = sqrt(1.05e6 × f / n))
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/map-spec.mjs
 *
 * 결과물
 *   tools/out/24-map-spec-floors.png   바닥 질감 6종 (시트 한 장)
 *   tools/out/24-bg-order.txt          화면 배경 3장 (붙여넣을 글)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'web')
const outDir = join(root, 'tools/out')
mkdirSync(outDir, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
}

const server = await new Promise((resolve) => {
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (p === '/' || p.endsWith('/')) p += 'index.html'
      const file = join(webRoot, normalize(p).replace(/^(\.\.[/\\])+/, ''))
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch { res.writeHead(404); res.end('not found') }
  })
  s.listen(0, '127.0.0.1', () => resolve(s))
})

/* 재질은 1차 바닥 시트에서 사용자가 고른 것을 이어받았다 — 재질 선택은 좋았고
 * 못 쓴 이유는 크기와 구워진 길 때문이지 재질 때문이 아니었다.
 * 길 재질은 실제로 받은 art/path-*.png 를 눈으로 확인해 적었다. */
const FLOORS = [
  { id: 'alley',     path: '회색 자갈 블록',   floor: '젖은 아스팔트',
    note: '무늬 거의 없이. 얼룩과 물기만' },
  { id: 'kitchen',   path: '파란 무늬 타일',   floor: '흑백 체크 타일',
    note: '무늬 없는 민무늬 정사각 타일' },
  { id: 'rooftop',   path: '주황 기와',        floor: '회색 벽돌 옥상 바닥',
    note: '평평하게 깐 벽돌. 기와와 색이 확 달라야 함' },
  { id: 'warehouse', path: '밝은 나무 판자',   floor: '매끈한 회색 콘크리트',
    note: '결이 없어야 나무 길과 구분됨' },
  { id: 'basement',  path: '어두운 돌 블록',   floor: '축축한 콘크리트',
    note: '물자국과 곰팡이 얼룩. 돌 줄눈은 넣지 말 것' },
  { id: 'attic',     path: '어두운 나무 판자', floor: '먼지 쌓인 낡은 합판',
    note: '판자 결 없이 뿌옇게. 나무 길과 구분되게 밝기를 올릴 것' },
]

/* 화면 배경 3장 — **글로 주문한다.**
 *
 * 생성기는 준 시트를 재현한다(비율을 지키고 넓이만 1.05MP 로 맞춘다). 그래서
 * 세로 9:14 배경을 가로형 안내판 시트로 주문하면 가로형 안내판이 돌아온다.
 * 지난 2차 발주서(772×670)가 정확히 그 상태였다. 시트를 세로 9:14 로 만들어도
 * 안내 글씨가 그림 안에 그대로 그려져 나온다 — 배경은 칸 밖이라는 게 없다.
 *
 * 그래서 배경만은 붙여넣을 글로 준다. UI 가 덮는 자리는 비율로 적는다.        */
const BGS = [
  { id: 'title', name: '타이틀 화면',
    mood: '밤중의 뒷골목. 낮은 지붕 위에 고양이 한 마리가 앉아 도시를 내려다보는 실루엣. '
        + '멀리 창문 불빛과 가로등, 옅은 안개. 따뜻한 주황과 짙은 남색.',
    keep: '위에서 10~28% (로고)와 46~80% (버튼 네 개)에 글씨와 버튼이 얹힙니다. '
        + '그 두 띠는 어둡고 단순하게 비워 주세요.' },
  { id: 'select', name: '맵 / 챕터 선택',
    mood: '같은 세계를 멀리서 본 넓은 풍경. 골목·지붕·창고가 이어진 밤의 동네. '
        + '아주 단순하게 — 큰 형태와 색만 남기고 디테일은 빼 주세요.',
    keep: '카드 목록이 화면의 14~96% 를 거의 다 덮습니다. 대부분 안 보입니다.' },
  { id: 'story', name: '컷신 배경',
    mood: '이야기 한 장면. **인물이나 동물은 그리지 마세요** — 장소만. '
        + '부엌 한구석이나 어두운 지하실 같은, 사건이 일어날 것 같은 빈 공간.',
    keep: '아래 55~92% 를 대사 상자가 덮고, 30~52% 에 화자 그림이 얹힙니다. '
        + '위쪽 3분의 1에 볼거리를 두세요.' },
]

const BG_COMMON = [
  '세로 1152 × 1792 (9:14). 생성기에 세로 비율을 지정해 주세요',
  '한 번에 한 장씩. 세 장을 같이 만들면 한 장당 해상도가 3분의 1이 됩니다',
  '그림 안에 글씨·로고·UI 를 그리지 마세요. 그건 코드가 얹습니다',
  '어둡고 대비를 낮게. 위에 흰 글씨가 올라갑니다',
  '잘림 걱정 없이 화면을 꽉 채워 그리세요',
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })

  const made = await page.evaluate(async ({ FLOORS }) => {
    const reg = window.__catpaw.__registry
    const byId = Object.fromEntries(reg.listMaps().map((m) => [m.id, m]))

    /** 이미 받은 길 질감을 참고로 싣는다 — 바닥은 이것과 확실히 달라야 한다 */
    const loadImg = (src) => new Promise((res) => {
      const im = new Image()
      im.onload = () => res(im); im.onerror = () => res(null)
      im.src = src
    })
    const pathImg = {}
    for (const f of FLOORS) pathImg[f.id] = await loadImg(`art/path-${f.id}.png`)

    const overflow = []
    const CELL = 300, PAD = 22, COLS = 3
    const ROWS = Math.ceil(FLOORS.length / COLS)
    const W = PAD * 2 + CELL * COLS
    const S = W / 1158                        // 지난 시트에서 읽히던 글씨 크기 기준
    const u = (n) => Math.round(n * S)

    const rules = [
      `★ 결과는 ${ROWS}행 × ${COLS}열, 총 ${FLOORS.length}칸짜리 한 장입니다`,
      '★ 칸은 정사각형. 각 칸이 이어붙일 질감 한 장입니다',
      '★ 길을 그리지 마세요 — 아래 ✗ 예를 보세요. 길은 코드가 위에 얹습니다',
      '★ 상하좌우가 맞물려야 합니다 — 아래 이어붙임 예를 보세요',
      '★ 무늬는 작고 고르게. 큰 물건(상자 하나·웅덩이 하나)은 넣지 마세요',
      '★ 칸 안에 숫자·글씨를 넣지 마세요. 설명은 격자 밖에만',
      '칸 왼쪽 위 작은 그림이 그 맵의 길입니다. 바닥은 그것과 확실히 구분되게',
      '한 장이 화면에서 2칸을 덮고 4×7회 반복됩니다',
    ]
    const RULE_COLS = 2
    const hRules = Math.ceil(rules.length / RULE_COLS) * u(27)
    const DEMO = Math.round(CELL * 0.62)
    const hHead = PAD + u(38) + u(26) + u(18) + hRules + u(22) + u(22) + DEMO + u(30) + u(50)
    const ROWLAB = u(52)
    const H = hHead + ROWS * (ROWLAB + CELL) + PAD

    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#3f3f3f'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'left'

    function say(s, x, y, size, color, weight = '500', align = 'left', mono = false, max = 0) {
      ctx.textAlign = align; ctx.fillStyle = color
      ctx.font = `${weight} ${size}px ${mono ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`
      if (max > 0 && ctx.measureText(s).width > max) {
        overflow.push(`${Math.round(ctx.measureText(s).width)}>${Math.round(max)}  ${s}`)
      }
      ctx.fillText(s, x, y)
    }

    let y = PAD + u(32)
    say('지도 발주서 — 바닥 질감 6종', PAD, y, u(27), '#ffffff', '700')
    y += u(26)
    say('길과 소품은 이미 받아서 게임에 들어갔습니다. 이제 그 아래 깔릴 바닥입니다.',
      PAD, y, u(15), '#c9c9c9', '600')
    y += u(18)

    rules.forEach((line, i) => {
      const col = (i / Math.ceil(rules.length / RULE_COLS)) | 0
      const row = i % Math.ceil(rules.length / RULE_COLS)
      say(line, PAD + col * ((W - PAD * 2) / RULE_COLS), y + row * u(27), u(15),
        line.startsWith('★') ? '#ffd166' : '#c2c2c2', line.startsWith('★') ? '700' : '500',
        'left', false, (W - PAD * 2) / RULE_COLS - u(14))
    })
    y += hRules + u(22)

    // ── 그림으로 보여주는 두 가지 ──────────────────────────────────────────
    // 지난 바닥 시트는 "길을 그리지 마세요"를 글로만 적어서 무시당했다.
    const demoSrc = pathImg.alley
    const bx = PAD
    say('이어붙임이란 (실제 길 질감)', bx, y, u(14), '#8fd6b4', '700')
    say('✗ 이렇게 길을 그리면 안 됩니다', bx + DEMO + u(30), y, u(14), '#ff9f9f', '700')
    say('✓ 무늬만 고르게', bx + DEMO * 2 + u(60), y, u(14), '#8fd6b4', '700')
    y += u(22)

    // (1) 2×2 로 깔아 이음매를 보여준다
    if (demoSrc) {
      const half = DEMO / 2
      for (let j = 0; j < 2; j += 1) {
        for (let i = 0; i < 2; i += 1) ctx.drawImage(demoSrc, bx + i * half, y + j * half, half, half)
      }
      ctx.strokeStyle = '#8fd6b4'; ctx.lineWidth = Math.max(1, u(2)); ctx.setLineDash([7, 6])
      ctx.beginPath()
      ctx.moveTo(bx + half, y); ctx.lineTo(bx + half, y + DEMO)
      ctx.moveTo(bx, y + half); ctx.lineTo(bx + DEMO, y + half)
      ctx.stroke(); ctx.setLineDash([])
    }

    // (2) 길이 구워진 나쁜 예 — 바닥색 위에 길 띠를 그려서 보여준다
    const x2 = bx + DEMO + u(30)
    ctx.fillStyle = byId.alley.theme.ground
    ctx.fillRect(x2, y, DEMO, DEMO)
    if (demoSrc) {
      ctx.save()
      ctx.beginPath(); ctx.rect(x2, y + DEMO * 0.34, DEMO, DEMO * 0.32); ctx.clip()
      const half = DEMO / 2
      for (let i = 0; i < 2; i += 1) ctx.drawImage(demoSrc, x2 + i * half, y + DEMO * 0.28, half, half)
      ctx.restore()
    }
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = Math.max(3, u(5))
    ctx.beginPath()
    ctx.moveTo(x2 + DEMO * 0.12, y + DEMO * 0.12); ctx.lineTo(x2 + DEMO * 0.88, y + DEMO * 0.88)
    ctx.moveTo(x2 + DEMO * 0.88, y + DEMO * 0.12); ctx.lineTo(x2 + DEMO * 0.12, y + DEMO * 0.88)
    ctx.stroke()

    // (3) 좋은 예 — 길 없이 무늬만
    const x3 = bx + DEMO * 2 + u(60)
    ctx.fillStyle = byId.alley.theme.ground
    ctx.fillRect(x3, y, DEMO, DEMO)
    ctx.save()
    ctx.globalAlpha = 0.5
    for (let i = 0; i < 220; i += 1) {
      const rx = x3 + Math.random() * DEMO, ry = y + Math.random() * DEMO
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.16)'
      ctx.beginPath(); ctx.ellipse(rx, ry, DEMO * 0.035, DEMO * 0.022, Math.random() * 3, 0, 6.3)
      ctx.fill()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
    for (const x of [bx, x2, x3]) ctx.strokeRect(x + 0.5, y + 0.5, DEMO - 1, DEMO - 1)
    y += DEMO + u(30)

    // ── 격자 ──────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = Math.max(2, u(3))
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
    say(`↓ 여기부터가 그려야 할 격자입니다 — ${ROWS}행 × ${COLS}열 = ${FLOORS.length}칸`,
      PAD, y + u(26), u(17), '#ffd166', '700')
    y += u(50)

    FLOORS.forEach((f, i) => {
      const m = byId[f.id]
      const cx = PAD + (i % COLS) * CELL
      const cy = y + ((i / COLS) | 0) * (ROWLAB + CELL)
      say(`${m.name} — ${f.floor}`, cx, cy + u(20), u(17), '#ffffff', '700', 'left', false, CELL - u(10))
      say(f.note, cx, cy + u(38), u(13), '#b6b6b6', '500', 'left', false, CELL - u(10))

      const top = cy + ROWLAB
      ctx.fillStyle = m.theme.ground
      ctx.fillRect(cx + 4, top + 4, CELL - 8, CELL - 8)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1
      ctx.strokeRect(cx + 4.5, top + 4.5, CELL - 9, CELL - 9)
      // 그 맵의 길 질감을 왼쪽 위에 작게 — "이것과 다르게"의 기준
      const t = Math.round(CELL * 0.26)
      if (pathImg[f.id]) ctx.drawImage(pathImg[f.id], cx + 10, top + 10, t, t)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.strokeRect(cx + 10.5, top + 10.5, t - 1, t - 1)
    })

    const f = (COLS * CELL * ROWS * CELL) / (W * H)
    return {
      w: W, h: H, f: +f.toFixed(3),
      cell: Math.round(Math.sqrt(1.05e6 * f / FLOORS.length)),
      data: cv.toDataURL('image/png'), overflow,
    }
  }, { FLOORS })

  if (made.overflow.length > 0) {
    console.error('■ 칸 밖으로 넘치는 글씨 — 문구를 줄이세요')
    for (const o of made.overflow) console.error('  ' + o)
    throw new Error(`글씨 ${made.overflow.length}줄이 폭을 넘습니다`)
  }

  await writeFile(join(outDir, '24-map-spec-floors.png'),
    Buffer.from(made.data.split(',')[1], 'base64'))
  console.log(`24-map-spec-floors.png  ${made.w}×${made.h}   격자비율 f=${made.f}   예상 셀 ${made.cell}px`)
  console.log(`  화면에서 필요한 크기: 356px (한 장이 격자 2칸을 덮는다 · 태블릿 기준)`)

  // 배경은 시트가 아니라 글로 — 이유는 BGS 위 주석에 적었다
  const txt = [
    '화면 배경 3장 — 발주서',
    '',
    '※ 이건 그림으로 넣는 시트가 아니라 **붙여넣을 글**입니다.',
    '   배경은 세로 9:14 한 장짜리라 시트로 주문하면 안내판 그림이 돌아옵니다.',
    '',
    '── 세 장 모두에 해당 ──',
    ...BG_COMMON.map((r) => `  · ${r}`),
    '',
    ...BGS.flatMap((b, i) => [
      `── ${i + 1}. ${b.name}  (art/bg-${b.id}.jpg) ──`,
      '',
      '  그려주세요:',
      `    ${b.mood}`,
      '',
      '  비워둘 곳:',
      `    ${b.keep}`,
      '',
    ]),
  ].join('\n')
  await writeFile(join(outDir, '24-bg-order.txt'), txt, 'utf8')
  console.log(`24-bg-order.txt         배경 ${BGS.length}장 (붙여넣을 글 · 한 번에 한 장씩)`)
} finally {
  await browser.close()
  server.close()
}
