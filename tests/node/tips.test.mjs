import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listTowers } from '../../web/js/content/registry.js'
import { ELITE_FROM_WAVE, ELITE_HP_MUL } from '../../web/js/domain/elite.js'
import { ruleTips, contentTips, buildTips } from '../../web/js/domain/tips.js'

test('팁이 충분히 많고 비거나 겹치지 않는다', () => {
  const all = buildTips()
  assert.ok(all.length >= 30, `${all.length}개`)
  for (const t of all) assert.ok(typeof t === 'string' && t.trim().length > 10, `빈 팁: ${JSON.stringify(t)}`)
  assert.equal(new Set(all).size, all.length, '중복 팁이 있다')
})

test('규칙 팁은 상수를 실제로 보간한다 — 수치를 바꾸면 문장도 바뀐다', () => {
  const text = ruleTips().join('\n')
  assert.ok(text.includes(`${ELITE_FROM_WAVE}웨이브부터`), 'ELITE_FROM_WAVE 가 문장에 없다')
  assert.ok(text.includes(`체력 ${ELITE_HP_MUL}배`), 'ELITE_HP_MUL 이 문장에 없다')
  // 크리스탈 수명은 game.js 상수를 값으로 받는다 — 넘긴 값이 그대로 들어가야 한다
  assert.ok(ruleTips({ crystalLife: 7 }).join('\n').includes('7초 뒤 사라집니다'))
})

test('콘텐츠 팁에 고양이 전부가 들어 있다 (desc 가 있는 것은 빠지지 않는다)', () => {
  const text = contentTips().join('\n')
  for (const t of listTowers()) {
    if (t.desc) assert.ok(text.includes(`${t.name}: `), `${t.name} 팁이 없다`)
  }
})

test('같은 난수를 주면 같은 순서다 (재현 가능)', () => {
  const a = buildTips(() => 0.37)
  const b = buildTips(() => 0.37)
  assert.deepEqual(a, b)
})
