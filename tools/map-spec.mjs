/**
 * 지도·화면 배경 발주서 — 무엇을 어떤 규격으로 그려야 하는지 두 장으로 보여준다.
 *
 * 캐릭터 15종은 전부 채색 일러스트가 됐는데 지도는 아직 단색이다. 바닥은 두 색
 * 체커보드, 길은 단색 폴리라인이라 그림 같은 고양이가 색종이 위를 걷는 꼴이다.
 *
 * 바닥 시트가 핵심이다. 칸마다 **그 맵의 실제 격자와 길을 게임과 같은 렌더러로**
 * 그려 넣는다 — 어디를 비워둬야 하는지 말이 아니라 그림으로 보여주는 게 목적이다.
 * 길은 코드가 그 위에 그리므로 그림에 길을 넣으면 두 겹이 된다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/map-spec.mjs
 *
 * 결과물
 *   tools/out/18-map-spec-grounds.png   맵 6종 바닥
 *   tools/out/18-map-spec-parts.png     길 텍스처 · 소품 · 화면 배경
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

/* 실측값 — 헤드리스로 4개 기기에서 재봤다.
 * 격자 비율은 어디서나 정확히 9:14(0.6429) 다. tile = min(cssW/9, cssH/14) 라
 * 비율이 보존되기 때문이다. 그래서 바닥 그림은 늘어나지도 잘리지도 않는다.
 * 격자 device px: 큰 폰 1342×2088 · 태블릿 1612×2508 · 작은 폰 571×888        */
