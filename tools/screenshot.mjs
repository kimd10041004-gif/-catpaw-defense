/**
 * 실행 검증 — 헤드리스 크로미움으로 게임을 실제로 띄우고 조작한 뒤 스크린샷을 남긴다.
 * 콘솔 에러가 하나라도 있으면 실패로 끝낸다 (런타임 오류를 눈으로 놓치지 않으려고).
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/screenshot.mjs
 *
 * 결과물: tools/out/*.png
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
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** web/ 를 그대로 서빙하는 최소 정적 서버 (의존성 0) */
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (p === '/' || p.endsWith('/')) p += 'index.html'
      const file = join(webRoot, normalize(p).replace(/^(\.\.[/\\])+/, ''))
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const problems = []
const steps = []
const check = (label, ok, detail = '') => {
  steps.push(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) problems.push(label)
}

const server = await serve()
const port = server.address().port
const base = `http://127.0.0.1:${port}/`

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

try {
  // ── 1. 부팅 ────────────────────────────────────────────────
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })
  const boot = await page.textContent('#boot-status')
  check('콘텐츠 검증 통과 후 부팅', boot.includes('준비 완료'), boot)
  await page.screenshot({ path: join(outDir, '1-title.png') })

  // ── 2. 맵 선택 ─────────────────────────────────────────────
  await page.click('#btn-play')
  await page.waitForSelector('#screen-maps:not([hidden])')
  const cards = await page.$$('#map-list .map-card')
  const locked = await page.$$('#map-list .map-card[disabled]')
  check('맵 3개가 표시되고 첫 맵만 열려 있다', cards.length === 3 && locked.length === 2,
    `카드 ${cards.length}개, 잠김 ${locked.length}개`)
  await page.screenshot({ path: join(outDir, '2-maps.png') })

  // ── 3. 게임 진입 ───────────────────────────────────────────
  await cards[0].click()
  await page.waitForSelector('#screen-game:not([hidden])')
  const initial = await page.evaluate(() => ({
    gold: window.__catpaw.game.gold,
    lives: window.__catpaw.game.lives,
    waves: window.__catpaw.game.totalWaves,
  }))
  check('게임이 시작 상태로 초기화된다', initial.gold === 300 && initial.lives === 20 && initial.waves === 30,
    JSON.stringify(initial))

  // 캔버스가 실제로 그려졌는지 (전부 같은 색이면 렌더 실패)
  const painted = await page.evaluate(() => {
    const cv = document.getElementById('canvas')
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 997) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return seen.size
  })
  check('캔버스에 맵이 실제로 그려진다', painted > 5, `고유 색상 ${painted}종`)

  // ── 4. 실제 탭으로 타워 배치 ────────────────────────────────
  /** 지을 수 있는 타일의 화면 좌표를 찾아준다 (렌더러 오프셋 기준) */
  const tileToClient = async (c, r) => page.evaluate(({ c, r }) => {
    const app = window.__catpaw
    const rect = document.getElementById('canvas').getBoundingClientRect()
    return {
      x: rect.left + app.renderer.ox + (c + 0.5) * app.renderer.tile,
      y: rect.top + app.renderer.oy + (r + 0.5) * app.renderer.tile,
    }
  }, { c, r })

  const spots = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    const out = []
    for (let r = 0; r < g.mapDef.rows && out.length < 6; r += 1) {
      for (let c = 0; c < g.mapDef.cols && out.length < 6; c += 1) {
        if (!g.path.tileSet.has(`${c},${r}`) && !(g.mapDef.blocked || []).some((b) => b[0] === c && b[1] === r)) {
          // 경로에 붙은 자리를 골라야 실제로 사격이 일어난다
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => g.path.tileSet.has(`${c + dc},${r + dr}`))
          if (near) out.push({ c, r })
        }
      }
    }
    return out
  })
  check('경로에 인접한 건설 가능 타일을 찾았다', spots.length >= 2, `${spots.length}곳`)

  await page.click('#shop-cards .shop-card:nth-child(1)')  // 치즈냥
  const p0 = await tileToClient(spots[0].c, spots[0].r)
  await page.mouse.click(p0.x, p0.y)
  const afterPlace = await page.evaluate(() => ({
    towers: window.__catpaw.game.towers.length,
    gold: window.__catpaw.game.gold,
  }))
  check('탭으로 고양이를 배치하고 골드가 차감된다',
    afterPlace.towers === 1 && afterPlace.gold === 220, JSON.stringify(afterPlace))

  // 경로 위에는 지을 수 없어야 한다
  const pathTile = await page.evaluate(() => {
    const t = window.__catpaw.game.path.tiles[3]
    return { c: t.c, r: t.r }
  })
  const pp = await tileToClient(pathTile.c, pathTile.r)
  await page.mouse.click(pp.x, pp.y)
  const blockedMsg = await page.evaluate(() => {
    const n = document.getElementById('toast')
    return n.hidden ? '' : n.textContent
  })
  check('경로 위 배치는 거부되고 안내가 뜬다', blockedMsg.includes('지을 수 없습니다'), blockedMsg || '(안내 없음)')

  // 살 돈이 없는 고양이는 거부돼야 한다 (골드 220 < 검은냥 240)
  await page.click('#shop-cards .shop-card:nth-child(4)')   // 검은냥 240
  const p1 = await tileToClient(spots[1].c, spots[1].r)
  await page.mouse.click(p1.x, p1.y)
  const poorMsg = await page.evaluate(() => {
    const n = document.getElementById('toast')
    return n.hidden ? '' : n.textContent
  })
  check('골드가 모자라면 배치가 거부된다',
    poorMsg.includes('골드가 부족') && (await page.evaluate(() => window.__catpaw.game.towers.length)) === 1,
    poorMsg || '(안내 없음)')

  // 살 수 있는 고양이로 바꾸면 배치된다 (샴냥 130)
  await page.click('#shop-cards .shop-card:nth-child(3)')
  await page.mouse.click(p1.x, p1.y)
  check('두 번째 고양이도 배치된다',
    (await page.evaluate(() => window.__catpaw.game.towers.length)) === 2,
    `골드 ${await page.evaluate(() => window.__catpaw.game.gold)}`)

  // ── 5. 타워 선택 패널 ──────────────────────────────────────
  await page.evaluate(() => { window.__catpaw.placingId = null })
  await page.mouse.click(p0.x, p0.y)
  await page.waitForSelector('#tower-panel:not([hidden])')
  const panelText = await page.textContent('#tower-panel')
  check('타워를 탭하면 상세 패널이 열린다',
    panelText.includes('치즈냥') && panelText.includes('업그레이드'), panelText.slice(0, 40).replace(/\s+/g, ' '))

  // 업그레이드
  await page.click('#tower-panel .btn.primary')
  check('업그레이드가 반영된다',
    (await page.evaluate(() => window.__catpaw.game.towers[0].level)) === 2)

  // ── 6. 웨이브 진행 ─────────────────────────────────────────
  await page.click('#btn-wave')
  check('웨이브가 시작된다', (await page.evaluate(() => window.__catpaw.game.phase)) === 'wave')

  // 시뮬레이션을 직접 빠르게 돌린다 (실시간으로 기다리지 않기 위해)
  const waveResult = await page.evaluate(() => {
    const g = window.__catpaw.game
    for (let i = 0; i < 60 * 120 && g.phase === 'wave'; i += 1) g.update(1 / 60)
    return { phase: g.phase, killed: g.stats.killed, leaked: g.stats.leaked, gold: g.gold, lives: g.lives }
  })
  check('1웨이브의 적을 모두 처치하고 준비 단계로 돌아온다',
    waveResult.phase === 'prep' && waveResult.killed === 8 && waveResult.leaked === 0,
    JSON.stringify(waveResult))

  // ── 7. 중반 웨이브까지 자동 진행 후 스크린샷 ─────────────────
  await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    // 골드를 넉넉히 주고 경로 주변에 고양이를 더 깔아 전투 장면을 만든다
    g.gold = 3000
    const ids = ['calico', 'siamese', 'chonk', 'black', 'cheese']
    let k = 0
    for (let r = 0; r < g.mapDef.rows && k < 10; r += 1) {
      for (let c = 0; c < g.mapDef.cols && k < 10; c += 1) {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dc, dr]) => g.path.tileSet.has(`${c + dc},${r + dr}`))
        if (near && g.placeTower(c, r, ids[k % ids.length]).ok) k += 1
      }
    }
    // 8웨이브까지 흘려보낸다
    for (let w = 0; w < 7; w += 1) {
      g.prepRemaining = 0
      g.startWave()
      for (let i = 0; i < 60 * 150 && g.phase === 'wave'; i += 1) g.update(1 / 60)
    }
    // 9웨이브를 시작해 전투가 한창인 장면에서 멈춘다
    g.prepRemaining = 0
    g.startWave()
    for (let i = 0; i < 60 * 14; i += 1) g.update(1 / 60)
  })
  await page.waitForTimeout(400) // 한 프레임 이상 그려질 시간
  const mid = await page.evaluate(() => {
    const g = window.__catpaw.game
    return { wave: g.waveNo, enemies: g.enemies.length, towers: g.towers.length, lives: g.lives, killed: g.stats.killed }
  })
  check('여러 웨이브를 연속 진행해도 시뮬레이션이 유지된다',
    mid.wave === 9 && mid.towers >= 10 && mid.killed > 50, JSON.stringify(mid))
  check('전투 중 화면에 적이 살아 있다', mid.enemies > 0, `적 ${mid.enemies}마리`)
  await page.screenshot({ path: join(outDir, '3-battle.png') })

  // ── 8. 설정 (스키마 자동 생성) ──────────────────────────────
  await page.click('#btn-pause')
  await page.waitForSelector('#overlay:not([hidden])')
  await page.screenshot({ path: join(outDir, '4-pause.png') })
  await page.click('#overlay-sheet button:text-is("설정")')
  await page.waitForSelector('.set-group')
  const rows = await page.$$('.set-row')
  check('설정 화면이 스키마에서 자동 생성된다', rows.length === 13, `${rows.length}개 항목`)
  await page.screenshot({ path: join(outDir, '5-settings.png') })

  // 토글을 바꾸면 즉시 저장된다
  await page.click('.set-row .switch input')  // 효과음 off
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('catpaw.progress')).settings.sfx)
  check('설정 변경이 localStorage에 즉시 저장된다', saved === false, `sfx=${saved}`)

  // ── 9. 도감 ────────────────────────────────────────────────
  await page.click('#overlay-sheet button:text-is("닫기")')   // 설정 닫기 → 일시정지로 복귀
  await page.waitForSelector('#overlay-sheet button:text-is("도감")')
  await page.click('#overlay-sheet button:text-is("도감")')
  await page.waitForSelector('.codex-tabs')
  const codexItems = await page.$$('.codex-item')
  check('도감이 레지스트리에서 자동 생성된다', codexItems.length === 5, `고양이 ${codexItems.length}종`)
  await page.click('.codex-tabs .chip:nth-child(2)')
  await page.waitForTimeout(120)
  const enemyItems = await page.$$('.codex-item')
  check('도감 해충 탭도 자동 생성된다', enemyItems.length === 6, `해충 ${enemyItems.length}종`)
  await page.screenshot({ path: join(outDir, '6-codex.png') })

  // ── 10. PWA ────────────────────────────────────────────────
  const manifest = await page.evaluate(async () => {
    const res = await fetch('manifest.webmanifest')
    return res.ok ? await res.json() : null
  })
  check('매니페스트가 세로 전체화면으로 설정돼 있다',
    manifest && manifest.display === 'fullscreen' && manifest.orientation === 'portrait' && manifest.icons.length === 3,
    manifest ? `${manifest.name} / 아이콘 ${manifest.icons.length}개` : '없음')

  const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false))
  check('서비스 워커가 등록된다 (오프라인 구동)', swReady === true)

  // ── 11. 콘솔 에러 ──────────────────────────────────────────
  check('콘솔 에러 0건', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '없음')

} catch (err) {
  check(`검증 도중 예외: ${err.message.split('\n')[0]}`, false)
} finally {
  await browser.close()
  server.close()
}

console.log('\n실행 검증 결과')
console.log(steps.join('\n'))
console.log(`\n${problems.length === 0 ? '통과' : `실패 ${problems.length}건`}: ${problems.join(', ') || '전 항목 통과'}`)
console.log(`스크린샷: ${outDir}`)
process.exit(problems.length === 0 ? 0 : 1)
