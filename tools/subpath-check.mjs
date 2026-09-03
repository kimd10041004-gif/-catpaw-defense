/**
 * 서브경로 서빙 검증 — 안드로이드 회귀 방지용.
 *
 * 안드로이드 앱은 WebViewAssetLoader가 게임을 https://appassets.androidplatform.net/assets/index.html
 * 로 서빙한다. 즉 사이트 루트가 아니다. 어딘가에 절대경로('/js/main.js' 같은)가 섞여 들어가면
 * 웹에서는 멀쩡한데 APK만 빈 화면이 되는데, 그 사고를 여기서 잡는다.
 * GitHub Pages의 하위 경로 배포도 같은 조건이다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/subpath-check.mjs
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

import { dirname, join as pjoin } from 'node:path'
import { fileURLToPath } from 'node:url'
const webRoot = pjoin(dirname(fileURLToPath(import.meta.url)), '..', 'web')
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' }

// 안드로이드 AssetLoader와 똑같이 /assets/ 접두어를 붙여 서빙한다
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (!p.startsWith('/assets/')) { res.writeHead(404); res.end('밖'); return }
    p = p.slice('/assets'.length)
    if (p === '/' || p.endsWith('/')) p += 'index.html'
    const body = await readFile(join(webRoot, normalize(p).replace(/^(\.\.[/\\])+/, '')))
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('없음') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/assets/index.html`

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10000 })
const boot = await page.textContent('#boot-status')
await page.click('#btn-play')
await page.waitForSelector('#screen-maps:not([hidden])')
await page.click('#map-list .map-card')
await page.waitForSelector('#screen-game:not([hidden])')
const state = await page.evaluate(() => ({ gold: window.__catpaw.game.gold, map: window.__catpaw.game.mapDef.name }))
const sw = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope).catch((e) => `실패: ${e.message}`))

// 프레임 아트 경로가 절대경로로 새면 웹에서는 멀쩡하고 APK 에서만 고양이가
// 벡터로 떨어진다 — 오류도 안 나서 눈으로 보기 전엔 모른다.
await page.evaluate(() => new Promise((r) => window.__catpaw.__framesets.onFrameSetsReady(r)))
const art = await page.evaluate(() => window.__catpaw.__framesets.loadedFrameSetKeys().length)
const artTotal = await page.evaluate(() => window.__catpaw.__registry.listFrameSets().length)

console.log(`  ${boot.includes('준비 완료') ? '✓' : '✗'} 서브경로에서 부팅 — ${boot}`)
console.log(`  ${state.gold === 300 ? '✓' : '✗'} 서브경로에서 게임 진입 — ${state.map} / 골드 ${state.gold}`)
console.log(`  ${String(sw).includes('/assets/') ? '✓' : '✗'} 서비스 워커 스코프 — ${sw}`)
console.log(`  ${art === artTotal ? '✓' : '✗'} 서브경로에서 프레임 아트 로드 — ${art}/${artTotal}장`)
console.log(`  ${errs.length === 0 ? '✓' : '✗'} 콘솔 에러 ${errs.length}건 ${errs.slice(0,2).join(' | ')}`)

await browser.close(); server.close()
process.exit(errs.length === 0 && state.gold === 300 && String(sw).includes('/assets/') && art === artTotal ? 0 : 1)
