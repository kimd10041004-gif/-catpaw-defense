/**
 * 곡선 리포트 — 웨이브셋의 모양(정적)과 자동 플레이어의 실점(동적)을 한 표로.
 * 웨이브 행을 고치는 루프는 이걸로 돈다: 리포트 → 편집 → npm test → 리포트.
 *
 *   node tools/curve-report.mjs                       셋 전부 — 플래그만 요약
 *   node tools/curve-report.mjs --all                 셋 전부 — 표까지
 *   node tools/curve-report.mjs --set standard30      한 셋의 표
 *   node tools/curve-report.mjs --map alley [--runs 5 --policy mixed --seed 7 --difficulty normal]
 *                                                     그 맵의 셋 + hpMul 로 표를 만들고 실점 곡선을 덧붙인다
 *   --json                                            검사가 먹을 수 있는 형태로
 */
import '../web/js/content/index.js'
import { getEnemy, getMap, listMaps, listWaveSets, getWaveSet } from '../web/js/content/registry.js'
import { waveCurve, findCliffs, describeFlag } from '../web/js/domain/curve.js'
import { playMany } from './balance-sim.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

/** 셋을 쓰는 자유 모드 맵 (hpMul 을 그 맵 것으로 잰다). 없으면 1. */
const mapForSet = (setId) => listMaps().find((m) => m.waveSet === setId) || null

function table(rows, flags, loss) {
  const flagAt = new Map(flags.map((f) => [f.w, f]))
  const lines = ['  w  마릿수     체력    배율   HP/s  보스  ' + (loss ? '실점  ' : '') + '표시']
  for (const r of rows) {
    const f = flagAt.get(r.w)
    lines.push(`  ${String(r.w).padStart(2)}  ${String(r.count).padStart(4)}  ${String(r.totalHp).padStart(8)}`
      + `  ${r.ratio === null ? '   -  ' : ('×' + r.ratio.toFixed(2)).padStart(6)}`
      + `  ${String(Math.round(r.hpPerSec)).padStart(5)}  ${r.boss ? ' ★ ' : '   '} `
      + (loss ? ` ${loss[r.w - 1].toFixed(1).padStart(4)}  ` : '')
      + (f ? `✗ ${f.kind}` : ''))
  }
  return lines.join('\n')
}

const json = has('json')
const out = []
const say = (s) => { if (!json) console.log(s) }

const onlySet = arg('set', null)
const onlyMap = arg('map', null)
const sets = listWaveSets().filter(({ id }) => (!onlySet || id === onlySet))
  .filter(({ id }) => !onlyMap || (getMap(onlyMap) && getMap(onlyMap).waveSet === id))
if (onlyMap && !getMap(onlyMap)) { console.error(`모르는 맵: ${onlyMap}`); process.exit(2) }
if (sets.length === 0) { console.error(`모르는 셋: ${onlySet}`); process.exit(2) }

for (const { id, table: tbl } of sets) {
  const map = onlyMap ? getMap(onlyMap) : mapForSet(id)
  const rows = waveCurve(tbl, getEnemy, { mapHpMul: map ? map.hpMul : 1 })
  const flags = findCliffs(rows)
  let dyn = null
  if (onlyMap) {
    const runs = Number(arg('runs', 5))
    const seedArg = arg('seed', null)
    dyn = playMany(map.id, arg('difficulty', 'normal'), runs, {
      policy: arg('policy', 'cheese'), seed: seedArg === null ? undefined : Number(seedArg), specials: has('specials'),
    })
  }
  out.push({ id, map: map ? map.id : null, hpMul: map ? map.hpMul : 1, waves: rows.length, flags, dyn })
  say(`■ ${id}${map ? ` (${map.name} · hpMul ${map.hpMul})` : ''} — ${rows.length}웨이브 · 플래그 ${flags.length}개`)
  for (const f of flags) say(`    ✗ ${describeFlag(f)}`)
  if (has('all') || onlySet || onlyMap) say(table(rows, flags, dyn ? dyn.lossCurve : null))
  if (dyn) {
    say(`  동적 (${dyn.runs}판 · ${arg('policy', 'cheese')} · ${dyn.diffId})`
      + ` — 클리어율 ${Math.round(dyn.clearRate * 100)}% · 도달 중앙 ${dyn.median}/${dyn.total} · 첫 실점 ${dyn.firstLoss}웨이브`
      + ` · 보스 실점 비율 ${Math.round(dyn.bossLossShare * 100)}% · 실점 잡몹 웨이브 ${dyn.bleedWaves}개`
      + ` · 마지막 웨이브 실점 ${Math.round(dyn.finalWaveLoss * 100)}% · 도달 점수 ${dyn.reachScore.toFixed(1)}`)
  }
  say('')
}
if (json) console.log(JSON.stringify(out, null, 2))
