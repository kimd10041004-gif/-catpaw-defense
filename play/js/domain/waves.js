/**
 * 웨이브 스폰 스케줄 생성.
 * 레지스트리를 import하지 않고 getEnemy를 주입받는다 — 그래야 도메인이 순수하게 남고
 * 테스트에서 가짜 적 정의만으로 검증할 수 있다.
 *
 * 웨이브 테이블 한 줄 = 그 웨이브에 나오는 그룹들의 배열.
 * 그룹 형식: [적id, 마리수, 마리당 간격(초), 그룹 시작 지연(초)]
 */

import { scaleGold, scaleHp } from './balance.js'

export class WaveError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WaveError'
  }
}

/** 웨이브 테이블의 총 웨이브 수 */
export function waveCount(table) {
  if (!Array.isArray(table)) throw new WaveError('웨이브 테이블은 배열이어야 합니다')
  return table.length
}

/**
 * 한 웨이브의 스폰 스케줄을 전부 계산해서 돌려준다 (시각까지 확정된 순수 데이터).
 * @param {Array} table 웨이브 테이블
 * @param {number} waveNo 1-based 웨이브 번호
 * @param {{getEnemy:Function, mapHpMul?:number, hpMul?:number, goldMul?:number}} opts
 * @returns {{waveNo:number, spawns:Array, totalHp:number, durationSec:number,
 *            bossCount:number, count:number}}
 */
