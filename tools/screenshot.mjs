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

/** 합격/불합격이 아니라 숫자만 남기는 줄 (기준값을 아직 못 정한 것) */
const note = (label, detail) => { steps.push(`  · ${label} — ${detail}`) }

/**
 * 프레임 간격을 재서 중앙값·p95·최악값을 돌려준다.
 *
 * 평균을 쓰지 않는다 — 한 번의 큰 끊김을 평균은 감추는데 눈에 띄는 건 그 한 번이다.
 *
 * 헤드리스 크로미움은 대개 소프트웨어 렌더링이라 절대값이 폰과 다르다. 이 숫자는
 * (1) 수정 전후 비교와 (2) '상한 없는 배열' 같은 구조적 문제를 잡는 데만 쓴다.
 * 진짜 체감은 배포된 프리뷰를 폰으로 열어봐야 안다.
 */
const measureFrames = (page, frames = 120) => page.evaluate((n) => new Promise((res) => {
  const ts = []
  const tick = (t) => {
    ts.push(t)
    if (ts.length <= n) { requestAnimationFrame(tick); return }
    const gaps = []
    for (let i = 1; i < ts.length; i += 1) gaps.push(ts[i] - ts[i - 1])
    gaps.sort((a, b) => a - b)
    const g = window.__catpaw.game
    res({
      frames: gaps.length,
      median: +gaps[gaps.length >> 1].toFixed(2),
      p95: +gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))].toFixed(2),
      worst: +gaps[gaps.length - 1].toFixed(2),
      // 16.7 로 재면 경계 지터(16.70001)까지 세어 0마리일 때도 20/120 이 나온다.
      // 60Hz 에서 진짜 빠진 프레임은 33ms 근처이므로 20ms 를 경계로 둔다.
      over20: gaps.filter((x) => x > 20).length,
      enemies: g ? g.enemies.length : 0,
      particles: g ? g.particles.length : 0,
      towers: g ? g.towers.length : 0,
    })
  }
  requestAnimationFrame(tick)
}), frames)

