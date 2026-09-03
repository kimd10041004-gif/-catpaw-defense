/**
 * 적 그림 발주서 — 무엇을 어떤 규격으로 그려야 하는지 한 장으로 보여준다.
 *
 * 고양이 5마리는 사용자가 준 그림으로 바꿨는데(web/art/cat-*.png) 적 10종은
 * 아직 캔버스 도형이라 그림이 섞여 보인다. 그 10종의 발주서다.
 *
 * 형식은 고양이 시트와 똑같이 간다 — 그 형식으로 그림이 잘 나왔으므로 바꾸지 않는다.
 * 칸마다 지금 쓰는 벡터 그림을 그려 넣어 무엇을 대체하는지 보이게 한다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/art-spec.mjs
 *
 * 결과물
 *   tools/out/13-art-spec-enemies.png   일반 적 5종 × 3프레임
 *   tools/out/13-art-spec-bosses.png    보스 5종 × 3프레임 (칸이 더 크다)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
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

/**
 * 프레임 3장만 요청한다.
 *
 * 고양이는 5장이 필요했지만(발사 모션) 적은 걷기만 하고, 피격 번쩍임·보호막·
 * 광폭화 고리·왕관은 코드가 그린다. 프레임을 줄이면 같은 폭에서 칸이 커진다
 * = 그림이 커진다. 실제로 쓰지도 않을 프레임을 요구할 이유가 없다.
 */