export function buildWave(table, waveNo, opts) {
  if (!Array.isArray(table)) throw new WaveError('웨이브 테이블은 배열이어야 합니다')
  if (!Number.isInteger(waveNo) || waveNo < 1 || waveNo > table.length) {
    throw new WaveError(`waveNo는 1 이상 ${table.length} 이하의 정수여야 합니다: ${String(waveNo)}`)
  }
  return buildWaveFromGroups(table[waveNo - 1], waveNo, opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// 무한 모드 — 표가 끝난 뒤에도 웨이브를 만든다.
//
// 마지막 5줄(26~30)을 돌려 쓴다. 다섯 번째마다 보스 줄이 온다. 웨이브 번호가 오를수록
// scaleHp 가 10%씩 올리고, 여기서는 마릿수를 8%씩 더 늘리고(2배 상한) 간격을 2%씩
// 줄인다(0.5초 하한). 40웨이브쯤이면 30웨이브의 2.3배 압박 — 만렙 방어도 10~15웨이브
// 안에 무너진다. 그게 의도다: 무한은 "얼마나 버티나"지 "언제까지"가 아니다.
// ─────────────────────────────────────────────────────────────────────────────
export const ENDLESS_CYCLE = 5
export const ENDLESS_COUNT_GROWTH = 0.08
export const ENDLESS_COUNT_CAP = 2.0
export const ENDLESS_INTERVAL_SHRINK = 0.02
export const ENDLESS_INTERVAL_MIN = 0.5

/**
 * 표 밖 waveNo 의 스폰 그룹 (표의 마지막 ENDLESS_CYCLE 줄을 순환·증폭).
 * @param {number} [limit] 이번 판이 쓴 표 길이. 챕터처럼 waveLimit 으로 잘라 쓴 판은 표 전체가
 *   아니라 그 길이 뒤부터가 '표 밖'이다. 기본은 표 전체.
 */
export function endlessGroups(table, waveNo, limit = waveCount(table)) {
  const n = Math.min(waveCount(table), Number.isInteger(limit) && limit > 0 ? limit : waveCount(table))
  if (!Number.isInteger(waveNo) || waveNo <= n) {
    throw new WaveError(`무한 웨이브 번호는 표 길이(${n})보다 커야 합니다: ${String(waveNo)}`)
  }
  const k = waveNo - n                                   // 표 밖으로 몇 번째
  const cycle = Math.min(ENDLESS_CYCLE, n)
  const row = table[n - cycle + ((k - 1) % cycle)]      // n-4, n-3, …, n(보스), n-4, …
  const countMul = Math.min(ENDLESS_COUNT_CAP, 1 + ENDLESS_COUNT_GROWTH * k)
  const intervalMul = Math.max(0, 1 - ENDLESS_INTERVAL_SHRINK * k)
  return row.map(([enemyId, count, interval, delay]) => [
    enemyId,
    Math.max(1, Math.ceil(count * countMul)),
    Math.max(ENDLESS_INTERVAL_MIN, interval * intervalMul),
    delay,
  ])
}

/** 표 밖 웨이브. buildWave 와 같은 결과 형식. */
export function buildEndlessWave(table, waveNo, opts) {
  return buildWaveFromGroups(endlessGroups(table, waveNo, opts && opts.tableWaves), waveNo, opts)
}

/**
 * 스폰 그룹 배열 하나로 웨이브를 만든다 (buildWave·buildEndlessWave 의 공통 본체).
 * opts.transform = { replace: { 적id: 적id }, bossCountMul } 는 도전 모드가 쓴다 —
 * 치환을 먼저, 보스 수 배수를 그다음에.
 */
export function buildWaveFromGroups(groups, waveNo, opts) {
  const { getEnemy, mapHpMul = 1, hpMul = 1, goldMul = 1, transform = null } = opts || {}
  if (typeof getEnemy !== 'function') {
    throw new WaveError('opts.getEnemy 함수가 필요합니다')
  }
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new WaveError(`웨이브 ${waveNo}에 스폰 그룹이 없습니다`)
  }
  if (transform) groups = applyTransform(groups, transform, getEnemy, waveNo)

  const spawns = []
  let totalHp = 0
  let bossCount = 0

  for (const group of groups) {
    if (!Array.isArray(group) || group.length !== 4) {
      throw new WaveError(
        `웨이브 ${waveNo}의 그룹 형식이 잘못됐습니다. [적id, 마리수, 간격, 지연] 이어야 합니다: ${JSON.stringify(group)}`,
      )
    }
    const [enemyId, count, interval, delay] = group
    if (!Number.isInteger(count) || count < 1) {
      throw new WaveError(`웨이브 ${waveNo} '${enemyId}'의 마리수가 잘못됐습니다: ${String(count)}`)
    }
    if (typeof interval !== 'number' || interval < 0 || typeof delay !== 'number' || delay < 0) {
      throw new WaveError(`웨이브 ${waveNo} '${enemyId}'의 간격/지연은 0 이상의 숫자여야 합니다`)
    }

    const def = getEnemy(enemyId)
    if (!def) {
      throw new WaveError(`웨이브 ${waveNo}가 등록되지 않은 적 '${enemyId}'을(를) 참조합니다`)
    }

    // 표 밖(무한)에서는 체력이 계속 10%씩 오른다 — scaleHp 가 웨이브 번호만 본다
    const hp = scaleHp(def.baseHp, waveNo, mapHpMul, hpMul)
    const gold = scaleGold(def.gold, waveNo, goldMul)

    for (let i = 0; i < count; i += 1) {
      spawns.push({
        enemyId,
        atSec: delay + i * interval,
        hp,
        maxHp: hp,
        gold,
        isBoss: !!def.boss,
      })
      totalHp += hp
      if (def.boss) bossCount += 1
    }
  }

  // 스폰 시각 순으로 정렬해야 게임 루프가 앞에서부터 하나씩 꺼내 쓸 수 있다.
  spawns.sort((a, b) => a.atSec - b.atSec)
  spawns.forEach((s, i) => { s.index = i })

  const durationSec = spawns.length === 0 ? 0 : spawns[spawns.length - 1].atSec

  return { waveNo, spawns, totalHp, durationSec, bossCount, count: spawns.length }
}

/**
 * 웨이브 미리보기용 요약 — 같은 적을 묶어 [{ enemyId, name, count, boss, flying, armored }].
 * 보스가 먼저, 그다음 마릿수 내림차순. buildWave 의 결과만 읽으므로 순수하다.
 * @param {{spawns:Array}} wave buildWave 의 결과
 * @param {Function} getEnemy 적 정의 조회
 */
export function summarizeWave(wave, getEnemy) {
  const byId = new Map()
  for (const s of (wave && wave.spawns) || []) {
    const cur = byId.get(s.enemyId)
    if (cur) { cur.count += 1; continue }
    const def = (typeof getEnemy === 'function' && getEnemy(s.enemyId)) || {}
    byId.set(s.enemyId, {
      enemyId: s.enemyId,
      name: def.name || s.enemyId,
      count: 1,
      boss: !!def.boss,
      flying: !!def.flying,
      armored: (def.armor || 0) > 0,
    })
  }
  return [...byId.values()].sort((a, b) => (b.boss - a.boss) || (b.count - a.count))
}

/**
 * 도전 모드의 웨이브 변형. replace 는 적 id 치환(공중만 도전), bossCountMul 은 보스 마릿수 배수.
 * 치환된 적이 등록돼 있지 않으면 던진다 — 조용히 원래 적으로 두면 '공중만' 이 거짓말이 된다.
 */
function applyTransform(groups, transform, getEnemy, waveNo) {
  const replace = transform.replace || {}
  const bossMul = Number.isFinite(transform.bossCountMul) ? transform.bossCountMul : 1
  return groups.map(([enemyId, count, interval, delay]) => {
    const id = Object.prototype.hasOwnProperty.call(replace, enemyId) ? replace[enemyId] : enemyId
    const def = getEnemy(id)
    if (!def) throw new WaveError(`웨이브 ${waveNo}의 치환 대상 '${id}'이(가) 등록돼 있지 않습니다`)
    const n = def.boss && bossMul !== 1 ? Math.max(1, Math.round(count * bossMul)) : count
    return [id, n, interval, delay]
  })
}
