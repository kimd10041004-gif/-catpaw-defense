import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resetRegistry, registerTower, registerEnemy, registerMap, registerWaveSet,
  registerEffect, registerSprite, registerEnemyAbility, registerSpecial, registerPose,
  registerFrameSet, getFrameSet, listFrameSets,
  registerObjective, registerChapter, getObjective, getChapter, listChapters,
  registerMapArt, registerProp, getMapArt, getProp,
  registerCombo, listCombos, registerPet, registerSpecialCombo,
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
  waypoints: [[0, 0], [8, 0]], tier: 1, hpMul: 1, startGold: 100, startLives: 10,
  waveSet: 'ws1', theme: { ground: '#000' },
  ...over,
})

/** 참조가 모두 성립하는 최소 구성 한 벌 */
function seedValid() {
  resetRegistry()
  registerSprite('cat', () => {})
  registerSprite('rodent', () => {})
  registerEffect('slow', { name: 'slow', describe: () => '', onHit() {} })
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
  assert.throws(() => registerEffect('x', { name: 'x', describe: () => '', onHit: 'fn' }), /onHit 또는 onFire/)
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
    enemyAbilities: 0, specials: 0, poses: 0, frameSets: 0,
    objectives: 0, chapters: 0, mapArt: 0, props: 0, combos: 0, pets: 0, specialCombos: 0,
  })
})

test('validateAll: 등록되지 않은 공격 모션을 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerTower(tower({ id: 't9', pose: '없는모션' }))
  assert.throws(() => validateAll(), /registerPose\('없는모션'/)
})

test('registerCombo: 형식이 틀리면 부팅 때 잡는다', () => {
  resetRegistry()
  const ok = { id: 'c1', name: '삼총사', desc: 'd', towers: ['a', 'b'], shape: 'line', mods: { fireRateMul: 1.2 } }
  assert.doesNotThrow(() => registerCombo({ ...ok }))
  assert.throws(() => registerCombo({ ...ok }), /이미 등록/)
  assert.throws(() => registerCombo({ ...ok, id: 'c2', towers: ['a'] }), /2개 이상/)
  assert.throws(() => registerCombo({ ...ok, id: 'c3', shape: '없는모양' }), /adjacent/)
  assert.throws(() => registerCombo({ ...ok, id: 'c4', mods: null }), /mods 객체/)
  // diagonal 은 두 마리 전용 — 셋을 대각선으로 세우는 건 뜻이 모호하다
  assert.throws(
    () => registerCombo({ ...ok, id: 'c5', shape: 'diagonal', towers: ['a', 'b', 'c'] }),
    /두 마리/)
})

test('validateAll: 조합이 없는 고양이를 가리키면 잡는다', () => {
  seedValid()
  registerCombo({
    id: 'bad', name: '없는조합', desc: 'd',
    towers: ['t1', '없는고양이'], shape: 'adjacent', mods: { damageMul: 1.1 },
  })
  assert.throws(() => validateAll(), /등록되지 않은 고양이 '없는고양이'/)
})

test('registerPet: 형식이 틀리거나 모르는 훅을 쓰면 잡는다', () => {
  resetRegistry()
  const ok = { id: 'p1', name: '햄스터', desc: 'd', price: 0 }
  assert.doesNotThrow(() => registerPet({ ...ok }))
  assert.throws(() => registerPet({ ...ok }), /이미 등록/)
  assert.throws(() => registerPet({ ...ok, id: 'p2', price: -1 }), /0 이상/)
  // 훅을 문자열로 제한한 이유: 임의의 함수를 받으면 두 번째 필살기 시스템이 된다
  assert.throws(() => registerPet({ ...ok, id: 'p3', hook: '아무거나' }), /autoCollect/)
})

test('registerSpecialCombo: 같은 필살기를 두 번 쓰는 건 연계가 아니다', () => {
  resetRegistry()
  const ok = { id: 'l1', name: '연계', desc: 'd', from: 'a', to: 'b', window: 4, bonus: { damageMul: 2 } }
  assert.doesNotThrow(() => registerSpecialCombo({ ...ok }))
  assert.throws(() => registerSpecialCombo({ ...ok, id: 'l2', to: 'a' }), /같은 필살기/)
  assert.throws(() => registerSpecialCombo({ ...ok, id: 'l3', window: 0 }), /0보다 큰/)
  // 보너스를 둘로 제한한 덕에 specials.js 를 안 고쳐도 된다. 모르는 항목은 막는다.
  assert.throws(() => registerSpecialCombo({ ...ok, id: 'l4', bonus: { radiusMul: 2 } }), /모르는 항목/)
  assert.throws(() => registerSpecialCombo({ ...ok, id: 'l5', bonus: {} }), /damageMul/)
})

