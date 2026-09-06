/**
 * 밸런스 시뮬레이터 — 자동 플레이어가 실제로 판을 돌려 본다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * 지금까지 밸런스는 '수치 설계'였다. balance.test.mjs 는 applyArmor·scaleHp 같은
 * 공식이 맞는지만 보고, content.test.mjs 의 '맵: 뒤로 갈수록 난이도가 높아진다'는
 * 맵에 적어 둔 difficulty 숫자만 비교한다. 아무도 끝까지 플레이해 본 적이 없다.
 *
 * 그런데 game.js 는 DOM 을 전혀 안 쓴다(파일 첫 줄이 그렇게 선언하고 실제로 그렇다).
 * Node 에서 그대로 돌아가고 한 판이 76ms 다. 처음 돌려 보니 선언 난이도와 실제
 * 플레이가 거의 무관했다 — 창고(1.45)가 중앙값 4웨이브인데 지하실(1.52)은 10,
 * 다락방은 20판 전부 1웨이브였다. 검사가 못 잡은 이유는 하나, 안 해봤기 때문이다.
 *
 * ── 자동 플레이어가 하는 것 ────────────────────────────────────────────────
 *   · 길에서 가까운 칸부터 짓는다. 좌상단부터 채우면 사거리 밖이라 맵끼리
 *     비교가 불공평해진다 (첫 시도에서 실제로 그래서 결과가 뒤집혔다)
 *   · 업그레이드를 먼저, 그다음 신축. 돈이 다 떨어질 때까지
 *   · --specials 를 주면 적이 6마리 넘게 몰릴 때 쓸 수 있는 필살기를 쓴다
 *
 * 치즈냥만 쓰고 펫·조합·표적 모드를 안 쓴다. 그래서 절대 수치는 사람보다
 * 비관적이다. 하지만 모든 맵에 같은 정책을 대므로 맵끼리의 비교는 유효하다.
 *
 *   node tools/balance-sim.mjs                    맵 6종 × 난이도 3종, 각 5판
 *   node tools/balance-sim.mjs --runs 20          판 수를 늘린다
 *   node tools/balance-sim.mjs --difficulty normal --runs 20 --specials
 *   node tools/balance-sim.mjs --json             검사가 먹을 수 있는 형태로
 *   node tools/balance-sim.mjs --growth 3 --seed 7  훈련 만렙(고양이마다 공격 +15%)이 후반을 얼마나 쉽게 만드는지 — 같은 시드로 0단계와 비교
 *   node tools/balance-sim.mjs --policy smart --specials    사람에 가장 가까운 봇(공중 인식·표적 모드·펫) — 난이도를 잡을 때 쓰는 기준
 */
import { mulberry32 } from '../web/js/domain/rng.js'
import '../web/js/content/index.js'
import { Game } from '../web/js/game.js'
import { getEnemy, getMap, getTower, listMaps, listSpecials, listTowers } from '../web/js/content/registry.js'
import { defaultProgress } from '../web/js/domain/save.js'
import { DIFFICULTIES } from '../web/js/domain/settings.js'
import { getExpedition, listExpeditions } from '../web/js/content/registry.js'
import { DECK_SIZE, stageRules } from '../web/js/domain/expedition.js'
import { ELEMENTS, elementMul } from '../web/js/domain/elements.js'
import { buildCost } from '../web/js/domain/economy.js'

export { mulberry32 }

/**
 * 'mixed' 정책의 건설 순서. 치즈냥만 쓰는 봇은 바닥이고, 이 봇이 사람에 조금 더 가까운 기준이다.
 * (지상 광역·저격·둔화·범위 전체가 섞인다. 펫·조합·표적 모드는 여전히 안 쓴다.)
 */
export const MIXED_ORDER = ['cheese', 'cheese', 'calico', 'black', 'siamese', 'cheese', 'black', 'chonk']

