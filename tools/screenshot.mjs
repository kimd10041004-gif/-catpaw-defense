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
  check('맵 4개가 표시되고 첫 맵만 열려 있다', cards.length === 4 && locked.length === 3,
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

  // 경로 한가운데는 (스냅 반경 밖이므로) 여전히 거부돼야 한다
  const pathTile = await page.evaluate(() => {
    const t = window.__catpaw.game.path.tiles[3]
    return { c: t.c, r: t.r }
  })
  const towersBefore = await page.evaluate(() => window.__catpaw.game.towers.length)
  const pp = await tileToClient(pathTile.c, pathTile.r)
  await page.mouse.click(pp.x, pp.y)
  const blocked = await page.evaluate(() => ({
    msg: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent,
    towers: window.__catpaw.game.towers.length,
  }))
  check('경로 한가운데는 스냅되지 않고 거부된다',
    blocked.msg.includes('지을 수 없습니다') && blocked.towers === towersBefore,
    `${blocked.msg || '(안내 없음)'} / 타워 ${blocked.towers}개`)

  // 살짝 빗나간 터치는 옆의 지을 수 있는 칸으로 보정돼야 한다 (조작 개선의 핵심)
  const nearMiss = await page.evaluate(({ c, r }) => {
    const app = window.__catpaw
    const g = app.game
    // 경로 칸 바로 옆의 빈 칸을 찾고, 그 경계에서 살짝 경로 쪽으로 치우친 지점을 누른다
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bc = c + dc; const br = r + dr
      if (g.path.tileSet.has(`${bc},${br}`)) continue
      if (g.towerAt(bc, br)) continue
      if (bc < 0 || br < 0 || bc >= g.mapDef.cols || br >= g.mapDef.rows) continue
      const rect = document.getElementById('canvas').getBoundingClientRect()
      // 빈 칸 중심에서 경로 쪽으로 0.45칸 치우친 위치 = 사람이 흔히 빗나가는 정도
      const px = bc + 0.5 - dc * 0.45
      const py = br + 0.5 - dr * 0.45
      return {
        x: rect.left + app.renderer.ox + px * app.renderer.tile,
        y: rect.top + app.renderer.oy + py * app.renderer.tile,
        expect: { c: bc, r: br },
      }
    }
    return null
  }, pathTile)

  if (nearMiss) {
    await page.mouse.click(nearMiss.x, nearMiss.y)
    const snapped = await page.evaluate(({ c, r }) => !!window.__catpaw.game.towerAt(c, r), nearMiss.expect)
    check('살짝 빗나간 터치는 옆 빈 칸으로 보정된다', snapped,
      `보정 목표 (${nearMiss.expect.c},${nearMiss.expect.r})`)
  } else {
    check('살짝 빗나간 터치는 옆 빈 칸으로 보정된다', false, '테스트할 자리를 못 찾음')
  }

  // 살 돈이 없는 고양이는 거부돼야 한다 (골드 220 < 검은냥 240)
  await page.click('#shop-cards .shop-card:nth-child(4)')   // 검은냥 240
  const p1 = await tileToClient(spots[1].c, spots[1].r)
  await page.mouse.click(p1.x, p1.y)
  const poor = await page.evaluate(() => ({
    msg: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent,
    towers: window.__catpaw.game.towers.length,
    gold: window.__catpaw.game.gold,
  }))
  check('골드가 모자라면 배치가 거부된다',
    poor.msg.includes('골드가 부족'), `${poor.msg} (보유 ${poor.gold})`)

  // 골드를 채우고 다시 시도하면 배치된다
  await page.evaluate(() => { window.__catpaw.game.gold = 1000 })
  await page.click('#shop-cards .shop-card:nth-child(3)')   // 샴냥 130
  await page.mouse.click(p1.x, p1.y)
  check('골드를 채우면 배치된다',
    (await page.evaluate(() => window.__catpaw.game.towers.length)) === poor.towers + 1,
    `타워 ${poor.towers} → ${await page.evaluate(() => window.__catpaw.game.towers.length)}개`)

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
    // 9웨이브를 시작해 '전투가 한창인' 순간에서 멈춘다.
    // 고정 시간으로 끊으면 크리티컬 운에 따라 전멸해 있을 수 있으므로
    // 화면에 적이 충분히 모일 때까지 돌린 뒤 멈춘다.
    g.prepRemaining = 0
    g.startWave()
    for (let i = 0; i < 60 * 60; i += 1) {
      g.update(1 / 60)
      if (g.enemies.length >= 6) break
    }
  })
  await page.waitForTimeout(400) // 한 프레임 이상 그려질 시간
  const mid = await page.evaluate(() => {
    const g = window.__catpaw.game
    return { wave: g.waveNo, enemies: g.enemies.length, towers: g.towers.length, lives: g.lives, killed: g.stats.killed }
  })

  // ── 7-b. 필살기 ────────────────────────────────────────────
  const specialButtons = await page.$$('#specials .special')
  check('필살기 버튼이 등록된 수만큼 생성된다', specialButtons.length === 4, `${specialButtons.length}개`)

  // 적이 실제로 살아 있는 순간에 쏴야 의미가 있다 — 다음 웨이브를 불러 5초 진행시킨다
  const alive = await page.evaluate(() => {
    const g = window.__catpaw.game
    g.prepRemaining = 0
    g.startWave()
    for (let i = 0; i < 60 * 5; i += 1) g.update(1 / 60)
    return g.enemies.length
  })
  check('필살기 검증용으로 적이 전장에 남아 있다', alive > 0, `${alive}마리`)

  const beforeHp = await page.evaluate(() => window.__catpaw.game.enemies.reduce((n, e) => n + e.hp, 0))
  await specialButtons[0].click()   // 츄르 폭격
  const afterSpecial = await page.evaluate(() => ({
    hp: window.__catpaw.game.enemies.reduce((n, e) => n + e.hp, 0),
    used: window.__catpaw.game.stats.specialsUsed,
    ready: window.__catpaw.game.specialStates()[0].ready,
    flash: window.__catpaw.game.flashStrength,
  }))
  check('필살기가 적 체력을 실제로 깎고 쿨다운에 들어간다',
    afterSpecial.used === 1 && afterSpecial.ready === false && afterSpecial.hp < beforeHp,
    `총 체력 ${Math.round(beforeHp)} → ${Math.round(afterSpecial.hp)}, `
    + `화면섬광 ${afterSpecial.flash.toFixed(2)}`)

  check('여러 웨이브를 연속 진행해도 시뮬레이션이 유지된다',
    mid.wave === 9 && mid.towers >= 10 && mid.killed > 50, JSON.stringify(mid))
  check('전투 중 화면에 적이 여럿 살아 있다', mid.enemies >= 6, `적 ${mid.enemies}마리`)
  await page.screenshot({ path: join(outDir, '3-battle.png') })

  // ── 7-c. 최종 보스와 능력 ───────────────────────────────────
  const bossRun = await page.evaluate(() => {
    const g = window.__catpaw.game
    g.lives = 999                      // 연출 확인이 목적이라 목숨은 넉넉히
    g.enemies.length = 0; g.pending.length = 0
    g.waveNo = 29                      // 30웨이브(최종 보스)를 직접 부른다
    g.phase = 'prep'; g.prepRemaining = 0
    g.startWave()
    for (let i = 0; i < 60 * 22; i += 1) g.update(1 / 60)
    const boss = g.enemies.find((e) => e.def.id === 'demonking')
    return boss ? {
      name: boss.def.name, tier: boss.def.tier,
      shield: Math.round(boss.shield), shieldMax: Math.round(boss.shieldMax),
      abilities: boss.def.abilities.map((a) => a.kind),
      onField: g.enemies.length,
      summoned: g.enemies.filter((e) => e.def.id === 'rat').length,
    } : { missing: true }
  })
  check('최종 보스가 등장하고 보호막을 두른다',
    !bossRun.missing && bossRun.tier === 3 && bossRun.shieldMax > 0,
    JSON.stringify(bossRun))
  check('보스가 부하를 실제로 소환한다', !bossRun.missing && bossRun.summoned > 0,
    `소환된 시궁쥐 ${bossRun.summoned}마리 / 전장 ${bossRun.onField}마리`)
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(outDir, '8-boss.png') })

  // ── 8. 설정 (스키마 자동 생성) ──────────────────────────────
  await page.click('#btn-pause')
  await page.waitForSelector('#overlay:not([hidden])')
  await page.screenshot({ path: join(outDir, '4-pause.png') })
  await page.click('#overlay-sheet button:text-is("설정")')
  await page.waitForSelector('.set-group')
  const rows = await page.$$('.set-row')
  check('설정 화면이 스키마에서 자동 생성된다', rows.length >= 13, `${rows.length}개 항목`)
  await page.screenshot({ path: join(outDir, '5-settings.png') })

  // 토글을 바꾸면 즉시 저장된다
  await page.click('.set-row .switch input')  // 효과음 off
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('catpaw.progress')).settings.sfx)
  check('설정 변경이 localStorage에 즉시 저장된다', saved === false, `sfx=${saved}`)

  // ── 8-b. 캣닢 상점 ─────────────────────────────────────────
  await page.click('#overlay-sheet button:text-is("닫기")')
  await page.waitForSelector('#overlay-sheet button:text-is("🌿 캣닢 상점")')
  await page.click('#overlay-sheet button:text-is("🌿 캣닢 상점")')
  await page.waitForSelector('.store-item')
  const storeItems = await page.$$('.store-item')
  const billingText = await page.textContent('.billing-label')
  check('상점이 상품 배열에서 자동 생성된다', storeItems.length === 6, `${storeItems.length}개 상품`)
  check('데모 결제임을 숨기지 않고 표시한다', billingText.includes('데모 결제'), billingText.trim())
  await page.screenshot({ path: join(outDir, '7-store.png') })

  // 데모 결제로 캣닢을 충전하면 진행도에 반영된다
  const catnipBefore = await page.evaluate(() => window.__catpaw.progress.catnip)
  await page.click('.store-item button:text-is("₩1,200")')
  await page.waitForTimeout(250)
  const catnipAfter = await page.evaluate(() => ({
    catnip: window.__catpaw.progress.catnip,
    saved: JSON.parse(localStorage.getItem('catpaw.progress')).catnip,
    purchases: window.__catpaw.progress.purchases.length,
  }))
  check('결제가 캣닢을 지급하고 영수증과 함께 저장된다',
    catnipAfter.catnip === catnipBefore + 100 && catnipAfter.saved === catnipAfter.catnip
      && catnipAfter.purchases === 1,
    `${catnipBefore} → ${catnipAfter.catnip}, 영수증 ${catnipAfter.purchases}건`)

  // 캣닢으로 소모품 구매
  const goldBefore = await page.evaluate(() => window.__catpaw.game.gold)
  await page.click('.store-item button:text-is("🌿 30")')
  await page.waitForTimeout(200)
  const buyResult = await page.evaluate(() => ({
    gold: window.__catpaw.game.gold, catnip: window.__catpaw.progress.catnip,
  }))
  check('캣닢으로 산 소모품이 즉시 적용되고 캣닢이 차감된다',
    buyResult.gold === goldBefore + 400 && buyResult.catnip === catnipAfter.catnip - 30,
    `골드 ${goldBefore} → ${buyResult.gold}, 캣닢 ${catnipAfter.catnip} → ${buyResult.catnip}`)

  // ── 9. 도감 ────────────────────────────────────────────────
  // 소모품을 사면 오버레이가 닫히고 일시정지 화면으로 돌아온다
  await page.waitForSelector('#overlay-sheet button:text-is("도감")')
  await page.click('#overlay-sheet button:text-is("도감")')
  await page.waitForSelector('.codex-tabs')
  const codexItems = await page.$$('.codex-item')
  check('도감이 레지스트리에서 자동 생성된다', codexItems.length === 5, `고양이 ${codexItems.length}종`)
  await page.click('.codex-tabs .chip:nth-child(2)')
  await page.waitForTimeout(120)
  const enemyItems = await page.$$('.codex-item')
  check('도감 해충 탭도 자동 생성된다', enemyItems.length === 10, `해충 ${enemyItems.length}종`)
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