test('validateAll: 연계가 없는 필살기를 가리키면 잡는다', () => {
  seedValid()
  registerSpecialCombo({
    id: 'bad', name: '연계', desc: 'd',
    from: '없는필살기', to: '또없는것', window: 3, bonus: { damageMul: 2 },
  })
  assert.throws(() => validateAll(), /등록되지 않은 필살기 '없는필살기'/)
})

test('registerPose: 이름이 겹치거나 함수가 아니면 ContentError를 던진다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerPose('swing', () => {}))
  assert.throws(() => registerPose('swing', () => {}), /이미 등록/)
  assert.throws(() => registerPose('x', '함수아님'), /드로잉 함수/)
  assert.throws(() => registerPose('', () => {}), /문자열/)
})

/** 검증을 통과하는 최소 프레임셋 */
const frameSet = (over = {}) => ({
  src: 'art/x.png', frames: 5, w: 169, h: 169, body: { cx: 82, cy: 73, h: 107 }, ...over,
})

test('validateAll: 등록되지 않은 프레임셋을 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerTower(tower({ id: 't8', frames: '없는프레임셋' }))
  assert.throws(() => validateAll(), /registerFrameSet\('없는프레임셋'/)
})

test('validateAll: 프레임셋이 맞게 등록돼 있으면 통과하고 개수를 센다', () => {
  seedValid()
  registerFrameSet('cat-x', frameSet())
  registerTower(tower({ id: 't7', frames: 'cat-x' }))
  assert.equal(validateAll().frameSets, 1)
})

test('registerFrameSet: 필수 항목이 빠지면 ContentError를 던진다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerFrameSet('a', frameSet()))
  assert.throws(() => registerFrameSet('a', frameSet()), /이미 등록/)
  assert.throws(() => registerFrameSet('', frameSet()), /문자열/)
  assert.throws(() => registerFrameSet('b', frameSet({ src: '' })), /'src'/)
  assert.throws(() => registerFrameSet('c', frameSet({ frames: 0 })), /'frames'/)
  assert.throws(() => registerFrameSet('d', frameSet({ body: undefined })), /'body'/)
  assert.throws(() => registerFrameSet('e', frameSet({ body: { cx: 1, cy: 1 } })), /'h'/)
  // body 가 프레임보다 크면 좌표 계산이 프레임 밖으로 나간다
  assert.throws(() => registerFrameSet('f', frameSet({ body: { cx: 1, cy: 1, h: 500 } })), /프레임 높이/)
})

test('registerFrameSet: 등록한 정의를 조회할 수 있고 body 는 복사된다', () => {
  resetRegistry()
  const body = { cx: 82, cy: 73, h: 107 }
  registerFrameSet('cat-y', frameSet({ body }))
  body.cx = 999                                  // 원본을 고쳐도 레지스트리는 안 바뀐다
  assert.equal(getFrameSet('cat-y').body.cx, 82)
  assert.equal(getFrameSet('없음'), null)
  assert.deepEqual(listFrameSets().map((f) => f.key), ['cat-y'])
})