/**
 * 'smart' 정책 — 사람에 더 가까운 기준. mixed 와 다른 것 넷:
 *   · 다음 웨이브의 공중 비율을 보고 지상 전용 고양이를 건너뛴다.
 *     mixed 는 순서가 고정이라 공중만 오는 웨이브에도 삼색냥(지상 전용)을 놓고, 그 골드는 그냥 버려진다.
 *   · 펫을 데려간다. 사람은 늘 하나 데려가는데 봇만 맨몸이었다.
 *   · 필살기를 보스가 살아 있을 때도 쓴다. mixed 는 '적 일곱 마리 이상'만 봐서 보스 한 마리에는 쓰지 않았다.
 * 그래도 조합·판매·소모품·업그레이드 우선순위는 안 쓴다. 사람은 여전히 이보다 잘한다.
 *
 * 표적 모드는 **일부러 안 쓴다.** 검은냥·고등어냥을 '강력'으로 두면 사람처럼 보이지만 재 보면 더 나쁘다 —
 * 보스 맵에서 한 방이 무거운 고양이들이 전부 보스만 때리는 동안 잡몹이 그대로 지나간다
 * (아깽이 지하실 100% → 0%, 다락방 38% → 0%). 사람은 상황을 보고 바꾸지, 켜 두지 않는다.
 */
/** smart 가 데려가는 펫 (시작 골드 +80) */
export const SMART_PET = 'hamster'
/** 보스가 없을 때 필살기를 쓰는 최소 적 수 (mixed 와 같다) */
const SMART_SPECIAL_COUNT = 6

/** 한 웨이브가 이 시간을 넘기면 못 깨는 것으로 본다 (무한 루프 방지) */
const WAVE_TIMEOUT_SEC = 400
const SPECIAL_IDS = listSpecials().map((s) => s.id)

/**
 * 한 판을 끝까지 돌린다.
 *
 * @param {string} mapId
 * @param {string} diffId
 * @param {{ specials?: boolean, policy?: string, seed?: number, growth?: number,
 *   rules?: object, lives?: number, waveSet?: string, waveLimit?: number,
 *   deck?: string[], runes?: object }} opts
 *   growth — 모든 고양이의 훈련 단계(0~3). 기본 0 이라 밸런스 검사는 훈련 없는 판을 본다.
 *   rules/lives/waveSet/waveLimit — 원정 칸을 그대로 재현하는 데 쓴다(Game 생성자로 들어간다).
 *   deck — 이 판에 데려갈 고양이. 주면 봇의 건설 순서를 덱 안으로 줄인다(rules.bannedTowers 와 짝).
 *   order — 건설 순서를 통째로 갈아 끼운다(--order). 카드 고양이를 재는 유일한 길이다.
 *   runes — { 고양이id: 속성 }. progress.runes.equipped 로 들어가 타워의 속성을 바꾼다.
 */
