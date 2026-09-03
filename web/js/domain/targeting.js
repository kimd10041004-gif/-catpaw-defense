/**
 * 타워의 사격 대상 선택.
 * 타워마다 모드를 바꿀 수 있어서(탭으로 순환) 같은 타워도 배치 위치에 따라 역할이 달라진다.
 */

/** 선택 가능한 타겟팅 모드 (UI에서 이 순서로 순환한다) */
export const TARGET_MODES = ['first', 'last', 'strongest', 'closest']

export const TARGET_MODE_LABELS = {
  first: '선두',
  last: '후미',
  strongest: '강력',
  closest: '근접',
}

/** 타워가 이 적을 때릴 수 있는 종류인지 (공중/지상 판정) */
export function canTarget(tower, enemy) {
  if (tower.targets === 'ground') return !enemy.flying
  if (tower.targets === 'air') return !!enemy.flying
  return true
}

/** 타일 좌표 기준 제곱거리 (제곱근을 피해 비교만 한다) */
export function distanceSq(tower, enemy) {
  const dx = enemy.x - tower.x
  const dy = enemy.y - tower.y
  return dx * dx + dy * dy
}

/** 사거리 안에 있는지 */
export function inRange(tower, enemy) {
  return distanceSq(tower, enemy) <= tower.range * tower.range
}

/**
 * 사거리·공중지상 조건을 통과한 적 중에서 모드에 따라 하나를 고른다.
 * @param {{x:number,y:number,range:number,targets:string}} tower 타일 좌표
 * @param {Array<{x:number,y:number,hp:number,progress:number,flying:boolean,alive:boolean}>} enemies
 * @param {string} mode TARGET_MODES 중 하나 (모르는 값이면 'first'로 동작)
 * @returns {object|null} 대상이 없으면 null
 */
export function selectTarget(tower, enemies, mode = 'first') {
  let best = null
  let bestScore = 0

  for (const e of enemies) {
    if (e.alive === false || e.hp <= 0) continue
    if (!canTarget(tower, e)) continue
    if (!inRange(tower, e)) continue

    let score
    switch (mode) {
      case 'last':      score = -e.progress; break
      case 'strongest': score = e.hp; break
      case 'closest':   score = -distanceSq(tower, e); break
      case 'first':
      default:          score = e.progress; break
    }

    if (best === null || score > bestScore) {
      best = e
      bestScore = score
    }
  }
  return best
}

/** 사거리·공중지상 조건을 통과한 적 전부 (뚱냥의 광역 오라, 스플래시 판정에 쓴다) */
export function selectAllInRange(tower, enemies) {
  const out = []
  for (const e of enemies) {
    if (e.alive === false || e.hp <= 0) continue
    if (!canTarget(tower, e)) continue
    if (inRange(tower, e)) out.push(e)
  }
  return out
}

/** 다음 타겟팅 모드로 순환한다 */
export function nextTargetMode(mode) {
  const i = TARGET_MODES.indexOf(mode)
  return TARGET_MODES[(i + 1) % TARGET_MODES.length]
}
