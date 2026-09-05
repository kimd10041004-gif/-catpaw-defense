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
  const { getEnemy, mapHpMul = 1, hpMul = 1, goldMul = 1 } = opts || {}
  if (typeof getEnemy !== 'function') {
    throw new WaveError('opts.getEnemy 함수가 필요합니다')
  }

  const groups = table[waveNo - 1]
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new WaveError(`웨이브 ${waveNo}에 스폰 그룹이 없습니다`)
  }

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
