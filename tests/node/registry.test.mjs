import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resetRegistry, registerTower, registerEnemy, registerMap, registerWaveSet,
  registerEffect, registerSprite, registerEnemyAbility, registerSpecial, registerPose,
  validateAll, listTowers, listMaps, listSpecials,
  nextMapId, getTower, getEnemy, ContentError,
} from '../../web/js/content/registry.js'

/** 검증을 통과하는 최소 타워 */
const tower = (over = {}) => ({
  id: 't1', name: '테스트냥', order: 1, desc: '설명', sprite: 'cat', targets: 'all',
  palette: { fur: '#fff' },
  levels: [{ cost: 10, damage: 5, range: 2, fireRate: 1, effects: [] }],
  ...over,
})

/** 검증을 통과하는 최소 적 */
const enemy = (over = {}) => ({
  id: 'e1', name: '테스트쥐', sprite: 'rodent',
  baseHp: 10, speed: 1, armor: 0, gold: 1, size: 0.3,
  palette: { body: '#000' },
  ...over,
})

/** 검증을 통과하는 최소 맵 */
const map = (over = {}) => ({
  id: 'm1', name: '테스트맵', order: 1, cols: 9, rows: 9,
  waypoints: [[0, 0], [8, 0]], difficulty: 1, startGold: 100, startLives: 10,
  waveSet: 'ws1', theme: { ground: '#000' },
  ...over,
})

/** 참조가 모두 성립하는 최소 구성 한 벌 */
function seedValid() {
  resetRegistry()
  registerSprite('cat', () => {})
  registerSprite('rodent', () => {})
  registerEffect('slow', { onHit() {} })
  registerEnemy(enemy())
  registerTower(tower())
  registerWaveSet('ws1', [[['e1', 3, 1, 0]]])
  registerMap(map())
}

test('registerTower: 같은 id를 두 번 등록하면 ContentError를 던진다', () => {
  resetRegistry()
  registerTower(tower())
  assert.throws(() => registerTower(tower()), ContentError)
  assert.throws(() => registerTower(tower()), /id 중복/)
})

test('registerTower: 필수 필드가 없으면 어느 필드인지 알려주며 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerTower(tower({ name: undefined })), /name/)
  assert.throws(() => registerTower(tower({ sprite: 123 })), /sprite/)
  assert.throws(() => registerTower(tower({ order: 'first' })), /order/)
})

test('registerTower: targets가 all/ground/air가 아니면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerTower(tower({ targets: 'water' })), ContentError)
  assert.throws(() => registerTower(tower({ targets: 'water' })), /targets/)
})

test('registerTower: levels가 비었거나 수치가 잘못되면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerTower(tower({ levels: [] })), ContentError)
  assert.throws(() => registerTower(tower({ levels: [{ cost: 10, damage: 5, range: 0, fireRate: 1 }] })), /range/)
  assert.throws(() => registerTower(tower({ levels: [{ cost: -1, damage: 5, range: 2, fireRate: 1 }] })), /cost/)
})

test('registerTower: 효과가 { kind } 형태가 아니면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(
    () => registerTower(tower({ levels: [{ cost: 1, damage: 1, range: 1, fireRate: 1, effects: ['slow'] }] })),
    /kind/,
  )
})

test('registerEnemy / registerMap: 필수 수치 범위를 검사한다', () => {
  resetRegistry()
  assert.throws(() => registerEnemy(enemy({ baseHp: 0 })), /baseHp/)
  assert.throws(() => registerEnemy(enemy({ speed: 0 })), /speed/)
  assert.throws(() => registerEnemy(enemy({ resist: '없음' })), /resist/)
  assert.throws(() => registerMap(map({ cols: 1 })), /cols/)
  assert.throws(() => registerMap(map({ startLives: 0 })), /startLives/)
})

