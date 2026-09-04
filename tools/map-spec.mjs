/**
 * 지도 아트 발주서 — 다음에 받아야 할 그림을 규격과 함께 그림으로 보여준다.
 *
 * 1차로 받은 두 장 중 **파츠 시트(길 질감 6 · 소품 6)는 그대로 게임에 들어갔다.**
 * 바닥 시트는 못 썼다. 길이 구워져 있고 실제 경로와 최대 64% 어긋났으며(지붕),
 * 칸당 254×395 라 전체화면(1152×1792)에 4.5배 확대해야 했다.
 *
 * 그 실패의 원인은 **내 발주서**에 있다. 생성 도구는 전체 출력 크기가 대체로
 * 고정(640~830px)이라 칸을 나눌수록 칸당 해상도가 무너진다. 화면을 꽉 채우는 그림을
 * 시트 칸에 넣어 달라고 한 것이 잘못이었다. 그래서 이번 발주서는 규칙이 다르다:
 *
 *   시트로 받는 것    작아도 되는 것 — 질감 512×512
 *   한 장씩 받는 것    화면을 채우는 것 — 배경 1152×1792
 *
 * 배경 3종을 한 시트가 아니라 **파일 세 장**으로 뽑는 이유가 그것이다. 한 번에
 * 하나씩만 넘길 수 있게 물리적으로 갈라놨다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/map-spec.mjs
 *
 * 결과물
 *   tools/out/18-map-spec-floors.png       바닥 질감 6종 + 길 질감 재작업 2종 (시트 한 장)
 *   tools/out/18-map-spec-bg-title.png     타이틀 배경        ┐
 *   tools/out/18-map-spec-bg-select.png    맵/챕터 선택 배경  ├ 한 장씩 따로 넘길 것
 *   tools/out/18-map-spec-bg-story.png     컷신 배경          ┘
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
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

/* 맵별 주문 내용.
 *
 * 바닥 재질은 1차 바닥 시트에서 사용자가 고른 것을 그대로 이어받았다 — 재질 선택은
 * 좋았고 못 쓴 이유는 크기와 구워진 길 때문이지 재질 때문이 아니었다.
 * 길 재질은 실제로 받은 art/path-*.png 를 눈으로 확인해 적었다. 바닥은 그 길과
 * 확실히 구분돼야 한다. 대비가 없으면 어디가 길인지 안 보인다.               */
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

/* 이어붙임 실측. 양 끝 열/행의 색 차이를, 같은 질감 안의 무관한 두 열 차이(기준값)와
 * 비교했다. 기준값을 넘으면 이어붙인 자리에 줄이 보인다.                     */
const PATH_FIX = [
  { id: 'warehouse', seam: '상하 109 (기준 42)',
    why: '판자 결이 가로라 위아래가 안 맞습니다',
    how: '판자를 세로로 돌리거나, 위아래 끝의 판자 폭·색을 맞물리게 해주세요' },
  { id: 'basement', seam: '상하 96 (기준 80)',
    why: '돌 줄눈이 위아래가 안 맞습니다',
    how: '맨 윗줄과 맨 아랫줄이 벽돌 쌓기처럼 반 칸씩 어긋나 맞물리게 해주세요' },
]