export function playOnce(mapId, diffId, opts = {}) {
  // 진행도를 주면 game 이 고양이 해금(unlockedTowers)·펫·훈련을 전부 진행도에서 읽는다. 그래서 필요한 것만 켜고
  // 나머지는 '진행도 없음'과 같게 맞춘다 — 기본 진행도를 그냥 넘기면 치즈·삼색만 열려 순서가 막히고
  // 햄스터(+80 골드)가 따라붙어 비교가 뒤집힌다(실제로 그렇게 만들었다가 잡았다).
  const smart = opts.policy === 'smart'
  const growth = Math.max(0, Math.min(3, Number(opts.growth || 0)))
  const runes = opts.runes && Object.keys(opts.runes).length > 0 ? opts.runes : null
  const progress = (smart || growth > 0 || runes)
    ? {
      ...defaultProgress(),
      unlockedTowers: listTowers().map((t) => t.id),
      pets: smart ? { owned: [SMART_PET], equipped: SMART_PET } : { owned: [], equipped: null },
      growth: growth > 0 ? Object.fromEntries(listTowers().map((t) => [t.id, growth])) : {},
      // 룬을 끼운 고양이는 그 속성으로 때린다(game.placeTower 가 여기서 읽는다)
      runes: { owned: {}, equipped: { ...(runes || {}) } },
    }
    : null
  const game = new Game({
    mapDef: getMap(mapId),
    difficulty: DIFFICULTIES[diffId],
    settings: {},
    progress,
    rules: opts.rules || null,
    lives: opts.lives || 0,
    waveSet: opts.waveSet || null,
    waveLimit: opts.waveLimit || 0,
    random: opts.seed === undefined ? Math.random : mulberry32(opts.seed),
  })

  // 길에서 가까운 순으로 칸을 정렬해 둔다. 매 판 다시 계산할 필요가 없다.
  const spots = []
  for (let r = 0; r < game.mapDef.rows; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) {
      let d = Infinity
      for (const p of game.path.points) {
        d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
      }
      spots.push({ c, r, d })
    }
  }
  spots.sort((a, b) => a.d - b.d)

  // smart 는 mixed 와 같은 건설 순서를 쓴다 — 순서까지 바꾸면 무엇이 개선인지 못 가른다.
  // 다른 것은 네 가지 행동뿐이다(공중 건너뛰기·표적 모드·펫·필살기 문턱).
  let order = Array.isArray(opts.order) && opts.order.length > 0
    ? opts.order
    : (smart || opts.policy === 'mixed' ? MIXED_ORDER : ['cheese'])
  if (Array.isArray(opts.deck) && opts.deck.length > 0) {
    /* 원정: 덱 밖의 고양이는 rules.bannedTowers 로 막혀 있어서, 순서에 남겨 두면
     * placeTower 가 거절하고 build() 가 그 자리에서 멈춘다(더 싼 것으로 대체하지 않는 봇이라).
     * 그래서 순서를 덱 안으로 줄인다. MIXED_ORDER 의 상대 비중은 그대로 살린다. */
    const inDeck = order.filter((id) => opts.deck.includes(id))
    order = inDeck.length > 0 ? inDeck : [...opts.deck]
  }
  let orderAt = 0

  /** 다음 웨이브가 공중 위주인가 (절반 초과) */
  const airHeavy = () => {
    const spawns = game.nextWave && game.nextWave.spawns
    if (!spawns || spawns.length === 0) return false
    let flying = 0
    for (const sp of spawns) {
      const def = getEnemy(sp.enemyId)
      if (def && def.flying) flying += 1
    }
    return flying * 2 > spawns.length
  }

  const build = () => {
    // 순서의 다음 고양이를 놓는다. 살 돈이 없으면 그 자리에서 멈춘다 (더 싼 것으로 대체하지
    // 않는다 — 대체하면 결국 치즈냥만 잔뜩 놓는 봇으로 되돌아간다)
    let at = orderAt
    let def = getTower(order[at % order.length])
    // smart 만: 공중이 몰려오는 웨이브에 지상 전용을 놓지 않는다. 순서에서 다음 대공 고양이로 건너뛴다.
    if (smart && def.targets === 'ground' && airHeavy()) {
      for (let k = 1; k < order.length; k += 1) {
        const d = getTower(order[(orderAt + k) % order.length])
        if (d.targets !== 'ground') { at = orderAt + k; def = d; break }
      }
    }
    if (game.gold < buildCost(def)) return false
    const ok = spots.some((s) => game.placeTower(s.c, s.r, def.id).ok)
    if (!ok) return false
    orderAt = at + 1
    return true
  }
  const upgrade = () => game.towers.some((t) => game.upgradeTower(t))

  /**
   * 지금 필살기를 쓸 때인가.
   * mixed·cheese 는 예전 그대로(적 일곱 마리 이상) — 기존 회귀 값이 움직이면 안 된다.
   * smart 는 여기에 '보스가 살아 있으면 쓴다'를 더한다. 사람은 필살기를 보스에 아낀다.
   *
   * 처음에는 '이 웨이브 총 체력의 30% 이상이 살아 있으면'으로 썼다가 되돌렸다: 보스는 혼자 나오고
   * 웨이브 총 체력에서 차지하는 몫이 작아서(다락방 20웨이브는 78,185 중 5,392) 문턱을 영영 못 넘었다.
   * 그래서 보스 맵에서만 필살기를 아예 안 쓰는 봇이 됐고, 아깽이 지하실 클리어율이 100% → 38% 로 떨어졌다.
   */
  const wantSpecial = () => {
    if (game.enemies.length === 0) return false
    if (smart && game.enemies.some((e) => e.def && e.def.boss)) return true
    return game.enemies.length > SMART_SPECIAL_COUNT
  }

  const waves = []
  while (game.phase !== 'defeat' && game.phase !== 'victory') {
    // 업그레이드가 신축보다 골드 효율이 좋다 (칸을 안 먹고 시너지도 유지된다)
    while (upgrade() || build()) { /* 돈이 다 떨어질 때까지 */ }
    const livesBefore = game.lives
    game.startWave()
    const boss = !!(game.currentWave && game.currentWave.bossCount > 0)

    let t = 0
    while (game.phase === 'wave' && t < WAVE_TIMEOUT_SEC) {
      game.update(1 / 60)
      t += 1 / 60
      if (opts.specials && wantSpecial()) {
        for (const id of SPECIAL_IDS) {
          // useSpecial 은 { ok } 객체를 돌려준다 — 객체는 늘 참이라 전에는 첫 필살기만 시도했다
          try { if (game.useSpecial(id).ok) break } catch { /* 못 쓰는 것은 넘긴다 */ }
        }
      }
    }
    waves.push({ wave: game.waveNo, boss, towers: game.towers.length, gold: game.gold,
      lives: game.lives, lost: livesBefore - game.lives })
    if (t >= WAVE_TIMEOUT_SEC) break   // 못 깨고 멈췄다
  }

  return {
    wave: game.waveNo,
    total: game.totalWaves,
    win: game.phase === 'victory',
    lives: game.lives,
    maxLives: game.maxLives,
    towers: game.towers.length,
    waves,
  }
}