const FRAMES = [
  { label: '걷기 A', t: Math.PI / 2 / 12, note: '다리·꼬리 한쪽' },
  { label: '걷기 B', t: Math.PI * 1.5 / 12, note: '반대쪽' },
  { label: '멈춤', t: 0, note: '둔화·자장가에 걸렸을 때' },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })

  const made = await page.evaluate(({ FRAMES }) => {
    const reg = window.__catpaw.__registry
    const all = reg.listEnemies()
    const normals = all.filter((e) => !e.boss)
    const bosses = all.filter((e) => e.boss)

    /** 큰 폰(타일 51px, DPR 3)에서 이 적이 실제로 차지하는 화면 크기 */
    const deviceW = (def) => Math.round(def.size * 51 * 2.5 * 3)

    function sheet(list, CELL, title, subtitle, rules, crownSpace) {
      const LABEL = 258
      const HEAD = 70 + rules.length * 26 + 56
      const cv = document.createElement('canvas')
      cv.width = LABEL + CELL * FRAMES.length
      cv.height = HEAD + CELL * list.length
      const ctx = cv.getContext('2d')

      ctx.fillStyle = '#3f3f3f'                        // 고양이 시트와 같은 회색 바탕
      ctx.fillRect(0, 0, cv.width, cv.height)

      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 26px system-ui, sans-serif'
      ctx.fillText(title, 24, 38)
      ctx.fillStyle = '#c9c9c9'
      ctx.font = '600 15px system-ui, sans-serif'
      ctx.fillText(subtitle, 24, 62)
      ctx.font = '500 14px system-ui, sans-serif'
      rules.forEach((line, i) => {
        ctx.fillStyle = line.startsWith('★') ? '#ffd166' : '#b6b6b6'
        ctx.fillText(line, 24, 90 + i * 26)
      })

      ctx.textAlign = 'center'
      ctx.fillStyle = '#e6e6e6'
      ctx.font = '700 20px system-ui, sans-serif'
      FRAMES.forEach((f, i) => {
        ctx.fillText(f.label, LABEL + CELL * i + CELL / 2, HEAD - 32)
        ctx.fillStyle = '#9a9a9a'
        ctx.font = '500 13px system-ui, sans-serif'
        ctx.fillText(f.note, LABEL + CELL * i + CELL / 2, HEAD - 12)
        ctx.fillStyle = '#e6e6e6'
        ctx.font = '700 20px system-ui, sans-serif'
      })

      list.forEach((def, row) => {
        const cy = HEAD + CELL * row + CELL / 2
        ctx.textAlign = 'right'
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 21px system-ui, sans-serif'
        ctx.fillText(def.name, LABEL - 20, cy - 16)
        ctx.fillStyle = '#a8a8a8'
        ctx.font = '600 13px ui-monospace, monospace'
        ctx.fillText(`art/enemy-${def.id}.png`, LABEL - 20, cy + 8)
        ctx.font = '600 14px system-ui, sans-serif'
        ctx.fillStyle = '#8a8a8a'
        ctx.fillText(`화면 최대 ${deviceW(def)}px`, LABEL - 20, cy + 30)

        const draw = reg.getSprite(def.sprite)
        FRAMES.forEach((f, col) => {
          const x = LABEL + CELL * col
          ctx.strokeStyle = 'rgba(255,255,255,0.16)'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 6.5, HEAD + CELL * row + 6.5, CELL - 13, CELL - 13)
          // 발이 닿는 선 — 그림에서 이 높이에 바닥이 오게 그려달라는 표시.
          // 벡터 그림자가 중심에서 +0.86r 에 있으므로 거기에 맞춰 세로 위치를 잡는다.
          const R = CELL * 0.24
          const groundY = HEAD + CELL * row + CELL * 0.78
          ctx.strokeStyle = 'rgba(255,209,102,0.40)'
          ctx.setLineDash([7, 7])
          ctx.beginPath()
          ctx.moveTo(x + 10, groundY)
          ctx.lineTo(x + CELL - 10, groundY)
          ctx.stroke()
          ctx.setLineDash([])
          // 왕관이 들어갈 위쪽 12% — 글로만 쓰면 안 지켜져서 선으로도 표시한다.
          // 보스는 엘리트 변종이 되지 않으므로(elite.js) 이 여백이 필요 없다.
          if (crownSpace) {
            ctx.strokeStyle = 'rgba(140,200,255,0.30)'
            ctx.setLineDash([4, 8])
            ctx.beginPath()
            ctx.moveTo(x + 10, HEAD + CELL * row + CELL * 0.12)
            ctx.lineTo(x + CELL - 10, HEAD + CELL * row + CELL * 0.12)
            ctx.stroke()
            ctx.setLineDash([])
          }

          draw(ctx, {
            x: x + CELL / 2, y: groundY - R * 0.86, r: R,
            palette: def.palette, angle: 0,        // 오른쪽을 보게 통일
            t: f.t, flying: def.flying,
          })
        })
      })
      return { w: cv.width, h: cv.height, data: cv.toDataURL('image/png') }
    }

    const common = [
      '★ 배경은 완전 투명한 PNG-32. 회색이나 흰색을 깔지 말 것',
      '★ 전부 오른쪽을 보게. 왼쪽으로 걸을 때는 코드가 좌우 반전한다',
      '바닥 그림자는 그림에 포함 (노란 점선이 발이 닿는 높이)',
      '피격 번쩍임 · 보호막 · 광폭화 고리는 코드가 그린다 — 그리지 말 것',
      '칸 안에서 몸이 차지하는 비율과 발 높이를 세 칸 모두 똑같이',
    ]

    return {
      enemies: sheet(normals, 300, '해충 발주서 — 일반 5종',
        '칸마다 지금 쓰는 그림이다. 같은 격자에 같은 자리로, 채색 일러스트로 그려주세요.',
        ['★ 위쪽 12%(파란 점선)는 비워둘 것 — 엘리트 변종의 금색 왕관을 코드가 얹는다']
          .concat(common), true),
      bosses: sheet(bosses, 340, '해충 발주서 — 보스 5종',
        '보스는 화면에서 훨씬 크게 나온다. 칸을 키웠으니 디테일을 더 넣어주세요.',
        common.concat([
          '왕관·장신구는 그림에 포함 — 보스는 엘리트 변종이 되지 않아 코드가 얹지 않는다',
          '일반 개체(생쥐/바퀴/박쥐/두더지)와 한눈에 구분되게',
        ]), false),
      counts: { normals: normals.length, bosses: bosses.length },
    }
  }, { FRAMES })

  const { writeFile } = await import('node:fs/promises')
  const save = async (name, o) => {
    await writeFile(join(outDir, name), Buffer.from(o.data.split(',')[1], 'base64'))
    console.log(`${name}  ${o.w}×${o.h}`)
  }
  await save('13-art-spec-enemies.png', made.enemies)
  await save('13-art-spec-bosses.png', made.bosses)
  console.log(`일반 ${made.counts.normals}종 · 보스 ${made.counts.bosses}종 · 프레임 ${FRAMES.length}장`)
} finally {
  await browser.close()
  server.close()
}