const GROUND_SIZE = '1152 × 1792'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })
  // 한 판에 들어가야 Game 클래스와 난이도 프리셋을 꺼낼 수 있다.
  // 발주서의 지도 그림은 게임과 같은 렌더러로 그려야 의미가 있다.
  await page.click('#btn-play')
  await page.click('.map-card')
  await page.waitForSelector('#screen-game:not([hidden])')

  const made = await page.evaluate(({ GROUND_SIZE }) => {
    const app = window.__catpaw
    const reg = app.__registry
    const Game = app.game ? app.game.constructor : null
    const Renderer = app.renderer.constructor

    // ── 공용 그리기 도구 ─────────────────────────────────────
    const BG = '#3f3f3f'
    function sheet(w, h) {
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)
      return { cv, ctx }
    }
    function header(ctx, x, y, title, subtitle, rules) {
      ctx.textAlign = 'left'
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

    /** 맵 하나를 게임과 같은 렌더러로 그려서 캔버스로 돌려준다 */
    function renderMap(mapDef, w, h) {
      const cv = document.createElement('canvas')
      const dpr = 2
      cv.width = w * dpr; cv.height = h * dpr
      const r = new Renderer(cv)
      r.resize(w, h, mapDef)
      const g = new Game({
        mapDef,
        difficulty: app.game.difficulty,
        settings: app.settings,
      })
      r.draw(g, {})
      return { cv, r, g, dpr }
    }

    // ── 시트 1: 맵 6종 바닥 ──────────────────────────────────
    function groundSheet() {
      const maps = reg.listMaps()
      const CW = 280, CH = Math.round(280 * 14 / 9)   // 9:14
      const COLS = 3, PAD = 22, LABEL = 84
      const rules = [
        `★ art/map-<id>.jpg · ${GROUND_SIZE} (9:14 정확히) · JPEG`,
        '★ 길을 그리지 마세요 — 노란 띠가 길입니다. 코드가 그 위에 그립니다',
        '★ 막힌 칸의 상자·화분도 그리지 마세요 — 소품도 코드가 얹습니다',
        '격자 비율이 모든 기기에서 똑같이 유지됩니다. 잘림 걱정 없이 꽉 채워 그리세요',
        '가운데는 비교적 단순하게 — 길과 고양이가 그 위에 올라갑니다',
        'JPEG 인 이유: 투명이 필요 없고, PNG 로 받으면 6장이 10MB 를 넘어 앱에 못 싣습니다',
      ]
      const W = PAD * 2 + COLS * CW + (COLS - 1) * PAD
      const headBottom = 44 + 52 + rules.length * 25
      const rows = Math.ceil(maps.length / COLS)
      const H = headBottom + 30 + rows * (CH + LABEL) + PAD
      const { cv, ctx } = sheet(W, H)
      header(ctx, PAD, 44, '지도 발주서 — 바닥 6종',
        '칸 안이 그 맵의 실제 격자와 길입니다. 같은 구도로 바닥만 그려주세요.', rules)

      maps.forEach((m, i) => {
        const col = i % COLS, row = (i / COLS) | 0
        const x = PAD + col * (CW + PAD)
        const y = headBottom + 30 + row * (CH + LABEL)

        const { cv: mc, r, g, dpr } = renderMap(m, CW, CH)
        ctx.drawImage(mc, 0, 0, mc.width, mc.height, x, y, CW, CH)

        // 길 위에 '여기 비워두세요' 띠.
        // 진입·퇴장 웨이포인트가 격자 밖([4,-1] 등)이라 클립하지 않으면 아래 라벨을 덮는다.
        const mx = ctx.getTransform()
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, CW, CH)
        ctx.clip()
        ctx.translate(x, y)
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,209,102,0.40)'
        ctx.lineWidth = r.tile * 1.0
        const pts = g.path.points
        ctx.beginPath()
        ctx.moveTo(r.toPx(pts[0].x), r.toPy(pts[0].y))
        for (let k = 1; k < pts.length; k++) ctx.lineTo(r.toPx(pts[k].x), r.toPy(pts[k].y))
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255,209,102,0.95)'
        ctx.lineWidth = 2
        ctx.setLineDash([7, 6])
        ctx.stroke()
        ctx.setLineDash([])

        // 막힌 칸 표시
        for (const [c, rr] of (m.blocked || [])) {
          ctx.strokeStyle = 'rgba(140,200,255,0.95)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.strokeRect(r.toPx(c) + 2, r.toPy(rr) + 2, r.tile - 4, r.tile - 4)
          ctx.setLineDash([])
        }
        ctx.restore()
        ctx.setTransform(mx)

        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, CW - 1, CH - 1)

        // 라벨
        ctx.textAlign = 'left'
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 19px system-ui, sans-serif'
        ctx.fillText(m.name, x, y + CH + 24)
        ctx.fillStyle = '#a8a8a8'
        ctx.font = '600 13px ui-monospace, monospace'
        ctx.fillText(`art/map-${m.id}.jpg`, x, y + CH + 44)
        // 지금 쓰는 테마 색 견본 — 분위기는 유지해달라는 뜻. 파일명과 겹치지 않게 다음 줄에.
        ctx.fillStyle = '#8a8a8a'
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.fillText('지금 색', x, y + CH + 68)
        const sw = [m.theme.ground, m.theme.path, m.theme.accent, m.theme.sky]
        sw.forEach((col2, k) => {
          ctx.fillStyle = col2
          ctx.fillRect(x + 52 + k * 24, y + CH + 57, 20, 15)
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 52.5 + k * 24, y + CH + 57.5, 19, 14)
        })
      })

      // 범례
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffd166'
      ctx.font = '700 14px system-ui, sans-serif'
      ctx.fillText('■ 노란 띠 = 길 (그리지 말 것)', PAD, headBottom + 18)
      ctx.fillStyle = '#8cc8ff'
      ctx.fillText('▫ 파란 네모 = 막힌 칸, 소품 자리 (그리지 말 것)', PAD + 250, headBottom + 18)
      return { w: W, h: H, data: cv.toDataURL('image/png') }
    }

    // ── 시트 2: 길 텍스처 · 소품 · 화면 배경 ─────────────────
    function partsSheet() {
      const maps = reg.listMaps()
      const PAD = 22, CELL = 200, COLS = 3
      const W = PAD * 2 + COLS * CELL + (COLS - 1) * PAD
      const BGW = Math.round((W - PAD * 2 - PAD * 2) / 3), BGH = Math.round(BGW * 14 / 9)
      const rules = [
        '★ 길 텍스처와 소품은 PNG, 화면 배경은 JPEG',
        '★ 소품만 배경 투명(PNG-32). 투명이 안 되면 단색 배경으로 주셔도 파내겠습니다',
        '길 텍스처는 이어붙여도 티가 안 나야 합니다 (상하좌우가 서로 맞물리게)',
      ]
      const headBottom = 44 + 52 + rules.length * 25
      const secH = 34
      const H = headBottom + 26
        + secH + 2 * (CELL + 62) + 26          // 길 텍스처 6칸
        + secH + 2 * (CELL + 62) + 26          // 소품 6칸
        + secH + BGH + 78 + PAD                // 화면 배경 3칸
      const { cv, ctx } = sheet(W, H)
      header(ctx, PAD, 44, '지도 발주서 — 길·소품·화면 배경',
        '바닥 시트와 함께 씁니다. 칸마다 파일명과 크기를 적어 뒀습니다.', rules)

      let y = headBottom + 26
      const section = (title, note) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 19px system-ui, sans-serif'
        ctx.fillText(title, PAD, y + 20)
        ctx.fillStyle = '#9a9a9a'
        ctx.font = '500 13px system-ui, sans-serif'
        ctx.fillText(note, PAD + ctx.measureText(title).width + 180, y + 20)
        y += secH
      }
      const cellBox = (x, yy, w, h, name, file, size, swatch) => {
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(x, yy, w, h)
        if (swatch) {
          ctx.fillStyle = swatch
          ctx.fillRect(x + 1, yy + 1, w - 2, h - 2)
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 15px system-ui, sans-serif'
        ctx.fillText(name, x, yy + h + 19)
        ctx.fillStyle = '#a8a8a8'
        ctx.font = '600 12px ui-monospace, monospace'
        ctx.fillText(file, x, yy + h + 35)
        // 크기는 다음 줄에 — 한 줄에 같이 두면 200px 칸에서 파일명과 겹친다
        ctx.fillStyle = '#8a8a8a'
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.fillText(size, x, yy + h + 51)
      }

      section('길 표면 텍스처 6종', '화면에서 길 폭이 116px 입니다. 칸 색은 지금 쓰는 길 색.')
      maps.forEach((m, i) => {
        const x = PAD + (i % COLS) * (CELL + PAD)
        const yy = y + ((i / COLS) | 0) * (CELL + 62)
        cellBox(x, yy, CELL, CELL, m.name, `art/path-${m.id}.png`, '512×512', m.theme.path)
      })
      y += 2 * (CELL + 62) + 26

      section('막힌 칸 소품 6종', '한 칸에 하나씩 놓입니다. 바닥 닿는 높이 78%.')
      const props = [
        ['나무 상자', 'crate'], ['화분', 'pot'], ['항아리', 'jar'],
        ['자루', 'sack'], ['드럼통', 'barrel'], ['헌 가구', 'furniture'],
      ]
      props.forEach(([name, id], i) => {
        const x = PAD + (i % COLS) * (CELL + PAD)
        const yy = y + ((i / COLS) | 0) * (CELL + 62)
        cellBox(x, yy, CELL, CELL, name, `art/prop-${id}.png`, '256×256 투명')
        // 접지선
        ctx.strokeStyle = 'rgba(255,209,102,0.45)'
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(x + 8, yy + CELL * 0.78)
        ctx.lineTo(x + CELL - 8, yy + CELL * 0.78)
        ctx.stroke()
        ctx.setLineDash([])
      })
      y += 2 * (CELL + 62) + 26

      section('화면 배경 3종', '카드와 글씨가 위에 얹힙니다 — 어둡고 단순하게.')
      const bgs = [
        ['타이틀 화면', 'title', '로고와 버튼이 가운데'],
        ['맵/챕터 선택', 'select', '카드가 세로로 쌓임 — 가장 단순하게'],
        ['컷신 배경', 'story', '대사 상자가 아래쪽에'],
      ]
      bgs.forEach(([name, id, note], i) => {
        const x = PAD + i * (BGW + PAD)
        cellBox(x, y, BGW, BGH, name, `art/bg-${id}.jpg`, '1152×1792')
        ctx.fillStyle = '#8a8a8a'
        ctx.font = '500 12px system-ui, sans-serif'
        ctx.fillText(note, x, y + BGH + 67)
      })

      return { w: W, h: H, data: cv.toDataURL('image/png') }
    }

    return { grounds: groundSheet(), parts: partsSheet(), maps: reg.listMaps().length }
  }, { GROUND_SIZE })

  const save = async (name, o) => {
    await writeFile(join(outDir, name), Buffer.from(o.data.split(',')[1], 'base64'))
    console.log(`${name}  ${o.w}×${o.h}`)
  }
  await save('18-map-spec-grounds.png', made.grounds)
  await save('18-map-spec-parts.png', made.parts)
  console.log(`맵 ${made.maps}종 · 길 텍스처 ${made.maps}종 · 소품 6종 · 화면 배경 3종`)
} finally {
  await browser.close()
  server.close()
}