/**
 * 속성 원정 한 판 — 칸을 이어 돌면서 **목숨을 넘긴다.**
 *
 * 한 칸이라도 지면 거기서 끝이다(그게 이 모드의 규칙이라 시뮬레이터도 같아야 한다).
 * 덱 밖 고양이는 `stageRules` 가 만든 `bannedTowers` 로 막히고, 룬은 `opts.runes` 로 들어간다.
 *
 * @param {string} expId
 * @param {string} diffId
 * @param {{ deck: string[], runes?: object, seed?: number, specials?: boolean, policy?: string }} opts
 * @returns {{ stages: number, cleared: boolean, lives: number, rows: Array }}
 */
export function playExpedition(expId, diffId, opts = {}) {
  const exp = getExpedition(expId)
  if (!exp) throw new Error(`모르는 원정: ${expId}`)
  const all = listTowers().map((t) => t.id)
  const deck = (opts.deck || []).slice(0, DECK_SIZE)
  const rows = []
  let lives = 0
  let cleared = 0

  for (let i = 0; i < exp.stages.length; i += 1) {
    const st = exp.stages[i]
    const r = playOnce(st.mapId, diffId, {
      ...opts,
      rules: stageRules(st, deck, all),
      lives,
      waveSet: st.waveSet,
      waveLimit: st.waveLimit,
      deck,
      // 칸마다 시드를 흔든다 — 같은 시드로 다섯 칸을 돌면 같은 웨이브가 다섯 번 나온다
      seed: opts.seed === undefined ? undefined : opts.seed + i * 101,
    })
    rows.push({ stage: i + 1, mapId: st.mapId, element: st.element, wave: r.wave, total: r.total, win: r.win, lives: r.lives })
    if (!r.win) break
    cleared += 1
    lives = r.lives
  }
  return { stages: cleared, cleared: cleared === exp.stages.length, lives, rows }
}

