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
import { APP_VERSION } from '../web/js/version.js'
import { DAILY_REWARDS } from '../web/js/domain/daily.js'
import { IAP_PRODUCTS, availableItems } from '../web/js/domain/shop.js'
import { ownsGrants } from '../web/js/domain/entitlements.js'
import { disclosureRows, DRAW_COST_CATNIP, DRAW10_COST_CATNIP, PITY_AT } from '../web/js/domain/gacha.js'
const DAILY_HOLE = 0   // 새 저장소로 시작하므로 로딩 전 캣닢이 곧 기준값이다

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
 * 로딩 화면을 지나 타이틀로 — 실제 사용자 흐름이다.
 * 부팅(window.__catpaw) → 탭 프롬프트 대기 → (스크린샷) → 탭 → 로딩이 hidden 될 때까지.
 * 탭 프롬프트는 그림이 다 오거나 15초가 지나야 뜬다. 로컬은 최소 표시 0.9초 뒤.
 */
const passLoading = async (pg, { shot } = {}) => {
  await pg.waitForFunction(() => window.__catpaw !== undefined, null, { timeout: 15000 })
  await pg.waitForSelector('#loading-tap:not([hidden])', { timeout: 20000 })
  if (shot) await pg.screenshot({ path: join(outDir, shot) })
  await pg.click('#loading-tap')
  await pg.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 5000 })
  await dismissDaily(pg)
}

/** 출석 시트 — 새 저장소면 로딩 뒤에 뜬다. 닫아야 다음 조작이 된다. 같은 날 두 번째는 안 뜬다. */
const dismissDaily = async (pg) => {
  const btn = await pg.$('#overlay:not([hidden]) .daily-close')
  if (!btn) return false
  await btn.click()
  await pg.waitForFunction(() => document.getElementById('overlay').hidden, null, { timeout: 3000 })
  return true
}

/**
 * CSS 배경 그림이 실제로 풀리는지 — 브라우저 안에서 돈다.
 *
 * 바닥 질감 때 쓴 uniq()/mean() 은 게임 캔버스 ctx 를 물고 있어서 CSS 배경엔 못 쓴다.
 * computedStyle 에서 url 을 뽑아 Image 로 다시 불러 오프스크린에 그린 뒤 고유 색을 센다
 * — 경로가 풀리는지 · 디코드되는지 · 단색이 아닌지를 한 번에 본다.
 * 번들(data: URI)에서도 그대로 돌아서 웹과 단일 파일 양쪽에 같은 자를 댄다.
 */
const measureBg = (pairs) => Promise.all(pairs.map(async ([name, sel]) => {
  const el = document.querySelector(sel)
  const m = el && getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/)
  if (!m) return [name, { url: null, uniq: 0 }]
  const short = m[1].startsWith('data:') ? 'data:' : m[1].split('/').pop()
  const img = new Image()
  img.src = m[1]
  try { await img.decode() } catch { return [name, { url: short, uniq: 0 }] }
  const cv = document.createElement('canvas')
  cv.width = 120; cv.height = 120
  const c = cv.getContext('2d', { willReadFrequently: true })
  c.drawImage(img, 0, 0, 120, 120)
  const d = c.getImageData(0, 0, 120, 120).data
  const seen = new Set()
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
  return [name, { url: short, uniq: seen.size }]
})).then(Object.fromEntries)

