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
import { mkdirSync, existsSync } from 'node:fs'
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
    blocked.msg.includes('못 짓는다') && blocked.towers === towersBefore,
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
    poor.msg.includes('골드 부족'), `${poor.msg} (보유 ${poor.gold})`)

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

  // ── 5-b. 조작 이질감을 만들던 것들 ──────────────────────────
  // (1) 밀어서 넘긴 손가락까지 '탭'으로 처리하면 뗄 때마다 패널이 열렸다 닫힌다
  await page.click('#tower-panel .tp-close')

  // (0) 닫은 패널이 지도 위에 계속 남아 탭을 삼키던 버그.
  //     hidden 을 걸어도 .tower-panel{display:flex} 가 브라우저 기본 [hidden]{display:none}
  //     을 덮어써서, 타워를 한 번 누른 뒤로는 화면 아래쪽 지도가 통째로 먹통이 됐다.
  const closedPanel = await page.evaluate(() => {
    const p = document.getElementById('tower-panel')
    const stage = document.getElementById('stage').getBoundingClientRect()
    // 패널이 있던 자리(스테이지 아래쪽 가운데)에서 실제로 무엇이 잡히는지 본다
    const hit = document.elementFromPoint(stage.left + stage.width / 2, stage.bottom - 40)
    return {
      display: getComputedStyle(p).display,
      height: Math.round(p.getBoundingClientRect().height),
      hitId: hit ? hit.id : null,
    }
  })
  check('패널을 닫으면 지도 위에서 완전히 사라진다 (탭을 삼키지 않는다)',
    closedPanel.display === 'none' && closedPanel.height === 0 && closedPanel.hitId === 'canvas',
    `display=${closedPanel.display} 높이=${closedPanel.height} 아래쪽에서 잡히는 것=${closedPanel.hitId}`)
  await page.mouse.move(p0.x, p0.y)
  await page.mouse.down()
  await page.mouse.move(p0.x + 70, p0.y + 30, { steps: 6 })
  await page.mouse.up()
  check('밀어서 넘긴 동작은 타워를 선택하지 않는다',
    await page.evaluate(() => document.getElementById('tower-panel').hidden),
    '패널이 닫힌 상태로 유지됨')

  // 같은 자리를 '탭'하면 여전히 선택돼야 한다 (드래그 판정이 과하지 않은지)
  await page.mouse.click(p0.x, p0.y)
  check('제자리 탭은 그대로 타워를 선택한다',
    !(await page.evaluate(() => document.getElementById('tower-panel').hidden)))

  // (2) 배치 모드 표시와 취소. 표시는 상점 카드 위에만 둔다 —
  //     지도 위에 안내를 띄우면 하필 그 칸에 고양이를 못 짓게 된다(실제로 낸 사고다).
  await page.click('#shop-cards .shop-card:nth-child(1)')
  const marked = await page.evaluate(() => ({
    placing: window.__catpaw.placingId,
    badge: !!document.querySelector('#shop-cards .shop-card.selected .x'),
  }))
  await page.click('#shop-cards .shop-card:nth-child(1)')   // 같은 카드를 다시 누르면 취소
  const afterCancel = await page.evaluate(() => ({
    placing: window.__catpaw.placingId,
    badge: !!document.querySelector('#shop-cards .shop-card .x'),
  }))
  check('배치 중임을 상점 카드에 표시하고 다시 눌러 취소한다',
    marked.placing === 'cheese' && marked.badge && afterCancel.placing === null && !afterCancel.badge,
    `선택 ${marked.placing}/표시 ${marked.badge} → 취소 ${afterCancel.placing}/표시 ${afterCancel.badge}`)

  // (2-b) 배치 모드에서도 지도 '전체'가 눌려야 한다.
  //       타워 패널·배치 안내를 지도 위에 얹었다가 그 아래가 통째로 먹통이 된 적이 두 번 있다.
  await page.click('#shop-cards .shop-card:nth-child(1)')
  const covered = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect()
    const bad = []
    for (let ix = 1; ix <= 5; ix += 1) {
      for (let iy = 1; iy <= 7; iy += 1) {
        const x = r.left + (r.width * ix) / 6
        const y = r.top + (r.height * iy) / 8
        const hit = document.elementFromPoint(x, y)
        if (!hit || hit.id !== 'canvas') {
          bad.push(`${Math.round(x)},${Math.round(y)}→${hit ? (hit.id || hit.className || hit.tagName) : 'null'}`)
        }
      }
    }
    return bad
  })
  await page.click('#shop-cards .shop-card:nth-child(1)')   // 취소해서 원래 상태로
  check('배치 중에도 지도 전체가 눌린다 (UI가 지도를 덮지 않는다)',
    covered.length === 0,
    covered.length ? `가려진 지점: ${covered.slice(0, 3).join(' / ')}` : '35개 지점 전부 캔버스')

  // (3) 판매 확인은 OS 기본 confirm 이 아니라 게임 안 시트여야 한다.
  //     window.confirm 이면 Playwright 가 자동으로 닫아버려 판매가 조용히 무산된다.
  let nativeDialogs = 0
  page.on('dialog', (d) => { nativeDialogs += 1; d.dismiss() })
  await page.mouse.click(p0.x, p0.y)
  await page.waitForSelector('#tower-panel:not([hidden])')
  const towersBeforeSell = await page.evaluate(() => window.__catpaw.game.towers.length)
  await page.click('#tower-panel .btn.danger')
  await page.waitForSelector('#overlay:not([hidden])', { timeout: 2000 })
  const sheetText = await page.textContent('#overlay-sheet')
  await page.click('#overlay-sheet .btn.danger')
  const towersAfterSell = await page.evaluate(() => window.__catpaw.game.towers.length)
  check('판매 확인이 OS 대화상자가 아니라 게임 안 시트로 뜬다',
    nativeDialogs === 0 && sheetText.includes('판매') && towersAfterSell === towersBeforeSell - 1,
    `OS 대화상자 ${nativeDialogs}회 / 타워 ${towersBeforeSell} → ${towersAfterSell}`)

  // (4) 햅틱은 설정에 있는데 실제로는 호출되지 않고 있었다
  const haptic = await page.evaluate(() => {
    const app = window.__catpaw
    const calls = []
    navigator.vibrate = (ms) => { calls.push(ms); return true }
    app.settings.haptics = true
    app._haptic(11)
    app.settings.haptics = false
    app._haptic(11)
    return calls
  })
  check('진동(햅틱) 설정이 실제 vibrate 호출을 켜고 끈다',
    haptic.length === 1 && haptic[0] === 11, `호출 ${JSON.stringify(haptic)}`)

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

  // 마나가 진짜 관문인지 — 모자라면 아무 일도 일어나지 않아야 한다
  const starved = await page.evaluate(() => {
    const g = window.__catpaw.game
    const cost = g.specialStates()[0].cost
    g.mana = cost - 1
    g.specialReadyAt.churu = 0
    const before = { mana: g.mana, used: g.stats.specialsUsed, hp: g.enemies.reduce((n, e) => n + e.hp, 0) }
    const res = g.useSpecial('churu')
    return {
      cost,
      refused: !res.ok,
      reason: res.reason || '',
      manaKept: g.mana === before.mana,
      notUsed: g.stats.specialsUsed === before.used,
      hpKept: g.enemies.reduce((n, e) => n + e.hp, 0) === before.hp,
      stillOffCooldown: g.specialReadyAt.churu === 0,
    }
  })
  check('마나가 모자라면 필살기가 거부되고 마나·쿨다운이 그대로 남는다',
    starved.refused && starved.manaKept && starved.notUsed && starved.hpKept && starved.stillOffCooldown,
    `${starved.reason} (비용 ${starved.cost}) / 마나보존 ${starved.manaKept} 쿨다운보존 ${starved.stillOffCooldown}`)

  // 정확히 비용만큼만 깎여야 한다. 필살기가 죽인 적이 마나를 되돌려주면
  // 후반에 필살기가 사실상 공짜가 된다 — 실제로 그랬고 여기서 잡았다.
  //
  // 한 evaluate 안에서 쓰고 바로 읽는다. 클릭과 읽기를 나누면 그 사이에 rAF 루프가
  // update() 를 돌려 웨이브 클리어 보너스(+8)가 끼어들고 검사가 들쭉날쭉해진다.
  const spent = await page.evaluate(() => {
    const g = window.__catpaw.game
    g.mana = g.manaMax
    g.specialReadyAt.churu = 0
    const before = g.mana
    const cost = g.specialStates()[0].cost
    const hpBefore = g.enemies.reduce((n, e) => n + e.hp, 0)
    const usedBefore = g.stats.specialsUsed
    const res = g.useSpecial('churu')
    return {
      ok: res.ok, before, cost, after: g.mana,
      hpBefore, hpAfter: g.enemies.reduce((n, e) => n + e.hp, 0),
      usedDelta: g.stats.specialsUsed - usedBefore,
      onCooldown: g.specialStates()[0].cooled === false,
      flash: g.flashStrength,
    }
  })
  check('필살기를 쓰면 정확히 비용만큼 깎인다 (자기 킬로 마나를 되벌지 않는다)',
    spent.ok && spent.after === spent.before - spent.cost,
    `${spent.before} → ${spent.after} (비용 ${spent.cost} 이므로 ${spent.before - spent.cost} 이어야 함)`)

  check('필살기가 적 체력을 실제로 깎고 쿨다운에 들어간다',
    spent.usedDelta === 1 && spent.onCooldown && spent.hpAfter < spent.hpBefore && spent.flash > 0,
    `총 체력 ${Math.round(spent.hpBefore)} → ${Math.round(spent.hpAfter)}, `
    + `쿨다운 진입 ${spent.onCooldown}, 화면섬광 ${spent.flash.toFixed(2)}`)

  // 버튼이 실제로 게임에 연결돼 있는지는 따로 본다 (값은 위에서 확인했다)
  await page.evaluate(() => {
    const g = window.__catpaw.game
    g.mana = g.manaMax
    g.specialReadyAt.nap = 0
  })
  const usedBefore = await page.evaluate(() => window.__catpaw.game.stats.specialsUsed)
  await specialButtons[1].click()   // 자장가
  const afterSpecial = await page.evaluate(() => ({
    used: window.__catpaw.game.stats.specialsUsed,
    hudMana: document.getElementById('hud-mana').textContent,
    mana: window.__catpaw.game.mana,
  }))
  check('필살기 버튼 탭이 게임에 연결돼 있고 HUD 마나가 따라온다',
    afterSpecial.used === usedBefore + 1 && Number(afterSpecial.hudMana) === afterSpecial.mana,
    `사용 ${usedBefore} → ${afterSpecial.used}, HUD ${afterSpecial.hudMana} / 실제 ${afterSpecial.mana}`)

  // ── 7-c. 밀크 크리스탈 ─────────────────────────────────────
  const crystal = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    g.mana = 10
    g.crystals.length = 0
    // 크리스탈은 웨이브 중에만 떨어진다. 앞선 필살기가 웨이브를 전멸시켰을 수 있으므로
    // 여기서 상태를 명시적으로 만들어 준다 (안 하면 검사가 들쭉날쭉해진다).
    g.phase = 'wave'
    g.nextCrystalAt = g.time            // 지금 떨어지게
    g.update(1 / 60)
    if (g.crystals.length === 0) return { spawned: false }

    const c = g.crystals[0]
    const rect = document.getElementById('canvas').getBoundingClientRect()
    return {
      spawned: true,
      onPath: g.path.tileSet.has(`${Math.floor(c.x)},${Math.floor(c.y)}`),
      before: g.mana,
      x: rect.left + app.renderer.ox + c.x * app.renderer.tile,
      y: rect.top + app.renderer.oy + c.y * app.renderer.tile,
    }
  })
  if (crystal.spawned) {
    await page.mouse.click(crystal.x, crystal.y)
    const got = await page.evaluate(() => ({
      mana: window.__catpaw.game.mana,
      left: window.__catpaw.game.crystals.length,
      towers: window.__catpaw.game.towers.length,
    }))
    check('밀크 크리스탈이 경로 밖에 떨어지고 탭하면 마나가 찬다',
      !crystal.onPath && got.mana > crystal.before && got.left === 0,
      `마나 ${crystal.before} → ${got.mana}, 남은 크리스탈 ${got.left}개, 경로 위 ${crystal.onPath}`)
  } else {
    check('밀크 크리스탈이 경로 밖에 떨어지고 탭하면 마나가 찬다', false, '크리스탈이 떨어지지 않음')
  }

  // ── 7-d. 엘리트(왕관) 변종 ─────────────────────────────────
  const elite = await page.evaluate(() => {
    const g = window.__catpaw.game
    g.enemies.length = 0
    // 확률에 의존하지 않도록 강제로 엘리트를 만들어 수치를 비교한다
    const plain = g._createEnemy('mouse', { progress: 0 })
    const crowned = g._createEnemy('mouse', { progress: 0, elite: true })
    const boss = g._createEnemy('ratking', { progress: 0, elite: true })
    return {
      hpUp: crowned.maxHp > plain.maxHp,
      goldUp: crowned.gold > plain.gold,
      armorUp: g.armorOf(crowned) > g.armorOf(plain),
      crown: !!crowned.palette.crown,
      defClean: g.getEnemyDefCrown ? true : plain.palette.crown === undefined,
      bossNotElite: boss.elite === false,
      detail: `체력 ${plain.maxHp}→${crowned.maxHp}, 골드 ${plain.gold}→${crowned.gold}, 방어 ${g.armorOf(plain)}→${g.armorOf(crowned)}`,
    }
  })
  check('엘리트는 왕관을 쓰고 더 단단하고 더 값지며, 정의를 오염시키지 않는다',
    elite.hpUp && elite.goldUp && elite.armorUp && elite.crown && elite.defClean && elite.bossNotElite,
    `${elite.detail} / 왕관 ${elite.crown} / 보스 제외 ${elite.bossNotElite}`)
  await page.evaluate(() => { window.__catpaw.game.enemies.length = 0 })

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
  await page.waitForSelector('#overlay-sheet button:text-is("캣닢 상점")')
  await page.click('#overlay-sheet button:text-is("캣닢 상점")')
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
  await page.click('.store-item button:has-text("30")')
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

  // ── 11. 단일 파일 번들 (dist/) ─────────────────────────────
  // ── 10-b. 결과 화면 + UI 전체 이모지 점검 ──────────────────
  // 이모지는 기기·폰트에 따라 흑백 윤곽으로 뜨거나 크기가 제각각이라 화면이 들쭉날쭉해진다.
  // 실제로 결과 화면이 그래서 지적을 받았다. 텍스트에 이모지가 남지 않았는지 직접 센다.
  await page.evaluate(() => {
    const g = window.__catpaw.game
    g.lives = 0
    g.phase = 'defeat'
    g.emit('defeat', g.summary())
  })
  await page.waitForSelector('#overlay:not([hidden])')
  await page.screenshot({ path: join(outDir, '11-result.png') })
  const resultCheck = await page.evaluate(() => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u
    const found = []
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement.closest('[hidden]')) continue
      const m = n.data.match(emoji)
      if (m) found.push(`${m[0]} (${n.data.trim().slice(0, 20)})`)
    }
    return { emoji: found, text: document.getElementById('overlay-sheet').innerText.slice(0, 40) }
  })
  check('결과 화면이 뜨고 UI 텍스트에 이모지가 없다',
    resultCheck.emoji.length === 0 && resultCheck.text.includes('뚫렸'),
    resultCheck.emoji.length ? `남은 이모지: ${resultCheck.emoji.join(', ')}` : resultCheck.text.replace(/\s+/g, ' '))
  await page.evaluate(() => window.__catpaw.ui.closeOverlay())

  // 스크롤 가능한 영역이 폰에서 실제로 스크롤되는지.
  // touch-action 은 조상까지 교차 적용되므로 body 에 none 을 걸면 설정 시트·맵 목록·상점이
  // 전부 손가락으로 스크롤되지 않는다. 헤드리스는 마우스를 쓰기 때문에 이 사고를 못 잡는다.
  const touch = await page.evaluate(() => {
    const eff = (node) => {
      // 조상을 거슬러 올라가며 none 을 거는 요소가 있는지 본다
      for (let el = node; el; el = el.parentElement) {
        if (getComputedStyle(el).touchAction === 'none') return el.id || el.tagName.toLowerCase()
      }
      return null
    }
    return {
      body: getComputedStyle(document.body).touchAction,
      shop: eff(document.getElementById('shop-cards')),
      maps: eff(document.getElementById('map-list')),
      canvas: getComputedStyle(document.getElementById('canvas')).touchAction,
    }
  })
  check('스크롤 영역이 터치 스크롤을 잃지 않는다 (지도만 touch-action:none)',
    touch.body !== 'none' && touch.shop === null && touch.maps === null && touch.canvas === 'none',
    `body=${touch.body} 지도=${touch.canvas} / 막는 조상: 상점=${touch.shop || '없음'} 맵목록=${touch.maps || '없음'}`)

  // 번들은 index.html 을 잘라 붙이는 방식이라 조용히 깨지기 쉽다.
  // 실제로 <svg id="icon-defs"> 가 통째로 잘려 아이콘이 전부 빈칸이던 적이 있다.
  const distFile = join(root, 'dist/catpaw-defense.html')
  if (existsSync(distFile)) {
    const bundlePage = await context.newPage()
    const bundleErrors = []
    bundlePage.on('pageerror', (e) => bundleErrors.push(e.message))
    await bundlePage.goto(`file://${distFile}`)
    await bundlePage.waitForFunction(() => window.__catpaw, null, { timeout: 15000 })
    await bundlePage.click('#btn-play')
    await bundlePage.click('.map-card')
    await bundlePage.waitForSelector('#screen-game:not([hidden])')
    const bundleIcons = await bundlePage.evaluate(() => {
      const uses = [...document.querySelectorAll('svg.i use')]
      const missing = uses
        .map((u) => u.getAttribute('href').slice(1))
        .filter((id) => !document.getElementById(id))
      // 아이콘이 실제로 픽셀을 차지하는지도 본다 (정의가 있어도 크기가 0이면 안 보인다)
      const sized = uses.filter((u) => u.ownerSVGElement.getBoundingClientRect().width > 4).length
      return { total: uses.length, missing, sized }
    })
    await bundlePage.screenshot({ path: join(outDir, '9-bundle.png') })
    check('단일 파일 번들이 아이콘까지 온전히 실행된다',
      bundleErrors.length === 0 && bundleIcons.missing.length === 0 && bundleIcons.sized > 0,
      `아이콘 ${bundleIcons.sized}/${bundleIcons.total}개 표시` +
      (bundleIcons.missing.length ? ` · 정의 없음 ${bundleIcons.missing.join(',')}` : '') +
      (bundleErrors.length ? ` · 오류 ${bundleErrors[0]}` : ''))
    await bundlePage.close()
  } else {
    check('단일 파일 번들이 아이콘까지 온전히 실행된다', false, 'dist/ 가 없습니다 — node tools/bundle.mjs 를 먼저 실행하세요')
  }

  // ── 12. 콘솔 에러 ──────────────────────────────────────────
  check('콘솔 에러 0건', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '없음')

} catch (err) {
  check(`검증 도중 예외: ${err.message.split("\n").slice(0, 12).join(" | ")}`, false)
} finally {
  await browser.close()
  server.close()
}

console.log('\n실행 검증 결과')
console.log(steps.join('\n'))
console.log(`\n${problems.length === 0 ? '통과' : `실패 ${problems.length}건`}: ${problems.join(', ') || '전 항목 통과'}`)
console.log(`스크린샷: ${outDir}`)
process.exit(problems.length === 0 ? 0 : 1)