/** 원정을 N판 돌려 평균을 낸다 */
export function playExpeditionMany(expId, diffId, runs, opts = {}) {
  const rs = Array.from({ length: runs }, (_, i) => playExpedition(expId, diffId,
    opts.seed === undefined ? opts : { ...opts, seed: opts.seed + i * 1009 }))
  const stages = rs.map((r) => r.stages).sort((a, b) => a - b)
  return {
    runs: rs.length,
    clearRate: rs.filter((r) => r.cleared).length / rs.length,
    minStages: stages[0],
    maxStages: stages[stages.length - 1],
    medianStages: stages[Math.floor(stages.length / 2)],
    /* 도달 점수 — 깬 칸 수 + 마지막 칸에서 얼마나 갔나(0~1). 칸 수만 세면
     * "1칸에서 1웨이브 만에 죽었다"와 "1칸을 깨고 2칸 마지막 웨이브에서 죽었다"가 같아진다. */
    reachScore: rs.reduce((a, r) => {
      const last = r.rows[r.rows.length - 1]
      return a + r.stages + (last && !last.win ? Math.min(1, last.wave / last.total) : 0)
    }, 0) / rs.length,
    rows: rs,
  }
}

/** 한 조합을 N판 돌려 통계를 낸다. opts.seed 를 주면 판마다 seed+i 로 재현 가능하다. */
export function playMany(mapId, diffId, runs, opts = {}) {
  const rs = Array.from({ length: runs }, (_, i) => playOnce(mapId, diffId,
    opts.seed === undefined ? opts : { ...opts, seed: opts.seed + i }))
  const reached = rs.map((r) => r.wave).sort((a, b) => a - b)
  /* 다들 마지막 웨이브까지 닿아서 죽으면 도달 웨이브로도 남은 목숨으로도
   * 사다리가 안 보인다(둘 다 포화). '첫 목숨을 잃은 웨이브'가 압박이 언제
   * 시작되는지를 직접 잰다 — 골목길은 14웨이브까지 한 대도 안 맞았다. */
  const firstLoss = rs.map((r) => {
    const hit = r.waves.find((w) => w.lost > 0)
    return hit ? hit.wave : r.total + 1        // 끝까지 한 대도 안 맞았다
  }).sort((a, b) => a - b)
  /* 동적 곡선 — 실점이 '어디서' 나는지. 정적 체력 곡선이 매끈해도 실점이 보스 웨이브에만
   * 몰리면 잡몹 웨이브는 그냥 기다리는 시간이다. */
  const total = rs[0].total
  const lossCurve = Array.from({ length: total }, (_, i) => {
    const at = rs.map((r) => r.waves[i] ? r.waves[i].lost : 0)
    return at.reduce((a, b) => a + b, 0) / runs
  })
  const bossAt = new Set()
  for (const r of rs) for (const w of r.waves) if (w.boss) bossAt.add(w.wave)
  const totalLoss = lossCurve.reduce((a, b) => a + b, 0)
  const bossLoss = lossCurve.reduce((a, b, i) => a + (bossAt.has(i + 1) ? b : 0), 0)
  const bleedWaves = lossCurve.filter((v, i) => v > 0 && !bossAt.has(i + 1)).length
  const reachScore = rs.map((r) => (r.win ? r.total : r.wave - 1) + r.lives / r.maxLives).sort((a, b) => a - b)

  return {
    mapId,
    diffId,
    runs,
    clearRate: rs.filter((r) => r.win).length / runs,
    min: reached[0],
    max: reached[reached.length - 1],
    median: reached[Math.floor(runs / 2)],
    firstLoss: firstLoss[Math.floor(runs / 2)],
    total,
    lossCurve,
    bossLossShare: totalLoss > 0 ? bossLoss / totalLoss : 0,
    bleedWaves,
    finalWaveLoss: lossCurve[total - 1] / rs[0].maxLives,
    reachScore: reachScore[Math.floor(runs / 2)],
  }
}

