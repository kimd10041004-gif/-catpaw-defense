/**
 * 수정자 계층 — 펫·조합·buff 고양이가 얹는 배수를 합치는 순수 모듈.
 *
 * 여기서 상한이 무너지면 곱이 터진다. 상한 검사는 "지금 있는 출처를 다 켜도 안 넘는다"가
 * 아니라 "상한 코드를 지우면 실패한다"까지 확인해야 의미가 있다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyMods, combineMods, buffOf, towerModsFor, MODS_CAP,
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

test('towerModsFor: 조합은 성립한 것만, 그 구성원에게만 붙는다', () => {
  const a = plainTower(1, 1)
  const b = plainTower(2, 1)
  const c = plainTower(8, 8)
  const combo = { id: 'pair', mods: { fireRateMul: 1.5 } }
  // 성립 판정은 6단계의 matchCombo 가 한다. 여기서는 계약만 확인한다.
  const match = (cm, towers) => (cm.id === 'pair' ? towers.filter((t) => t === a || t === b) : null)

  assert.equal(towerModsFor(a, [a, b, c], [combo], match).fireRateMul, 1.5)
  assert.equal(towerModsFor(c, [a, b, c], [combo], match).fireRateMul, 1, '조합 밖은 안 받는다')
  // matchCombo 를 안 넘기면 조합은 아예 계산하지 않는다
  assert.equal(towerModsFor(a, [a, b, c], [combo]).fireRateMul, 1)
})