test('validateAll: 적이 등록되지 않은 프레임셋을 참조하면 잡아낸다', () => {
  // 적도 타워와 같은 통로를 쓴다. 여기서 안 걸리면 판이 시작된 뒤에야 적이 안 보인다.
  seedValid()
  registerEnemy(enemy({ id: 'e9', frames: '없는프레임셋' }))
  assert.throws(() => validateAll(), /registerFrameSet\('없는프레임셋'/)
})

test('registerEnemy: frames 를 안 줘도 되고, 주면 문자열이어야 한다', () => {
  resetRegistry()
  registerSprite('rodent', () => {})
  assert.doesNotThrow(() => registerEnemy(enemy({ id: 'a' })))
  assert.doesNotThrow(() => registerEnemy(enemy({ id: 'b', frames: 'enemy-x' })))
  assert.throws(() => registerEnemy(enemy({ id: 'c', frames: '' })), /'frames'/)
})

test('registerFrameSet: 크기·그림자 선택 항목도 형식을 본다', () => {
  resetRegistry()
  const fs = (over) => ({ src: 'a.png', frames: 3, w: 209, h: 209, body: { cx: 1, cy: 1, h: 9 }, ...over })
  assert.doesNotThrow(() => registerFrameSet('ok', fs({ hPerR: 1.85, cyPerR: -0.3 })))
  assert.throws(() => registerFrameSet('a', fs({ hPerR: 0 })), /'hPerR'/)
  assert.throws(() => registerFrameSet('b', fs({ shadow: '있음' })), /'shadow'/)
  assert.throws(() => registerFrameSet('c', fs({ shadow: { cy: 1, rx: 1 } })), /'ry'/)
  assert.doesNotThrow(() =>
    registerFrameSet('d', fs({ shadow: { cy: 0.86, rx: 0.88, ry: 0.3, alpha: 0.26 } })))
})

test('registerTower: frames 를 안 줘도 되고, 주면 문자열이어야 한다', () => {
  resetRegistry()
  registerSprite('cat', () => {})
  assert.doesNotThrow(() => registerTower(tower({ id: 'a' })))
  assert.doesNotThrow(() => registerTower(tower({ id: 'b', frames: 'cat-x' })))
  assert.throws(() => registerTower(tower({ id: 'c', frames: '' })), /'frames'/)
  assert.throws(() => registerTower(tower({ id: 'd', frames: 3 })), /'frames'/)
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
  assert.doesNotThrow(() => registerEnemyAbility('ok', { name: 'ok', describe: () => '', onTick() {} }))
})

test('registerEnemyAbility: 같은 kind를 두 번 등록하면 ContentError를 던진다', () => {
  resetRegistry()
  registerEnemyAbility('regen', { name: 'regen', describe: () => '', onTick() {} })
  assert.throws(() => registerEnemyAbility('regen', { name: 'regen', describe: () => '', onTick() {} }), /id 중복/)
})

test('validateAll: 적이 등록되지 않은 능력을 참조하면 추가 방법까지 알려준다', () => {
  seedValid()
  registerEnemy(enemy({ id: 'e2', abilities: [{ kind: 'burn' }] }))
  assert.throws(() => validateAll(), /registerEnemyAbility\('burn'/)
})

test('validateAll: 소환 능력이 없는 적을 부르면 잡아낸다', () => {
  seedValid()
  registerEnemyAbility('summon', { name: 'summon', describe: () => '', onTick() {} })
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

// ── 시나리오 챕터 ─────────────────────────────────────────────
// 챕터는 맵·웨이브셋·목표·보상·컷신 화자를 전부 id 로 가리킨다. 하나라도 어긋나면
// 그 챕터를 눌렀을 때 게임이 죽으므로 부팅 때 전부 걸러야 한다.

/** 검증을 통과하는 최소 챕터 (seedValid 가 만든 't1' / 'e1' / 'm1' / 'w1' 을 쓴다) */
const chapter = (over = {}) => ({
  id: 'ch1', order: 1, title: '첫 밤', mapId: 'm1', waveSet: 'ws1',
  primary: { kind: 'survive' }, bonus: [],
  ...over,
})

/** survive / livesAbove 두 종류만 등록한 상태를 만든다 */
function seedObjectives() {
  registerObjective('survive', { label: () => '버티기', check: (s) => s.cleared === true })
  registerObjective('livesAbove', {
    requires: ['n'], label: (sp) => `목숨 ${sp.n}`, check: (s, sp) => s.livesLeft >= sp.n,
  })
}

test('validateAll: 챕터가 없는 맵/웨이브셋을 가리키면 잡아낸다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({ mapId: '없는맵' }))
  assert.throws(() => validateAll(), /등록되지 않은 맵 '없는맵'/)

  seedValid(); seedObjectives()
  registerChapter(chapter({ waveSet: '없는웨이브셋' }))
  assert.throws(() => validateAll(), /등록되지 않은 웨이브셋 '없는웨이브셋'/)
})

test('validateAll: 등록되지 않은 목표를 가리키면 추가 방법까지 알려준다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({ primary: { kind: '없는목표' } }))
  assert.throws(() => validateAll(), /registerObjective\('없는목표'/)
})

test('validateAll: 목표에 필요한 항목이 빠지면 잡아낸다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({ bonus: [{ kind: 'livesAbove' }] }))   // n 이 없다
  assert.throws(() => validateAll(), /'n'이\(가\) 빠졌습니다/)
})

test('validateAll: 보상 타워와 컷신 화자도 실제로 있어야 한다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({ rewards: { tower: '없는고양이' } }))
  assert.throws(() => validateAll(), /등록되지 않은 타워 '없는고양이'/)

  seedValid(); seedObjectives()
  registerChapter(chapter({ intro: [{ who: '없는캐릭터', text: '안녕' }] }))
  assert.throws(() => validateAll(), /컷신 화자 '없는캐릭터'/)
})

test('validateAll: 챕터 order 가 겹치면 잡아낸다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({ id: 'ch1', order: 1 }))
  registerChapter(chapter({ id: 'ch2', order: 1 }))
  assert.throws(() => validateAll(), /order 1이\(가\) 챕터/)
})

test('validateAll: waveLimit 이 웨이브셋보다 길면 잡아낸다', () => {
  // 조용히 짧아지는 대신 드러내야 한다 — 12장이 최종 보스를 못 만나는 사고가 난다
  seedValid(); seedObjectives()
  registerChapter(chapter({ waveLimit: 99 }))
  assert.throws(() => validateAll(), /waveLimit 99/)
})

