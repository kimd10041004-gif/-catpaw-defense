import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateObjectives, ObjectiveError, MAX_STARS } from '../../web/js/domain/objectives.js'
import {
  resetRegistry, registerTower, registerEnemy, registerSprite, getObjective,
} from '../../web/js/content/registry.js'

// content/objectives.js 는 import 되는 순간 레지스트리에 등록한다.
// ES 모듈 캐시 때문에 한 번만 실행되므로, 먼저 비우고 이름 조회용 콘텐츠를 넣은 뒤 부른다.
resetRegistry()
registerSprite('cat', () => {})
registerSprite('rodent', () => {})
registerTower({
  id: 'cheese', name: '치즈냥', order: 1, desc: 'd', sprite: 'cat', targets: 'all',
  palette: { fur: '#fff' }, levels: [{ cost: 10, damage: 5, range: 2, fireRate: 1, effects: [] }],
})
registerTower({
  id: 'black', name: '검은냥', order: 2, desc: 'd', sprite: 'cat', targets: 'all',
  palette: { fur: '#000' }, levels: [{ cost: 10, damage: 5, range: 2, fireRate: 1, effects: [] }],
})
registerEnemy({
  id: 'ratking', name: '쥐왕', desc: 'd', sprite: 'rodent', baseHp: 10, speed: 1,
  armor: 0, gold: 1, size: 0.5, livesCost: 1, palette: { body: '#000' }, boss: true,
})
await import('../../web/js/content/objectives.js')

/** 전부 통과하는 기본 판 결과 */
const won = (over = {}) => ({
  mapId: 'alley', cleared: true, livesLeft: 20, leaked: 0, specialsUsed: 0,
  towersBuilt: 3, towerIdsUsed: ['cheese'], bossIdsKilled: [], ...over,
})

const run = (chapter, summary) => evaluateObjectives(chapter, summary, getObjective)

// ── 경계값 ────────────────────────────────────────────────────

test('livesAbove: n 과 같으면 통과, 하나 모자라면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'livesAbove', n: 18 }] }
  assert.equal(run(ch, won({ livesLeft: 18 })).stars, 2)
  assert.equal(run(ch, won({ livesLeft: 17 })).stars, 1)
})

test('maxTowers: n 마리까지 통과, 한 마리 더 지으면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'maxTowers', n: 4 }] }
  assert.equal(run(ch, won({ towersBuilt: 4 })).bonus[0].ok, true)
  assert.equal(run(ch, won({ towersBuilt: 5 })).bonus[0].ok, false)
})

test('maxSpecials: n=0 이면 한 번이라도 쓰면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'maxSpecials', n: 0 }] }
  assert.equal(run(ch, won({ specialsUsed: 0 })).bonus[0].ok, true)
  assert.equal(run(ch, won({ specialsUsed: 1 })).bonus[0].ok, false)
  assert.equal(getObjective('maxSpecials').label({ n: 0 }), '필살기 없이 막기')
  assert.equal(getObjective('maxSpecials').label({ n: 2 }), '필살기 2회 이하로 쓰기')
})

test('noLeak: 한 마리라도 통과시키면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'noLeak' }] }
  assert.equal(run(ch, won({ leaked: 0 })).bonus[0].ok, true)
  assert.equal(run(ch, won({ leaked: 1 })).bonus[0].ok, false)
})

// ── 타워 종류 제한 ────────────────────────────────────────────

test('onlyTowers: 목록 밖 타워를 하나라도 쓰면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'onlyTowers', ids: ['black'] }] }
  assert.equal(run(ch, won({ towerIdsUsed: ['black'] })).bonus[0].ok, true)
  assert.equal(run(ch, won({ towerIdsUsed: ['black', 'cheese'] })).bonus[0].ok, false)
  // 한 마리도 안 지었으면 어긴 것이 없다
  assert.equal(run(ch, won({ towerIdsUsed: [] })).bonus[0].ok, true)
})

