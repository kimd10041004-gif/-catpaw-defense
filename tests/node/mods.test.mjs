/**
 * 수정자 계층 — 펫·조합·buff 고양이가 얹는 배수를 합치는 순수 모듈.
 *
 * 여기서 상한이 무너지면 곱이 터진다. 상한 검사는 "지금 있는 출처를 다 켜도 안 넘는다"가
 * 아니라 "상한 코드를 지우면 실패한다"까지 확인해야 의미가 있다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyMods, combineMods, buffOf, towerModsFor, matchCombo, shapeHolds,
  matchSpecialCombo, specialComboHints, MODS_CAP,
} from '../../web/js/domain/mods.js'

/** buff 능력을 가진 타워 정의 */
const buffTower = (c, r, o = {}) => ({
  c, r, level: 1,
  def: {
    id: 'tuxedo',
    levels: [{ effects: [{ kind: 'buff', radius: o.radius ?? 1.5, damageMul: o.damageMul ?? 1.2 }] }],
  },
})
/** 아무 능력도 없는 평범한 타워 */
const plainTower = (c, r) => ({ c, r, level: 1, def: { id: 'cheese', levels: [{ effects: [] }] } })

// ── 합치기 ────────────────────────────────────────────────────

test('emptyMods 는 항등원이다 (곱은 1, 덧셈은 0)', () => {
  assert.deepEqual(emptyMods(), {
    damageMul: 1, fireRateMul: 1, rangeAdd: 0, goldMul: 1, manaMul: 1,
  })
})

test('combineMods: 배수는 곱하고 사거리는 더한다 (섞이지 않는다)', () => {
  const out = combineMods(
    { damageMul: 1.2, rangeAdd: 0.5 },
    { damageMul: 1.5, rangeAdd: 0.3 },
  )
  assert.equal(+out.damageMul.toFixed(4), 1.8)
  assert.equal(+out.rangeAdd.toFixed(4), 0.8)
})

test('combineMods: 빈 입력·null·이상한 값은 무시한다', () => {
  assert.deepEqual(combineMods(), emptyMods())
  assert.deepEqual(combineMods(null, undefined, 'x', 3), emptyMods())
  // 0 이나 음수 배수는 타워를 무력화한다 — 실수로 들어와도 안 먹는다
  assert.deepEqual(combineMods({ damageMul: 0 }, { fireRateMul: -2 }), emptyMods())
})

test('combineMods: 모든 출처를 다 켜도 상한을 넘지 않는다', () => {
  // 펫 1.12 × 조합 1.25 × buff 1.26 × 황금 발바닥 2.0 = 3.53 배
  const out = combineMods(
    { damageMul: 1.12, goldMul: 1.12 },
    { damageMul: 1.25, fireRateMul: 1.25 },
    { damageMul: 1.26, fireRateMul: 1.18, rangeAdd: 0.8 },
    { damageMul: 2.0, fireRateMul: 2.0, rangeAdd: 1.2 },
  )
  assert.equal(out.damageMul, MODS_CAP.damageMul, '피해 배수가 상한에서 잘려야 한다')
  assert.equal(out.fireRateMul, MODS_CAP.fireRateMul)
  assert.equal(out.rangeAdd, MODS_CAP.rangeAdd)
  // 상한이 실제로 일하고 있는지 — 자르기 전 값이 상한보다 크다
  assert.ok(1.12 * 1.25 * 1.26 * 2.0 > MODS_CAP.damageMul,
    '이 검사가 의미 있으려면 자르기 전 값이 상한을 넘어야 한다')
})

test('combineMods: 상한 아래면 그대로 둔다 (무조건 자르지 않는다)', () => {
  const out = combineMods({ damageMul: 1.2 }, { damageMul: 1.3 })
  assert.equal(+out.damageMul.toFixed(4), 1.56)
})

// ── buff 고양이 ───────────────────────────────────────────────

test('buffOf: buff 능력이 있으면 그 파라미터를, 없으면 null 을 준다', () => {
  assert.equal(buffOf(plainTower(0, 0)), null)
  assert.equal(buffOf(buffTower(0, 0)).radius, 1.5)
  assert.equal(buffOf(null), null)
})

