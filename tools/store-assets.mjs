/**
 * Play 스토어 등록 자산 생성기 — 헤드리스 크로미움으로 실제 게임 화면을 찍는다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/store-assets.mjs
 *   → store/01-title.png … 08-settings.png (1080×1920, 9:16)  ·  store/feature-graphic.png (1024×500)
 *
 * 왜 스모크 캡처(tools/out, 824×1830)를 안 쓰는가: Play 는 폰 스크린샷을 9:16(또는 16:9)로 요구한다.
 * 824×1830 은 9:20 이라 거부된다. 그래서 540×960 뷰포트를 2배로 찍어 정확히 1080×1920 을 만든다.
 * 스모크(screenshot.mjs)는 2,400줄짜리 검사 흐름이라 import 하지 않고, 장면 여덟 개만 작게 다시 쓴다.
 *
 * 장면은 전부 실제 DOM·게임 상태를 거친다 — 합성한 그림이 아니다. 다만 한 판을 끝까지 두지는 않고
 * 스모크와 같은 방식으로 상태를 밀어 넣는다(골드 지급·웨이브 번호·강제 승리). 결과 검사는
 * tests/node/store-assets.test.mjs 가 PNG 헤더의 폭·높이로 한다.
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'web')
const outDir = join(root, 'store')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }

/** Play 폰 스크린샷: 9:16, 각 변 320~3840 */
export const SHOT_W = 1080
export const SHOT_H = 1920
/** 기능 그래픽: 1024×500 고정 */
export const FEATURE_W = 1024
export const FEATURE_H = 500
export const SHOTS = ['01-title', '02-battle', '03-boss', '04-result', '05-codex', '06-chapters', '07-challenges', '08-settings']

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/' || p.endsWith('/')) p += 'index.html'
    const body = await readFile(join(webRoot, normalize(p).replace(/^(\.\.[/\\])+/, '')))
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('없음') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({
  viewport: { width: SHOT_W / 2, height: SHOT_H / 2 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'ko-KR',
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) })
const settle = (ms = 300) => page.waitForTimeout(ms)

await page.goto(base, { waitUntil: 'load' })
await page.waitForFunction(() => window.__catpaw !== undefined, null, { timeout: 15000 })
await page.waitForSelector('#loading-tap:not([hidden])', { timeout: 20000 })
await page.click('#loading-tap')
await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 5000 })
const daily = await page.$('#overlay:not([hidden]) .daily-close')
if (daily) { await daily.click(); await page.waitForFunction(() => document.getElementById('overlay').hidden) }
await settle(600)   // 타이틀 등장 연출이 끝난 뒤
await shot('01-title')

// 전투 — 고양이 여섯 마리를 길 옆에 놓고 8웨이브를 돌린다 (첫 판 도움말은 끈다: 토스트가 화면을 가린다)
await page.evaluate(() => { window.__catpaw._changeSetting('hints', false) })
await page.click('#btn-play')
await page.waitForSelector('#screen-maps:not([hidden])')
await page.click('#map-list .map-card')
await page.waitForSelector('#screen-game:not([hidden])')
await settle(250)
await page.evaluate(() => {
  const app = window.__catpaw, g = app.game
  g.gold = 99999
  g.progress = { ...g.progress, unlockedTowers: null }   // null = 전부 해금 (save.js 규약)
  const spots = []
  for (let r = 0; r < g.mapDef.rows; r += 1) for (let c = 0; c < g.mapDef.cols; c += 1) {
    let d = Infinity
    for (const p of g.path.points) d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
    spots.push({ c, r, d })
  }
  spots.sort((a, b) => a.d - b.d)
  const cats = ['cheese', 'calico', 'siamese', 'black', 'mackerel', 'tuxedo']
  let i = 0
  for (const sp of spots) { if (i >= cats.length) break; if (g.placeTower(sp.c, sp.r, cats[i]).ok) i += 1 }
  for (const t of g.towers) { g.gold = 99999; g.upgradeTower(t) }
  g.waveNo = 7            // 다음 웨이브 = 8 (적이 충분히 많다)
  g.prepRemaining = 0
  g.startWave()
  app.ui.renderShop(g, null)
})
await settle(3800)
await shot('02-battle')

// 보스 등장 — 웨이브 스폰 경로로 마왕 쥐를 하나 넣으면 등장 배너·플래시가 뜬다
await page.evaluate(() => {
  const g = window.__catpaw.game
  g._createEnemy('demonking', { fromWave: true })
})
await settle(350)
await shot('03-boss')