/** measureBg 결과를 사람이 읽는 한 줄로 */
const bgLine = (stats) =>
  Object.entries(stats).map(([k, s]) => `${k} ${s.url || '없음'} ${s.uniq}종`).join(' · ')

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
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[검사 ${steps.length}번 뒤] ${m.text()}`) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

try {
  // ── 1. 부팅 ────────────────────────────────────────────────
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__catpaw !== undefined, null, { timeout: 10_000 })
  const boot = await page.textContent('#boot-status')
  const ready = await page.evaluate(() => document.documentElement.dataset.ready)
  check('콘텐츠 검증 통과 후 부팅 (data-ready 신호 + 한국어 문구)', ready === '1' && boot.includes('준비 완료'), boot)

  // ── 1b. 로딩 화면 ──────────────────────────────────────────
  // 진행률은 loading.js 가 실제 파일(캐릭터 + 지도 + 타이틀 배경)로 센다 — 가짜 타이머가
  // 아니다. 탭 프롬프트는 다 오거나 15초 뒤에 뜬다. 로컬은 최소 표시 0.9초 뒤.
  const loadT0 = Date.now()
  await page.waitForSelector('#loading-tap:not([hidden])', { timeout: 20000 })
  const loadMs = Date.now() - loadT0
  await page.screenshot({ path: join(outDir, '0-loading.png') })
  const ld = await page.evaluate(() => ({
    fill: document.getElementById('loading-fill').style.width,
    status: document.getElementById('loading-status').textContent,
    tip: document.getElementById('loading-tip').textContent,
    version: document.getElementById('loading-version').textContent,
    titleVersion: document.getElementById('title-version').textContent,
    counted: window.__catpaw.__loading.snapshot(),
    // 로더들이 세는 것과 같은 목록: 캐릭터 프레임셋 + 지도 길/바닥 + 소품 + 타이틀 배경 1
    expected: window.__catpaw.__registry.listFrameSets().length
      + window.__catpaw.__registry.listMapArt().reduce((n, a) => n + (a.path ? 1 : 0) + (a.floor ? 1 : 0), 0)
      + window.__catpaw.__registry.listProps().length + 1,
    audioBefore: window.__catpaw.audio.ctx !== null,
  }))
  check('로딩 진행률이 실제 파일 수를 다 채운다',
    ld.fill === '100%' && /준비 완료/.test(ld.status)   // 한국어 패스 — 영어 패스는 뒤에서 따로 본다
      && ld.counted.done === ld.counted.total && ld.counted.total === ld.expected,
    `${ld.counted.done}/${ld.counted.total} (기대 ${ld.expected}) · ${ld.fill} · ${ld.status} · ${loadMs}ms`)
  check('로딩 팁이 데이터에서 온다', ld.tip.trim().length > 10, ld.tip.slice(0, 44))
  check('화면 버전이 APP_VERSION 과 같다 (로딩·타이틀 둘 다)',
    ld.version === `v${APP_VERSION}` && ld.titleVersion === `v${APP_VERSION}`,
    `${ld.version} / ${ld.titleVersion}`)
  const catnipBeforeDaily = await page.evaluate(() => window.__catpaw.progress.catnip - (window.__catpaw.progress.daily.lastClaim ? DAILY_HOLE : 0))
  await page.click('#loading-tap')
  await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 5000 })
  // 출석 — 새 저장소의 첫 실행이라 1일째 시트가 뜨고 캣닢이 표의 첫 칸만큼 늘어야 한다
  const daily = await page.evaluate(() => ({
    open: !document.getElementById('overlay').hidden && !!document.querySelector('.daily-grid'),
    cells: document.querySelectorAll('.daily-cell').length,
    today: (document.querySelector('.daily-cell.today .k') || {}).textContent,
    catnip: window.__catpaw.progress.catnip,
    streak: window.__catpaw.progress.daily.streak,
  }))
  check('첫 실행에 출석 시트가 뜨고 1일째 보상이 들어온다',
    daily.open && daily.cells === 7 && daily.today === '1일' && daily.streak === 1
    && daily.catnip === catnipBeforeDaily + DAILY_REWARDS[0],
    `${daily.cells}칸 · 오늘 ${daily.today} · 캣닢 ${catnipBeforeDaily} → ${daily.catnip}`)
  await page.screenshot({ path: join(outDir, '0b-daily.png') })
  await dismissDaily(page)
  const audioOn = await page.evaluate(() => window.__catpaw.audio.ctx !== null)
  check('탭하여 시작이 오디오를 깨운다 (탭 전엔 없다)', !ld.audioBefore && audioOn,
    `탭 전 ${ld.audioBefore ? '있음' : '없음'} → 탭 뒤 ${audioOn ? 'AudioContext 있음' : 'ctx null'}`)
  await page.waitForTimeout(700)   // 타이틀 등장 연출(.45s + 지연 .18s)이 끝난 뒤
  await page.screenshot({ path: join(outDir, '1-title.png') })

  const bgStats = await page.evaluate(measureBg,
    [['타이틀', '#screen-title'], ['맵 선택', '#screen-maps']])
  /* 기준 300 은 양쪽을 다 재서 정했다.
   *   그림이 붙었을 때  타이틀 7261종 · 맵 선택 3568종 (흐린 그림이라 색이 적다)
   *   파일을 치웠을 때  decode 가 실패해 0종
   * 실제로 bg-title.jpg 를 잠시 치워 0종으로 떨어지는 것을 확인했다. 그때
   * '콘솔 에러 0건'도 404 로 같이 빨개진다 — 그물이 둘이라 하나가 새도 잡힌다. */
  check('화면 배경 그림이 실제로 깔린다',
    Object.values(bgStats).every((s) => s.uniq > 300), bgLine(bgStats))

  // ── 2. 맵 선택 ─────────────────────────────────────────────
  // 화면 전환 페이드 — 90ms 막을 스크린샷으로 잡는 건 불안정하니, 켜졌다 꺼지는 것을
  // MutationObserver 로 지켜본다. 막이 입력을 삼키면 안 되므로 pointer-events 도 본다.
  await page.evaluate(() => {
    window.__fadeSeen = false
    const fade = document.getElementById('fade')
    if (fade) {
      new MutationObserver(() => { if (fade.classList.contains('on')) window.__fadeSeen = true })
        .observe(fade, { attributes: true, attributeFilter: ['class'] })
    }
  })
  await page.click('#btn-play')
  await page.waitForSelector('#screen-maps:not([hidden])')
  const fadeInfo = await page.evaluate(() => {
    const fade = document.getElementById('fade')
    if (!fade) return null
    const cs = getComputedStyle(fade)
    return { seen: window.__fadeSeen, on: fade.classList.contains('on'), pe: cs.pointerEvents }
  })
  check('화면 전환에 페이드 막이 켜졌다 꺼지고 입력을 안 막는다',
    !!fadeInfo && fadeInfo.seen && !fadeInfo.on && fadeInfo.pe === 'none',
    fadeInfo ? `켜짐 ${fadeInfo.seen} · 지금 ${fadeInfo.on ? '켜짐' : '꺼짐'} · pointer-events ${fadeInfo.pe}` : '#fade 없음')
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

  /* 캔버스가 실제로 그려졌는지 (전부 같은 색이면 렌더 실패).
   * **프레임을 기다린 뒤에 읽는다** — 예전엔 그냥 읽어서, 부팅이 조금만 느려지면
   * 아직 한 번도 안 그린 캔버스를 보고 '고유 색상 1종'으로 빨개졌다(콘텐츠가 늘자 실제로 그랬다).
   * 임계값을 낮추는 건 검사를 죽이는 것이라, 경합을 없앤다. */
  const painted = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const cv = document.getElementById('canvas')
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 997) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return seen.size
  })
  check('캔버스에 맵이 실제로 그려진다', painted > 5, `고유 색상 ${painted}종`)

  // 다음 웨이브 미리보기 — 준비 단계에 실제 구성(골목길 1웨이브 = 생쥐 8)이 보이고,
  // 지도 위에 얹히되 아래 칸의 탭을 막지 않는다.
  const preview = await page.evaluate(() => {
    const pv = document.getElementById('wave-preview')
    return { hidden: pv.hidden, text: pv.textContent, pe: getComputedStyle(pv).pointerEvents }
  })
  check('다음 웨이브 미리보기가 실제 구성으로 뜨고 탭을 막지 않는다',
    !preview.hidden && /×8/.test(preview.text) && preview.pe === 'none',
    `${preview.text} · pointer-events ${preview.pe}`)

  // 첫 판 안내 — 1.5초 뒤 '고양이를 놓자'. 튜토리얼 대신 상태를 보고 한 번씩 뜬다.
  let hintOk = false
  try {
    await page.waitForFunction(() => {
      const t = document.getElementById('toast')
      return !t.hidden && /고양이를 놓자/.test(t.textContent)
    }, null, { timeout: 6000 })
    hintOk = true
  } catch { /* 아래 check 가 빨개진다 */ }
  check('첫 판 안내가 1.5초 뒤 토스트로 뜬다', hintOk, hintOk ? '고양이를 놓자' : '6초 안에 안 떴다')
  await page.screenshot({ path: join(outDir, '3-game.png') })
  // 이 뒤의 검사들은 첫 판이 아니다 — 안내를 끄고 토스트를 치운다
  await page.evaluate(() => {
    const app = window.__catpaw
    app.settings.hints = false
    document.getElementById('toast').hidden = true
  })

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

  // (5) 왼손 모드는 상점·HUD 만 뒤집고 준비 배지·패널 닫기·필살기 바는 그대로였다
  const lefty = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    g.phase = 'prep'; g.prepRemaining = 10          // 준비 배지가 보이는 상태
    app.ui.updateHud(g)
    app.ui.showTowerPanel(g, g.towers[0])
    const measure = () => {
      const badge = document.getElementById('prep-badge').getBoundingClientRect()
      const close = document.querySelector('#tower-panel .tp-close').getBoundingClientRect()
      const h3 = document.querySelector('#tower-panel .tp-head h3').getBoundingClientRect()
      return {
        badgeLeft: badge.left + badge.width / 2 < window.innerWidth / 2,
        closeLeftOfTitle: close.left < h3.left,
        specials: getComputedStyle(document.getElementById('specials')).flexDirection,
      }
    }
    app._changeSetting('leftHanded', true)
    const on = measure()
    app._changeSetting('leftHanded', false)
    const off = measure()
    app.ui.hideTowerPanel()
    return { on, off }
  })
  check('왼손 모드가 준비 배지·패널 닫기·필살기 바까지 뒤집는다',
    lefty.on.badgeLeft && lefty.on.closeLeftOfTitle && lefty.on.specials === 'row-reverse'
    && !lefty.off.badgeLeft && !lefty.off.closeLeftOfTitle && lefty.off.specials === 'row',
    `켬 ${JSON.stringify(lefty.on)} / 끔 ${JSON.stringify(lefty.off)}`)

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

  // 보스 웨이브 앞에서는 미리보기에 왕관이 뜬다 (10웨이브 = 쥐왕)
  const bossPreview = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    g.enemies.length = 0; g.pending.length = 0
    g.waveNo = 9; g.phase = 'prep'; g.prepRemaining = 5
    g.nextWave = g._peekNextWave()
    app.ui.updateHud(g)
    return {
      no: g.nextWaveNo,
      crown: !!document.querySelector('#wave-preview .pv-item.boss'),
      text: document.getElementById('wave-preview').textContent,
    }
  })
  check('보스 웨이브 앞 미리보기에 왕관이 뜬다', bossPreview.no === 10 && bossPreview.crown, bossPreview.text)

  // ── 7-c. 최종 보스와 능력 ───────────────────────────────────
  const bossRun = await page.evaluate(() => {
    const g = window.__catpaw.game
    g.lives = 999                      // 연출 확인이 목적이라 목숨은 넉넉히
    g.enemies.length = 0; g.pending.length = 0
    g.waveNo = 29                      // 30웨이브(최종 보스)를 직접 부른다
    g.phase = 'prep'; g.prepRemaining = 0
    // 등장 연출 — 이벤트·효과음이 실제로 나가는지 시작 전에 걸어 둔다
    const seen = { spawn: 0, sfx: [] }
    g.on('bossspawn', () => { seen.spawn += 1 })
    g.on('sfx', (n) => seen.sfx.push(typeof n === 'string' ? n : n && n.name))
    g.startWave()
    for (let i = 0; i < 60 * 22; i += 1) g.update(1 / 60)
    const boss = g.enemies.find((e) => e.def.id === 'demonking')
    return boss ? {
      name: boss.def.name, tier: boss.def.tier,
      shield: Math.round(boss.shield), shieldMax: Math.round(boss.shieldMax),
      abilities: boss.def.abilities.map((a) => a.kind),
      onField: g.enemies.length,
      summoned: g.enemies.filter((e) => e.def.id === 'rat').length,
      spawnEvents: seen.spawn, bossIn: seen.sfx.includes('boss_in'), bossOnField: g.bossOnField,
    } : { missing: true }
  })
  await page.waitForTimeout(120)   // 프레임 루프가 보스 유무를 오디오에 전한다
  const bgmMode = await page.evaluate(() => window.__catpaw.audio._bgmModeWanted)
  check('보스 등장에 이벤트·효과음이 나가고 보스 테마로 바뀐다',
    !bossRun.missing && bossRun.spawnEvents >= 1 && bossRun.bossIn && bossRun.bossOnField >= 1 && bgmMode === 'boss',
    `bossspawn ${bossRun.spawnEvents}회 · boss_in ${bossRun.bossIn} · 전장 보스 ${bossRun.bossOnField} · 테마 ${bgmMode}`)
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
  // 등장 배너는 1.8초 만에 걷혀 위 빨리감기에선 못 찍는다 — 같은 값을 다시 띄워 한 장 남긴다
  await page.evaluate(() => {
    const g = window.__catpaw.game
    const boss = g.enemies.find((e) => e.def.boss)
    if (boss) { g._announceBoss(boss); g.bossAnnounce.until = g.time + 60 }
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(outDir, '7c-boss.png') })
  await page.evaluate(() => { window.__catpaw.game.bossAnnounce = null })

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
  const expectStore = availableItems('ingame').length + IAP_PRODUCTS.length
  check('상점이 상품 배열에서 자동 생성된다', storeItems.length === expectStore, `${storeItems.length}개 상품 (기대 ${expectStore})`)
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
  // 탭을 자리(nth-child)로 고르지 않는다 — 탭이 하나 늘 때마다 여기가 조용히 다른 탭을 본다(실제로 그랬다)
  await page.evaluate(() => window.__catpaw.ui.openCodex('enemies'))
  await page.waitForTimeout(120)
  const enemyItems = await page.$$('.codex-item')
  const enemyCount = await page.evaluate(() => window.__catpaw.__registry.listEnemies().length)
  check('도감 해충 탭도 자동 생성된다',
    enemyItems.length === enemyCount && enemyCount >= 14,
    `해충 ${enemyItems.length}종 / 등록 ${enemyCount}종`)
  const abilityRows = await page.$$('.codex-item .ability-list')
  const abilityChips = await page.$$('.codex-item .ability-chip')
  check('도감 해충 항목에 보스 능력이 이름과 수치로 나온다',
    abilityRows.length >= 5 && abilityChips.length >= 10,
    `능력 있는 항목 ${abilityRows.length}개 · 칩 ${abilityChips.length}개`)

  // 도감 탭 8개 — 펫·필살기·업적·기록은 레지스트리와 진행도에서 생성된다
  const codexTabs = await page.evaluate(async () => {
    const app = window.__catpaw
    const reg = app.__registry
    const rows = async (tab) => {
      app.ui.openCodex(tab)
      await new Promise((r) => setTimeout(r, 60))
      return document.querySelectorAll('.codex-item').length
    }
    const out = {
      tabs: document.querySelectorAll('.codex-tabs .chip').length,
      pets: await rows('pets'), petsReg: reg.listPets().length,
      specials: await rows('specials'), specialsReg: reg.listSpecials().length + reg.listSpecialCombos().length,
      achievements: await rows('achievements'), achReg: reg.listAchievements().length,
    }
    app.ui.openCodex('records')
    await new Promise((r) => setTimeout(r, 60))
    out.records = document.querySelector('#overlay-sheet').innerText
    return out
  })
  check('도감 탭이 8개이고 펫·필살기·업적·기록 탭이 등록 수만큼 채워진다',
    codexTabs.tabs === 8 && codexTabs.pets === codexTabs.petsReg && codexTabs.specials === codexTabs.specialsReg
    && codexTabs.achievements === codexTabs.achReg && codexTabs.achReg >= 18
    && /플레이/.test(codexTabs.records) && /가장 많이 데려간 고양이/.test(codexTabs.records),
    `탭 ${codexTabs.tabs} · 펫 ${codexTabs.pets}/${codexTabs.petsReg} · 필살기 ${codexTabs.specials}/${codexTabs.specialsReg}`
    + ` · 업적 ${codexTabs.achievements}/${codexTabs.achReg}`)
  await page.screenshot({ path: join(outDir, '6b-codex-records.png') })
  await page.evaluate(() => window.__catpaw.ui.openCodex('achievements'))
  await page.waitForTimeout(80)
  await page.screenshot({ path: join(outDir, '6c-codex-achievements.png') })
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

  // 승리 → 결과 시트 → '맵 선택으로' 는 _saveRun 을 두 번 부른다. 전에는 clears 가
  // 판마다 2씩 올랐다(판 장부가 없었다). 두 번 불러도 1만 오르는지 본다.
  const ledger = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    const map = g.mapDef.id
    const before = app.progress.clears[map] || 0
    const runsBefore = app.progress.stats.runs
    g.phase = 'victory'
    app._runLedger = null
    const unlocked = app._saveRun().map((a) => a.id)
    app._saveRun()
    return { before, after: app.progress.clears[map] || 0, runsBefore, runsAfter: app.progress.stats.runs,
      wins: app.progress.stats.wins, unlocked }
  })
  check('승리를 두 번 저장해도 클리어 횟수와 판 수는 1만 오른다 (판 장부)',
    ledger.after - ledger.before === 1 && ledger.runsAfter - ledger.runsBefore === 1,
    `클리어 ${ledger.before} → ${ledger.after} · 판 ${ledger.runsBefore} → ${ledger.runsAfter} · 승리 ${ledger.wins}`)
  check('첫 승리에 업적이 풀리고 캣닢이 들어온다',
    !!(ledger.unlocked && ledger.unlocked.includes('first-win')), `풀린 업적: ${(ledger.unlocked || []).join(', ') || '없음'}`)

  // 무한 모드 — 승리한 판을 표 밖으로 잇는다. 31웨이브는 26웨이브 줄을 더 많이·빨리 돌린다.
  const endless = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    g.phase = 'victory'
    const ok = g.continueEndless()
    g.prepRemaining = 0
    g.startWave()
    return {
      ok, isInf: !Number.isFinite(g.totalWaves), waveNo: g.waveNo,
      count31: g.currentWave.count, w26: g._buildWaveNo(26).count,
    }
  })
  await page.waitForTimeout(150)
  const hudLabel = await page.textContent('#wave-label')
  check('무한 모드: 승리 뒤 계속 버티면 표 밖 웨이브가 더 세게 나오고 HUD 에 ∞ 가 뜬다',
    endless.ok && endless.isInf && endless.waveNo === 31 && endless.count31 > endless.w26 && /∞/.test(hudLabel),
    `${endless.waveNo}웨이브 ${endless.count31}마리 (26웨이브 ${endless.w26}) · ${hudLabel}`)
  await page.screenshot({ path: join(outDir, '10c-endless.png') })
  // 무한 판을 여기서 끝낸다 — 다음 절들은 새 판을 시작한다
  await page.evaluate(() => { window.__catpaw.game = null })

  // ── 도전 모드 ──────────────────────────────────────────────
  // 깬 맵에만 칩이 뜬다. 시트의 행 수는 등록 수에서 온다(숫자를 박지 않는다).
  await page.evaluate(() => {
    const app = window.__catpaw
    app.progress = { ...app.progress, clears: { ...app.progress.clears, alley: Math.max(1, app.progress.clears.alley || 0) } }
    app._goto('maps')                       // 실제 경로 — 맵 선택 화면이 목록을 그린다
  })
  await page.waitForTimeout(250)
  const chUi = await page.evaluate(() => {
    const app = window.__catpaw
    const reg = app.__registry
    const chips = [...document.querySelectorAll('#map-list .map-chip')]
    const expectChips = reg.listMaps().filter((m) => app.progress.unlockedMaps.includes(m.id) && app.progress.clears[m.id] > 0).length
    const chip = chips[0]
    if (chip) chip.click()
    return {
      chips: chips.length, expectChips, chipText: chip ? chip.textContent : '',
      sheetOpen: !document.getElementById('overlay').hidden,
      rows: document.querySelectorAll('#overlay .challenge-row').length,
      reg: reg.listChallenges().length,
      title: (document.querySelector('#overlay h2') || { textContent: '' }).textContent,
      screen: document.body.dataset.screen,
    }
  })
  check('도전: 깬 맵의 카드에만 칩이 뜨고, 시트에 등록된 도전이 전부 나온다',
    chUi.chips === chUi.expectChips && chUi.chips >= 1 && chUi.sheetOpen && chUi.rows === chUi.reg && chUi.reg >= 5,
    `칩 ${chUi.chips}개 (기대 ${chUi.expectChips}) '${chUi.chipText}' · 행 ${chUi.rows}/${chUi.reg} · ${chUi.title}`)
  await page.screenshot({ path: join(outDir, '10d-challenges.png') })

  // 여섯 마리 — 일곱 번째는 빈 칸이 있어도 거부되고, 탭 경로로 오면 토스트가 뜬다
  const six = await page.evaluate(() => {
    const app = window.__catpaw
    const idx = app.__registry.listChallenges().findIndex((c) => c.id === 'six-cats')
    const btns = [...document.querySelectorAll('#overlay .challenge-row .btn')]
    btns[idx].click()                       // → startChallenge('alley', 'six-cats')
    const g = app.game
    if (!g) return { placed: -1 }
    g.gold = 100000
    let placed = 0
    let refused = null
    for (let r = 0; r < g.mapDef.rows && !refused; r += 1) {
      for (let c = 0; c < g.mapDef.cols; c += 1) {
        const res = g.placeTower(c, r, 'cheese')
        if (res.ok) placed += 1
        else if (res.code === 'LIMIT') { refused = res.reason; break }
      }
    }
    return { placed, refused, challengeId: g.challenge && g.challenge.id, towers: g.towers.length }
  })
  await page.waitForTimeout(250)            // 화면 전환은 90ms 페이드 뒤
  const hud6 = await page.textContent('#wave-label')
  six.screen = await page.evaluate(() => document.body.dataset.screen)
  check('도전 여섯 마리: 일곱 번째 고양이가 거부되고 HUD 에 도전 이름이 붙는다',
    six.placed === 6 && six.towers === 6 && /6마리/.test(six.refused || '') && /여섯 마리/.test(hud6) && six.screen === 'game',
    `${six.placed}마리 놓고 '${six.refused}' · ${hud6} · 화면 ${six.screen}`)

  // 공중만 — 1웨이브가 전부 날아온다. 그리고 이겨도 자유 모드 기록·무한을 건드리지 않는다.
  const air = await page.evaluate(() => {
    const app = window.__catpaw
    app.startChallenge('alley', 'air-only')
    const g = app.game
    const spawns = g.nextWave.spawns
    return { total: spawns.length, flying: spawns.filter((sp) => app.__registry.getEnemy(sp.enemyId).flying).length }
  })
  check('도전 공중만: 1웨이브가 전부 공중 적이다', air.total > 0 && air.flying === air.total, `${air.flying}/${air.total}마리`)

  const chRes = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    const key = 'alley:air-only'
    const reward = app.__registry.getChallenge('air-only').reward
    const before = { clears: app.progress.challenge.clears[key] || 0, best: app.progress.bestWave.alley || 0,
      catnip: app.progress.catnip, mapClears: app.progress.clears.alley || 0 }
    g.phase = 'victory'
    g.waveNo = g.tableWaves
    app._runLedger = null
    app._endRun(g.summary())                // 결과 시트
    const title = document.querySelector('#overlay h2').textContent
    const btns = [...document.querySelectorAll('#overlay .btn')]
    const hasEndless = btns.some((b) => /무한/.test(b.textContent))
    const unlockedCatnip = (app._lastResult.unlocked || []).reduce((a, x) => a + x.catnip, 0)
    const back = btns.find((b) => /맵 선택으로/.test(b.textContent))
    if (back) back.click()                  // onQuit → _saveRun 두 번째
    return {
      title, hasEndless, unlockedCatnip, reward, before,
      after: { clears: app.progress.challenge.clears[key] || 0, best: app.progress.bestWave.alley || 0,
        catnip: app.progress.catnip, mapClears: app.progress.clears.alley || 0 },
    }
  })
  // 화면 전환은 90ms 페이드 뒤에 일어난다 — 그 뒤에 읽는다
  await page.waitForTimeout(250)
  Object.assign(chRes, await page.evaluate(() => {
    const chip = document.querySelector('#map-list .map-chip')
    return { screen: document.body.dataset.screen, chipText: chip ? chip.textContent : '' }
  }))
  const firstClear = chRes.before.clears === 0
  check('도전 결과: 제목에 도전 이름, 무한 버튼 없음, 클리어 1회·첫 보상 한 번, 자유 모드 기록은 그대로',
    /공중만 도전 성공/.test(chRes.title) && !chRes.hasEndless
      && chRes.after.clears === chRes.before.clears + 1
      && chRes.after.catnip === chRes.before.catnip + (firstClear ? chRes.reward : 0) + chRes.unlockedCatnip
      && chRes.after.best === chRes.before.best && chRes.after.mapClears === chRes.before.mapClears
      && chRes.screen === 'maps' && /도전 1\//.test(chRes.chipText),
    `${chRes.title} · 클리어 ${chRes.before.clears}→${chRes.after.clears} · 캣닢 ${chRes.before.catnip}→${chRes.after.catnip}`
      + ` (보상 ${chRes.reward}, 업적 ${chRes.unlockedCatnip}) · 최고 ${chRes.before.best}→${chRes.after.best}`
      + ` · 맵 클리어 ${chRes.before.mapClears}→${chRes.after.mapClears} · 무한 버튼 ${chRes.hasEndless ? '있음' : '없음'} · 화면 ${chRes.screen} · ${chRes.chipText}`)
  await page.evaluate(() => { window.__catpaw.game = null })

  // ── 주간 도전 ──────────────────────────────────────────────
  // 맵 목록 맨 위 카드. 주 키에서 맵·규칙·시드가 정해지고, 시드 난수로 도는 판이며, 기록은 weekly 에만 남는다.
  const wk = await page.evaluate(() => {
    const app = window.__catpaw
    app._goto('maps')
    const card = document.querySelector('#map-list .weekly-card')
    const text = card ? card.textContent : ''
    if (card) card.click()
    return { has: !!card, text, first: !!card && document.querySelector('#map-list > :first-child').contains(card) }
  })
  await page.waitForTimeout(250)
  const wkGame = await page.evaluate(() => {
    const app = window.__catpaw, g = app.game
    return {
      screen: document.body.dataset.screen, key: g && g.weekly, seeded: !!g && g.random !== Math.random,
      hud: document.getElementById('wave-label').textContent, challenge: g && g.challenge ? g.challenge.id : null,
    }
  })
  check('주간 도전: 맵 목록 맨 위 카드가 뜨고, 누르면 시드 난수로 도는 주간 판이 열린다',
    wk.has && wk.first && /이번 주 도전/.test(wk.text) && wkGame.screen === 'game' && /^\d{4}-W\d{2}$/.test(wkGame.key || '') && wkGame.seeded && /주간/.test(wkGame.hud),
    `${wk.text.replace(/\s+/g, ' ').slice(0, 60)} · 키 ${wkGame.key} · 규칙 ${wkGame.challenge} · ${wkGame.hud}`)
  await page.screenshot({ path: join(outDir, '10e-weekly.png') })
  const wkRes = await page.evaluate(() => {
    const app = window.__catpaw, g = app.game
    const key = g.weekly
    const clearedBefore = !!(app.progress.weekly.cleared[key])
    const before = { catnip: app.progress.catnip, best: app.progress.bestWave[g.mapDef.id] || 0, mapClears: app.progress.clears[g.mapDef.id] || 0, clearedBefore }
    g.phase = 'victory'; g.waveNo = g.tableWaves; app._runLedger = null
    app._endRun(g.summary())
    const title = document.querySelector('#overlay h2').textContent
    const btns = [...document.querySelectorAll('#overlay .btn')]
    const hasEndless = btns.some((b) => /무한/.test(b.textContent))
    const unlockedCatnip = (app._lastResult.unlocked || []).reduce((a, x) => a + x.catnip, 0)
    const back = btns.find((b) => /맵 선택으로/.test(b.textContent))
    if (back) back.click()
    return {
      title, hasEndless, unlockedCatnip, key, before,
      after: { catnip: app.progress.catnip, best: app.progress.bestWave[g.mapDef.id] || 0, mapClears: app.progress.clears[g.mapDef.id] || 0 },
      cleared: !!(app.progress.weekly.cleared[key]), bestWeekly: app.progress.weekly.best[key],
    }
  })
  await page.waitForTimeout(250)
  const wkCard = await page.evaluate(() => (document.querySelector('#map-list .weekly-card') || { textContent: '' }).textContent)
  check('주간 도전 결과: 제목·무한 버튼 없음·첫 클리어 캣닢 +25·자유 모드 기록 불변·카드에 클리어 표시',
    /주간 도전 성공/.test(wkRes.title) && !wkRes.hasEndless && wkRes.cleared && wkRes.bestWeekly >= 1
      && wkRes.after.catnip === wkRes.before.catnip + (wkRes.before.clearedBefore ? 0 : 25) + wkRes.unlockedCatnip
      && wkRes.after.best === wkRes.before.best && wkRes.after.mapClears === wkRes.before.mapClears && /클리어/.test(wkCard),
    `${wkRes.title} · 캣닢 ${wkRes.before.catnip}→${wkRes.after.catnip} (업적 ${wkRes.unlockedCatnip}) · 최고 ${wkRes.before.best}→${wkRes.after.best} · 주간 최고 ${wkRes.bestWeekly}`)
  await page.evaluate(() => { window.__catpaw.game = null })

  // ── 훈련 ──────────────────────────────────────────────────
  // 도감에서 캣닢으로 단계를 올리면 상점 카드에 핍이 붙고 판의 타워가 실제로 세진다.
  const tr = await page.evaluate(() => {
    const app = window.__catpaw
    app.progress = { ...app.progress, catnip: 500, growth: {} }
    app.ui.openCodex('towers')
    const btn = document.querySelector('#overlay .train-btn')
    const before = app.progress.catnip
    if (btn) btn.click()                    // onTrain('cheese') → 도감을 다시 그린다
    const pips = document.querySelectorAll('#overlay .codex-item .rank-pips .pip.on').length
    return { hadBtn: !!btn, before, after: app.progress.catnip, rank: app.progress.growth.cheese, pips, toast: document.getElementById('toast').textContent }
  })
  await page.evaluate(() => { window.__catpaw.ui.closeOverlay(); window.__catpaw.startGame('alley') })
  await page.waitForTimeout(250)
  const trGame = await page.evaluate(() => {
    const app = window.__catpaw, g = app.game
    const cardPips = document.querySelectorAll('#shop-cards .shop-card .rank-pips .pip.on').length
    g.gold = 9999
    let t = null
    for (let r = 0; r < g.mapDef.rows && !t; r += 1) for (let c = 0; c < g.mapDef.cols; c += 1) { if (g.placeTower(c, r, 'cheese').ok) { t = g.towerAt(c, r); break } }
    app.selectedTower = t; app.ui.showTowerPanel(g, t)
    const pill = [...document.querySelectorAll('#tower-panel .stat-pill')].map((p) => p.textContent).find((x) => /훈련/.test(x)) || ''
    const base = t.def.levels[0].damage
    return { cardPips, pill, ratio: g.towerInfo(t).eff.damage / base }
  })
  check('훈련: 도감에서 캣닢 40 으로 1단계 → 상점 카드 핍 1개 · 패널 훈련 알약 · 공격 ×1.05',
    tr.hadBtn && tr.rank === 1 && tr.before - tr.after === 40 && tr.pips === 1 && /훈련 1단계/.test(tr.toast)
      && trGame.cardPips === 1 && /1단계/.test(trGame.pill) && Math.abs(trGame.ratio - 1.05) < 1e-9,
    `캣닢 ${tr.before}→${tr.after} · 단계 ${tr.rank} · 핍 ${tr.pips}/${trGame.cardPips} · '${trGame.pill}' · 배율 ${trGame.ratio.toFixed(3)}`)
  // 훈련 단계는 진행도에 남아 뒤 검사(버프 배수 1.0 기준)를 흔든다 — 여기서 되돌린다
  await page.evaluate(() => {
    const app = window.__catpaw
    app.ui.hideTowerPanel(); app.game = null
    app.progress = { ...app.progress, growth: {} }; app._persist()
  })

  // ── 과금 콘텐츠 — 유료가 잠그는 것은 유료뿐이고, 데모 결제로 열린다 ─────────
  // 3막: 카드가 '유료' 로 잠겨 있고 탭하면 상점이 그 상품을 강조한다. 데모 결제 뒤엔 보통 카드가 되고
  // 앞 장을 다 깬 사람에게 19장이 실제로 열린다(컷신). 1~2막 카드에는 유료 표시가 없다.
  const act3 = await page.evaluate(async () => {
    const app = window.__catpaw
    const all = app.__registry.listChapters()
    const paidIds = all.filter((c) => (c.act || 1) === 3).map((c) => c.id)
    const freeIds = all.filter((c) => (c.act || 1) !== 3).map((c) => c.id)
    // 1~2막을 전부 깬 진행도 — 3막이 열리는 유일한 조건이 '샀는가' 가 되도록
    const stars = { ...((app.progress.scenario && app.progress.scenario.stars) || {}) }
    for (const id of freeIds) stars[id] = Math.max(1, stars[id] || 0)
    app.progress = { ...app.progress, unlocks: { acts: [], packs: [] }, scenario: { ...(app.progress.scenario || {}), stars } }
    app._goto('chapters')
    const cards = [...document.querySelectorAll('#chapter-list .map-card')]
    const paidCards = cards.filter((c) => c.classList.contains('paid'))
    const heads = [...document.querySelectorAll('#chapter-list .act-head')].map((h) => h.textContent)
    const first = paidCards[0]
    const meta = first ? first.querySelector('.map-meta').textContent : ''
    // 우회 경로 — 카드가 아니라 함수로 와도 잠겨 있다
    app.startChapter(paidIds[0])
    const refused = document.getElementById('toast').textContent
    const refusedOverlay = !document.getElementById('overlay').hidden
    if (first) first.click()                // → onOpenStore('title', 'act3')
    const focus = document.querySelector('#overlay .store-item.focus')
    const focusName = focus ? focus.querySelector('h4').textContent : ''
    const buy = focus && focus.querySelector('button.buy')
    if (buy) buy.click()                    // 데모 결제 → applyPurchase → 상점을 다시 그린다
    await new Promise((r) => setTimeout(r, 250))
    const ownedRows = [...document.querySelectorAll('#overlay .store-item .owned')].length
    const toast = document.getElementById('toast').textContent
    app.ui.closeOverlay()
    app._goto('chapters')
    const after = [...document.querySelectorAll('#chapter-list .map-card')]
    const paidAfter = after.filter((c) => c.classList.contains('paid')).length
    const enabledAfter = after.filter((c) => !c.disabled).length
    app.startChapter(paidIds[0])            // 이제 컷신이 열린다
    const story = !document.getElementById('overlay').hidden && !!document.querySelector('#overlay .story-box')
    app.ui.closeOverlay(); app.ui.overlay.classList.remove('story')
    return { total: cards.length, paid: paidCards.length, expectPaid: paidIds.length, free: freeIds.length, heads, meta, refused, refusedOverlay,
      focusName, hadBuy: !!buy, ownedRows, toast, paidAfter, enabledAfter, story, acts: app.progress.unlocks.acts }
  })
  check('3막: 유료 카드가 6장 잠겨 있고(우회해도 거부) 탭하면 상점이 3막을 강조한다 · 데모 결제 뒤 전부 열려 컷신이 뜬다',
    act3.paid === act3.expectPaid && act3.expectPaid === 6 && act3.heads.length === 3 && /유료/.test(act3.meta) && /₩/.test(act3.meta)
      && /상점/.test(act3.refused) && !act3.refusedOverlay && /3막/.test(act3.focusName) && act3.hadBuy && act3.ownedRows >= 1
      && /데모 결제/.test(act3.toast) && act3.paidAfter === 0 && act3.enabledAfter === act3.free + 1 && act3.story
      && act3.acts.length === 1 && act3.acts[0] === 3,
    `유료 ${act3.paid}/${act3.expectPaid} · 막 ${act3.heads.join(',')} · '${act3.meta}' · 우회 '${act3.refused}' · 강조 '${act3.focusName}' · 뒤 유료 ${act3.paidAfter} 열림 ${act3.enabledAfter}/${act3.total} (기대 ${act3.free + 1}) · 컷신 ${act3.story}`)
  await page.screenshot({ path: join(outDir, '10e-act3.png') })

  // 도전 팩 2: 시트에서 팩 행이 잠겨 '유료 · ₩' 버튼이고, 우회해도 시작되지 않는다. 버튼 → 상점(강조) → 데모 결제 → 잠금 0.
  // 그리고 팩 2 규칙 하나(판매 금지)가 실제 판에서 먹는다.
  const pk = await page.evaluate(async () => {
    const app = window.__catpaw
    const reg = app.__registry
    app.progress = { ...app.progress, clears: { ...app.progress.clears, alley: Math.max(1, app.progress.clears.alley || 0) } }
    app.ui.openChallenges('alley', app.progress)
    const rows = [...document.querySelectorAll('#overlay .challenge-row')]
    const locked = rows.filter((r) => r.classList.contains('locked'))
    const expectLocked = reg.listChallenges().filter((c) => c.pack).length
    const expectRows = reg.listChallenges().length
    const lockedBtn = locked[0] && locked[0].querySelector('.btn')
    const lockedText = lockedBtn ? lockedBtn.textContent : ''
    const paid = reg.listChallenges().find((c) => c.pack)
    app.startChallenge('alley', paid.id)
    const refused = document.getElementById('toast').textContent
    const refusedGame = !!app.game
    if (lockedBtn) lockedBtn.click()        // → onOpenStore('title', 'challenges2')
    const focus = document.querySelector('#overlay .store-item.focus')
    const focusName = focus ? focus.querySelector('h4').textContent : ''
    const buy = focus && focus.querySelector('button.buy')
    if (buy) buy.click()
    await new Promise((r) => setTimeout(r, 250))
    app.ui.closeOverlay()
    app.ui.openChallenges('alley', app.progress)
    const lockedAfter = document.querySelectorAll('#overlay .challenge-row.locked').length
    const startBtns = document.querySelectorAll('#overlay .challenge-row .btn').length
    // 판매 금지 — 팩 2 규칙. 고양이를 하나 놓고 팔아 본다.
    app.startChallenge('alley', 'no-sell')
    const g = app.game
    let sold = null, can = null, towers = 0
    if (g) {
      g.gold = 9999
      for (let r = 0; r < g.mapDef.rows && !towers; r += 1) for (let c = 0; c < g.mapDef.cols; c += 1) { if (g.placeTower(c, r, 'cheese').ok) { towers = 1; break } }
      can = g.canSellTower()
      sold = g.sellTower(g.towers[0])
    }
    return { rows: rows.length, expectRows, locked: locked.length, expectLocked, lockedText, refused, refusedGame, focusName, hadBuy: !!buy,
      lockedAfter, startBtns, packs: app.progress.unlocks.packs, challengeId: g && g.challenge && g.challenge.id, can, sold, towersLeft: g ? g.towers.length : -1 }
  })
  await page.waitForTimeout(250)
  pk.screen = await page.evaluate(() => document.body.dataset.screen)
  const hudPk = await page.textContent('#wave-label')
  check('도전 팩 2: 팩 행 5개가 잠겨 있고(우회해도 거부) 버튼 → 상점 강조 → 데모 결제 → 잠금 0 · 판매 금지 규칙이 판에서 먹는다',
    pk.locked === pk.expectLocked && pk.expectLocked === 5 && pk.rows === pk.expectRows && /유료/.test(pk.lockedText) && /₩/.test(pk.lockedText)
      && /상점/.test(pk.refused) && !pk.refusedGame && /도전 팩/.test(pk.focusName) && pk.hadBuy && pk.lockedAfter === 0 && pk.startBtns === pk.expectRows
      && pk.packs.length === 1 && pk.packs[0] === 'challenges2' && pk.challengeId === 'no-sell' && pk.can && !pk.can.ok && pk.sold === 0
      && pk.towersLeft === 1 && pk.screen === 'game' && /판매 금지/.test(hudPk),
    `잠금 ${pk.locked}/${pk.expectLocked} (행 ${pk.rows}/${pk.expectRows}) '${pk.lockedText}' · 우회 '${pk.refused}' · 강조 '${pk.focusName}' · 뒤 잠금 ${pk.lockedAfter} 시작 ${pk.startBtns}/${pk.expectRows} · 판매 ${pk.sold} '${pk.can && pk.can.reason}' · ${hudPk}`)

  // 스킨: 도감 → 스킨 시트에서 캣닢 스킨을 사면 장착되고, 판의 상점 카드 그림이 달라진다.
  // 기본으로 되돌리면 픽셀이 원본과 같아진다. 그 뒤 놓는 고양이는 스킨을 입되 능력치는 그대로다.
  const sk = await page.evaluate(async () => {
    const app = window.__catpaw, g = app.game
    const reg = app.__registry
    app.progress = { ...app.progress, catnip: 500, skins: { owned: [], equipped: {} } }
    g.setProgress(app.progress); app.ui.renderShop(g, app.placingId)
    const cardPng = () => {
      const card = [...document.querySelectorAll('#shop-cards .shop-card')].find((c) => c.querySelector('.nm').textContent === reg.getTower('cheese').name)
      return card ? card.querySelector('canvas').toDataURL() : ''
    }
    const base = cardPng()
    const target = reg.listSkins('cheese').find((s) => s.price)
    app.ui.openSkins('cheese', app.progress)
    const rows = [...document.querySelectorAll('#overlay .skin-row')]
    const row = rows.find((r) => r.querySelector('h4').textContent.startsWith(target.name))
    const btn = row && row.querySelector('.btn')
    const btnText = btn ? btn.textContent : ''
    const before = app.progress.catnip
    if (btn) btn.click()                    // onBuySkin → 캣닢 차감 · 소유 · 장착 · 시트 다시 그림
    const toast = document.getElementById('toast').textContent
    const equippedRow = [...document.querySelectorAll('#overlay .skin-row.on h4')].map((h) => h.textContent)
    const skinned = cardPng()
    // 기본으로 되돌리기 → 픽셀이 원본과 같다
    app.ui.h.onEquipSkin('cheese', null)
    const restored = cardPng()
    // 다시 장착하고 고양이를 놓으면 타워가 스킨을 입는다. 능력치는 기본과 같다.
    app.ui.h.onEquipSkin('cheese', target.id)
    let placed = null
    for (let r = 0; r < g.mapDef.rows && !placed; r += 1) for (let c = 0; c < g.mapDef.cols; c += 1) { if (g.placeTower(c, r, 'cheese').ok) { placed = g.towerAt(c, r); break } }
    const plain = g.towers.find((t) => t !== placed)
    const dmg = (t) => g.towerInfo(t).eff.damage
    const out = { btnText, before, after: app.progress.catnip, price: target.price, toast, equippedRow, rows: rows.length, expectRows: reg.listSkins('cheese').length + 1,
      owned: app.progress.skins.owned, changed: skinned !== base && base.length > 100, restored: restored === base,
      towerSkin: placed && placed.skin ? placed.skin.id : null, sameDamage: placed && plain ? dmg(placed) === dmg(plain) : null, target: target.id }
    app.ui.closeOverlay(); app.ui.h.onEquipSkin('cheese', null); app.ui.hideTowerPanel(); app.game = null
    app.progress = { ...app.progress, skins: { owned: [], equipped: {} } }; app._persist()
    return out
  })
  check('스킨: 캣닢 120 으로 사면 장착되고 상점 카드 그림이 달라진다 · 기본으로 되돌리면 원본과 같다 · 놓은 고양이가 스킨을 입되 공격력은 같다',
    sk.rows === sk.expectRows && sk.expectRows >= 3 && /120/.test(sk.btnText) && sk.before - sk.after === sk.price && sk.price === 120
      && /장착/.test(sk.toast) && sk.equippedRow.length === 1 && sk.owned.length === 1 && sk.owned[0] === sk.target
      && sk.changed && sk.restored && sk.towerSkin === sk.target && sk.sameDamage === true,
    `행 ${sk.rows}/${sk.expectRows} · '${sk.btnText}' 캣닢 ${sk.before}→${sk.after} · '${sk.toast}' · 장착 행 ${sk.equippedRow.join(',')} · 달라짐 ${sk.changed} 복원 ${sk.restored} · 타워 스킨 ${sk.towerSkin} · 공격 같음 ${sk.sameDamage}`)

  // 카드 고양이: 뽑기 풀이 채워졌으니 조각 교환으로 한 마리를 사서 **상점에 실제로 뜨는지** 본다.
  // (해금 목록에 없어도 cards.owned 만으로 쓸 수 있어야 한다 — game.isTowerUnlocked 의 두 번째 길)
  const cc = await page.evaluate(async () => {
    const app = window.__catpaw, reg = app.__registry
    const cards = reg.listTowers().filter((t) => t.rarity)
    const target = cards[0]
    const free = reg.listTowers().filter((t) => !t.rarity).map((t) => t.id)
    app.progress = {
      ...app.progress, unlockedTowers: free,
      cards: { owned: {}, shards: 400 }, runes: { owned: {}, equipped: {} },
    }
    app._persist()
    app.ui.openCodex('cards')
    const rows = document.querySelectorAll('#overlay .pet-row').length
    const btns = [...document.querySelectorAll('#overlay .pet-act .btn')]
    const row = [...document.querySelectorAll('#overlay .pet-row')]
      .find((r) => r.querySelector('h4').textContent.startsWith(target.name))
    const buy = row.querySelector('.pet-act .btn')
    const beforeShards = app.progress.cards.shards
    buy.click()
    const out = {
      cards: cards.length, rows, buttons: btns.length,
      owned: app.progress.cards.owned[target.id] || 0,
      shards: app.progress.cards.shards, beforeShards, target: target.id, name: target.name,
    }
    // 판을 열어 상점에 뜨는지 — 해금 목록엔 없고 카드로만 가진 고양이다
    app.ui.closeOverlay()
    app.startGame('alley')
    out.inShop = [...document.querySelectorAll('#shop-cards .shop-card .nm')].map((n) => n.textContent).includes(target.name)
    out.unlockedByCard = app.game.isTowerUnlocked(target.id)
    out.notInUnlockList = !app.progress.unlockedTowers.includes(target.id)
    app.game = null; app.currentMapId = null
    app.progress = { ...app.progress, unlockedTowers: reg.listTowers().map((t) => t.id), cards: { owned: {}, shards: 0 } }
    app._persist()
    return out
  })
  await page.screenshot({ path: join(outDir, '22-cards.png') })
  check('카드: 도감 카드 탭에 뽑기 고양이 6종이 뜨고, 조각으로 산 고양이가 해금 없이 상점에 나온다',
    cc.cards === 6 && cc.rows === 6 && cc.owned === 1 && cc.beforeShards - cc.shards === 300
      && cc.inShop === true && cc.unlockedByCard === true && cc.notInUnlockList === true,
    `카드 ${cc.cards}종 행 ${cc.rows} · ${cc.name} 보유 ${cc.owned} · 조각 ${cc.beforeShards}→${cc.shards} · `
    + `상점 ${cc.inShop} 해금 ${cc.unlockedByCard} 해금목록밖 ${cc.notInUnlockList}`)

  // 속성 원정: 맵 목록의 카드 → 덱 편성(4마리) → 칸 진입. 상점이 덱 밖 고양이를 안 그리고,
  // HUD 에 이번 칸의 지배 속성이 뜨고, 이기면 결과 시트에 '다음 칸'과 사다리가 나온다.
  const ex = await page.evaluate(async () => {
    const app = window.__catpaw, reg = app.__registry
    const exp = reg.listExpeditions()[0]
    const all = reg.listTowers().map((t) => t.id)
    // 고양이 셋만 열린 진행도 → 카드가 잠긴다
    app.progress = { ...app.progress, unlockedTowers: all.slice(0, 3), cards: { owned: {}, shards: 0 } }
    app.ui.renderMapList(app.progress)
    const lockedCard = document.querySelector('#map-list .expedition-card')
    const lockedText = lockedCard ? lockedCard.textContent : ''
    const lockedDisabled = lockedCard ? lockedCard.disabled : null

    // 전부 열고 다시
    app.progress = { ...app.progress, unlockedTowers: all, expedition: { best: {}, cleared: [], deck: [] } }
    app._persist()
    app.ui.renderMapList(app.progress)
    const card = document.querySelector('#map-list .expedition-card')
    const dots = card.querySelectorAll('.stage-dot').length
    card.click()
    await new Promise((r) => setTimeout(r, 60))

    const stageRows = document.querySelectorAll('#overlay .stage-row').length
    const catBtns = [...document.querySelectorAll('#overlay .deck-cat')]
    const startBtn = () => [...document.querySelectorAll('#overlay .sheet-actions .btn')].find((b) => /원정 시작|Start expedition/.test(b.textContent))
    const disabledEmpty = startBtn().disabled
    // 4마리를 고르고, 다섯 번째는 안 들어간다
    for (let i = 0; i < 5; i += 1) document.querySelectorAll('#overlay .deck-cat')[i].click()
    const picked = document.querySelectorAll('#overlay .deck-cat.on').length
    const deck = [...document.querySelectorAll('#overlay .deck-cat.on .nm')].map((n) => n.textContent)
    const disabledFull = startBtn().disabled
    startBtn().click()
    await new Promise((r) => setTimeout(r, 120))

    const g = app.game
    const shopCards = document.querySelectorAll('#shop-cards .shop-card').length
    const hud = document.getElementById('hud-wave') ? document.getElementById('hud-wave').textContent : ''
    const stage0 = exp.stages[0]
    const out = {
      lockedText, lockedDisabled, dots, stageRows, expStages: exp.stages.length,
      disabledEmpty, disabledFull, picked, deck, shopCards,
      banned: (g.rules.bannedTowers || []).length, expectBanned: all.length - 4,
      enemyElement: g.rules.enemyElement,
      elemental: g.rules.elemental, waveTotal: g.totalWaves, wantWaves: stage0.waveLimit,
      mapId: g.mapDef.id, wantMap: stage0.mapId, hud: (document.getElementById('wave-label') || {}).textContent || '',
      // 이 칸의 적은 전부 지배 속성이다 — 타고난 속성이 뭐든
      mul: (() => {
        const e = g._createEnemy('mouse', { hp: 100000 })
        const before = e.hp
        g.applyDamage(e, 100, { canCrit: false, element: 'bolt' })   // 번개 → (덮인) 얼음? 칸1은 흙이라 불리
        return { born: e.def.element, dealt: before - e.hp }
      })(),
    }
    // 첫 칸을 이겨서 결과 시트를 본다
    g.phase = 'victory'; g.waveNo = g.tableWaves; app._runLedger = null
    const catnipBefore = app.progress.catnip
    const freeBefore = { best: app.progress.bestWave[stage0.mapId] || 0, clears: app.progress.clears[stage0.mapId] || 0 }
    app._endRun(g.summary())
    out.title = document.querySelector('#overlay h2').textContent
    out.resultDots = document.querySelectorAll('#overlay .stage-chain .stage-dot').length
    out.btns = [...document.querySelectorAll('#overlay .btn')].map((b) => b.textContent)
    out.reached = app.progress.expedition.best[exp.id]
    out.gotTickets = app.progress.tickets
    out.gotShards = app.progress.cards.shards
    out.catnipGain = app.progress.catnip - catnipBefore
    // 앞선 검사들이 이미 골목길을 깼으므로 0 이 아니다 — 원정이 **안 건드렸는지**를 본다
    out.freeUnchanged = (app.progress.bestWave[stage0.mapId] || 0) === freeBefore.best
      && (app.progress.clears[stage0.mapId] || 0) === freeBefore.clears
    out.freeBefore = freeBefore
    // 정리 — 다음 검사들이 같은 페이지를 쓴다
    const back = [...document.querySelectorAll('#overlay .btn')].find((b) => /맵 선택으로|Back to maps/.test(b.textContent))
    if (back) back.click()
    app.ui.closeOverlay(); app.game = null; app.expeditionRun = null; app.currentExpeditionId = null
    app.progress = { ...app.progress, expedition: { best: {}, cleared: [], deck: [] } }; app._persist()
    return out
  })
  await page.screenshot({ path: join(outDir, '21-expedition.png') })
  check('원정: 고양이 3마리면 카드가 잠기고, 덱은 4마리까지, 시작하면 상점에 그 4마리만 뜬다',
    /3마리/.test(ex.lockedText) && ex.lockedDisabled === true
      && ex.dots === ex.expStages && ex.stageRows === ex.expStages && ex.expStages === 6
      && ex.disabledEmpty === true && ex.picked === 4 && ex.disabledFull === false
      && ex.shopCards === 4 && ex.banned === ex.expectBanned && ex.elemental === true
      && ex.mapId === ex.wantMap && ex.waveTotal === ex.wantWaves,
    `잠금 '${ex.lockedText}' (${ex.lockedDisabled}) · 점 ${ex.dots}/${ex.expStages} 행 ${ex.stageRows} · `
    + `시작버튼 빈덱 ${ex.disabledEmpty}/가득 ${ex.disabledFull} · 고른 ${ex.picked} [${ex.deck.join(',')}] · `
    + `상점 ${ex.shopCards}장 금지 ${ex.banned}/${ex.expectBanned} · 맵 ${ex.mapId}/${ex.wantMap} ${ex.waveTotal}/${ex.wantWaves}웨이브`)
  check('원정: 칸의 지배 속성이 적을 덮고 HUD 에 뜬다 · 이기면 결과에 사다리와 다음 칸이 나온다',
    ex.enemyElement === 'earth' && ex.mul.born === 'earth' && ex.mul.dealt < 100
      && /흙|Earth/.test(ex.hud)
      && /1칸 돌파|Stage 1 cleared/.test(ex.title) && ex.resultDots === ex.expStages
      && ex.btns.some((b) => /다음 칸|Next stage/.test(b)) && !ex.btns.some((b) => /무한|endless/i.test(b))
      && ex.reached === 1 && ex.gotTickets >= 1 && ex.gotShards >= 20 && ex.catnipGain >= 20
      && ex.freeUnchanged === true,
    `지배속성 ${ex.enemyElement} · 생쥐 타고난 ${ex.mul.born} 피해 ${ex.mul.dealt} · HUD '${ex.hud}' · `
    + `제목 '${ex.title}' 점 ${ex.resultDots} · 버튼 ${ex.btns.join('|')} · 도달 ${ex.reached}칸 · `
    + `티켓 ${ex.gotTickets} 조각 ${ex.gotShards} 캣닢 +${ex.catnipGain} · 자유모드 기록 불변 ${ex.freeUnchanged} (${ex.freeBefore.best}/${ex.freeBefore.clears})`)

  // 뽑기: 화면의 확률 표가 gacha.js 의 표와 **글자 하나까지 같아야 한다**. 이게 법이 요구하는 것이고
  // (게임산업법 확률 공개), gacha.test 가 못 잡는 마지막 한 칸이 "화면에 실제로 그 값이 떴는가" 다.
  const gc = await page.evaluate(() => {
    const app = window.__catpaw
    app.progress = { ...app.progress, catnip: 2000, tickets: 1, cards: { owned: {}, shards: 0 }, runes: { owned: {}, equipped: {} } }
    app._persist()
    app.ui.openGacha(app.progress)
    const rows = [...document.querySelectorAll('#overlay .gacha-row')].map((r) => ({
      name: r.querySelector('b').textContent, pct: r.querySelector('.pct').textContent,
    }))
    const btns = [...document.querySelectorAll('#overlay .sheet-actions .btn')].map((b) => b.textContent)
    // 티켓이 1장 있으니 낱장은 티켓으로 낸다
    const t0 = app.progress.tickets, c0 = app.progress.catnip
    document.querySelectorAll('#overlay .sheet-actions .btn')[0].click()
    const afterOne = { tickets: app.progress.tickets, catnip: app.progress.catnip, gained: document.querySelectorAll('#overlay .gain-card').length }
    // 티켓이 떨어졌으니 10연은 캣닢으로
    document.querySelectorAll('#overlay .sheet-actions .btn')[1].click()
    const afterTen = { catnip: app.progress.catnip, gained: document.querySelectorAll('#overlay .gain-card').length }
    const runeTotal = Object.values(app.progress.runes.owned).reduce((a, b) => a + b, 0)
    const shards = app.progress.cards.shards
    return { rows, btns, t0, c0, afterOne, afterTen, runeTotal, shards }
  })
  await page.screenshot({ path: join(outDir, '20-gacha.png') })
  const want = disclosureRows()
  check('뽑기: 화면의 확률 표가 GACHA_TABLE 과 같고 합이 100% 다 · 낱장은 티켓, 10연은 캣닢으로 낸다',
    gc.rows.length === want.length
      && want.every((w, i) => gc.rows[i].pct === w.percent)
      && Math.abs(gc.rows.reduce((a, r) => a + parseFloat(r.pct), 0) - 100) < 0.01
      && gc.t0 === 1 && gc.afterOne.tickets === 0 && gc.afterOne.catnip === gc.c0 && gc.afterOne.gained === 1
      && gc.afterTen.catnip === gc.c0 - DRAW10_COST_CATNIP && gc.afterTen.gained === PITY_AT
      && gc.runeTotal + gc.shards > 0,
    `표 ${gc.rows.map((r) => r.pct).join('/')} (기대 ${want.map((w) => w.percent).join('/')}) · 버튼 ${gc.btns.join('|')} · `
    + `낱장 티켓 ${gc.t0}→${gc.afterOne.tickets} 캣닢 ${gc.c0}→${gc.afterOne.catnip} (${gc.afterOne.gained}장) · `
    + `10연 캣닢 →${gc.afterTen.catnip} (기대 ${gc.c0 - DRAW10_COST_CATNIP}, ${gc.afterTen.gained}장) · 룬 ${gc.runeTotal} 조각 ${gc.shards}`)

  // 룬: 도감 고양이 행의 '속성' 칩 → 룬 시트 → 장착. 룬은 소모되지 않고, 개수만큼만 동시에 낀다.
  const rn = await page.evaluate(() => {
    const app = window.__catpaw
    app.progress = { ...app.progress, runes: { owned: { fire: 1 }, equipped: {} } }
    app._persist()
    app.ui.openRunes('cheese', app.progress)
    const rows = [...document.querySelectorAll('#overlay .rune-row')]
    const fireRow = rows.find((r) => /불/.test(r.querySelector('h4').textContent))
    fireRow.querySelector('.btn').click()                       // onEquipRune
    const equipped = { ...app.progress.runes.equipped }
    const owned = app.progress.runes.owned.fire
    const onRows = document.querySelectorAll('#overlay .rune-row.on').length
    // 두 마리째는 못 낀다 (룬이 1개뿐)
    app.ui.openRunes('black', app.progress)
    const blackRows = [...document.querySelectorAll('#overlay .rune-row')]
    const blackFire = blackRows.find((r) => /불/.test(r.querySelector('h4').textContent))
    const blocked = blackFire.querySelector('.btn').disabled
    // 도감 카드 탭 — 룬 개수 칩이 6개 뜬다
    app.ui.openCodex('cards')
    const runeChips = document.querySelectorAll('#overlay .rune-count').length
    const tab = document.querySelector('#overlay .codex-tabs .chip.on').textContent
    const out = { rows: rows.length, equipped, owned, onRows, blocked, runeChips, tab }
    app.ui.closeOverlay()
    app.progress = { ...app.progress, runes: { owned: {}, equipped: {} } }; app._persist()
    return out
  })
  check('룬: 불 룬을 치즈냥에 끼우면 소모되지 않고, 룬이 1개뿐이라 두 마리째는 막힌다 · 카드 탭에 6속성 칩',
    rn.rows === 7 && rn.equipped.cheese === 'fire' && rn.owned === 1 && rn.onRows === 1
      && rn.blocked === true && rn.runeChips === 6 && rn.tab === '카드',
    `행 ${rn.rows}(기대 7) · 장착 ${JSON.stringify(rn.equipped)} · 남은 룬 ${rn.owned} · on ${rn.onRows} · 두 마리째 막힘 ${rn.blocked} · 칩 ${rn.runeChips} · 탭 '${rn.tab}'`)

  // 상점 섹션: 캣닢 소모품 · 콘텐츠 · 스킨 팩 · 캣닢 충전 · 프리미엄. 산 것은 '보유 중' 이고 다시 사는 버튼이 없다.
  // 웹 데모에는 '결제 준비 중' 이 안 뜬다(그건 결제가 안 붙은 APK 문구다).
  const st = await page.evaluate(() => {
    const app = window.__catpaw
    app.ui.openStore('title', app.progress, app.billing.label)
    const sections = [...document.querySelectorAll('#overlay .store-section')].map((b) => b.querySelector('h3').textContent)
    const owned = [...document.querySelectorAll('#overlay .store-item')].filter((r) => r.querySelector('.owned')).map((r) => r.querySelector('h4').textContent)
    const notes = [...document.querySelectorAll('#overlay .store-note')].map((n) => n.textContent)
    const out = { sections, owned, notReady: notes.some((n) => /결제 준비 중/.test(n)), progress: JSON.parse(JSON.stringify(app.progress)) }
    app.ui.closeOverlay()
    return out
  })
  const expectOwned = IAP_PRODUCTS.filter((p) => p.kind === 'once' && ownsGrants(st.progress, p.grants)).map((p) => p.name)
  check('상점: 섹션 5개(캣닢 소모품·콘텐츠·스킨 팩·캣닢 충전·프리미엄) · 산 콘텐츠는 보유 중 · 웹 데모엔 결제 준비 중 문구가 없다',
    st.sections.length === 5 && st.sections[0] === '캣닢으로 구매' && st.sections.includes('콘텐츠') && st.sections.includes('스킨 팩')
      && st.sections.includes('캣닢 충전') && st.sections.includes('프리미엄')
      && expectOwned.length === 2 && st.owned.length === expectOwned.length && expectOwned.every((n) => st.owned.includes(n)) && !st.notReady,
    `섹션 ${st.sections.join('·')} · 보유 ${st.owned.join(',')} (기대 ${expectOwned.join(',')}) · 준비 중 문구 ${st.notReady}`)
  await page.screenshot({ path: join(outDir, '7d-store-sections.png') })

  // 새 버전 토스트 — 새 sw.js 가 설치되면 버튼 달린 토스트가 뜨고, 그 변형만 손가락을 받는다.
  // (버튼은 location.reload() 라 누르지 않는다 — 다음 검사들이 같은 페이지를 쓴다.)
  const swToast = await page.evaluate(() => {
    const app = window.__catpaw
    app._onSwUpdate()
    const node = document.getElementById('toast')
    const btn = node.querySelector('button')
    const r = btn && btn.getBoundingClientRect()
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const out = {
      visible: !node.hidden, text: node.textContent, btn: btn ? btn.textContent : '',
      pe: getComputedStyle(node).pointerEvents, hitsButton: !!(hit && btn && (hit === btn || btn.contains(hit))),
    }
    node.hidden = true; node.classList.remove('action')
    return out
  })
  check('새 버전 토스트: 버튼이 달려 있고 그 변형만 손가락을 받는다',
    swToast.visible && /새 버전/.test(swToast.text) && swToast.btn === '새로고침' && swToast.pe === 'auto' && swToast.hitsButton,
    `${swToast.text} · pointer-events ${swToast.pe} · 버튼 명중 ${swToast.hitsButton}`)

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
    /** 한 조각의 평균색. 질감이 깔리면 픽셀 하나로는 아무것도 못 잰다. */
    const mean = (x, y, n) => {
      const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(n), Math.round(n)).data
      let r = 0, g = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
      const px = d.length / 4
      return [Math.round(r / px), Math.round(g / px), Math.round(b / px)]
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
          // 칸 한복판을 조각으로 오려 평균색과 고유 색 수를 낸다.
          // 예전엔 픽셀 하나를 테마색과 비교했는데, 바닥이 질감이 된 뒤로는
          // 테마색이 더는 화면에 안 나온다.
          const px = (R.toPx(cc) + R.tile * 0.25) * dpr
          const py = (R.toPy(rr) + R.tile * 0.25) * dpr
          const n = R.tile * 0.5 * dpr
          ground = { rgb: mean(px, py, n).join(','), uniq: uniq(px, py, n) }
          break
        }
      }

      /* 소품 판정.
       *
       * 예전 기준은 '막힌 칸의 고유 색 수가 빈 칸의 3배'였다. 빈 칸이 단색일 때만
       * 성립하는 기준이라 바닥에 질감이 깔리자 무너졌다(빈 칸도 수백 색이 된다).
       * 대신 **빈 칸 두 개끼리의 차이**를 기준선으로 삼고, 막힌 칸이 그보다
       * 훨씬 멀리 떨어져 있는지 본다. 질감이 있든 없든 성립한다.             */
      let propGap = null, floorGap = null
      if ((target.blocked || []).length > 0) {
        const free = []
        for (let rr = 0; rr < target.rows && free.length < 2; rr += 1) {
          for (let cc = 0; cc < target.cols && free.length < 2; cc += 1) {
            if (app.game.path.tileSet.has(`${cc},${rr}`)) continue
            if (target.blocked.some((b) => b[0] === cc && b[1] === rr)) continue
            free.push(mean(R.toPx(cc) * dpr, R.toPy(rr) * dpr, R.tile * dpr))
          }
        }
        const [c, r] = target.blocked[0]
        const blocked = mean(R.toPx(c) * dpr, R.toPy(r) * dpr, R.tile * dpr)
        const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
        if (free.length === 2) {
          propGap = dist(blocked, free[0])
          floorGap = dist(free[0], free[1])
        }
      }
      rows.push({ map: target.name, onPath, bad: badL + badR, seen: seenL + seenR,
        ox: Math.round(R.ox), propGap, floorGap, ground, props: (target.props || []).length })
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
  // 토스트는 #stage 안에 있어서 타이틀에서 띄운 것("함께 간다" 등)이 전부 안 보였다
  await page.evaluate(() => window.__catpaw.ui.toast('토스트 가시성 검사', 3000))
  const toastVis = await page.evaluate(() => {
    const t = document.getElementById('toast')
    const r = t.getBoundingClientRect()
    const cs = getComputedStyle(t)
    return { hidden: t.hidden, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      inView: r.top >= 0 && r.bottom <= window.innerHeight, pos: cs.position, z: cs.zIndex }
  })
  check('타이틀 화면에서 띄운 토스트가 실제로 보인다',
    !toastVis.hidden && toastVis.shown && toastVis.inView, JSON.stringify(toastVis))
  await page.evaluate(() => { document.getElementById('toast').hidden = true })
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

  // 새 고양이 4종의 효과는 패널에 아무것도 안 나왔다. 이제 레지스트리 설명이 알약으로 뜬다.
  const pills = await page.evaluate(() => {
    const app = window.__catpaw
    const g = app.game
    app.progress.unlockedTowers = null
    g.progress = app.progress
    g.gold = 99999
    const out = {}
    for (const id of ['mackerel', 'bluerussian', 'sphynx', 'tuxedo', 'calico']) {
      let tower = null
      for (let r = 0; r < g.mapDef.rows && !tower; r += 1) {
        for (let c = 0; c < g.mapDef.cols && !tower; c += 1) {
          const res = g.placeTower(c, r, id)
          if (res.ok) tower = res.tower
        }
      }
      if (!tower) { out[id] = '못 놓음'; continue }
      app.ui.showTowerPanel(g, tower)
      out[id] = [...document.querySelectorAll('#tower-panel .stat-pill')].map((p) => p.textContent).join(' | ')
      app.ui.hideTowerPanel()
      g.sellTower(tower)
    }
    return out
  })
  check('패널에 상처·정전기·관통·강화 알약이 뜨고 지상 전용은 표적을 알린다',
    /상처/.test(pills.mackerel) && /정전기/.test(pills.bluerussian) && /관통/.test(pills.sphynx) && /강화/.test(pills.tuxedo)
    && /표적\s*지상 전용/.test(pills.calico),
    Object.entries(pills).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(' / '))

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

  /* 기준 40 은 양쪽을 다 재서 정했다.
   *   그림이 붙었을 때  창고 104종 (매끈한 회색 콘크리트 — 일부러 무늬가 거의 없다)
   *   그림을 뺐을 때    창고   7종 (테마색 체커보드 + 방사형 그라디언트)
   * 7 과 104 사이라 어느 쪽으로도 넉넉하다. 실제로 floor-warehouse.png 를 잠시
   * 치워서 7종이 나오는 것을 확인했다.                                        */
  check('바닥이 단색이 아니라 질감으로 칠해진다',
    mapArt.length > 0 && mapArt.every((m) => m.ground && m.ground.uniq > 40),
    mapArt.map((m) => `${m.map} ${m.ground ? `${m.ground.uniq}종` : '샘플없음'}`).join(' · '))
  // 바닥 캐시가 맵을 바꿔도 안 지워지면 여섯 맵의 평균색이 **똑같아진다**.
  // 그걸 잡는 검사다 — 미세한 차이를 재는 게 아니라 '전부 같은가'를 본다.
  const grounds = mapArt.map((m) => m.ground && m.ground.rgb).filter(Boolean)
  check('맵을 바꾸면 바닥도 바뀐다 (바닥 캐시가 낡지 않는다)',
    grounds.length === mapArt.length && new Set(grounds).size === grounds.length,
    mapArt.map((m) => `${m.map} ${m.ground ? m.ground.rgb : '샘플없음'}`).join(' · '))
  const withProps = mapArt.filter((m) => m.propGap !== null)
  check('막힌 칸에 소품 그림이 놓인다',
    withProps.length > 0
      && withProps.every((m) => m.propGap > 12 && m.propGap > m.floorGap * 2),
    withProps.map((m) => `${m.map} 소품칸 차이 ${m.propGap} / 빈칸끼리 ${m.floorGap}`).join(' · '))

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
    sc.on('console', (m) => { if (m.type() === 'error') scErrors.push(`[검사 ${steps.length}번 뒤] ${m.text()}`) })
    await sc.goto(base)
    await passLoading(sc)

    await sc.click('#btn-scenario')
    await sc.waitForSelector('#screen-chapters:not([hidden])')
    // 잠김 = 자물쇠가 붙은 카드. 앞 장을 못 깬 카드는 disabled 이고, 안 산 유료 막의 카드는 눌러서 상점으로 가므로
    // disabled 가 아니다 — 둘 다 '놀 수 없는' 카드라 첫 장 빼고 전부 자물쇠여야 한다.
    const chCards = await sc.$$('#chapter-list .map-card')
    const chLocked = await sc.$$('#chapter-list .map-card .lock')
    const chDisabled = await sc.$$('#chapter-list .map-card[disabled]')
    const chPaid = await sc.$$('#chapter-list .map-card.paid')
    const chTotal = await sc.evaluate(() => window.__catpaw.__registry.listChapters().length)
    const chPaidReg = await sc.evaluate(() => window.__catpaw.__registry.listChapters().filter((c) => (c.act || 1) >= 3).length)
    check('시나리오 챕터가 등록 수만큼 뜨고 첫 장만 열려 있다 (유료 막은 자물쇠 + 상점행)',
      chCards.length === chTotal && chLocked.length === chTotal - 1 && chPaid.length === chPaidReg && chPaidReg > 0
        && chDisabled.length === chTotal - 1 - chPaidReg,
      `챕터 ${chCards.length}개, 자물쇠 ${chLocked.length}개 (disabled ${chDisabled.length} · 유료 ${chPaid.length}/${chPaidReg})`)
    const actHeads = await sc.$$eval('#chapter-list .act-head', (els) => els.map((e) => e.textContent))
    const actsReg = await sc.evaluate(() => new Set(window.__catpaw.__registry.listChapters().map((c) => c.act || 1)).size)
    check('챕터 목록이 막마다 제목을 넣는다 (1막·2막)',
      actHeads.length === actsReg && actHeads[0] === '1막' && actHeads[actHeads.length - 1] === `${actsReg}막`,
      actHeads.join(' · '))
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
    // 장소 사진은 오버레이에 깔린다. 그런데 오버레이는 일시정지·설정·도감·결과가
    // 전부 함께 쓰고, closeOverlay() 는 hidden 만 뒤집는다 — 클래스를 안 지우면
    // 컷신 다음에 여는 시트마다 컷신 배경이 따라다닌다.
    const storyOnDuring = await sc.evaluate(() =>
      document.getElementById('overlay').classList.contains('story'))
    await sc.screenshot({ path: join(outDir, '16-story.png') })
    const taps = await tapThroughStory()
    await sc.waitForSelector('#screen-game:not([hidden])', { timeout: 5000 })
    check('컷신이 뜨고 화자 그림과 함께 탭으로 넘어가 전투로 들어간다',
      taps === introCards && speakerPainted > 100,
      `대사 ${introCards}장 · 탭 ${taps}회 · 화자 그림 ${speakerPainted}px`)

    await sc.click('#btn-pause')
    await sc.waitForSelector('#overlay:not([hidden])', { timeout: 5000 })
    const storyOnAfter = await sc.evaluate(() =>
      document.getElementById('overlay').classList.contains('story'))
    // 배경만 눌러 닫으면 게임이 멈춘 채로 남아 뒤 검사(지도 탭)가 깨진다.
    // 정식 경로인 '계속하기'로 돌아간다.
    await sc.click('#overlay-sheet button:text-is("계속하기")')
    // waitForSelector 는 기본이 '보일 때까지'라 숨은 요소는 영영 안 온다
    await sc.waitForFunction(() => document.getElementById('overlay').hidden, null, { timeout: 5000 })
    check('컷신 배경이 다음에 여는 시트로 새지 않는다',
      storyOnDuring && !storyOnAfter,
      `컷신 중 ${storyOnDuring ? 'story 있음' : 'story 없음(배경이 안 깔린다)'}`
      + ` · 일시정지 ${storyOnAfter ? 'story 남음' : 'story 없음'}`)

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
    // 화면 배경은 .jpg 다. .png 만 막으면 '그림이 하나도 없을 때'를 재는 게 아니게 된다.
    await noArt.route(/\/art\/[^/]+\.(png|jpe?g)$/, (r) => r.abort())
    await noArt.goto(base)
    // 실패도 finish 다 — 그림이 전부 막혀도 로딩은 15초 상한이 아니라 곧바로 끝나야 한다
    const noArtT0 = Date.now()
    await passLoading(noArt)
    const noArtMs = Date.now() - noArtT0
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
    check('그림이 없어도 로딩이 가두지 않는다 (실패도 finish)', noArtMs < 10000, `${noArtMs}ms 에 탭 프롬프트`)
    check('그림이 없어도 벡터로 떨어져 게임이 그대로 돌아간다',
      noArtErrors.length === 0 && fb.keys.length === 0 && fb.opaque > 100,
      `로드된 그림 ${fb.keys.length}장 · 상점 카드 불투명 ${fb.opaque}px` +
      (noArtErrors.length ? ` · 오류 ${noArtErrors[0]}` : ' · 오류 없음'))
  }

  /* 영어 패스 — 기기 언어가 영어면(설정 auto) 부팅부터 결과 시트까지 한글이 한 글자도 안 보여야 한다.
   * 사전에 없는 문구는 조용히 한국어로 샌다(정직한 폴백) — 그걸 눈이 아니라 검사가 잡는다.
   * i18n.test 는 코드에 적힌 리터럴만 보므로, 레지스트리 제자리 번역 · 정적 HTML · 실행 때 조립되는 문장은 여기서만 잡힌다. */
  {
    const enCtx = await browser.newContext({
      viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US',
    })
    const en = await enCtx.newPage()
    const enErrors = []
    en.on('pageerror', (e) => enErrors.push(e.message))
    en.on('console', (m) => { if (m.type() === 'error') enErrors.push(m.text()) })
    await en.goto(base)
    await en.waitForFunction(() => window.__catpaw !== undefined, null, { timeout: 15000 })
    await en.waitForSelector('#loading-tap:not([hidden])', { timeout: 20000 })
    const enTexts = {}
    const grab = async (name, fn, arg) => { enTexts[name] = await en.evaluate(fn, arg) }
    const overlayText = () => document.getElementById('overlay').innerText
    await grab('loading', () => document.getElementById('loading').innerText)
    await en.click('#loading-tap')
    await en.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 5000 })
    await grab('daily', () => (document.getElementById('overlay').hidden ? '' : document.getElementById('overlay').innerText))
    await dismissDaily(en)
    await grab('title', () => document.getElementById('screen-title').innerText)
    await grab('html', () => `${document.documentElement.lang} | ${document.title} | ${document.querySelector('meta[name="description"]').content}`)
    await en.click('#btn-play')
    await en.waitForSelector('#screen-maps:not([hidden])')
    await en.waitForTimeout(250)
    await en.evaluate(() => {
      const app = window.__catpaw
      app.progress = { ...app.progress, clears: { ...app.progress.clears, alley: 1 } }
      app._goto('maps')                     // 깬 맵이 있어야 도전 칩 · 주간 카드 문구가 다 나온다
    })
    await grab('maps', () => document.getElementById('screen-maps').innerText)
    await en.evaluate(() => window.__catpaw.ui.openChallenges('alley', window.__catpaw.progress))
    await grab('challenges', overlayText)
    await en.evaluate(() => { window.__catpaw.ui.closeOverlay(); window.__catpaw._goto('chapters') })
    await en.waitForTimeout(250)
    await grab('chapters', () => document.getElementById('screen-chapters').innerText)
    await en.evaluate(() => { const app = window.__catpaw; app.ui.openStoryCards(app.__registry.listChapters()[0].intro, () => {}) })
    await grab('story', overlayText)
    await en.evaluate(() => { const app = window.__catpaw; app.ui.closeOverlay(); app.ui.overlay.classList.remove('story') })
    // 게임 — HUD · 상점 카드 · 타워 패널 · 필살기 · 웨이브 버튼
    await en.evaluate(() => window.__catpaw.startGame('alley'))
    await en.waitForTimeout(250)
    await en.evaluate(() => {
      const app = window.__catpaw, g = app.game
      g.gold = 9999
      let t = null
      for (let r = 0; r < g.mapDef.rows && !t; r += 1) for (let c = 0; c < g.mapDef.cols; c += 1) { if (g.placeTower(c, r, 'cheese').ok) { t = g.towerAt(c, r); break } }
      app.selectedTower = t; app.ui.showTowerPanel(g, t); app.ui.updateHud(g)
    })
    await en.waitForTimeout(300)
    await grab('game', () => document.getElementById('screen-game').innerText)
    await en.evaluate(() => { const app = window.__catpaw; app.paused = true; app.ui.openPause() })
    await grab('pause', overlayText)
    await en.evaluate(() => { const app = window.__catpaw; app.ui.openSettings(app.settings, () => {}) })
    await grab('settings', overlayText)
    for (const tab of ['towers', 'enemies', 'combos', 'pets', 'specials', 'achievements', 'records']) {
      await en.evaluate((t) => window.__catpaw.ui.openCodex(t), tab)
      await grab(`codex:${tab}`, overlayText)
    }
    await en.evaluate(() => { const app = window.__catpaw; app.ui.openSkins('cheese', app.progress) })
    await grab('skins', overlayText)
    await en.evaluate(() => { const app = window.__catpaw; app.ui.openStore('ingame', app.progress, app.billing.label) })
    await grab('store', overlayText)
    await en.evaluate(() => { const app = window.__catpaw; app.ui.closeOverlay(); app._openPets() })
    await grab('pets', overlayText)
    await en.evaluate(() => {
      const app = window.__catpaw, g = app.game
      app.paused = false; app.ui.closeOverlay()
      g.phase = 'victory'; g.waveNo = g.tableWaves; app._runLedger = null
      app._endRun(g.summary())              // 결과 시트 — 업적 · 이어하기 · 무한 버튼 문구까지
    })
    await grab('result', overlayText)
    await en.screenshot({ path: join(outDir, '40-english.png') })
    await enCtx.close()
    const hangul = Object.entries(enTexts)
      .map(([k, v]) => { const m = String(v).match(/[^\n]*[가-힣][^\n]*/); return m ? `${k}: '${m[0].trim().slice(0, 70)}'` : null })
      .filter(Boolean)
    check('영어 패스: 기기 언어가 영어면 로딩·출석·타이틀·맵·도전·챕터·컷신·게임·일시정지·설정·도감 7탭·스킨·상점·펫·결과 어디에도 한글이 없다',
      hangul.length === 0 && /^en \| Catpaw Defense \| /.test(enTexts.html) && Object.keys(enTexts).length >= 20,
      hangul.length ? `${hangul.length}곳 — ${hangul.slice(0, 4).join(' · ')}` : `${Object.keys(enTexts).length}화면 · ${enTexts.html}`)
    check('영어 패스: 콘솔 에러 0건', enErrors.length === 0, enErrors[0] || '없음')
  }

  /* 타워 패널이 옆 고양이 버프를 반영하는가.
   *
   * towerInfo() 가 레벨 표 원본(stats)만 주던 시절에는, 치즈냥 옆에 턱시도냥을
   * 놓아도 패널이 계속 19.2 를 보여줬다 — 실제로는 23.2 로 싸우고 있었다.
   * 턱시도냥의 존재 이유 전부가 그 배수인데 화면에 안 나타났다. */
  {
    const buff = await page.evaluate(async () => {
      const app = window.__catpaw, g = app.game
      g.gold = 99999
      g.progress.unlockedTowers = null   // null = 전부 해금 (save.js 규약)
      const spots = []
      for (let r = 0; r < g.mapDef.rows; r += 1) {
        for (let c = 0; c < g.mapDef.cols; c += 1) {
          let d = Infinity
          for (const p of g.path.points) d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
          spots.push({ c, r, d })
        }
      }
      spots.sort((a, b) => a.d - b.d)
      let cat = null
      for (const sp of spots) if (g.placeTower(sp.c, sp.r, 'cheese').ok) { cat = g.towerAt(sp.c, sp.r); break }
      if (!cat) return { err: '치즈냥을 못 놓았다' }
      app.selectedTower = cat
      app.ui.showTowerPanel(g, cat)
      const dps = () => document.querySelector('.stat-pill b[data-k="dps"]')?.textContent
      const before = dps()
      let tux = false
      for (const sp of spots) {
        if (Math.hypot(sp.c - cat.c, sp.r - cat.r) < 2 && g.placeTower(sp.c, sp.r, 'tuxedo').ok) { tux = true; break }
      }
      if (!tux) return { err: '턱시도냥을 옆에 못 놓았다' }
      // 패널은 열어 둔 채로 두 프레임 — 매 프레임 갱신이 도는지 보는 것이다
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return { before, after: dps(), real: String(g.towerInfo(cat).eff.dps) }
    })
    check('타워 패널이 옆 고양이 버프를 실시간으로 반영한다',
      !buff.err && buff.after === buff.real && buff.after !== buff.before,
      buff.err || `초당피해 ${buff.before} → ${buff.after} (실제 ${buff.real})`)
  }

  /* 패널을 열어 둔 채 골드가 모이면 업그레이드가 풀려야 한다.
   *
   * 잠금은 패널을 열 때 한 번 계산됐다. 패널은 열어 둔 채로 전투가 계속 도니까
   * 적을 잡아 돈이 모여도 버튼은 잠긴 채였다 — 돈이 있는데 안 눌리고, 닫았다
   * 다시 열어야 풀렸다. 실제 폰에서 사용자가 잡은 버그다. */
  {
    const t = await page.evaluate(async () => {
      const app = window.__catpaw, g = app.game
      const tower = g.towers[0]
      if (!tower) return { err: '타워가 없다' }
      const cost = g.towerInfo(tower).upgradeCost
      if (cost === null) return { err: '이미 최대 레벨' }

      const btn = () => document.querySelector('#tower-panel .btn.upgrade')
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

      // 살 수 없는 상태로 패널을 연다
      const keep = g.gold
      g.gold = cost - 1
      app.ui.showTowerPanel(g, tower)
      await frame()
      const poor = btn().disabled

      // 패널은 그대로 두고 돈만 들어온다 (적을 잡은 것과 같다)
      g.gold = cost + 50
      await frame()
      const rich = btn().disabled

      g.gold = keep
      await frame()
      return { cost, poor, rich }
    })
    check('패널을 열어 둔 채 돈이 모이면 업그레이드가 풀린다',
      !t.err && t.poor === true && t.rich === false,
      t.err || `업그레이드 ${t.cost}골드 · 부족할 때 ${t.poor ? '잠김' : '열림'}`
        + ` · 충분해진 뒤 ${t.rich ? '잠김(버그)' : '열림'}`)
  }

  /* ── 짧은 화면 (실제 폰 인앱 브라우저) ──────────────────────────────────
   *
   * 이 검사가 없어서 지도가 손톱만 해지는 버그를 놓쳤다. 위의 모든 검사는
   * 412×915 로만 돌고, 915 는 @media (min-height:760px) 의 '키우는' 브랜치라
   * 문제가 생길 수 없는 조건만 봐 온 셈이다.
   *
   * 402×658 은 실제 아이폰(402×874)에서 인앱 브라우저 크롬 216px 를 뺀 실측값이다.
   * 전투 UI 는 화면 높이와 무관하게 고정 높이라, 짧아지면 스테이지만 줄고
   * 지도가 9×14 라 세로에 맞춰지므로 가로도 9/14 배로 같이 좁아진다.          */
  {
    const shortCtx = await browser.newContext({
      viewport: { width: 402, height: 658 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, locale: 'ko-KR',
    })
    const shortPage = await shortCtx.newPage()
    const shortErrors = []
    shortPage.on('console', (m) => { if (m.type() === 'error') shortErrors.push(m.text()) })
    await shortPage.goto(base)
    await passLoading(shortPage, { shot: '0-loading-short.png' })
    await shortPage.click('#btn-play')
    await shortPage.click('.map-card')
    await shortPage.waitForSelector('#screen-game:not([hidden])')
    const small = await shortPage.evaluate(() => {
      const app = window.__catpaw, g = app.game
      // 빈 칸 아무 데나 타워를 놓고 패널을 연다 — 패널이 열린 상태가 가장 빡빡하다
      let placed = null
      for (let y = 0; y < 20 && !placed; y += 1) {
        for (let x = 0; x < 20 && !placed; x += 1) {
          try { g.placeTower(x, y, 'cheese'); placed = g.towerAt(x, y) } catch { /* 못 놓는 칸 */ }
        }
      }
      if (placed) app.ui.showTowerPanel(g, placed)
      const stage = document.getElementById('stage').getBoundingClientRect()
      const panel = document.getElementById('tower-panel').getBoundingClientRect()
      const tap = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height)
      return {
        stage: Math.round(stage.height),
        tile: Math.round(app.renderer.tile * 10) / 10,
        mapW: Math.round(app.renderer.tile * g.mapDef.cols),
        covered: Math.round((panel.height / stage.height) * 100),
        special: tap('.special'), wave: tap('#btn-wave'),
      }
    })
    await shortPage.screenshot({ path: join(outDir, '31-short-viewport.png') })
    await shortCtx.close()

    /* 기준값은 고치기 전/후를 다 재서 그 사이로 잡았다 (402×658 기준).
     *            고치기 전   고친 뒤
     *   스테이지     314        367
     *   타일        22.4       26.2
     *   지도 폭      202        236   (화면 402)
     *   패널 덮음     64%        53%
     * 스모크의 412×915 는 전후가 완전히 동일했다 — 압축은 짧은 화면에서만 걸린다. */
    check('짧은 화면에서도 지도가 쓸 만한 크기로 남는다',
      small.stage >= 345 && small.tile >= 24.5,
      `스테이지 ${small.stage}px · 타일 ${small.tile}px · 지도 폭 ${small.mapW}/402`)
    check('타워 패널이 지도를 다 덮지 않는다',
      small.covered <= 58,
      `패널이 스테이지의 ${small.covered}%`)
    // 좁아진다고 손가락이 작아지지는 않는다. --tap 은 46px 이다.
    check('짧은 화면에서도 버튼이 손가락 크기를 지킨다',
      small.special >= 46 && small.wave >= 46,
      `필살기 ${small.special}px · 웨이브 버튼 ${small.wave}px`)
    check('짧은 화면에서 콘솔 에러 0건', shortErrors.length === 0, shortErrors[0] || '없음')
  }

  /* 가로 화면. 매니페스트는 portrait 고정이지만 Android 16 은 큰 화면(태블릿·폴더블)에서 그 고정을
   * 무시하고, iOS 사파리는 아예 안 본다. 그래서 **먼저 '세로로 돌려 주세요' 막이 떠야 한다** —
   * 915×412 의 타일은 15.9px 이라 손가락(44px)으로 할 수 있는 크기가 아니다.
   * 그다음, 그래도 하겠다는 사람을 위해 '이대로 하기' 로 빠져나가면 캔버스가 다시 잡히고
   * 상점·HUD 가 화면 밖으로 나가지 않아야 하며, 세로로 돌리면 지도가 원래 크기로 돌아와야 한다. */
  {
    const landCtx = await browser.newContext({
      viewport: { width: 915, height: 412 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, locale: 'ko-KR',
    })
    const land = await landCtx.newPage()
    const landErrors = []
    land.on('pageerror', (e) => landErrors.push(e.message))
    land.on('console', (m) => { if (m.type() === 'error') landErrors.push(m.text()) })
    await land.goto(base)
    await land.waitForFunction(() => document.documentElement.dataset.ready === '1')
    const hintUp = await land.locator('#rotate-hint').isVisible()
    check('가로로 눕히면 세로 안내 막이 먼저 뜬다 (타일이 15.9px 이라 못 논다)', hintUp,
      hintUp ? '915×412 에서 막이 떴다' : '막이 안 떴다 — style.css 의 max-height 기준을 확인한다')
    await land.screenshot({ path: join(outDir, '31-rotate-hint.png') })
    await land.click('#rotate-ignore')          // 그래도 하겠다는 사람을 위한 탈출구
    const hintGone = !(await land.locator('#rotate-hint').isVisible())
    check('이대로 하기를 누르면 막이 걷힌다', hintGone,
      hintGone ? 'html.rotate-ok 가 붙었다' : '막이 그대로다 — html.rotate-ok 규칙을 확인한다')
    await passLoading(land)
    await land.click('#btn-play')
    await land.click('.map-card')
    await land.waitForSelector('#screen-game:not([hidden])')
    await land.waitForTimeout(200)
    const measure = () => {
      const app = window.__catpaw, g = app.game
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect()
      const stage = rect('#stage'), canvas = rect('#canvas'), shop = rect('#shop-cards'), wave = rect('#btn-wave')
      return {
        w: innerWidth, h: innerHeight,
        tile: Math.round(app.renderer.tile * 10) / 10,
        canvasFits: canvas.width <= stage.width + 1 && canvas.height <= stage.height + 1,
        stageH: Math.round(stage.height),
        shopBottom: Math.round(shop.bottom), waveBottom: Math.round(wave.bottom),
        noHScroll: document.documentElement.scrollWidth <= innerWidth,
        mapCols: g.mapDef.cols, mapRows: g.mapDef.rows,
      }
    }
    const wide = await land.evaluate(measure)
    await land.screenshot({ path: join(outDir, '32-landscape.png') })
    // 세로로 되돌린다 — 리사이즈가 캔버스를 다시 잡는지
    await land.setViewportSize({ width: 412, height: 915 })
    await land.waitForTimeout(250)
    const tall = await land.evaluate(measure)
    await landCtx.close()
    check('가로 화면에서 지도가 스테이지 안에 들어가고 상점·웨이브 버튼이 화면 밖으로 안 나간다',
      wide.canvasFits && wide.noHScroll && wide.shopBottom <= wide.h + 1 && wide.waveBottom <= wide.h + 1 && wide.stageH >= 120,
      `915×412 · 스테이지 ${wide.stageH}px · 타일 ${wide.tile}px · 상점 바닥 ${wide.shopBottom}/${wide.h} · 웨이브 버튼 바닥 ${wide.waveBottom}`)
    check('세로로 되돌리면 지도가 다시 커진다 (리사이즈가 캔버스를 다시 잡는다)',
      tall.tile > wide.tile * 1.5 && tall.canvasFits,
      `타일 ${wide.tile}px → ${tall.tile}px`)
    check('가로 화면에서 콘솔 에러 0건', landErrors.length === 0, landErrors[0] || '없음')
  }

  // 번들은 index.html 을 잘라 붙이는 방식이라 조용히 깨지기 쉽다.
  // 실제로 <svg id="icon-defs"> 가 통째로 잘려 아이콘이 전부 빈칸이던 적이 있다.
  const distFile = join(root, 'dist/catpaw-defense.html')
  if (existsSync(distFile)) {
    const bundlePage = await context.newPage()
    const bundleErrors = []
    bundlePage.on('pageerror', (e) => bundleErrors.push(e.message))
    await bundlePage.goto(`file://${distFile}`)
    await passLoading(bundlePage)
    // 배경은 CSS url() 이라 JS 아트 인라이너와 경로가 다르다. 번들러가 한쪽만
    // 처리해도 게임은 멀쩡히 돌기 때문에, 여기서 안 보면 조용히 빠진다.
    const bundleBg = await bundlePage.evaluate(measureBg, [['타이틀', '#screen-title']])
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
    check('단일 파일 번들이 아이콘·배경까지 온전히 실행된다',
      bundleErrors.length === 0 && bundleIcons.missing.length === 0 && bundleIcons.sized > 0
      && Object.values(bundleBg).every((b) => b.uniq > 300),
      `아이콘 ${bundleIcons.sized}/${bundleIcons.total}개 표시 · 배경 ${bgLine(bundleBg)}` +
      (bundleIcons.missing.length ? ` · 정의 없음 ${bundleIcons.missing.join(',')}` : '') +
      (bundleErrors.length ? ` · 오류 ${bundleErrors[0]}` : ''))
    await bundlePage.close()
  } else {
    check('단일 파일 번들이 아이콘·배경까지 온전히 실행된다', false, 'dist/ 가 없습니다 — node tools/bundle.mjs 를 먼저 실행하세요')
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