/* 화면 배경 3종. 시트에 넣지 않는다 — 파일을 갈라 한 장씩 넘긴다. */
const BGS = [
  { id: 'title', name: '타이틀 화면',
    mood: '밤중의 뒷골목 지붕 위. 고양이가 앉아 도시를 내려다보는 실루엣',
    ui: [['로고', 0.10, 0.28], ['버튼 4개', 0.46, 0.80]],
    keep: '가운데 위(로고)와 아래 절반(버튼)은 비워주세요' },
  { id: 'select', name: '맵 / 챕터 선택',
    mood: '같은 세계의 넓은 풍경. 가장 단순하게 — 카드가 화면을 거의 다 덮습니다',
    ui: [['제목', 0.04, 0.12], ['카드 목록', 0.14, 0.96]],
    keep: '거의 전부 카드에 가려집니다. 큰 형태와 색만 남기세요' },
  { id: 'story', name: '컷신 배경',
    mood: '이야기 한 장면. 인물 없이 장소만 — 대사 상자가 아래를 덮습니다',
    ui: [['화자 그림', 0.30, 0.52], ['대사 상자', 0.55, 0.92]],
    keep: '아래 절반은 대사 상자에 가려집니다. 위쪽에 볼거리를 두세요' },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })

  const made = await page.evaluate(async ({ FLOORS, PATH_FIX, BGS }) => {
    const reg = window.__catpaw.__registry
    const byId = Object.fromEntries(reg.listMaps().map((m) => [m.id, m]))

    /** 이미 받은 길 질감을 발주서에 참고로 싣는다 — 대비를 눈으로 정하라는 뜻이다 */
    const loadPath = (id) => new Promise((res) => {
      const im = new Image()
      im.onload = () => res(im)
      im.onerror = () => res(null)
      im.src = `art/path-${id}.png`
    })
    const pathImg = {}
    for (const id of new Set([...FLOORS.map((f) => f.id), ...PATH_FIX.map((f) => f.id)])) {
      pathImg[id] = await loadPath(id)
    }

    const BG = '#3f3f3f'
    function sheet(w, h) {
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)
      ctx.textAlign = 'left'
      return { cv, ctx }
    }
    function header(ctx, x, y, w, title, subtitle, rules) {
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 26px system-ui, sans-serif'
      ctx.fillText(title, x, y)
      ctx.fillStyle = '#c9c9c9'
      ctx.font = '600 15px system-ui, sans-serif'
      ctx.fillText(subtitle, x, y + 24)
      ctx.font = '500 14px system-ui, sans-serif'
      rules.forEach((line, i) => {
        ctx.fillStyle = line.startsWith('★') ? '#ffd166' : '#b6b6b6'
        ctx.fillText(line, x, y + 52 + i * 25)
      })
      return y + 52 + rules.length * 25
    }
    /** 캔버스에는 줄바꿈이 없다. 폭에 맞춰 손으로 접는다 */
    function wrapText(ctx, txt, max) {
      const out = []
      let cur = ''
      for (const w of txt.split(' ')) {
        if (ctx.measureText(cur ? `${cur} ${w}` : w).width > max && cur) { out.push(cur); cur = w }
        else cur = cur ? `${cur} ${w}` : w
      }
      if (cur) out.push(cur)
      return out
    }
    /** 왼쪽 x 에 여러 줄을 쌓고 다음 y 를 돌려준다 */
    function lines(ctx, x, y, txt, max, color, font, gap) {
      ctx.fillStyle = color; ctx.font = font
      for (const l of wrapText(ctx, txt, max)) { ctx.fillText(l, x, y); y += gap }
      return y
    }
    /** 칸 하나: 왼쪽에 이미 있는 길, 오른쪽에 그려야 할 바닥 */
    function pairCell(ctx, x, y, w, h, img, leftLabel, rightLabel, swatch) {
      const half = Math.round(w / 2)
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y, half, h); ctx.clip()
      if (img) ctx.drawImage(img, x, y, half, half * (img.height / img.width))
      else { ctx.fillStyle = '#555'; ctx.fillRect(x, y, half, h) }
      ctx.restore()
      // 오른쪽은 '여기를 채워달라'는 빈 칸. 지금 테마 색을 옅게 깔아 분위기를 남긴다
      ctx.fillStyle = swatch
      ctx.fillRect(x + half, y, w - half, h)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(x + half, y, w - half, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      ctx.beginPath()
      ctx.moveTo(x + half + 0.5, y); ctx.lineTo(x + half + 0.5, y + h)
      ctx.stroke()
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(x, y, half, 20)
      ctx.fillStyle = '#dddddd'
      ctx.fillText(leftLabel, x + 6, y + 14)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(x + half, y, w - half, 20)
      ctx.fillStyle = '#ffd166'
      ctx.fillText(rightLabel, x + half + 6, y + 14)
    }

    // ── 시트: 바닥 질감 6종 + 길 재작업 2종 ────────────────────
    function floorSheet() {
      const PAD = 24, COLS = 3, CELL = 250, CELL_H = 150
      const LABEL = 104, LABEL_FIX = 140
      const W = PAD * 2 + COLS * CELL + (COLS - 1) * PAD
      const rules = [
        '★ 전부 512 × 512 PNG · 이어붙여도 티가 안 나야 합니다 (상하좌우가 서로 맞물리게)',
        '★ 길을 그리지 마세요 — 길은 이미 받았습니다. 코드가 바닥 위에 길을 얹습니다',
        '★ 칸 왼쪽이 그 맵의 길입니다. 오른쪽에 적힌 재질로, 길과 확실히 구분되게',
        '무늬는 작고 고르게. 한 장이 화면에서 2칸(약 306px)을 덮고 4×7회 반복됩니다',
        '큰 물건(상자 하나·웅덩이 하나)은 넣지 마세요 — 반복이 그대로 눈에 띕니다',
      ]
      const rows = Math.ceil(FLOORS.length / COLS)
      const fixRows = Math.ceil(PATH_FIX.length / COLS)
      const H = 44 + 52 + rules.length * 25 + 30
        + 30 + rows * (CELL_H + LABEL) + 40
        + 30 + fixRows * (CELL_H + LABEL_FIX) + PAD
      const { cv, ctx } = sheet(W, H)
      let y = header(ctx, PAD, 44, W, '지도 발주서 2차 — 바닥 질감',
        '1차 파츠 시트(길·소품)는 그대로 게임에 들어갔습니다. 고맙습니다.', rules) + 30

      /** 구역 제목 + 옆에 붙는 주석. 제목 폭을 재서 겹치지 않게 둔다 */
      const section = (title, note) => {
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 19px system-ui, sans-serif'
        ctx.fillText(title, PAD, y)
        const wTitle = ctx.measureText(title).width
        ctx.fillStyle = '#9a9a9a'
        ctx.font = '500 13px system-ui, sans-serif'
        ctx.fillText(note, PAD + wTitle + 20, y)
        y += 30
      }

      section('바닥 질감 6종 — 새로 그려주세요', '전부 512×512 · 이어붙임 필수')
      FLOORS.forEach((f, i) => {
        const m = byId[f.id]
        const x = PAD + (i % COLS) * (CELL + PAD)
        const yy = y + ((i / COLS) | 0) * (CELL_H + LABEL)
        pairCell(ctx, x, yy, CELL, CELL_H, pathImg[f.id], '지금 길', '바닥', m.theme.ground)
        let ty = yy + CELL_H + 21
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 16px system-ui, sans-serif'
        ctx.fillText(m.name, x, ty); ty += 20
        ctx.fillStyle = '#ffd166'
        ctx.font = '700 15px system-ui, sans-serif'
        ctx.fillText(f.floor, x, ty); ty += 19
        ty = lines(ctx, x, ty, `길은 ${f.path}. ${f.note}`, CELL,
          '#b6b6b6', '500 12px system-ui, sans-serif', 16)
        ctx.fillStyle = '#a8a8a8'
        ctx.font = '600 11px ui-monospace, monospace'
        ctx.fillText(`art/floor-${f.id}.png  512×512`, x, ty + 2)
      })
      y += rows * (CELL_H + LABEL) + 40

      section('길 질감 2종 — 이어붙는 자리만 고쳐주세요', '나머지 4종은 그대로 씁니다')
      PATH_FIX.forEach((f, i) => {
        const m = byId[f.id]
        const x = PAD + (i % COLS) * (CELL + PAD)
        const yy = y + ((i / COLS) | 0) * (CELL_H + LABEL_FIX)
        const img = pathImg[f.id]
        ctx.save()
        ctx.beginPath(); ctx.rect(x, yy, CELL, CELL_H); ctx.clip()
        if (img) ctx.drawImage(img, x, yy, CELL, CELL * (img.height / img.width))
        ctx.restore()
        // 안 맞는 자리를 표시한다 — 위·아래 끝
        ctx.strokeStyle = '#ff6b6b'
        ctx.lineWidth = 3
        ctx.setLineDash([9, 6])
        ctx.beginPath()
        ctx.moveTo(x, yy + 2); ctx.lineTo(x + CELL, yy + 2)
        ctx.moveTo(x, yy + CELL_H - 2); ctx.lineTo(x + CELL, yy + CELL_H - 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, yy + 0.5, CELL - 1, CELL_H - 1)

        let ty = yy + CELL_H + 21
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 16px system-ui, sans-serif'
        ctx.fillText(`${m.name} 길`, x, ty); ty += 20
        ty = lines(ctx, x, ty, `${f.why} (실측 ${f.seam})`, CELL,
          '#ff9f9f', '500 13px system-ui, sans-serif', 17)
        ty = lines(ctx, x, ty, `빨간 선끼리 맞물려야 합니다. ${f.how}`, CELL,
          '#b6b6b6', '500 12px system-ui, sans-serif', 16)
        ctx.fillStyle = '#a8a8a8'
        ctx.font = '600 11px ui-monospace, monospace'
        ctx.fillText(`art/path-${f.id}.png  512×512`, x, ty + 2)
      })
      return { w: W, h: H, data: cv.toDataURL('image/png') }
    }

    // ── 배경: 한 장에 하나씩 ──────────────────────────────────
    function bgCard(b) {
      const PAD = 24, FW = 270, FH = Math.round(FW * 1792 / 1152)
      const rules = [
        '★ 1152 × 1792 JPEG — 한 장짜리 그림입니다. 시트에 넣지 마세요',
        '★ 이 그림만 만들어 주세요. 다른 배경과 같이 만들면 해상도가 무너집니다',
        '세로 전체화면입니다. 잘림 걱정 없이 꽉 채워 그리세요',
        '위에 글씨와 카드가 얹힙니다 — 어둡고 단순하게, 대비를 낮춰서',
      ]
      const W = PAD * 3 + FW + 430
      const H = 44 + 52 + rules.length * 25 + 30 + FH + PAD
      const { cv, ctx } = sheet(W, H)
      const top = header(ctx, PAD, 44, W, `화면 배경 — ${b.name}`,
        `파일 하나만 그리는 발주서입니다. art/bg-${b.id}.jpg`, rules) + 30

      // 9:14 세로 화면 틀 + UI 가 앉는 자리
      const m0 = byId.alley.theme
      ctx.fillStyle = m0.sky
      ctx.fillRect(PAD, top, FW, FH)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(PAD + 0.5, top + 0.5, FW - 1, FH - 1)
      b.ui.forEach(([label, a, z]) => {
        const yy = top + FH * a, hh = FH * (z - a)
        ctx.fillStyle = 'rgba(255,209,102,0.16)'
        ctx.fillRect(PAD, yy, FW, hh)
        ctx.strokeStyle = 'rgba(255,209,102,0.8)'
        ctx.setLineDash([7, 6])
        ctx.strokeRect(PAD + 1.5, yy + 1.5, FW - 3, hh - 3)
        ctx.setLineDash([])
        ctx.fillStyle = '#ffd166'
        ctx.font = '700 14px system-ui, sans-serif'
        ctx.fillText(label, PAD + 10, yy + 20)
      })
      ctx.fillStyle = '#a8a8a8'
      ctx.font = '600 12px ui-monospace, monospace'
      ctx.fillText('1152 × 1792 (9:14)', PAD, top + FH + 20)

      // 오른쪽 설명
      const tx = PAD * 2 + FW
      let ty = top + 8
      const line = (txt, color, font, gap) => {
        ctx.fillStyle = color; ctx.font = font
        ctx.fillText(txt, tx, ty); ty += gap
      }
      line('그려주세요', '#ffffff', '700 20px system-ui, sans-serif', 34)
      ctx.font = '500 15px system-ui, sans-serif'
      ty = lines(ctx, tx, ty, b.mood, 400, '#dddddd', '500 15px system-ui, sans-serif', 24)
      ty += 14
      line('노란 칸은 비워주세요', '#ffd166', '700 17px system-ui, sans-serif', 28)
      ty = lines(ctx, tx, ty, b.keep, 400, '#b6b6b6', '500 14px system-ui, sans-serif', 22)
      ty += 14
      line('지금 화면 색', '#9a9a9a', '600 13px system-ui, sans-serif', 22)
      const sw = [m0.sky, m0.ground, m0.accent]
      sw.forEach((c, k) => {
        ctx.fillStyle = c
        ctx.fillRect(tx + k * 30, ty - 6, 26, 20)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 1
        ctx.strokeRect(tx + 0.5 + k * 30, ty - 5.5, 25, 19)
      })
      return { w: W, h: H, data: cv.toDataURL('image/png') }
    }

    const bgs = {}
    for (const b of BGS) bgs[b.id] = bgCard(b)
    return { floors: floorSheet(), bgs, loaded: Object.values(pathImg).filter(Boolean).length }
  }, { FLOORS, PATH_FIX, BGS })

  const save = async (name, o) => {
    await writeFile(join(outDir, name), Buffer.from(o.data.split(',')[1], 'base64'))
    console.log(`${name}  ${o.w}×${o.h}`)
  }
  await save('18-map-spec-floors.png', made.floors)
  for (const b of BGS) await save(`18-map-spec-bg-${b.id}.png`, made.bgs[b.id])
  console.log(`참고로 실은 길 질감 ${made.loaded}장 · 바닥 ${FLOORS.length}종 · 길 재작업 ${PATH_FIX.length}종 · 배경 ${BGS.length}장(따로)`)
} finally {
  await browser.close()
  server.close()
}