// 결과 — 강제 승리로 결과 시트
await page.evaluate(() => {
  const app = window.__catpaw, g = app.game
  g.phase = 'victory'; g.waveNo = g.tableWaves
  app._runLedger = null
  app._endRun(g.summary())
})
await settle(400)
await shot('04-result')

// 도감
await page.evaluate(() => { const app = window.__catpaw; app.ui.closeOverlay(); app.game = null; app.ui.openCodex('towers') })
await settle(300)
await shot('05-codex')

// 시나리오 목록 — 앞 네 장을 깬 상태로
await page.evaluate(() => {
  const app = window.__catpaw
  app.ui.closeOverlay()
  const stars = { ch1: 3, ch2: 3, ch3: 2, ch4: 3 }
  app.progress = { ...app.progress, scenario: { ...app.progress.scenario, stars: { ...app.progress.scenario.stars, ...stars } } }
  app._goto('chapters')
})
await settle(350)
await shot('06-chapters')

// 도전 시트 — 골목길을 깬 상태로
await page.evaluate(() => {
  const app = window.__catpaw
  app.progress = { ...app.progress, clears: { ...app.progress.clears, alley: 1 } }
  app._goto('maps')
})
await settle(300)
await page.evaluate(() => { const app = window.__catpaw; app.ui.openChallenges('alley', app.progress) })
await settle(300)
await shot('07-challenges')

// 설정
await page.evaluate(() => { const app = window.__catpaw; app.ui.closeOverlay(); app.ui.openSettings(app.settings, () => {}) })
await settle(300)
await shot('08-settings')

// 기능 그래픽 1024×500 — 같은 서버의 배경·아이콘으로 한 장 조립한다
const fctx = await browser.newContext({ viewport: { width: FEATURE_W, height: FEATURE_H }, deviceScaleFactor: 1 })
const fpage = await fctx.newPage()
await fpage.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${FEATURE_W}px;height:${FEATURE_H}px;overflow:hidden;font-family:"Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif}
  .bg{position:absolute;inset:0;background:url(${base}art/bg-title.jpg) center/cover no-repeat}
  .veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,9,14,.88) 0%,rgba(6,9,14,.6) 55%,rgba(6,9,14,.25) 100%)}
  .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 72px}
  .badge{width:220px;height:220px;border-radius:56px;display:grid;place-items:center;flex:none;
    background:linear-gradient(180deg,#2a3346,#171e2b);box-shadow:0 24px 60px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.12),0 0 0 2px rgba(255,201,77,.25)}
  .badge img{width:156px;height:156px}
  h1{margin:0;font-size:78px;font-weight:800;letter-spacing:-2px;line-height:1;
    background:linear-gradient(180deg,#fff3cf 10%,#ffc94d 60%,#d9962a);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{margin:18px 0 0;font-size:30px;color:#e8edf3;opacity:.92}
  .tags{margin-top:22px;display:flex;gap:10px}
  .tags span{font-size:19px;font-weight:700;color:#ffc94d;border:1px solid rgba(255,201,77,.5);border-radius:999px;padding:6px 16px;background:rgba(255,201,77,.1)}
</style></head><body>
  <div class="bg"></div><div class="veil"></div>
  <div class="wrap">
    <div class="badge"><img src="${base}icons/icon.svg" alt=""></div>
    <div><h1>캣포 디펜스</h1><p>고양이들과 함께 집을 지켜라</p>
      <div class="tags"><span>고양이 9종</span><span>보스 5종</span><span>시나리오 18장</span><span>오프라인</span></div></div>
  </div>
</body></html>`, { waitUntil: 'load' })
await fpage.waitForTimeout(500)
await fpage.screenshot({ path: join(outDir, 'feature-graphic.png') })
await fctx.close()

await writeFile(join(outDir, 'README.md'), `# 스토어 자산

\`node tools/store-assets.mjs\` 가 만든다. 손으로 고치지 말고 다시 돌린다.

| 파일 | 크기 | 용도 |
|---|---|---|
${SHOTS.map((s) => `| \`${s}.png\` | ${SHOT_W}×${SHOT_H} (9:16) | Play 폰 스크린샷 |`).join('\n')}
| \`feature-graphic.png\` | ${FEATURE_W}×${FEATURE_H} | Play 기능 그래픽 |

앱 아이콘 512×512 는 \`web/icons/icon-512.png\`.
`)

await browser.close(); server.close()
console.log(`  ${errs.length === 0 ? '✓' : '✗'} 콘솔 에러 ${errs.length}건 ${errs.slice(0, 2).join(' | ')}`)
console.log(`  ✓ ${SHOTS.length}장 + 기능 그래픽 → store/`)
process.exit(errs.length === 0 ? 0 : 1)
