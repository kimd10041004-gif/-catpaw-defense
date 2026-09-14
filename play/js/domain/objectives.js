/**
 * 시나리오 챕터의 목표 판정. DOM도 레지스트리도 모르는 순수 모듈이다.
 *
 * 목표 종류(kind)는 여기에 없다 — content/objectives.js 에 등록하고 getObjective 로
 * 넘겨받는다. domain/waves.js 가 getEnemy 를 넘겨받는 것과 같은 방식이다.
 * 그래서 새 목표를 추가할 때 이 파일과 game.js 를 건드리지 않는다.
 */

export class ObjectiveError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ObjectiveError'
  }
}

/** 별은 최대 3개 — 주 목표 1 + 부 목표 2 */
export const MAX_STARS = 3

/**
 * @param {object} chapter { primary, bonus[] }
 * @param {object} summary Game.summary()
 * @param {(kind:string)=>object|null} getObjective 목표 종류 조회
 * @returns {{primary:object, bonus:object[], stars:number}}
 */
export function evaluateObjectives(chapter, summary, getObjective) {
  if (typeof getObjective !== 'function') {
    throw new ObjectiveError('evaluateObjectives: getObjective 함수를 넘겨야 합니다')
  }
  if (!chapter || !chapter.primary) {
    throw new ObjectiveError('evaluateObjectives: 챕터에 primary 목표가 없습니다')
  }
  if (!summary || typeof summary !== 'object') {
    throw new ObjectiveError('evaluateObjectives: summary 객체가 필요합니다')
  }

  const judge = (spec) => {
    const def = getObjective(spec.kind)
    if (!def) {
      throw new ObjectiveError(
        `등록되지 않은 목표 '${spec.kind}' 입니다. ` +
        `content/objectives.js 에 registerObjective('${spec.kind}', ...) 를 추가하세요.`,
      )
    }
    return { kind: spec.kind, label: def.label(spec), ok: def.check(summary, spec) === true }
  }

  const primary = judge(chapter.primary)
  const bonus = (chapter.bonus || []).map(judge)

  // 주 목표를 못 지키면 부 목표를 채워도 별이 없다. 판을 깨는 것이 먼저다.
  const stars = primary.ok
    ? Math.min(MAX_STARS, 1 + bonus.filter((b) => b.ok).length)
    : 0

  return { primary, bonus, stars }
}
