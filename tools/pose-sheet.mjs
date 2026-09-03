/**
 * 공격 모션 시트 — 고양이별 모션을 단계별로 한 장에 뽑는다.
 *
 * 발사 모션은 0.17초 안에 끝나서 일반 스크린샷으로는 거의 못 잡는다.
 * 그림을 손볼 때마다 눈으로 확인할 방법이 필요해서 만들었다.
 *
 * 게임과 같은 drawUnit()을 쓴다 — 프레임 아트가 붙어 있으면 그림, 없으면 벡터.
 * 사용자가 이 시트를 보고 그림을 그려줬고, 그 그림이 실제로 어떻게 나오는지도
 * 같은 도구로 확인한다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/pose-sheet.mjs
 *
 * 결과물: tools/out/12-poses.png
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

/** 단계: 1 = 발사 순간, 0 = 대기. 마지막은 자는 모습. */
const PHASES = [1, 0.65, 0.3, 0]
const CELL = 132
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({
  viewport: { width: CELL * (PHASES.length + 1) + 130, height: 760 },
  deviceScaleFactor: 2,
})

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })
  // 그림은 비동기로 온다. 기다리지 않으면 벡터 시트가 나온다.
  await page.evaluate(() => new Promise((r) => window.__catpaw.__framesets.onFrameSetsReady(r)))
  const artKeys = await page.evaluate(() => window.__catpaw.__framesets.loadedFrameSetKeys())

  const info = await page.evaluate(({ PHASES, CELL }) => {
    const reg = window.__catpaw.__registry
    const { drawUnit } = window.__catpaw.__framesets
    const towers = reg.listTowers()

    const cv = document.createElement('canvas')
    const labels = 130
    cv.width = CELL * (PHASES.length + 1) + labels
    cv.height = CELL * towers.length + 46
    document.body.innerHTML = ''
    document.body.style.margin = '0'
    document.body.appendChild(cv)
    const ctx = cv.getContext('2d')

    ctx.fillStyle = '#141a26'
    ctx.fillRect(0, 0, cv.width, cv.height)

    ctx.font = '700 15px system-ui, sans-serif'
    ctx.fillStyle = '#9dabc2'
    ctx.textAlign = 'center'
    PHASES.forEach((ph, i) => {
      ctx.fillText(ph === 1 ? '발사 순간' : ph === 0 ? '대기' : `phase ${ph}`,
        labels + CELL * i + CELL / 2, 28)
    })
    ctx.fillText('자는 중', labels + CELL * PHASES.length + CELL / 2, 28)

    towers.forEach((def, row) => {
      const cy = 46 + CELL * row + CELL / 2 - 10
      ctx.textAlign = 'right'
      ctx.fillStyle = '#eef3fb'
      ctx.font = '700 16px system-ui, sans-serif'
      ctx.fillText(def.name, labels - 16, cy - 4)
      ctx.fillStyle = '#6b7a93'
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillText(`pose: ${def.pose || '없음'}`, labels - 16, cy + 16)

      const cells = [...PHASES.map((ph) => ({ ph, idle: false })), { ph: 0, idle: true }]
      cells.forEach((cell, col) => {
        const cx = labels + CELL * col + CELL / 2
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.strokeRect(labels + CELL * col + 4, 46 + CELL * row + 4, CELL - 8, CELL - 8)
        ctx.restore()
        drawUnit(ctx, def, {
          x: cx, y: cy, r: 34,
          angle: 0,                       // 오른쪽을 조준한 상태로 통일 (반전 없음)
          phase: cell.ph, idle: cell.idle,
          t: 1.2, seed: row * 1.7,
        })
      })
    })
    return { w: cv.width, h: cv.height, towers: towers.map((d) => `${d.name}:${d.pose}`) }
  }, { PHASES, CELL })

  await page.setViewportSize({ width: info.w, height: info.h })
  await page.screenshot({ path: join(outDir, '12-poses.png'), clip: { x: 0, y: 0, width: info.w, height: info.h } })
  console.log('모션 시트:', join(outDir, '12-poses.png'))
  console.log('모션:', info.towers.join(' · '))
  console.log('프레임 아트:', artKeys.length ? artKeys.join(', ') : '없음 (벡터로 그렸다)')
} finally {
  await browser.close()
  server.close()
}