/**
 * 원정 검사용 덱 셋 — **같은 네 마리, 룬만 다르게.**
 *
 * 이 모드에서 물어야 할 것은 하나다: "속성이 실제로 결과를 바꾸나". 그러려면
 * **고양이는 고정하고 속성만 갈라야 한다.** 처음엔 '상성 맞는 고양이로 짠 덱' vs '아닌 덱' 으로 쟀는데,
 * 그건 상성이 아니라 고양이 화력을 잰 것이었다(검은냥이 든 '안 맞춘 덱'이 늘 이겼다).
 *
 * 세 벌:
 *   최선  — 룬 배치 6^4 = 1,296가지를 전부 돌려 **가장 나쁜 칸의 배수 합이 최대**인 것.
 *           최소가 기준인 이유: 원정은 한 칸이라도 지면 끝이라 평균이 아니라 최약점이 결과를 정한다.
 *   기본  — 룬 없이 타고난 속성 그대로. 새로 시작한 사람이 서 있는 자리다.
 *   도배  — 네 마리를 같은 속성으로. 여섯 칸 사다리에서는 이게 **함정**이어야 한다
 *           (다섯 칸일 때는 이게 최선이었고, 그래서 칸을 여섯으로 늘렸다).
 */
export function buildTestDecks(exp, deck = ['cheese', 'calico', 'black', 'siamese']) {
  const stages = exp.stages.map((st) => st.element)
  const sumAt = (assign, st) => assign.reduce((a, e) => a + elementMul(e, st), 0)
  const minOf = (assign) => Math.min(...stages.map((st) => sumAt(assign, st)))

  let best = null
  const cur = []
  const rec = (i) => {
    if (i === deck.length) {
      const mn = minOf(cur)
      if (!best || mn > best.mn) best = { a: [...cur], mn }
      return
    }
    for (const e of ELEMENTS) { cur.push(e); rec(i + 1); cur.pop() }
  }
  rec(0)

  let uniform = null
  for (const e of ELEMENTS) {
    const mn = minOf(deck.map(() => e))
    if (!uniform || mn > uniform.mn) uniform = { e, mn }
  }

  const asRunes = (list) => Object.fromEntries(deck.map((id, i) => [id, list[i]]))
  return [
    { name: `최선 룬 (${best.a.join('·')})`, deck, runes: asRunes(best.a), min: best.mn },
    { name: '기본 (룬 없음)', deck, runes: {}, min: minOf(deck.map((id) => (getTower(id) || {}).element)) },
    { name: `도배 (전부 ${uniform.e})`, deck, runes: asRunes(deck.map(() => uniform.e)), min: uniform.mn },
  ]
}