test('validateAll: 챕터가 다 맞으면 통과하고 개수를 센다', () => {
  seedValid(); seedObjectives()
  registerChapter(chapter({
    bonus: [{ kind: 'livesAbove', n: 18 }],
    rewards: { catnip: 10, tower: 't1' },
    intro: [{ who: 't1', text: '여긴 내 골목이야.' }, { who: 'e1', text: '오늘부터 우리 거임.' }],
  }))
  const sum = validateAll()
  assert.equal(sum.chapters, 1)
  assert.equal(sum.objectives, 2)
  assert.deepEqual(listChapters().map((c) => c.id), ['ch1'])
})

test('registerChapter: 부 목표는 2개까지만 (별이 3개다)', () => {
  resetRegistry()
  assert.throws(
    () => registerChapter(chapter({ bonus: [{ kind: 'a' }, { kind: 'b' }, { kind: 'c' }] })),
    /0~2개/,
  )
})

test('registerChapter: id 가 겹치면 잡아낸다', () => {
  resetRegistry()
  registerChapter(chapter())
  assert.throws(() => registerChapter(chapter()), /이미 등록/)
  assert.equal(getChapter('ch1').id, 'ch1')
  assert.equal(getChapter('없음'), null)
})

test('registerObjective: label 과 check 가 함수여야 한다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerObjective('x', { label: () => '', check: () => true }))
  assert.throws(() => registerObjective('x', { label: () => '', check: () => true }), /이미 등록/)
  assert.throws(() => registerObjective('y', { check: () => true }), /'label'/)
  assert.throws(() => registerObjective('z', { label: () => '' }), /'check'/)
  assert.equal(getObjective('x').requires.length, 0)
})

// ── 지도 아트 ─────────────────────────────────────────────────
// 길 질감과 소품도 id 로 가리킨다. 어긋나면 그 맵에 들어갔을 때 조용히
// 단색으로 떨어지므로, 부팅 때 잡아서 오타를 알려준다.

test('validateAll: 맵이 등록되지 않은 지도 아트를 가리키면 추가 방법까지 알려준다', () => {
  seedValid()
  registerMap(map({ id: 'm2', art: '없는아트' }))
  assert.throws(() => validateAll(), /registerMapArt\('없는아트'/)
})

test('validateAll: 맵이 등록되지 않은 소품을 가리키면 잡아낸다', () => {
  seedValid()
  registerMap(map({ id: 'm3', props: ['없는소품'] }))
  assert.throws(() => validateAll(), /registerProp\('없는소품'/)
})

test('validateAll: 지도 아트와 소품이 맞으면 통과하고 개수를 센다', () => {
  seedValid()
  registerMapArt('alley', { path: 'art/path-alley.png' })
  registerProp('crate', { src: 'art/prop-crate.png' })
  registerMap(map({ id: 'm4', art: 'alley', props: ['crate'] }))
  const sum = validateAll()
  assert.equal(sum.mapArt, 1)
  assert.equal(sum.props, 1)
})

test('registerMapArt: path 나 floor 중 하나는 있어야 한다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerMapArt('a', { path: 'p.png' }))
  assert.doesNotThrow(() => registerMapArt('b', { floor: 'f.png' }))
  assert.throws(() => registerMapArt('a', { path: 'p.png' }), /이미 등록/)
  assert.throws(() => registerMapArt('c', {}), /path.*floor|floor/)
  assert.throws(() => registerMapArt('d', { path: 3 }), /'path'/)
  assert.equal(getMapArt('a').path, 'p.png')
  assert.equal(getMapArt('없음'), null)
})

test('registerProp: src 가 필요하다', () => {
  resetRegistry()
  assert.doesNotThrow(() => registerProp('crate', { src: 'c.png' }))
  assert.throws(() => registerProp('crate', { src: 'c.png' }), /이미 등록/)
  assert.throws(() => registerProp('x', {}), /'src'/)
  assert.equal(getProp('crate').src, 'c.png')
})

test('registerMap: art 와 props 는 선택이고, 주면 형식을 본다', () => {
  resetRegistry()
  registerWaveSet('ws1', [[['e1', 1, 1, 0]]])
  assert.doesNotThrow(() => registerMap(map({ id: 'a' })))
  assert.doesNotThrow(() => registerMap(map({ id: 'b', art: 'x', props: [] })))
  assert.throws(() => registerMap(map({ id: 'c', art: '' })), /'art'/)
  assert.throws(() => registerMap(map({ id: 'd', props: 'crate' })), /'props'/)
})

test('registerEffect / registerEnemyAbility: 화면 설명(name·describe)이 없으면 등록되지 않는다', () => {
  resetRegistry()
  assert.throws(() => registerEffect('nodesc', { onHit() {} }), /name/)
  assert.throws(() => registerEffect('nodesc', { name: '이름만', onHit() {} }), /describe/)
  assert.throws(() => registerEnemyAbility('nodesc', { onTick() {} }), /name/)
})