test('towerModsFor: 반경 안의 고양이만 강화한다', () => {
  const buff = buffTower(4, 4, { radius: 1.5, damageMul: 1.2 })
  const inside = plainTower(5, 4)     // 거리 1
  const edge = plainTower(3, 3)       // 거리 √2 ≈ 1.41 — 반경 안
  const outside = plainTower(7, 4)    // 거리 3 — 반경 밖
  const towers = [buff, inside, edge, outside]

  assert.equal(+towerModsFor(inside, towers).damageMul.toFixed(2), 1.2)
  assert.equal(+towerModsFor(edge, towers).damageMul.toFixed(2), 1.2)
  assert.equal(towerModsFor(outside, towers).damageMul, 1, '반경 밖은 안 받는다')
})

test('towerModsFor: 자기 자신은 강화하지 않는다', () => {
  const buff = buffTower(4, 4)
  assert.equal(towerModsFor(buff, [buff]).damageMul, 1)
})

test('towerModsFor: buff 고양이 둘이면 곱해서 쌓인다', () => {
  const a = buffTower(3, 4, { damageMul: 1.2 })
  const b = buffTower(5, 4, { damageMul: 1.2 })
  const mid = plainTower(4, 4)
  assert.equal(+towerModsFor(mid, [a, b, mid]).damageMul.toFixed(2), 1.44)
})

test('towerModsFor: 조합은 그 구성원에게만 붙는다', () => {
  const a = plainTower(1, 1)
  const b = plainTower(2, 1)
  const c = plainTower(8, 8)
  const matched = [{ combo: { id: 'pair', mods: { fireRateMul: 1.5 } }, members: [a, b] }]

  assert.equal(towerModsFor(a, [a, b, c], matched).fireRateMul, 1.5)
  assert.equal(towerModsFor(c, [a, b, c], matched).fireRateMul, 1, '조합 밖은 안 받는다')
  assert.equal(towerModsFor(a, [a, b, c]).fireRateMul, 1, '성립한 조합이 없으면 그대로')
})

// ── 조합 모양 판정 ────────────────────────────────────────────
// 한 칸만 어긋나도 성립하지 않아야 한다. 느슨하면 "아무렇게나 둬도 걸리는" 보너스가 된다.

const at = (c, r, id = 'cheese') => ({ c, r, level: 1, def: { id, levels: [{ effects: [] }] } })

test('shapeHolds adjacent: 상하좌우로 이어진 한 덩어리만', () => {
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(3, 2)]), true)
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(2, 3)]), true)
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(3, 3)]), false, '대각선은 adjacent 가 아니다')
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(4, 2)]), false, '한 칸 떨어지면 안 된다')
  // 셋이면 전부 이어져야 한다 — 하나가 떨어져 있으면 실패
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(3, 2), at(4, 2)]), true)
  assert.equal(shapeHolds('adjacent', [at(2, 2), at(3, 2), at(7, 7)]), false)
})

test('shapeHolds diagonal: 두 마리가 대각선으로 맞닿을 때만', () => {
  assert.equal(shapeHolds('diagonal', [at(2, 2), at(3, 3)]), true)
  assert.equal(shapeHolds('diagonal', [at(2, 2), at(3, 2)]), false, '상하좌우는 대각선이 아니다')
  assert.equal(shapeHolds('diagonal', [at(2, 2), at(4, 4)]), false, '두 칸 대각선은 안 된다')
})

test('shapeHolds line: 같은 행/열에서 빈칸 없이 연속일 때만', () => {
  assert.equal(shapeHolds('line', [at(2, 5), at(3, 5), at(4, 5)]), true)
  assert.equal(shapeHolds('line', [at(4, 5), at(2, 5), at(3, 5)]), true, '순서는 상관없다')
  assert.equal(shapeHolds('line', [at(5, 2), at(5, 3), at(5, 4)]), true, '세로도 된다')
  assert.equal(shapeHolds('line', [at(2, 5), at(3, 5), at(5, 5)]), false, '사이가 비면 안 된다')
  assert.equal(shapeHolds('line', [at(2, 5), at(3, 5), at(3, 6)]), false, '꺾이면 안 된다')
})

test('shapeHolds near: 전원이 3×3 안에 있을 때만', () => {
  assert.equal(shapeHolds('near', [at(2, 2), at(3, 3), at(4, 4)]), true)
  assert.equal(shapeHolds('near', [at(2, 2), at(5, 2)]), false, '가로로 넘치면 안 된다')
  assert.equal(shapeHolds('near', [at(2, 2), at(2, 5)]), false, '세로로 넘치면 안 된다')
})

// ── 조합 찾기 ─────────────────────────────────────────────────