test('registerEffect: onHit도 onFire도 없으면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerEffect('x', {}), ContentError)
  assert.throws(() => registerEffect('x', { onHit: 'fn' }), /onHit 또는 onFire/)
})

test('registerWaveSet / registerSprite: 형식을 검사한다', () => {
  resetRegistry()
  assert.throws(() => registerWaveSet('ws', []), ContentError)
  assert.throws(() => registerWaveSet('', [[['e1', 1, 1, 0]]]), ContentError)
  assert.throws(() => registerSprite('k', '함수아님'), ContentError)
})

test('validateAll: 참조가 모두 맞으면 등록 개수를 돌려준다', () => {
  seedValid()
  assert.deepEqual(validateAll(), {
    towers: 1, enemies: 1, maps: 1, waveSets: 1, effects: 1, sprites: 2,
    enemyAbilities: 0, specials: 0, poses: 0,
  })
})

test('validateAll: 등록되지 않은 공격 모션을 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerTower(tower({ id: 't9', pose: '없는모션' }))
  assert.throws(() => validateAll(), /registerPose\('없는모션'/)
})

test('registerPose: 이름이 겹치거나 함수가 아니면 ContentError를 던진다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerPose('swing', () => {}))
  assert.throws(() => registerPose('swing', () => {}), /이미 등록/)
  assert.throws(() => registerPose('x', '함수아님'), /드로잉 함수/)
  assert.throws(() => registerPose('', () => {}), /문자열/)
})

test('registerTower: pose 를 안 줘도 되고, 주면 문자열이어야 한다', () => {
  resetRegistry()
  registerSprite('cat', () => {})
  assert.doesNotThrow(() => registerTower(tower({ id: 'nopose' })))
  assert.throws(() => registerTower(tower({ id: 'badpose', pose: 42 })), /pose/)
})

test('validateAll: 등록되지 않은 스프라이트를 참조하면 잡아낸다', () => {
  seedValid()
  registerTower(tower({ id: 't2', sprite: '없는스프라이트' }))
  assert.throws(() => validateAll(), /없는스프라이트/)
})

test('validateAll: 등록되지 않은 효과를 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerTower(tower({
    id: 't3',
    levels: [{ cost: 1, damage: 1, range: 1, fireRate: 1, effects: [{ kind: 'burn' }] }],
  }))
  assert.throws(() => validateAll(), /registerEffect\('burn'/)
})

test('validateAll: 등록되지 않은 웨이브셋을 가리키는 맵을 잡아낸다', () => {
  seedValid()
  registerMap(map({ id: 'm2', waveSet: '없는웨이브셋' }))
  assert.throws(() => validateAll(), /없는웨이브셋/)
})

test('validateAll: 웨이브가 등록되지 않은 적을 참조하면 잡아낸다', () => {
  seedValid()
  registerWaveSet('ws2', [[['없는적', 1, 1, 0]]])
  registerMap(map({ id: 'm3', waveSet: 'ws2' }))
  assert.throws(() => validateAll(), /없는적/)
})

test('validateAll: 경로가 성립하지 않는 맵을 잡아낸다 (대각선 웨이포인트)', () => {
  seedValid()
  registerMap(map({ id: 'm4', waypoints: [[0, 0], [4, 4]] }))
  assert.throws(() => validateAll(), ContentError)
  assert.throws(() => validateAll(), /대각선/)
})

test('validateAll: 콘텐츠가 하나도 없으면 무엇이 비었는지 알려준다', () => {
  resetRegistry()
  assert.throws(() => validateAll(), /타워가 하나도 없습니다/)
  registerSprite('cat', () => {})
  registerTower(tower())
  assert.throws(() => validateAll(), /적이 하나도 없습니다/)
})

