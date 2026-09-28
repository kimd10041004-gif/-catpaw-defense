/**
 * 웨이브 곡선 — 웨이브셋의 '모양'을 숫자로 잰다. buildWave 위에서만 돌고 레지스트리를
 * 모른다(getEnemy 주입). 순수.
 *
 * 왜 필요한가: content.test 의 웨이브 검사는 '5웨이브마다 세진다'·'끝이 처음의 20배'처럼
 * 큰 방향만 봤다. 그 사이에서 직전 웨이브의 3배로 뛰는 절벽(골목길 15웨이브 ×3.16)이나
 * 0.77/1.4 가 교대로 반복되는 톱니(지하실)는 아무도 못 잡았고, 자동 플레이어는 잡몹
 * 웨이브에서는 한 대도 안 맞다가 보스 웨이브에서만 죽었다. 여기서 재는 것은 그 '모양'이다.
 *
 * 규칙(기본값)은 실제 셋을 전부 재서 정했다. 1~4웨이브는 체력이 작아(생쥐 8→12 = ×1.64)
 * 노이즈라 5부터 본다.
 */
import { buildWave, waveCount } from './waves.js'

export const CURVE_RULES = {
  cliffMax: 1.35,   // 보스 아닌 웨이브: 직전 대비 상한
  lullMin: 0.75,    // 보스 다음 첫 잡몹 웨이브: 보스 '직전' 웨이브 대비 하한 (숨은 쉬되 반토막은 아님)
  bossMax: 2.5,     // 보스 웨이브: 직전 대비 상한 (마지막 제외)
  finalMax: 3.0,    // 마지막 웨이브: 직전 대비 상한 (최종 보스는 튀어도 되지만 한계는 있다)
  fromWave: 5,
}

export const FLAG_TEXT = {
  CLIFF: '절벽 — 잡몹 웨이브가 직전보다 너무 세다',
  LULL: '공백 — 보스 뒤 웨이브가 보스 직전 웨이브의 반토막이다',
  BOSS: '보스 웨이브가 직전보다 너무 세다',
  FINAL: '마지막 웨이브가 직전보다 너무 세다',
}

/**
 * 웨이브마다 { w, count, totalHp, durationSec, hpPerSec, boss, ratio, ratio2 }.
 * ratio = hp[w]/hp[w-1], ratio2 = hp[w]/hp[w-2] (보스 뒤 공백 판정용).
 */
export function waveCurve(table, getEnemy, { mapHpMul = 1 } = {}) {
  const n = waveCount(table)
  const rows = []
  for (let w = 1; w <= n; w += 1) {
    const wave = buildWave(table, w, { getEnemy, mapHpMul })
    const prev = rows[w - 2]
    const prev2 = rows[w - 3]
    rows.push({
      w,
      count: wave.count,
      totalHp: wave.totalHp,
      durationSec: wave.durationSec,
      hpPerSec: wave.totalHp / Math.max(1, wave.durationSec),
      boss: wave.bossCount > 0,
      ratio: prev ? wave.totalHp / prev.totalHp : null,
      ratio2: prev2 ? wave.totalHp / prev2.totalHp : null,
    })
  }
  return rows
}

/**
 * 규칙을 어기는 웨이브 목록 [{ kind, w, ratio, limit }]. 비어 있으면 곡선이 매끈하다.
 * @param {Array} rows waveCurve 의 결과
 * @param {object} rules CURVE_RULES 덮어쓰기
 */
export function findCliffs(rows, rules = {}) {
  const r = { ...CURVE_RULES, ...rules }
  const flags = []
  const last = rows.length
  for (const row of rows) {
    if (row.w < r.fromWave || row.ratio === null) continue
    const prev = rows[row.w - 2]
    if (row.w === last) {
      if (row.ratio > r.finalMax) flags.push({ kind: 'FINAL', w: row.w, ratio: row.ratio, limit: r.finalMax })
      continue
    }
    if (row.boss) {
      if (row.ratio > r.bossMax) flags.push({ kind: 'BOSS', w: row.w, ratio: row.ratio, limit: r.bossMax })
      continue
    }
    if (prev && prev.boss) {
      if (row.ratio2 !== null && row.ratio2 < r.lullMin) {
        flags.push({ kind: 'LULL', w: row.w, ratio: row.ratio2, limit: r.lullMin })
      }
      continue
    }
    if (row.ratio > r.cliffMax) flags.push({ kind: 'CLIFF', w: row.w, ratio: row.ratio, limit: r.cliffMax })
  }
  return flags
}

/** 사람이 읽는 한 줄: '15웨이브: ×3.16 (보스 웨이브가 직전보다 너무 세다, 상한 2.5)' */
export function describeFlag(f) {
  const cmp = f.kind === 'LULL' ? '하한' : '상한'
  return `${f.w}웨이브: ×${f.ratio.toFixed(2)} (${FLAG_TEXT[f.kind]}, ${cmp} ${f.limit})`
}