test('matchCombo: 같은 id 를 세 번 적으면 서로 다른 세 마리가 필요하다', () => {
  const combo = { towers: ['cheese', 'cheese', 'cheese'], shape: 'line', mods: {} }
  const three = [at(1, 1), at(2, 1), at(3, 1)]
  assert.equal(matchCombo(combo, three).length, 3)
  // 두 마리뿐이면 성립하지 않는다 (한 마리를 세 번 세지 않는다)
  assert.equal(matchCombo(combo, [at(1, 1), at(2, 1)]), null)
})

test('matchCombo: 종류가 다르면 각각 필요하다', () => {
  const combo = { towers: ['black', 'tuxedo'], shape: 'adjacent', mods: {} }
  assert.ok(matchCombo(combo, [at(1, 1, 'black'), at(2, 1, 'tuxedo')]))
  assert.equal(matchCombo(combo, [at(1, 1, 'black'), at(2, 1, 'black')]), null)
})

test('matchCombo: 모양이 안 맞으면 종류가 맞아도 성립하지 않는다', () => {
  const combo = { towers: ['black', 'tuxedo'], shape: 'adjacent', mods: {} }
  assert.equal(matchCombo(combo, [at(1, 1, 'black'), at(5, 5, 'tuxedo')]), null)
})

test('matchCombo: 후보가 여럿이어도 성립하는 묶음을 찾아낸다', () => {
  // 붙어 있지 않은 검은냥이 먼저 오더라도, 붙어 있는 쪽을 찾아야 한다
  const combo = { towers: ['black', 'tuxedo'], shape: 'adjacent', mods: {} }
  const towers = [at(8, 8, 'black'), at(1, 1, 'black'), at(2, 1, 'tuxedo')]
  const got = matchCombo(combo, towers)
  assert.ok(got, '붙어 있는 조합이 있는데 못 찾았다')
  assert.equal(got.length, 2)
})

test('matchCombo: towers 가 비었거나 없는 조합은 null', () => {
  assert.equal(matchCombo({ towers: [], shape: 'line' }, [at(1, 1)]), null)
  assert.equal(matchCombo({}, [at(1, 1)]), null)
  assert.equal(matchCombo(null, [at(1, 1)]), null)
})

// ── 필살기 연계 ───────────────────────────────────────────────

const LINKS = [
  { id: 'a', from: 'nap', to: 'churu', window: 4, bonus: { damageMul: 2 } },
  { id: 'b', from: 'churu', to: 'milk', window: 4, bonus: { damageMul: 1.8 } },
]

test('matchSpecialCombo: 창 안에서 정해진 순서로 이어 쓸 때만 성립한다', () => {
  assert.equal(matchSpecialCombo(LINKS, { id: 'nap', at: 10 }, 'churu', 13).id, 'a')
  // 경계 — 창과 정확히 같으면 성립, 하나라도 넘으면 안 된다
  assert.equal(matchSpecialCombo(LINKS, { id: 'nap', at: 10 }, 'churu', 14).id, 'a')
  assert.equal(matchSpecialCombo(LINKS, { id: 'nap', at: 10 }, 'churu', 14.01), null)
})

test('matchSpecialCombo: 순서가 반대면 성립하지 않는다', () => {
  assert.equal(matchSpecialCombo(LINKS, { id: 'churu', at: 10 }, 'nap', 11), null)
})

test('matchSpecialCombo: 직전에 쓴 게 없으면 성립하지 않는다', () => {
  assert.equal(matchSpecialCombo(LINKS, null, 'churu', 11), null)
})

test('matchSpecialCombo: 등록된 연계가 없으면 조용히 null', () => {
  assert.equal(matchSpecialCombo([], { id: 'nap', at: 10 }, 'churu', 11), null)
  assert.equal(matchSpecialCombo(null, { id: 'nap', at: 10 }, 'churu', 11), null)
})

test('specialComboHints: 지금 이어 쓸 수 있는 것만 알려준다', () => {
  assert.deepEqual(specialComboHints(LINKS, { id: 'nap', at: 10 }, 12), ['churu'])
  // 창이 지나면 힌트도 사라져야 한다 — 안 그러면 눌러도 연계가 안 걸린다
  assert.deepEqual(specialComboHints(LINKS, { id: 'nap', at: 10 }, 20), [])
  assert.deepEqual(specialComboHints(LINKS, null, 12), [])
})