test('listTowers / listMaps: order 순으로 정렬해서 준다', () => {
  resetRegistry()
  registerTower(tower({ id: 'b', order: 2 }))
  registerTower(tower({ id: 'a', order: 1 }))
  assert.deepEqual(listTowers().map((t) => t.id), ['a', 'b'])

  registerMap(map({ id: 'm2', order: 2 }))
  registerMap(map({ id: 'm1', order: 1 }))
  assert.deepEqual(listMaps().map((m) => m.id), ['m1', 'm2'])
})

test('nextMapId: 다음 맵을 주고, 마지막 맵이면 null을 준다', () => {
  resetRegistry()
  registerMap(map({ id: 'm1', order: 1 }))
  registerMap(map({ id: 'm2', order: 2 }))
  assert.equal(nextMapId('m1'), 'm2')
  assert.equal(nextMapId('m2'), null)
  assert.equal(nextMapId('없음'), null)
})

test('getTower / getEnemy: 없는 id는 null을 준다', () => {
  resetRegistry()
  assert.equal(getTower('없음'), null)
  assert.equal(getEnemy('없음'), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 보스 능력 / 필살기 레지스트리
// ─────────────────────────────────────────────────────────────────────────────

/** 검증을 통과하는 최소 필살기 */
const special = (over = {}) => ({
  id: 'sp1', name: '테스트기', order: 1, desc: '설명', icon: '💥',
  cooldown: 30, mana: 40, catnip: 10, run() { return {} },
  ...over,
})

test('registerEnemyAbility: 훅이 하나도 없으면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerEnemyAbility('x', {}), ContentError)
  assert.throws(() => registerEnemyAbility('x', {}), /onSpawn/)
  assert.doesNotThrow(() => registerEnemyAbility('ok', { onTick() {} }))
})

test('registerEnemyAbility: 같은 kind를 두 번 등록하면 ContentError를 던진다', () => {
  resetRegistry()
  registerEnemyAbility('regen', { onTick() {} })
  assert.throws(() => registerEnemyAbility('regen', { onTick() {} }), /id 중복/)
})

test('validateAll: 적이 등록되지 않은 능력을 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerEnemy(enemy({ id: 'e2', abilities: [{ kind: 'burn' }] }))
  assert.throws(() => validateAll(), /registerEnemyAbility\('burn'/)
})

test('validateAll: 소환 능력이 없는 적을 부르면 잡아낸다', () => {
  seedValid()
  registerEnemyAbility('summon', { onTick() {} })
  registerEnemy(enemy({ id: 'e3', abilities: [{ kind: 'summon', enemyId: '없는부하' }] }))
  assert.throws(() => validateAll(), /없는부하/)
})

test('registerEnemy: abilities가 배열이 아니거나 kind가 없으면 ContentError를 던진다', () => {
  resetRegistry()
  assert.throws(() => registerEnemy(enemy({ abilities: 'regen' })), /abilities/)
  assert.throws(() => registerEnemy(enemy({ abilities: ['regen'] })), /kind/)
})

test('registerSpecial: 필수 필드와 run 함수를 검사한다', () => {
  resetRegistry()
  assert.throws(() => registerSpecial(special({ icon: undefined })), /icon/)
  assert.throws(() => registerSpecial(special({ cooldown: 0 })), /cooldown/)
  // 마나 비용을 빼먹으면 조용히 0원 필살기가 되므로 등록 단계에서 막는다
  assert.throws(() => registerSpecial(special({ mana: undefined })), /mana/)
  assert.throws(() => registerSpecial(special({ mana: -5 })), /mana/)
  assert.throws(() => registerSpecial(special({ run: '함수아님' })), /run/)
  assert.doesNotThrow(() => registerSpecial(special()))
  assert.throws(() => registerSpecial(special()), /id 중복/)
})

test('listSpecials: order 순으로 정렬해서 준다', () => {
  resetRegistry()
  registerSpecial(special({ id: 'b', order: 2 }))
  registerSpecial(special({ id: 'a', order: 1 }))
  assert.deepEqual(listSpecials().map((s) => s.id), ['a', 'b'])
})