const fmtPerf = (p) => `중앙 ${p.median}ms · p95 ${p.p95}ms · 최악 ${p.worst}ms`
  + ` · 20ms 초과 ${p.over20}/${p.frames}`
  + ` · 적 ${p.enemies} 파티클 ${p.particles} 타워 ${p.towers}`

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
  const mapCount = await page.evaluate(() => window.__catpaw.__registry.listMaps().length)
  check('등록된 맵이 모두 표시되고 첫 맵만 열려 있다',
    cards.length === mapCount && locked.length === mapCount - 1,
    `카드 ${cards.length}개, 잠김 ${locked.length}개`)
  await page.screenshot({ path: join(outDir, '2-maps.png') })

  // ── 3. 게임 진입 ───────────────────────────────────────────
  await cards[0].click()
  await page.waitForSelector('#screen-game:not([hidden])')
  // 시작 골드·목숨은 맵 정의에 장착한 펫의 보너스가 더해진 값이다.
  // 숫자를 박아 두면 펫을 하나 바꿀 때마다 여기가 깨진다.
  const initial = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    const pet = app.__registry.getPet(app.progress.pets.equipped)
    return {
      gold: g.gold, lives: g.lives, waves: g.totalWaves,
      expectGold: g.mapDef.startGold + ((pet && pet.startGold) || 0),
      expectLives: g.mapDef.startLives + ((pet && pet.startLives) || 0),
      pet: pet ? pet.name : '없음',
    }
  })
  check('게임이 시작 상태로 초기화된다 (펫 보너스 포함)',
    initial.gold === initial.expectGold && initial.lives === initial.expectLives
    && initial.waves === 30,
    `${JSON.stringify(initial)} · 펫 ${initial.pet}`)

  // 고양이 3마리는 시나리오 보상이라 새 저장에서는 잠겨 있다. 잠금 자체는 아래
  // '시나리오' 절에서 따로 확인하고, 여기서는 열어둔다 — 배치·조작·마나 검사의
  // 의도는 잠금과 무관하고, 잠긴 카드를 누르려다 30초씩 기다리게 된다.
  await page.evaluate(() => {
    const app = window.__catpaw
    app.progress.unlockedTowers = app.__registry.listTowers().map((t) => t.id)
    app.game.progress = app.progress
    app.ui.renderShop(app.game, null)
  })

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
  const goldBeforePlace = await page.evaluate(() => window.__catpaw.game.gold)
  await page.mouse.click(p0.x, p0.y)
  const afterPlace = await page.evaluate(() => ({
    towers: window.__catpaw.game.towers.length,
    gold: window.__catpaw.game.gold,
    cost: window.__catpaw.__registry.getTower('cheese').levels[0].cost,
  }))
  check('탭으로 고양이를 배치하고 골드가 차감된다',
    afterPlace.towers === 1 && afterPlace.gold === goldBeforePlace - afterPlace.cost,
    `${goldBeforePlace} → ${afterPlace.gold} (치즈냥 ${afterPlace.cost})`)

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

  // ── 4-b. 프레임 아트 ───────────────────────────────────────
  // 고양이는 원래 ctx.ellipse() 로 코드로 그렸다. 사용자가 준 그림으로 바꿨는데,
  // 그림이 안 붙어도 벡터로 떨어져서 조용히 예전 그림이 나온다. 눈으로만 보면
  // 놓치므로 "그림이 실제로 화면 픽셀이 됐는지"를 색 수로 판정한다.
  const artKeys = await page.evaluate(() => window.__catpaw.__framesets.loadedFrameSetKeys())
  const artTotal = await page.evaluate(() => window.__catpaw.__registry.listFrameSets().length)
  check('등록된 프레임 아트가 전부 로드된다', artKeys.length === artTotal,
    `${artKeys.length}/${artTotal}장`)

  // render.js 와 ui.js 가 쓰는 drawUnit 을 그대로 불러서, 같은 정의를 벡터로 그린
  // 결과와 비교한다. 지도 배경·숨쉬기 흔들림 없이 "그림 경로를 탔는지"만 본다.
  const artVsVector = await page.evaluate(() => {
    const app = window.__catpaw
    const def = app.__registry.getTower('cheese')
    const R = 40, S = 140
    const paint = (fn) => {
      const cv = document.createElement('canvas')
      cv.width = S; cv.height = S
      const ctx = cv.getContext('2d')
      fn(ctx)
      const d = ctx.getImageData(0, 0, S, S).data
      const colors = new Set()
      let opaque = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200) { opaque += 1; colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`) }
      }
      return { data: d, opaque, colors: colors.size }
    }
    const art = paint((ctx) => app.__framesets.drawUnit(ctx, def,
      { x: S / 2, y: S / 2, r: R, angle: -Math.PI / 2, phase: 0, t: 0, seed: 0 }))
    const vec = paint((ctx) => app.__registry.getSprite(def.sprite)(ctx,
      { x: S / 2, y: S / 2, r: R, palette: def.palette, angle: -Math.PI / 2, t: 0 }))

    let diff = 0
    for (let i = 0; i < art.data.length; i += 4) {
      if (Math.abs(art.data[i] - vec.data[i]) > 12) diff += 1
    }
    return { artOpaque: art.opaque, artColors: art.colors, vecColors: vec.colors, diff }
  })
  check('고양이가 채색 그림으로 그려진다 (벡터 폴백이 아니다)',
    artVsVector.artOpaque > 1000
      && artVsVector.artColors > artVsVector.vecColors * 5
      && artVsVector.diff > 1000,
    `그림 ${artVsVector.artColors}색 / 벡터 ${artVsVector.vecColors}색 · ` +
    `다른 픽셀 ${artVsVector.diff}개 · 불투명 ${artVsVector.artOpaque}px`)

  // 그림이 붙은 정의가 하나라도 벡터로 새면 화풍이 섞여 보인다. 전부 확인한다.
  const allArt = await page.evaluate(() => {
    const app = window.__catpaw
    const reg = app.__registry
    const defs = [...reg.listTowers(), ...reg.listEnemies()].filter((d) => d.frames)
    const S = 160, R = 46
    const paint = (fn) => {
      const cv = document.createElement('canvas')
      cv.width = S; cv.height = S
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      fn(ctx)
      const d = ctx.getImageData(0, 0, S, S).data
      const colors = new Set()
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
      return { data: d, colors: colors.size }
    }
    const vectorish = []
    for (const def of defs) {
      const art = paint((ctx) => app.__framesets.drawUnit(ctx, def,
        { x: S / 2, y: S / 2, r: R, angle: 0, t: 0, seed: 0, frame: 0, flying: def.flying }))
      const vec = paint((ctx) => reg.getSprite(def.sprite)(ctx,
        { x: S / 2, y: S / 2, r: R, palette: def.palette, angle: 0, t: 0, flying: def.flying }))
      let diff = 0
      for (let i = 0; i < art.data.length; i += 4) if (Math.abs(art.data[i] - vec.data[i]) > 12) diff += 1
      // 채색 그림은 벡터(단색 도형 몇 개)보다 색 수가 훨씬 많다
      if (!(art.colors > vec.colors * 3 && diff > 500)) {
        vectorish.push(`${def.id}(색 ${art.colors}/${vec.colors} 차이 ${diff})`)
      }
    }
    return { total: defs.length, vectorish }
  })
  check('그림이 붙은 고양이·해충이 하나도 빠짐없이 채색 그림으로 그려진다',
    allArt.vectorish.length === 0,
    `${allArt.total}종 확인` + (allArt.vectorish.length ? ` · 벡터로 샘: ${allArt.vectorish.join(', ')}` : ''))

  // 걷기 두 프레임이 실제로 다른 그림이어야 한다 (스트립 좌표가 어긋나면 같은 칸만 나온다)
  const walk = await page.evaluate(() => {
    const app = window.__catpaw
    const def = app.__registry.getEnemy('rat')
    const S = 160, R = 46
    const shot = (frame) => {
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      app.__framesets.drawUnit(ctx, def, { x: S / 2, y: S / 2, r: R, angle: 0, t: 0, frame })
      return ctx.getImageData(0, 0, S, S).data
    }
    const a = shot(0), b = shot(1), c = shot(2)
    const cmp = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) > 12) n += 1; return n }
    return { ab: cmp(a, b), ac: cmp(a, c) }
  })
  check('해충의 걷기 A·B·멈춤이 서로 다른 그림이다',
    walk.ab > 200 && walk.ac > 200, `A↔B ${walk.ab}px · A↔멈춤 ${walk.ac}px`)

  // 오래 안 쏘면 자는 프레임(스트립의 마지막 칸)으로 바뀐다.
  // 프레임 선택이 화면까지 도달하는지 보는 검사다 — 같은 칸의 픽셀이 달라져야 한다.
  const sleepSwap = await page.evaluate(async () => {
    const app = window.__catpaw
    const g = app.game
    const tw = g.towers[0]
    const cv = document.getElementById('canvas')
    const dpr = app.renderer.dpr
    const t = app.renderer.tile * dpr
    const grab = () => {
      const x = (app.renderer.ox + tw.c * app.renderer.tile) * dpr
      const y = (app.renderer.oy + tw.r * app.renderer.tile) * dpr
      return [...cv.getContext('2d').getImageData(x, y, t, t).data]
    }
    const frame = () => new Promise((res) => requestAnimationFrame(() => res()))

    tw.lastFired = g.time            // 방금 쏜 상태
    await frame(); await frame()
    const awake = grab()
    const wasIdle = g.isTowerIdle(tw)

    tw.lastFired = g.time - 99       // 한참 안 쏜 상태
    await frame(); await frame()
    const asleep = grab()
    const nowIdle = g.isTowerIdle(tw)

    let diff = 0
    for (let i = 0; i < awake.length; i += 4) if (awake[i] !== asleep[i]) diff += 1
    return { wasIdle, nowIdle, diff, total: awake.length / 4 }
  })
  check('오래 안 쏘면 자는 프레임으로 바뀐다',
    sleepSwap.wasIdle === false && sleepSwap.nowIdle === true && sleepSwap.diff > 200,
    `깨어있음→잠 판정 ${sleepSwap.wasIdle}→${sleepSwap.nowIdle} / 바뀐 픽셀 ${sleepSwap.diff}개`)

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
  // 가벼운 순간을 먼저 잰다 (준비 단계, 적 0마리). 무거울 때만 나빠지는지 보려면
  // 비교할 바닥값이 있어야 한다.
  note('프레임 간격 (준비 단계)', fmtPerf(await measureFrames(page)))

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
  // HUD 는 렌더 루프에서 갱신되므로 클릭 직후 값을 읽으면 한 프레임 전 값이 잡힌다.
  // 프레임 아트가 붙어 그리는 일이 늘면서 이 지연이 실제로 검사를 흔들었다.
  await page.waitForFunction(
    () => document.getElementById('hud-mana').textContent === String(window.__catpaw.game.mana),
    null, { timeout: 3000 },
  ).catch(() => {})   // 안 맞으면 아래 check 가 실패로 보고한다
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
  // 새 목표 4종이 보는 집계가 실제로 summary() 까지 실려 나가는가.
  // stats 안에 넣은 값은 스프레드로 따라오지만 gold·time 처럼 stats 밖에 있는 값은
  // 직접 실어야 한다. 안 실으면 목표가 조용히 '항상 통과'가 된다.
  const tally = await page.evaluate(() => {
    const s = window.__catpaw.game.summary()
    return {
      towersSold: s.towersSold, upgradesBought: s.upgradesBought,
      goldLeft: s.goldLeft, elapsed: s.elapsed === undefined ? undefined : Math.round(s.elapsed),
    }
  })
  check('새 목표가 보는 집계 4종이 판 결과에 실려 나온다',
    Object.values(tally).every((v) => typeof v === 'number')
    && tally.towersSold >= 1 && tally.upgradesBought >= 1 && tally.elapsed > 0,
    JSON.stringify(tally))

  // 가장 무거운 순간 — 마왕과 부하 수십 마리가 전장에 있고 파티클이 쏟아진다.
  // 두 번 잰다: 위 evaluate 가 1320번의 update 를 한 덩어리로 돌리기 때문에 직후에는
  // GC 와 정착 비용이 섞인다. 그게 얼마나 되는지 갈라 봐야 진짜 프레임률을 안다.
  note('프레임 간격 (마왕전·직후, 위 update 폭주의 잔열 포함)',
    fmtPerf(await measureFrames(page)))
  await page.waitForTimeout(700)
  const perfBoss = await measureFrames(page)
  /* 숫자로 남기되 합격·불합격을 걸지 않는다.
   *
   * 처음엔 '중앙 20ms 이하'를 검사로 걸었다. 그런데 컨테이너가 바빠지자 **코드를
   * 한 줄도 안 바꾼 커밋에서 똑같이 33.3ms** 가 나왔다(같은 날 아침엔 16.7ms 로
   * 통과했다). 헤드리스 크로미움은 vsync 에 걸려 16.7ms 를 조금만 넘겨도 33.3ms
   * 로 떨어지므로, 절대 시간 기준은 코드 회귀가 아니라 그때그때의 머신 부하를
   * 재게 된다. 그런 검사는 회귀를 잡는 게 아니라 신뢰를 깎는다.
   *
   * 매 프레임 도는 코드가 늘어나는 것은 구조로 막는다 — 파티클 상한, 바닥 캐시,
   * DoT 스택 상한은 각각 따로 검사가 걸려 있다. 실기기 체감은 Vercel 프리뷰를
   * 폰으로 열어 마왕전까지 가 보는 게 진짜 답이다. */
  note('프레임 간격 (마왕전·정착 후)', fmtPerf(perfBoss))

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
  // 숫자를 박아 두면 고양이를 늘릴 때마다 여기가 깨진다. 레지스트리에서 끌어온다.
  const towerCount = await page.evaluate(() => window.__catpaw.__registry.listTowers().length)
  check('도감이 레지스트리에서 자동 생성된다',
    codexItems.length === towerCount && towerCount >= 9,
    `고양이 ${codexItems.length}종 / 등록 ${towerCount}종`)
  await page.click('.codex-tabs .chip:nth-child(2)')
  await page.waitForTimeout(120)
  const enemyItems = await page.$$('.codex-item')
  const enemyCount = await page.evaluate(() => window.__catpaw.__registry.listEnemies().length)
  check('도감 해충 탭도 자동 생성된다',
    enemyItems.length === enemyCount && enemyCount >= 14,
    `해충 ${enemyItems.length}종 / 등록 ${enemyCount}종`)
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

  // ── 8-b. 지도 아트 ─────────────────────────────────────────
  // 길 질감은 색이 아니라 CanvasPattern 으로 칠한다. 패턴이 안 붙으면 조용히 단색으로
  // 떨어지므로 눈으로만 보면 놓친다. 실제로 칠해졌는지 픽셀로 확인한다.
  //
  // 맵마다 새로 시작해서 잰다. 전투 중에는 피해 숫자가 여백까지 흘러와 판정을 흐린다.
  const mapArt = await page.evaluate(async () => {
    const app = window.__catpaw
    const cv = document.getElementById('canvas')
    const ctx = cv.getContext('2d')
    const uniq = (x, y, n) => {
      const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(n), Math.round(n)).data
      const seen = new Set()
      for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
      return seen.size
    }

    const rows = []
    for (const target of app.__registry.listMaps()) {
      app.startGame(target.id)
      // startGame 은 상태만 세운다. 실제로 그려지는 건 다음 프레임이다.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const R = app.renderer
      const dpr = R.dpr
      const pts = app.game.path.points

      // 1) 길 위가 질감인가 — 한복판을 오려 고유 색 수를 센다. 단색이면 1~2종이다.
      const mid = pts[Math.floor(pts.length / 2)]
      const half = R.tile * 0.26
      const onPath = uniq((R.toPx(mid.x) - half) * dpr, (R.toPy(mid.y) - half) * dpr, half * 2 * dpr)

      // 2) 격자 밖(좌우 여백)으로 새지 않는가.
      //    캔버스 전체가 theme.sky 로 칠해져 있으므로 알파가 아니라 '하늘색과 다른 픽셀'을 센다.
      //
      //    길은 격자 밖에서 등장·퇴장한다(부엌은 x=-1 로 들어와 x=9 로 나간다). 그 구간은
      //    여백을 침범하는 게 정상이므로, 실제로 격자를 벗어나는 선분의 행 띠만 빼고 잰다.
      //    나머지 여백에 하늘색이 아닌 픽셀이 있으면 패턴이 엉뚱한 데까지 칠해진 것이다.
      // 띠 반폭. 가장 넓게 번지는 건 길 그림자다 — 굵기 1.0칸(반폭 0.5)에 아래로 0.06칸
      // 밀려 그려지므로 중심선에서 0.56칸까지 간다. 0.6 으로 잡는다.
      const hw = 0.6
      const bandL = [], bandR = []
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1], b = pts[i]
        const y0 = Math.min(a.y, b.y) - hw, y1 = Math.max(a.y, b.y) + hw
        if (Math.min(a.x, b.x) - hw < 0) bandL.push([y0, y1])
        if (Math.max(a.x, b.x) + hw > target.cols) bandR.push([y0, y1])
      }
      const sky = target.theme.sky
      const sr = parseInt(sky.slice(1, 3), 16)
      const sg = parseInt(sky.slice(3, 5), 16)
      const sb = parseInt(sky.slice(5, 7), 16)
      /** 여백 한 쪽을 훑어 하늘색과 다른 픽셀을 센다. bands 에 걸린 행은 건너뛴다. */
      const scan = (px0, wCss, bands) => {
        const x0 = Math.round(px0 * dpr), w = Math.round(wCss * dpr)
        if (w < 1 || x0 < 0 || x0 + w > cv.width) return [0, 0]
        const d = ctx.getImageData(x0, 0, w, cv.height).data
        let bad = 0, seen = 0
        for (let py = 0; py < cv.height; py += 1) {
          const gy = (py / dpr - R.oy) / R.tile
          if (bands.some(([lo, hi]) => gy >= lo && gy <= hi)) continue
          for (let px = 0; px < w; px += 1) {
            const i = (py * w + px) * 4
            seen += 1
            if (Math.abs(d[i] - sr) > 24 || Math.abs(d[i + 1] - sg) > 24 || Math.abs(d[i + 2] - sb) > 24) bad += 1
          }
        }
        return [bad, seen]
      }
      const gridRight = R.toPx(target.cols)
      const [badL, seenL] = scan(0, R.ox - 2, bandL)
      const [badR, seenR] = scan(gridRight + 2, cv.width / dpr - gridRight - 2, bandR)

      // 3) 막힌 칸에 소품이 놓였는가
      // 4) 바닥이 이 맵의 색인가 — 바닥은 캐시해 두므로 맵을 바꿨는데 캐시가 안 바뀌면
      //    이전 맵의 바닥이 그대로 남는다. 빈 칸 한가운데 색을 테마 색과 대조한다.
      let ground = null
      for (let rr = 0; rr < target.rows && ground === null; rr += 1) {
        for (let cc = 0; cc < target.cols; cc += 1) {
          if (app.game.path.tileSet.has(`${cc},${rr}`)) continue
          if ((target.blocked || []).some((b) => b[0] === cc && b[1] === rr)) continue
          const px = (R.toPx(cc) + R.tile * 0.5) * dpr
          const py = (R.toPy(rr) + R.tile * 0.5) * dpr
          const d = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data
          const hex = (c) => parseInt(c, 16)
          const near = (h) => Math.abs(d[0] - hex(h.slice(1, 3))) < 18
            && Math.abs(d[1] - hex(h.slice(3, 5))) < 18
            && Math.abs(d[2] - hex(h.slice(5, 7))) < 18
          ground = {
            rgb: `${d[0]},${d[1]},${d[2]}`,
            ok: near(target.theme.ground) || near(target.theme.groundAlt),
          }
          break
        }
      }

      let cell = null, empty = null
      if ((target.blocked || []).length > 0) {
        const [c, r] = target.blocked[0]
        cell = uniq(R.toPx(c) * dpr, R.toPy(r) * dpr, R.tile * dpr)
        // 비교용: 막히지 않고 길도 아닌 빈 칸
        for (let rr = 0; rr < target.rows && empty === null; rr += 1) {
          for (let cc = 0; cc < target.cols; cc += 1) {
            if (app.game.path.tileSet.has(`${cc},${rr}`)) continue
            if (target.blocked.some((b) => b[0] === cc && b[1] === rr)) continue
            empty = uniq(R.toPx(cc) * dpr, R.toPy(rr) * dpr, R.tile * dpr)
            break
          }
        }
      }
      rows.push({ map: target.name, onPath, bad: badL + badR, seen: seenL + seenR,
        ox: Math.round(R.ox), cell, empty, ground, props: (target.props || []).length })
    }
    return rows
  })
  const flat = (f) => mapArt.map((m) => `${m.map} ${f(m)}`).join(' · ')
  check('길이 단색이 아니라 질감으로 칠해진다',
    mapArt.length > 0 && mapArt.every((m) => m.onPath > 300),
    `길 위 고유 색 — ${flat((m) => `${m.onPath}종`)}`)
  check('길 질감이 격자 밖으로 새지 않는다',
    mapArt.length > 0 && mapArt.every((m) => m.seen > 1000 && m.bad === 0),
    `여백 ${mapArt[0]?.ox}px — ${flat((m) => `${m.bad}/${m.seen}`)}`)
  // ── 8-b-2. 새 고양이 4종의 능력이 실제로 작동하는가 ─────────
  // 데이터만 넣고 끝내면 "상점에 뜨긴 뜬다"까지만 확인된다. 능력이 실제로 무엇을
  // 하는지 픽셀이 아니라 게임 상태로 잰다.
  const newCats = await page.evaluate(() => {
    const app = window.__catpaw
    app.startGame('alley')
    const g = app.game
    g.gold = 999999
    g.lives = 99999
    const out = {}

    /** 길이 아닌 칸을 찾아 타워를 놓는다 */
    const place = (id) => {
      for (let r = 0; r < g.mapDef.rows; r += 1) {
        for (let c = 0; c < g.mapDef.cols; c += 1) {
          const res = g.placeTower(c, r, id)
          if (res.ok) return res.tower
        }
      }
      return null
    }
    const clear = () => { g.towers.length = 0; g.enemies.length = 0; g.recomputeTowerMods() }
    const maxOut = (t) => { while (g.upgradeTower(t)) { /* 만렙까지 */ } }

    // 1) buff — 옆에 서면 배수가 오르고, 치우면 되돌아온다
    clear()
    const plain = place('cheese')
    const before = plain.mods.damageMul
    const tux = g.placeTower(plain.c + 1, plain.r, 'tuxedo').tower
      || g.placeTower(plain.c, plain.r + 1, 'tuxedo').tower
    maxOut(tux)
    const withBuff = plain.mods.damageMul
    g.sellTower(tux)
    out.buff = { before, withBuff, after: plain.mods.damageMul }

    // 2) pierce — 길 위에 일렬로 세우고 한 발
    clear()
    const sphynx = place('sphynx'); maxOut(sphynx)
    // 타워에서 가장 가까운 경로 지점을 찾는다. pointAtDistance 를 직접 못 부르므로
    // 적을 하나씩 놓아 보고 좌표를 읽는다 (놓자마자 지운다).
    let near = 0, best = Infinity
    for (let d = 0; d < g.path.lengthTiles; d += 0.5) {
      const e = g._createEnemy('mouse', { progress: d, hp: 1e9 })
      const dist = Math.hypot(e.x - sphynx.x, e.y - sphynx.y)
      if (dist < best) { best = dist; near = d }
      e.alive = false
    }
    g.enemies.length = 0
    const line = []
    for (let i = 0; i < 5; i += 1) {
      line.push(g._createEnemy('mouse', { progress: near + i * 0.35, hp: 1e9 }))
    }
    const lvS = sphynx.def.levels[sphynx.level - 1]
    g._fire(sphynx, lvS, line[0])
    out.pierce = {
      hit: line.filter((e) => e.hp < 1e9).length,
      maxHits: lvS.effects[0].maxHits,
      onField: line.length,
    }

    // 3) chain — 뭉쳐 있는 적에게 한 발. 같은 적을 두 번 때리면 안 된다
    clear()
    const blue = place('bluerussian'); maxOut(blue)
    best = Infinity; near = 0
    for (let d = 0; d < g.path.lengthTiles; d += 0.5) {
      const e = g._createEnemy('mouse', { progress: d, hp: 1e9 })
      const dist = Math.hypot(e.x - blue.x, e.y - blue.y)
      if (dist < best) { best = dist; near = d }
      e.alive = false
    }
    g.enemies.length = 0
    const cluster = []
    for (let i = 0; i < 6; i += 1) {
      cluster.push(g._createEnemy('mouse', { progress: near + i * 0.3, hp: 1e9 }))
    }
    const lvB = blue.def.levels[blue.level - 1]
    g._fire(blue, lvB, cluster[0])
    // 투사체가 맞아야 chain 이 돈다 — 투사체를 즉시 명중시킨다
    for (const p of g.projectiles) { p.life = 0.001 }
    for (let i = 0; i < 60; i += 1) g.update(1 / 60)
    const damaged = cluster.filter((e) => e.hp < 1e9)
    out.chain = { damaged: damaged.length, jumps: lvB.effects[0].jumps }

    // 4) dot — 장갑 8짜리 두더지에게 걸고, 더 안 때려도 계속 닳는가
    clear()
    const mack = place('mackerel'); maxOut(mack)
    const mole = g._createEnemy('mole', { progress: 1, hp: 100000 })
    const lvM = mack.def.levels[mack.level - 1]
    g.addDot(mole, lvM.effects[0].dps, lvM.effects[0].duration, lvM.effects[0].maxStacks)
    g.towers.length = 0                       // 더 이상 아무도 안 때린다
    const hp0 = mole.hp
    for (let i = 0; i < 60; i += 1) g.update(1 / 60)   // 1초
    const hp1 = mole.hp
    // 스택 상한을 넘겨 걸어도 상한 안에서만 쌓인다
    for (let i = 0; i < 10; i += 1) g.addDot(mole, 5, 5, lvM.effects[0].maxStacks)
    out.dot = {
      dps: lvM.effects[0].dps,
      lost1s: Math.round(hp0 - hp1),
      armor: mole.def.armor,
      stacks: mole.dots.length,
      maxStacks: lvM.effects[0].maxStacks,
    }
    return out
  })
  // 새 해충 4종 — 각자의 성질이 게임 상태로 관측되는가
  const newPests = await page.evaluate(async () => {
    const app = window.__catpaw
    app.startGame('rooftop')
    const g = app.game
    g.lives = 99999
    g.gold = 999999
    // waveNo 를 안 올리고 phase 만 'wave' 로 두면 웨이브 종료 계산이 0웨이브를 만나 터진다
    g.waveNo = 1
    g.phase = 'wave'
    g.pending = [{ atSec: 1e9, enemyId: 'mouse', hp: 1, gold: 1 }]   // 웨이브가 안 끝나게
    const out = {}

    // 1) 불개미 — 샴냥의 둔화가 아예 안 걸린다
    g.enemies.length = 0
    const ant = g._createEnemy('fireant', { progress: 2, hp: 1e6 })
    const rat = g._createEnemy('rat', { progress: 2, hp: 1e6 })
    g.addSlow(ant, 0.6, 5)
    g.addSlow(rat, 0.6, 5)
    out.slow = { ant: ant.status.slowFactor, rat: +rat.status.slowFactor.toFixed(2) }

    // 2) 비둘기 — 삼색냥(지상 전용)이 못 잡는다
    g.enemies.length = 0
    const pigeon = g._createEnemy('pigeon', { progress: 2, hp: 1e6 })
    const calico = app.__registry.getTower('calico')
    out.air = {
      flying: pigeon.flying, armor: pigeon.def.armor,
      calicoTargets: calico.targets,
    }

    // 3) 지렁이 — 죽으면 둘이 되고, 그 둘은 더는 안 갈라진다
    g.enemies.length = 0
    const worm = g._createEnemy('worm', { progress: 3, hp: 10 })
    g.applyDamage(worm, 99999)
    g.update(1 / 60)
    const kids = g.enemies.filter((e) => e.def.id === 'worm')
    const kidCount = kids.length
    for (const k of kids) g.applyDamage(k, 99999)
    g.update(1 / 60)
    out.split = { kids: kidCount, grandKids: g.enemies.filter((e) => e.def.id === 'worm').length }

    // 4) 집게벌레 — 옆의 다친 적을 고친다
    g.enemies.length = 0
    const hurt = g._createEnemy('rat', { progress: 4, hp: 1000 })
    hurt.hp = 100
    const medic = g._createEnemy('earwig', { progress: 4, hp: 1000 })
    void medic
    const hp0 = hurt.hp
    for (let i = 0; i < 60 * 4; i += 1) g.update(1 / 60)
    out.mend = { before: hp0, after: Math.round(hurt.hp) }
    return out
  })
  check('불개미는 샴냥의 둔화가 아예 안 걸린다',
    newPests.slow.ant === 0 && newPests.slow.rat > 0,
    `불개미 둔화 ${newPests.slow.ant} · 시궁쥐 둔화 ${newPests.slow.rat}`)
  check('비둘기는 날면서 장갑까지 있어 지상 전용 고양이가 못 잡는다',
    newPests.air.flying === true && newPests.air.armor >= 3
    && newPests.air.calicoTargets === 'ground',
    `공중 ${newPests.air.flying} · 장갑 ${newPests.air.armor} · 삼색냥 ${newPests.air.calicoTargets}`)
  check('지렁이는 죽으면 둘이 되고 그 둘은 더는 안 갈라진다',
    newPests.split.kids === 2 && newPests.split.grandKids === 0,
    `새끼 ${newPests.split.kids}마리 → 손자 ${newPests.split.grandKids}마리`)
  check('집게벌레가 옆의 다친 적을 실제로 고친다',
    newPests.mend.after > newPests.mend.before,
    `체력 ${newPests.mend.before} → ${newPests.mend.after}`)

  // 필살기 연계 — 순서와 시간을 본다. 성립하면 피해가 실제로 배로 들어가야 한다.
  const link = await page.evaluate(() => {
    const app = window.__catpaw
    app.startGame('alley')
    const g = app.game
    g.lives = 99999
    g.phase = 'wave'
    const reg = app.__registry
    const combo = reg.listSpecialCombos()[0]        // 얼린 만찬 (자장가 → 츄르)

    /** 적을 한 줄 세우고 지정한 필살기만 써서 총 피해를 잰다 */
    const totalDamage = (before) => {
      g.enemies.length = 0
      for (let i = 0; i < 12; i += 1) g._createEnemy('mouse', { progress: i * 1.5, hp: 1e9 })
      const hp0 = g.enemies.reduce((a, e) => a + e.hp, 0)
      g.mana = 100
      g.lastSpecial = null
      for (const sp of reg.listSpecials()) g.specialReadyAt[sp.id] = 0
      if (before) { g.useSpecial(before); g.mana = 100 }
      const hintsAfter = g.specialComboHints()
      g.useSpecial(combo.to)
      const hp1 = g.enemies.reduce((a, e) => a + e.hp, 0)
      return { dealt: hp0 - hp1, hints: hintsAfter }
    }

    const alone = totalDamage(null)
    const linked = totalDamage(combo.from)
    // 창 밖에서 이어 쓰면 연계가 아니다
    g.enemies.length = 0
    for (let i = 0; i < 12; i += 1) g._createEnemy('mouse', { progress: i * 1.5, hp: 1e9 })
    g.mana = 100
    for (const sp of reg.listSpecials()) g.specialReadyAt[sp.id] = 0
    g.useSpecial(combo.from)
    g.lastSpecial.at -= combo.window + 1          // 시간이 지난 것처럼
    const lateHints = g.specialComboHints()

    return {
      name: combo.name, from: combo.from, to: combo.to, mul: combo.bonus.damageMul,
      alone: Math.round(alone.dealt), linked: Math.round(linked.dealt),
      hintsAlone: alone.hints.length, hintsLinked: linked.hints,
      lateHints: lateHints.length,
      registered: reg.listSpecialCombos().length,
    }
  })
  check('필살기를 이어 쓰면 연계가 걸려 피해가 실제로 커진다',
    link.alone > 0 && link.linked > link.alone * (link.mul * 0.9),
    `${link.name}(${link.from}→${link.to}) · 단독 ${link.alone} → 연계 ${link.linked}`
    + ` (기대 ${link.mul}배) · 연계 ${link.registered}종`)
  check('HUD 가 이어 쓸 필살기를 알려주고, 시간이 지나면 힌트가 사라진다',
    link.hintsAlone === 0 && link.hintsLinked.includes(link.to) && link.lateHints === 0,
    `직전 없음 ${link.hintsAlone}개 · 직전 ${link.from} 후 [${link.hintsLinked}]`
    + ` · 창 지난 뒤 ${link.lateHints}개`)

  // 펫 — 판 밖에서 고르는 한 번의 선택. 바꾸면 판 시작 상태가 실제로 달라져야 한다.
  const pets = await page.evaluate(() => {
    const app = window.__catpaw
    const reg = app.__registry
    const all = reg.listPets()
    // 전부 가진 것으로 두고 하나씩 끼워 본다 (구매 흐름은 아래에서 따로 본다)
    app.progress = { ...app.progress, pets: { owned: all.map((p) => p.id), equipped: 'hamster' } }
    const start = (petId) => {
      app.progress = { ...app.progress, pets: { ...app.progress.pets, equipped: petId } }
      app.startGame('alley')
      return { gold: app.game.gold, lives: app.game.lives, pet: app.game.pet && app.game.pet.id }
    }
    const base = { gold: reg.getMap('alley').startGold, lives: reg.getMap('alley').startLives }
    return {
      registered: all.length,
      hamster: start('hamster'),
      turtle: start('turtle'),
      magpie: start('magpie'),
      base,
      // 까치는 시작값이 아니라 처치 골드를 올린다 — 배수로 확인한다
      magpieGoldMul: app.game.runMods.goldMul,
    }
  })
  check('펫을 바꾸면 판 시작 상태가 실제로 달라진다',
    pets.hamster.gold === pets.base.gold + 80 && pets.hamster.lives === pets.base.lives
    && pets.turtle.lives === pets.base.lives + 3 && pets.turtle.gold === pets.base.gold
    && pets.magpie.gold === pets.base.gold && pets.magpieGoldMul > 1.1,
    `기본 ${pets.base.gold}골드/${pets.base.lives}목숨`
    + ` · 햄스터 ${pets.hamster.gold}골드 · 거북이 ${pets.turtle.lives}목숨`
    + ` · 까치 골드배수 ${pets.magpieGoldMul}`)

  await page.evaluate(() => window.__catpaw._goto('title'))
  await page.click('#btn-pets')
  await page.waitForSelector('.pet-row')
  const petRows = await page.$$('.pet-row')
  const petOn = await page.$$('.pet-row.on')
  check('펫 화면이 등록 수만큼 뜨고 데려가는 펫이 하나만 표시된다',
    petRows.length === pets.registered && petOn.length === 1,
    `${petRows.length}종 / 선택 ${petOn.length}마리`)
  await page.screenshot({ path: join(outDir, '19-pets.png') })
  await page.evaluate(() => window.__catpaw.ui.closeOverlay())

  // 조합 — 이름이 붙는 배치. 만들면 수치가 오르고, 깨면 되돌아와야 한다.
  const combo = await page.evaluate(() => {
    const app = window.__catpaw
    app.startGame('alley')
    const g = app.game
    g.gold = 999999
    g.towers.length = 0
    g.recomputeTowerMods()

    // 치즈냥 셋을 한 줄로 — '치즈 삼총사'
    const line = []
    for (let r = 0; r < g.mapDef.rows && line.length < 3; r += 1) {
      const row = []
      for (let c = 0; c < g.mapDef.cols; c += 1) {
        const res = g.placeTower(c, r, 'cheese')
        if (res.ok) row.push(res.tower)
        else if (row.length > 0) break          // 줄이 끊기면 이 행은 버린다
        if (row.length === 3) break
      }
      if (row.length === 3) line.push(...row)
      else for (const t of row) g.sellTower(t)
    }
    const made = g.activeCombos.map((m) => m.combo.id)
    const buffed = line.length === 3 ? line[0].mods.fireRateMul : null

    // 가운데를 팔아 줄을 끊는다
    if (line.length === 3) g.sellTower(line[1])
    return {
      placed: line.length,
      made,
      buffed,
      afterBreak: line.length === 3 ? line[0].mods.fireRateMul : null,
      seen: (app.progress.combosSeen || []).length,
      registered: app.__registry.listCombos().length,
    }
  })
  check('고양이 조합이 성립하면 실제로 수치가 오르고, 깨면 되돌아온다',
    combo.placed === 3 && combo.made.includes('cheese-trio')
    && combo.buffed > 1.2 && combo.afterBreak === 1,
    `조합 ${combo.made.join(',') || '없음'} · 연사 배수 ${combo.buffed} → ${combo.afterBreak}`)

  // 도감 조합 탭 — 레지스트리 순회라 조합을 늘려도 따라온다
  await page.evaluate(() => window.__catpaw.ui.openCodex('combos'))
  await page.waitForSelector('.codex-item')
  const comboRows = await page.$$('.codex-item')
  const comboLocked = await page.$$('.codex-item.locked')
  check('도감 조합 탭이 등록 수만큼 뜨고 못 만든 것은 잠겨 있다',
    comboRows.length === combo.registered && comboLocked.length < comboRows.length,
    `${comboRows.length}종 중 잠김 ${comboLocked.length}종 (만들어 본 것 ${combo.seen}종)`)
  await page.evaluate(() => window.__catpaw.ui.closeOverlay())

  check('턱시도냥이 옆 고양이를 실제로 강화한다 (치우면 되돌아온다)',
    newCats.buff.before === 1 && newCats.buff.withBuff > 1.2 && newCats.buff.after === 1,
    `피해 배수 ${newCats.buff.before} → ${newCats.buff.withBuff.toFixed(2)} → ${newCats.buff.after}`)
  check('스핑크스냥이 일렬로 선 적을 한 발로 여럿 꿴다',
    newCats.pierce.hit >= 3 && newCats.pierce.hit <= newCats.pierce.maxHits,
    `${newCats.pierce.onField}마리 중 ${newCats.pierce.hit}마리 관통 (상한 ${newCats.pierce.maxHits})`)
  check('러시안블루냥의 정전기가 옆으로 튀고 같은 적을 두 번 때리지 않는다',
    newCats.chain.damaged >= 2 && newCats.chain.damaged <= newCats.chain.jumps + 1,
    `${newCats.chain.damaged}마리 피해 (튐 ${newCats.chain.jumps}회 → 최대 ${newCats.chain.jumps + 1}마리)`)
  check('고등어냥의 상처가 장갑을 무시하고 계속 닳린다',
    newCats.dot.lost1s >= newCats.dot.dps * 0.8
    && newCats.dot.stacks === newCats.dot.maxStacks,
    `장갑 ${newCats.dot.armor}짜리가 1초에 ${newCats.dot.lost1s} 닳음 (dps ${newCats.dot.dps})`
    + ` · 스택 ${newCats.dot.stacks}/${newCats.dot.maxStacks}`)

  // ── 8-c. 맵마다 다른 판인가 ────────────────────────────────
  // 예전엔 6개 맵 중 5개가 완전히 같은 30웨이브를 썼다. 길 모양과 체력 배율만
  // 다르고 나오는 적이 글자 하나까지 같았다. 실제로 갈라졌는지 확인한다.
  const waveMix = await page.evaluate(() => {
    const reg = window.__catpaw.__registry
    return reg.listMaps().map((m) => {
      const table = reg.getWaveSet(m.waveSet)
      // 1웨이브에 나오는 적 종류와 마릿수 — 첫인상이 맵마다 달라야 한다
      const first = table[0].map(([id, n]) => `${id}×${n}`).join('+')
      // 판 전체에서 가장 많이 나오는 적 — 그 맵의 성격
      const tally = {}
      for (const wave of table) for (const [id, n] of wave) tally[id] = (tally[id] || 0) + n
      const main = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
      return { map: m.name, set: m.waveSet, first, main: `${main[0]}×${main[1]}` }
    })
  })
  const distinctSets = new Set(waveMix.map((w) => w.set)).size
  const distinctFirst = new Set(waveMix.map((w) => w.first)).size
  const distinctMain = new Set(waveMix.map((w) => w.main.split('×')[0])).size
  check('맵마다 다른 웨이브 구성을 쓴다 (같은 판을 여섯 번 하지 않는다)',
    distinctSets === waveMix.length && distinctFirst === waveMix.length && distinctMain >= 4,
    waveMix.map((w) => `${w.map} ${w.set} 첫웨이브 ${w.first} 주력 ${w.main}`).join(' · '))

  check('맵을 바꾸면 바닥도 그 맵의 색으로 바뀐다 (바닥 캐시가 낡지 않는다)',
    mapArt.length > 0 && mapArt.every((m) => m.ground && m.ground.ok),
    mapArt.map((m) => `${m.map} ${m.ground ? m.ground.rgb : '샘플없음'}`).join(' · '))
  const withProps = mapArt.filter((m) => m.cell !== null)
  check('막힌 칸에 소품 그림이 놓인다',
    withProps.length > 0 && withProps.every((m) => m.cell > 200 && m.cell > m.empty * 3),
    withProps.map((m) => `${m.map} 막힌 칸 ${m.cell}종/빈 칸 ${m.empty}종`).join(' · '))

  // ── 9. 시나리오 모드 ───────────────────────────────────────
  // 새 컨텍스트로 연다. 지금 페이지는 위에서 고양이를 전부 열어놨고 저장도 쌓여서
  // '첫 장만 열려 있다'를 확인할 수 없다.
  {
    const scCtx = await browser.newContext({
      viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, locale: 'ko-KR',
    })
    const sc = await scCtx.newPage()
    const scErrors = []
    sc.on('pageerror', (e) => scErrors.push(e.message))
    sc.on('console', (m) => { if (m.type() === 'error') scErrors.push(m.text()) })
    await sc.goto(base)
    await sc.waitForFunction(() => window.__catpaw, null, { timeout: 15000 })

    await sc.click('#btn-scenario')
    await sc.waitForSelector('#screen-chapters:not([hidden])')
    const chCards = await sc.$$('#chapter-list .map-card')
    const chLocked = await sc.$$('#chapter-list .map-card[disabled]')
    const chTotal = await sc.evaluate(() => window.__catpaw.__registry.listChapters().length)
    check('시나리오 챕터가 등록 수만큼 뜨고 첫 장만 열려 있다',
      chCards.length === chTotal && chLocked.length === chTotal - 1,
      `챕터 ${chCards.length}개, 잠김 ${chLocked.length}개`)
    await sc.screenshot({ path: join(outDir, '15-chapters.png') })

    /** 컷신을 탭으로 끝까지 넘긴다 */
    const tapThroughStory = async () => {
      for (let i = 0; i < 12; i += 1) {
        const on = await sc.evaluate(() =>
          !document.getElementById('overlay').hidden && !!document.querySelector('#overlay-sheet.story'))
        if (!on) return i
        await sc.click('#overlay-sheet')
      }
      return -1
    }

    await chCards[0].click()
    await sc.waitForSelector('#overlay-sheet.story', { timeout: 5000 })
    const introCards = await sc.evaluate(() => window.__catpaw.__registry.getChapter('ch1').intro.length)
    const speakerPainted = await sc.evaluate(() => {
      const cv = document.querySelector('.story-row canvas')
      if (!cv) return 0
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let opaque = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque += 1
      return opaque
    })
    await sc.screenshot({ path: join(outDir, '16-story.png') })
    const taps = await tapThroughStory()
    await sc.waitForSelector('#screen-game:not([hidden])', { timeout: 5000 })
    check('컷신이 뜨고 화자 그림과 함께 탭으로 넘어가 전투로 들어간다',
      taps === introCards && speakerPainted > 100,
      `대사 ${introCards}장 · 탭 ${taps}회 · 화자 그림 ${speakerPainted}px`)

    const chGame = await sc.evaluate(() => ({
      waves: window.__catpaw.game.totalWaves,
      chapterId: window.__catpaw.currentChapterId,
      mapId: window.__catpaw.game.mapDef.id,
    }))
    check('챕터의 waveLimit 이 판 길이가 된다',
      chGame.waves === 6 && chGame.chapterId === 'ch1' && chGame.mapId === 'alley',
      `${chGame.mapId} · ${chGame.waves}웨이브 · ${chGame.chapterId}`)

    // 잠긴 고양이는 UI 뿐 아니라 게임 로직에서도 거부돼야 한다
    const lockedBuild = await sc.evaluate(() => {
      const g = window.__catpaw.game
      const spot = { c: 0, r: 0 }
      for (let r = 0; r < g.mapDef.rows; r += 1) {
        for (let c = 0; c < g.mapDef.cols; c += 1) {
          if (!g.path.tileSet.has(`${c},${r}`)) { spot.c = c; spot.r = r; r = 99; break }
        }
      }
      g.gold = 9999
      return { res: g.placeTower(spot.c, spot.r, 'black'), unlocked: g.isTowerUnlocked('black') }
    })
    const lockedCards = await sc.$$('#shop-cards .shop-card.locked')
    // 1장 시작 시점에는 시작 고양이(치즈냥·삼색냥) 둘만 열려 있어야 한다
    const expectLocked = await sc.evaluate(() =>
      window.__catpaw.__registry.listTowers().length - window.__catpaw.progress.unlockedTowers.length)
    check('아직 못 받은 고양이는 상점에서 잠기고 배치도 거부된다',
      lockedBuild.res.ok === false && lockedBuild.unlocked === false
      && lockedCards.length === expectLocked && expectLocked >= 7,
      `사유 "${lockedBuild.res.reason}" · 잠긴 카드 ${lockedCards.length}/${expectLocked}장`)

    // 지도를 덮는 UI 가 없는지 — 타워 패널·배치 안내로 두 번 낸 사고다
    const chMapTaps = await sc.evaluate(() => {
      const cv = document.getElementById('canvas')
      const b = cv.getBoundingClientRect()
      let hit = 0, total = 0
      for (let i = 0; i < 5; i += 1) {
        for (let j = 0; j < 7; j += 1) {
          const x = b.left + b.width * (0.1 + i * 0.2)
          const y = b.top + b.height * (0.07 + j * 0.145)
          total += 1
          if (document.elementFromPoint(x, y) === cv) hit += 1
        }
      }
      return { hit, total }
    })
    check('시나리오 전투에서도 지도 전체가 눌린다',
      chMapTaps.hit === chMapTaps.total, `${chMapTaps.hit}/${chMapTaps.total} 지점`)

    // 목표를 일부러 어긴 채로 이긴다 → 별이 덜 나와야 한다
    const badWin = await sc.evaluate(() => {
      const g = window.__catpaw.game
      g.stats.towersBuilt = 9       // maxTowers 3 위반
      g.lives = 12                  // livesAbove 20 위반
      g.waveNo = g.totalWaves
      g.phase = 'victory'
      g.emit('victory', g.summary())
      return true
    })
    await tapThroughStory()                       // 마무리 컷신
    await sc.waitForSelector('#overlay:not([hidden])', { timeout: 5000 })
    const starRes = await sc.evaluate(() => ({
      on: document.querySelectorAll('#overlay-sheet .star.on').length,
      total: document.querySelectorAll('#overlay-sheet .star').length,
      goals: document.querySelectorAll('#overlay-sheet .goal-row').length,
      ok: document.querySelectorAll('#overlay-sheet .goal-row.ok').length,
      saved: window.__catpaw.progress.scenario.stars.ch1,
      bestWave: window.__catpaw.progress.bestWave.alley,
    }))
    await sc.screenshot({ path: join(outDir, '17-chapter-result.png') })
    check('목표를 어기면 별이 덜 나오고 그대로 저장된다',
      badWin && starRes.on === 1 && starRes.total === 3 && starRes.goals === 3
        && starRes.ok === 1 && starRes.saved === 1,
      `별 ${starRes.on}/${starRes.total} · 목표 ${starRes.ok}/${starRes.goals} 달성 · 저장 ${starRes.saved}`)
    check('시나리오 판이 자유 모드 기록(bestWave)을 건드리지 않는다',
      starRes.bestWave === undefined,
      `alley bestWave = ${starRes.bestWave === undefined ? '없음' : starRes.bestWave}`)

    // 2장을 깨면 샴냥이 합류하고 상점에 나타난다
    const reward = await sc.evaluate(async () => {
      const app = window.__catpaw
      app.ui.closeOverlay()
      app.startGame('alley', app.__registry.getChapter('ch2'))
      const g = app.game
      g.waveNo = g.totalWaves
      g.phase = 'victory'
      g.emit('victory', g.summary())
      return {
        unlocked: [...app.progress.unlockedTowers],
        catnip: app.progress.catnip,
      }
    })
    await tapThroughStory()
    // 상점은 판을 시작할 때 그려진다. 보상이 실제로 반영되는지는 다음 판에서 본다.
    const shopAfter = await sc.evaluate(() => {
      const app = window.__catpaw
      app.ui.closeOverlay()
      app.startGame('alley', app.__registry.getChapter('ch3'))
      return {
        locked: document.querySelectorAll('#shop-cards .shop-card.locked').length,
        expect: app.__registry.listTowers().length - app.progress.unlockedTowers.length,
        siameseLocked: !app.game.isTowerUnlocked('siamese'),
      }
    })
    check('챕터 보상으로 고양이가 합류하고 상점 자물쇠가 풀린다',
      reward.unlocked.includes('siamese')
      && shopAfter.locked === shopAfter.expect && !shopAfter.siameseLocked,
      `해금 ${reward.unlocked.join(',')} · 남은 자물쇠 ${shopAfter.locked}/${shopAfter.expect}장`)

    check('시나리오 진행 중 콘솔 에러 0건', scErrors.length === 0, scErrors.slice(0, 2).join(' | ') || '없음')
    await scCtx.close()
  }

  // 아트가 없는 상태가 정상 경로다 — 적 10종은 아직 그림이 없고, 새 캐릭터를
  // 넣을 때도 그림이 나중에 온다. 그림 요청을 전부 막고도 부팅·배치가 되는지 본다.
  {
    // 새 컨텍스트를 쓴다. 같은 컨텍스트면 이미 설치된 서비스 워커가 캐시에서
    // 그림을 내주고 page.route 를 그냥 지나쳐 버린다(처음에 그렇게 새어서 실패했다).
    const noArtCtx = await browser.newContext({
      viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, locale: 'ko-KR',
      serviceWorkers: 'block',
    })
    const noArt = await noArtCtx.newPage()
    const noArtErrors = []
    noArt.on('pageerror', (e) => noArtErrors.push(e.message))
    noArt.on('console', (m) => {
      // 요청을 우리가 일부러 막았으니 브라우저의 리소스 실패 로그는 이 검사의 부산물이다.
      // 앱이 던진 오류만 본다.
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) noArtErrors.push(m.text())
    })
    await noArt.route('**/art/*.png', (r) => r.abort())
    await noArt.goto(base)
    await noArt.waitForFunction(() => window.__catpaw, null, { timeout: 15000 })
    await noArt.click('#btn-play')
    await noArt.click('.map-card')
    await noArt.waitForSelector('#screen-game:not([hidden])')
    const fb = await noArt.evaluate(() => {
      const app = window.__catpaw
      const keys = app.__framesets.loadedFrameSetKeys()
      // 벡터로라도 고양이가 그려지는지 — 상점 카드 캔버스에 불투명 픽셀이 있어야 한다
      const card = document.querySelector('#shop-cards .shop-card canvas')
      const d = card.getContext('2d').getImageData(0, 0, card.width, card.height).data
      let opaque = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque += 1
      return { keys, opaque, towers: app.__registry.listTowers().length }
    })
    await noArtCtx.close()
    check('그림이 없어도 벡터로 떨어져 게임이 그대로 돌아간다',
      noArtErrors.length === 0 && fb.keys.length === 0 && fb.opaque > 100,
      `로드된 그림 ${fb.keys.length}장 · 상점 카드 불투명 ${fb.opaque}px` +
      (noArtErrors.length ? ` · 오류 ${noArtErrors[0]}` : ' · 오류 없음'))
  }

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
