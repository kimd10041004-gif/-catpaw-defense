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
import { getMap, listMaps, listSpecials } from '../web/js/content/registry.js'
import { DIFFICULTIES } from '../web/js/domain/settings.js'

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

  const build = () => spots.some((s) => game.placeTower(s.c, s.r, 'cheese').ok)
  const upgrade = () => game.towers.some((t) => game.upgradeTower(t))

  const waves = []
  while (game.phase !== 'defeat' && game.phase !== 'victory') {
    // 업그레이드가 신축보다 골드 효율이 좋다 (칸을 안 먹고 시너지도 유지된다)
    while (upgrade() || build()) { /* 돈이 다 떨어질 때까지 */ }
    const livesBefore = game.lives
    game.startWave()

    let t = 0
    while (game.phase === 'wave' && t < WAVE_TIMEOUT_SEC) {
      game.update(1 / 60)
      t += 1 / 60
      if (opts.specials && game.enemies.length > 6) {
        for (const id of SPECIAL_IDS) {
          try { if (game.useSpecial(id)) break } catch { /* 못 쓰는 것은 넘긴다 */ }
        }
      }
    }
    waves.push({ wave: game.waveNo, towers: game.towers.length, gold: game.gold,
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

/** 한 조합을 N판 돌려 통계를 낸다 */
export function playMany(mapId, diffId, runs, opts = {}) {
  const rs = Array.from({ length: runs }, () => playOnce(mapId, diffId, opts))
  const reached = rs.map((r) => r.wave).sort((a, b) => a - b)
  /* 다들 마지막 웨이브까지 닿아서 죽으면 도달 웨이브로도 남은 목숨으로도
   * 사다리가 안 보인다(둘 다 포화). '첫 목숨을 잃은 웨이브'가 압박이 언제
   * 시작되는지를 직접 잰다 — 골목길은 14웨이브까지 한 대도 안 맞았다. */
  const firstLoss = rs.map((r) => {
    const hit = r.waves.find((w) => w.lost > 0)
    return hit ? hit.wave : r.total + 1        // 끝까지 한 대도 안 맞았다
  }).sort((a, b) => a - b)
  return {
    mapId,
    diffId,
    runs,
    clearRate: rs.filter((r) => r.win).length / runs,
    min: reached[0],
    max: reached[reached.length - 1],
    median: reached[Math.floor(runs / 2)],
    firstLoss: firstLoss[Math.floor(runs / 2)],
    total: rs[0].total,
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

  const maps = listMaps().filter((m) => !onlyMap || m.id === onlyMap)
  const diffs = Object.keys(DIFFICULTIES).filter((d) => !onlyDiff || d === onlyDiff)

  const started = Date.now()
  const rows = []
  for (const m of maps) for (const d of diffs) rows.push({ map: m, ...playMany(m.id, d, runs, { specials }) })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (has('json')) {
    console.log(JSON.stringify({ runs, specials, elapsed: Number(elapsed), rows: rows.map((r) => ({
      mapId: r.mapId, diffId: r.diffId, clearRate: r.clearRate,
      min: r.min, max: r.max, median: r.median, firstLoss: r.firstLoss, total: r.total,
    })) }, null, 2))
  } else {
    console.log(`맵마다 ${runs}판씩${specials ? ' · 필살기 사용' : ''}\n`)
    console.log('맵              난이도    등급      클리어율   도달 웨이브 (최소~최대, 중앙)   첫 실점')
    for (const r of rows) {
      console.log(`  ${r.map.name.padEnd(12)} ${r.diffId.padEnd(8)} ${('★'.repeat(r.map.tier)).padEnd(8)}`
        + ` ${String(Math.round(r.clearRate * 100)).padStart(4)}%`
        + `   ${String(r.min).padStart(3)}~${String(r.max).padEnd(3)} 중앙 ${String(r.median).padStart(2)} / ${r.total}`
        + `   ${String(r.firstLoss).padStart(4)}웨이브`)
    }
    console.log(`\n${rows.length * runs}판 ${elapsed}초`)
  }
}
