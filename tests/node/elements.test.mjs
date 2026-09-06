/**
 * 속성과 상성 — 고리가 대칭인지, 그리고 **꺼져 있을 때 아무 일도 안 일어나는지**.
 *
 * 두 번째가 이 파일에서 제일 중요하다. 상성은 원정에서만 켜지고 자유 모드·시나리오는 그대로여야 한다
 * (맵을 깨고 나가는 길이 속성 수집에 걸리면 안 된다 — README 무료 범위 약속).
 * `rules.elemental` 이 꺼진 판에서 배수가 1.0 이 아니면 E 단계에서 잡은 난이도가 통째로 흔들린다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ELEMENTS, STRONG, NEUTRAL, WEAK, ELEMENT_NAMES, ELEMENT_LOOK,
  isElement, beats, elementMul, describeMatchup,
} from '../../web/js/domain/elements.js'
import '../../web/js/content/index.js'
import { listTowers, listEnemies } from '../../web/js/content/registry.js'

test('상성: 여섯이 고리를 이루고 한 바퀴 돌면 제자리다', () => {
  assert.equal(ELEMENTS.length, 6)
  assert.equal(new Set(ELEMENTS).size, 6, 'id 가 겹친다')
  let cur = ELEMENTS[0]
  for (let i = 0; i < 6; i += 1) cur = beats(cur)
  assert.equal(cur, ELEMENTS[0], '고리가 안 닫힌다')
})

test('상성: 모든 속성이 강점 1 · 약점 1 · 무관 3 으로 대칭이다', () => {
  /* 이 대칭이 깨지면 약점 없는 속성이 생기고, 고양이는 공격만 하므로 그게 늘 정답이 된다.
   * (처음에 4원소 고리 + 빛↔어둠 상호 우위로 짰다가 바로 이 이유로 갈아엎었다 — elements.js 머리말) */
  for (const a of ELEMENTS) {
    const counts = { [STRONG]: 0, [NEUTRAL]: 0, [WEAK]: 0 }
    for (const b of ELEMENTS) counts[elementMul(a, b)] += 1
    assert.equal(counts[STRONG], 1, `${a}: 강한 상대가 ${counts[STRONG]}개`)
    assert.equal(counts[WEAK], 1, `${a}: 약한 상대가 ${counts[WEAK]}개`)
    assert.equal(counts[NEUTRAL], 4, `${a}: 무관이 ${counts[NEUTRAL]}개 (자기 자신 포함)`)
  }
})

test('상성: 강하면 상대는 나에게 약하다 (표가 한쪽만 정의되지 않는다)', () => {
  for (const a of ELEMENTS) {
    for (const b of ELEMENTS) {
      const m = elementMul(a, b)
      if (m === STRONG) assert.equal(elementMul(b, a), WEAK, `${a}>${b} 인데 ${b}→${a} 가 약점이 아니다`)
      if (m === WEAK) assert.equal(elementMul(b, a), STRONG, `${a}<${b} 인데 ${b}→${a} 가 강점이 아니다`)
    }
    assert.equal(elementMul(a, a), NEUTRAL, `${a}: 자기 자신에게 상성이 걸린다`)
  }
})

test('상성: 값은 셋뿐이고, 속성이 없으면 1.0 이다', () => {
  const seen = new Set()
  for (const a of ELEMENTS) for (const b of ELEMENTS) seen.add(elementMul(a, b))
  assert.deepEqual([...seen].sort((x, y) => x - y), [WEAK, NEUTRAL, STRONG])

  // 속성 없는 콘텐츠(필살기 등)가 섞여도 조용히 1.0 — 여기서 NaN 이 나오면 피해가 통째로 사라진다
  for (const bad of [null, undefined, '', 'fier', 0, {}]) {
    assert.equal(elementMul(bad, 'fire'), NEUTRAL, `공격 ${JSON.stringify(bad)}`)
    assert.equal(elementMul('fire', bad), NEUTRAL, `방어 ${JSON.stringify(bad)}`)
  }
  assert.equal(beats('nope'), null)
  assert.equal(isElement('fire'), true)
  assert.equal(isElement('fier'), false)
})

test('상성: 여섯 다 이름과 배지가 있다 (UI 가 빈칸을 그리지 않는다)', () => {
  for (const e of ELEMENTS) {
    assert.ok(ELEMENT_NAMES[e], `${e}: 이름 없음`)
    assert.ok(ELEMENT_LOOK[e] && ELEMENT_LOOK[e].glyph && ELEMENT_LOOK[e].color, `${e}: 배지 없음`)
  }
  assert.equal(Object.keys(ELEMENT_NAMES).length, 6, '이름 표에 모르는 속성이 있다')
  assert.equal(Object.keys(ELEMENT_LOOK).length, 6, '배지 표에 모르는 속성이 있다')
  assert.equal(describeMatchup('earth', 'bolt'), '효과가 좋다')
  assert.equal(describeMatchup('bolt', 'earth'), '효과가 나쁘다')
  assert.equal(describeMatchup('earth', 'ice'), '보통')
})

test('콘텐츠: 여섯 속성이 고양이·적 양쪽에서 최소 한 번씩 쓰인다', () => {
  /* 한 속성이 어느 쪽에도 없으면 그 속성 룬은 영영 쓸 데가 없거나, 그 속성 고양이는 영영 유리할 일이 없다. */
  const towerEls = new Set(listTowers().map((t) => t.element))
  const enemyEls = new Set(listEnemies().map((e) => e.element))
  for (const e of ELEMENTS) {
    assert.ok(towerEls.has(e), `속성 ${e} 를 가진 고양이가 없다`)
    assert.ok(enemyEls.has(e), `속성 ${e} 를 가진 적이 없다`)
  }
  for (const t of listTowers()) assert.ok(isElement(t.element), `고양이 ${t.id}: 속성이 없거나 모르는 값`)
  for (const e of listEnemies()) assert.ok(isElement(e.element), `적 ${e.id}: 속성이 없거나 모르는 값`)
})
