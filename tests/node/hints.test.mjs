import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getMap } from '../../web/js/content/registry.js'
import { Game } from '../../web/js/game.js'
import { HINTS, nextHint } from '../../web/js/domain/hints.js'

const newGame = (o = {}) => new Game({ mapDef: getMap('alley'), ...o })
const tick = (g, sec) => { for (let i = 0; i < Math.round(sec * 60); i += 1) g.update(1 / 60) }
function placeSomewhere(game) {
  for (let r = 0; r < game.mapDef.rows; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) if (game.placeTower(c, r, 'cheese').ok) return
  }
  throw new Error('놓을 자리가 없다')
}

test('힌트: 놓기 → 웨이브 시작 → 패널 순서로 한 번씩 나온다', () => {
  const g = newGame()
  assert.equal(nextHint(g, []), null, '시작 직후 1.5초는 조용하다')
  tick(g, 1.7)
  assert.equal(nextHint(g, []).id, 'place')
  const seen = ['place']
  placeSomewhere(g)
  assert.equal(nextHint(g, seen).id, 'wave')
  seen.push('wave')
  g.startWave()
  const during = nextHint(g, seen)
  assert.ok(during === null || ['special', 'crystal'].includes(during.id),
    `웨이브 중엔 필살기·크리스탈 안내만: ${during && during.id}`)
  let t = 0
  while (g.phase === 'wave' && t < 400) { g.update(1 / 60); t += 1 / 60 }
  assert.equal(g.phase, 'prep')
  const next = nextHint(g, seen)
  assert.ok(next && ['panel', 'special', 'crystal'].includes(next.id), `1웨이브 뒤: ${next && next.id}`)
})

test('힌트: 필살기 안내는 첫 웨이브가 시작된 뒤에만 나온다 (시작 마나로도 하나는 눌린다)', () => {
  const g = newGame()
  assert.ok(g.specialStates().some((s) => s.ready), '전제: 시작 마나로 누를 수 있는 필살기가 있다')
  assert.equal(nextHint(g, ['place']), null)
  placeSomewhere(g)
  g.startWave()
  assert.equal(nextHint(g, ['place', 'wave']).id, 'special')
})

test('힌트: 이미 본 것은 다시 안 나온다', () => {
  const g = newGame()
  tick(g, 2)
  assert.equal(nextHint(g, ['place']), null)
})

test('힌트: 다음 웨이브에 보스가 있으면 알려준다', () => {
  const g = newGame({ waveSet: 'bossrush10' })
  const h = nextHint(g, ['place', 'wave', 'panel'])
  assert.ok(h && h.id === 'boss', `기대 boss, 받음 ${h && h.id}`)
})

test('힌트: 문구가 비지 않고 겹치지 않으며 id 가 유일하다', () => {
  const ids = new Set(HINTS.map((h) => h.id))
  assert.equal(ids.size, HINTS.length)
  for (const h of HINTS) assert.ok(h.text.length >= 12, `${h.id} 문구가 짧다`)
  assert.equal(new Set(HINTS.map((h) => h.text)).size, HINTS.length)
})

test('힌트: 조건 함수가 던져도 게임을 멈추지 않는다', () => {
  assert.equal(nextHint({}, []), null)   // 상태가 없는 객체
  assert.equal(nextHint(null, []), null)
})