test('withoutTowers: 금지된 타워를 쓰면 실패', () => {
  const ch = { primary: { kind: 'survive' }, bonus: [{ kind: 'withoutTowers', ids: ['cheese'] }] }
  assert.equal(run(ch, won({ towerIdsUsed: ['black'] })).bonus[0].ok, true)
  assert.equal(run(ch, won({ towerIdsUsed: ['black', 'cheese'] })).bonus[0].ok, false)
})

test('타워 제한 목표의 문구가 id 가 아니라 이름으로 나온다', () => {
  assert.equal(getObjective('onlyTowers').label({ ids: ['black'] }), '검은냥만 쓰기')
  assert.equal(getObjective('withoutTowers').label({ ids: ['cheese', 'black'] }), '치즈냥·검은냥 없이 막기')
})

// ── 보스 처치 ─────────────────────────────────────────────────

test('killBoss: 지정한 보스를 잡아야 통과한다', () => {
  const ch = { primary: { kind: 'killBoss', enemyId: 'ratking' }, bonus: [] }
  assert.equal(run(ch, won({ bossIdsKilled: ['ratking'] })).primary.ok, true)
  assert.equal(run(ch, won({ bossIdsKilled: [] })).primary.ok, false)
  // 다른 보스를 잡은 것으로는 안 된다
  assert.equal(run(ch, won({ bossIdsKilled: ['demonking'] })).primary.ok, false)
  assert.equal(getObjective('killBoss').label({ enemyId: 'ratking' }), '쥐왕 처치')
})

test('killBoss: 판을 못 깼어도 그 보스를 잡았으면 통과한다', () => {
  // 7장은 보스 처치가 주 목표다. 뒤 웨이브에서 뚫려도 목표는 이룬 것이다.
  const ch = { primary: { kind: 'killBoss', enemyId: 'ratking' }, bonus: [] }
  assert.equal(run(ch, won({ cleared: false, bossIdsKilled: ['ratking'] })).primary.ok, true)
})

// ── 별 계산 ───────────────────────────────────────────────────

test('주 목표를 못 지키면 부 목표를 다 채워도 별이 0개다', () => {
  const ch = {
    primary: { kind: 'survive' },
    bonus: [{ kind: 'noLeak' }, { kind: 'livesAbove', n: 1 }],
  }
  const r = run(ch, won({ cleared: false }))
  assert.equal(r.stars, 0)
  assert.equal(r.bonus.filter((b) => b.ok).length, 2, '부 목표 판정 자체는 그대로 보여준다')
})

test('별은 주 목표 1개 + 부 목표당 1개, 최대 3개', () => {
  const ch = {
    primary: { kind: 'survive' },
    bonus: [{ kind: 'noLeak' }, { kind: 'maxTowers', n: 3 }],
  }
  assert.equal(run(ch, won()).stars, 3)
  assert.equal(run(ch, won({ leaked: 2 })).stars, 2)
  assert.equal(run(ch, won({ leaked: 2, towersBuilt: 9 })).stars, 1)
  assert.equal(MAX_STARS, 3)
})

test('부 목표가 없는 챕터는 별 1개가 최대다', () => {
  assert.equal(run({ primary: { kind: 'survive' } }, won()).stars, 1)
})

// ── 잘못 쓴 경우 ──────────────────────────────────────────────

test('등록되지 않은 목표를 쓰면 추가 방법까지 알려준다', () => {
  assert.throws(
    () => run({ primary: { kind: '없는목표' } }, won()),
    (e) => e instanceof ObjectiveError && /registerObjective\('없는목표'/.test(e.message),
  )
})

test('getObjective 를 안 넘기면 즉시 실패한다', () => {
  assert.throws(() => evaluateObjectives({ primary: { kind: 'survive' } }, won()), ObjectiveError)
})

test('primary 나 summary 가 없으면 조용히 통과시키지 않는다', () => {
  assert.throws(() => evaluateObjectives({}, won(), getObjective), ObjectiveError)
  assert.throws(() => evaluateObjectives({ primary: { kind: 'survive' } }, null, getObjective), ObjectiveError)
})
