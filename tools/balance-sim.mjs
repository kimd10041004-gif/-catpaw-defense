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
 */
import '../web/js/content/index.js'
import { Game } from '../web/js/game.js'
import { getMap, getTower, listMaps, listSpecials } from '../web/js/content/registry.js'
import { DIFFICULTIES } from '../web/js/domain/settings.js'
import { buildCost } from '../web/js/domain/economy.js'

/** 재현 가능한 난수 — 같은 시드면 같은 판. 곡선을 손볼 때 '고쳐서 좋아진 건지 운인지'를 가른다. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 'mixed' 정책의 건설 순서. 치즈냥만 쓰는 봇은 바닥이고, 이 봇이 사람에 조금 더 가까운 기준이다.
 * (지상 광역·저격·둔화·범위 전체가 섞인다. 펫·조합·표적 모드는 여전히 안 쓴다.)
 */
export const MIXED_ORDER = ['cheese', 'cheese', 'calico', 'black', 'siamese', 'cheese', 'black', 'chonk']

/** 한 웨이브가 이 시간을 넘기면 못 깨는 것으로 본다 (무한 루프 방지) */
const WAVE_TIMEOUT_SEC = 400
const SPECIAL_IDS = listSpecials().map((s) => s.id)

/**
 * 한 판을 끝까지 돌린다.
 *
 * @param {string} mapId
 * @param {string} diffId
 * @param {{ specials?: boolean }} opts
 */
export function playOnce(mapId, diffId, opts = {}) {
  const game = new Game({
    mapDef: getMap(mapId),
    difficulty: DIFFICULTIES[diffId],
    settings: {},
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

  const order = opts.policy === 'mixed' ? MIXED_ORDER : ['cheese']
  let orderAt = 0
  const build = () => {
    // 순서의 다음 고양이를 놓는다. 살 돈이 없으면 그 자리에서 멈춘다 (더 싼 것으로 대체하지
    // 않는다 — 대체하면 결국 치즈냥만 잔뜩 놓는 봇으로 되돌아간다)
    const id = order[orderAt % order.length]
    if (game.gold < buildCost(getTower(id))) return false
    const ok = spots.some((s) => game.placeTower(s.c, s.r, id).ok)
    if (ok) orderAt += 1
    return ok
  }
  const upgrade = () => game.towers.some((t) => game.upgradeTower(t))

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
      if (opts.specials && game.enemies.length > 6) {
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

  const maps = listMaps().filter((m) => !onlyMap || m.id === onlyMap)
  const diffs = Object.keys(DIFFICULTIES).filter((d) => !onlyDiff || d === onlyDiff)

  const started = Date.now()
  const rows = []
  for (const m of maps) for (const d of diffs) rows.push({ map: m, ...playMany(m.id, d, runs, { specials, policy, seed }) })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (has('json')) {
    console.log(JSON.stringify({ runs, specials, elapsed: Number(elapsed), rows: rows.map((r) => ({
      mapId: r.mapId, diffId: r.diffId, clearRate: r.clearRate,
      min: r.min, max: r.max, median: r.median, firstLoss: r.firstLoss, total: r.total,
      bossLossShare: r.bossLossShare, bleedWaves: r.bleedWaves, finalWaveLoss: r.finalWaveLoss, reachScore: r.reachScore,
    })) }, null, 2))
  } else {
    console.log(`맵마다 ${runs}판씩 · 정책 ${policy}${specials ? ' · 필살기 사용' : ''}${seed === undefined ? '' : ` · 시드 ${seed}`}\n`)
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