// ---------------------------------------------------------- CLI

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(arg('runs', 5))
  const specials = has('specials')
  const onlyMap = arg('map', null)
  const onlyDiff = arg('difficulty', null)
  const policy = arg('policy', 'cheese')
  const seedArg = arg('seed', null)
  const seed = seedArg === null ? undefined : Number(seedArg)
  const growth = Number(arg('growth', 0))
  /* 건설 순서를 손으로 준다 — 새 고양이가 기존 봇보다 얼마나 나은지 재는 유일한 길이다.
   * MIXED_ORDER 에는 카드 고양이가 없어서, 그냥 두면 시뮬레이터가 새 고양이를 **한 번도 안 놓는다.** */
  const orderArg = arg('order', null)
  const order = orderArg ? orderArg.split(',') : null

  /* ── 원정 모드 — `--expedition <id>` 하나로 갈라진다 ────────────────────────
   * 덱은 `--deck a,b,c,d`, 룬은 `--runes 고양이:속성,…`. 둘 다 없으면 세 덱을 자동으로 돌려
   * "맞춘 덱 / 안 맞춘 덱 / 무작위 덱"을 나란히 보여 준다 — 이 모드에서 물어야 할 것이 그것뿐이라서다. */
  if (has('expedition')) {
    const expId = arg('expedition', (listExpeditions()[0] || {}).id)
    const exp = getExpedition(expId)
    if (!exp) { console.error(`모르는 원정: ${expId}`); process.exit(1) }
    const deckArg = arg('deck', null)
    const runesArg = arg('runes', null)
    const parseRunes = (t) => Object.fromEntries((t || '').split(',').filter(Boolean)
      .map((p) => p.split(':')).filter((kv) => kv.length === 2))
    const diff = onlyDiff || 'normal'
    const decks = deckArg
      ? [{ name: '지정', deck: deckArg.split(','), runes: parseRunes(runesArg) }]
      : buildTestDecks(exp)
    console.log(`원정 '${exp.name}' · ${exp.stages.length}칸 · ${runs}판씩 · 난이도 ${diff}`
      + `${specials ? ' · 필살기 사용' : ''}${seed === undefined ? '' : ` · 시드 ${seed}`}\n`)
    console.log(`칸 구성: ${exp.stages.map((st, i) => `${i + 1}.${st.mapId}(${st.element}/${st.waveLimit}w)`).join(' → ')}\n`)
    console.log('덱                                     최약칸 배수합   완주율   깬 칸(최소~최대, 중앙)  도달 점수')
    for (const d of decks) {
      const r = playExpeditionMany(exp.id, diff, runs, { deck: d.deck, runes: d.runes, specials, policy: policy === 'cheese' ? 'smart' : policy, seed })
      console.log(`  ${d.name.padEnd(36)} ${(d.min === undefined ? '  -  ' : d.min.toFixed(1)).padStart(9)}     ${String(Math.round(r.clearRate * 100)).padStart(4)}%`
        + `   ${String(r.minStages).padStart(2)}~${String(r.maxStages).padEnd(2)} 중앙 ${String(r.medianStages).padStart(2)}`
        + `        ${r.reachScore.toFixed(2)}`)
      if (has('verbose')) {
        for (const row of r.rows[0].rows) {
          console.log(`      ${row.stage}칸 ${row.mapId.padEnd(9)} ${row.element.padEnd(6)} ${row.win ? '깸' : '실패'} ${row.wave}/${row.total}웨이브 · 목숨 ${row.lives}`)
        }
      }
    }
    process.exit(0)
  }

  const maps = listMaps().filter((m) => !onlyMap || m.id === onlyMap)
  const diffs = Object.keys(DIFFICULTIES).filter((d) => !onlyDiff || d === onlyDiff)

  const started = Date.now()
  const rows = []
  for (const m of maps) for (const d of diffs) rows.push({ map: m, ...playMany(m.id, d, runs, { specials, policy, seed, growth, order }) })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (has('json')) {
    console.log(JSON.stringify({ runs, specials, growth, elapsed: Number(elapsed), rows: rows.map((r) => ({
      mapId: r.mapId, diffId: r.diffId, clearRate: r.clearRate,
      min: r.min, max: r.max, median: r.median, firstLoss: r.firstLoss, total: r.total,
      bossLossShare: r.bossLossShare, bleedWaves: r.bleedWaves, finalWaveLoss: r.finalWaveLoss, reachScore: r.reachScore,
    })) }, null, 2))
  } else {
    console.log(`맵마다 ${runs}판씩 · 정책 ${policy}${order ? ` · 순서 ${order.join(',')}` : ''}${specials ? ' · 필살기 사용' : ''}${seed === undefined ? '' : ` · 시드 ${seed}`}${growth > 0 ? ` · 훈련 ${growth}단계(공격 +${growth * 5}%)` : ''}\n`)
    console.log('맵              난이도    등급      클리어율   도달 웨이브 (최소~최대, 중앙)   첫 실점   보스 실점 비율  실점 잡몹웨이브  도달 점수')
    for (const r of rows) {
      console.log(`  ${r.map.name.padEnd(12)} ${r.diffId.padEnd(8)} ${('★'.repeat(r.map.tier)).padEnd(8)}`
        + ` ${String(Math.round(r.clearRate * 100)).padStart(4)}%`
        + `   ${String(r.min).padStart(3)}~${String(r.max).padEnd(3)} 중앙 ${String(r.median).padStart(2)} / ${r.total}`
        + `   ${String(r.firstLoss).padStart(4)}웨이브`
        + `   ${String(Math.round(r.bossLossShare * 100)).padStart(8)}%`
        + `   ${String(r.bleedWaves).padStart(10)}개`
        + `   ${r.reachScore.toFixed(1).padStart(6)}`)
    }
    console.log(`\n${rows.length * runs}판 ${elapsed}초`)
  }
}
