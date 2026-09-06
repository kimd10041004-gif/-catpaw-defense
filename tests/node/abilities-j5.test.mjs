/**
 * 번개·얼음·빛 보스가 들고 나온 새 능력 셋 — **숫자가 실제로 움직이는지**와
 * 무엇보다 **두 하한이 지켜지는지** 본다.
 *
 * 시뮬레이터로는 못 잰다: 봇은 자리를 안 고르므로 '사거리를 줄인다'가 의미가 없고,
 * '맞을수록 굳는다'는 봇의 고정 화력에 묻힌다. 그래서 엔진을 직접 두드린다.
 *
 * 하한 둘이 이 파일의 핵심이다:
 *   장갑    0 밑으로 안 내려간다 (음수 장갑은 피해를 늘려 '벗기기'가 '증폭'이 된다)
 *   사거리  DAZZLE_FLOOR(0.6) 밑으로 안 내려간다 — 이건 적 능력 중 유일하게
 *           플레이어 쪽 판을 만지므로, 하한이 없으면 '어렵다'가 아니라
 *           '할 수 있는 게 없다'가 된다
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getMap, getEnemy, listEnemies, getEnemyAbility } from '../../web/js/content/registry.js'
import { Game, DAZZLE_FLOOR } from '../../web/js/game.js'
import { ELEMENTS } from '../../web/js/domain/elements.js'

const newGame = (o = {}) => new Game({ mapDef: getMap('alley'), ...o })

/** 능력 하나만 든 적을 만든다 — 다른 능력이 섞이면 무엇이 움직였는지 못 가린다 */
function withAbility(g, baseId, ability, over = {}) {
  const e = g._createEnemy(baseId, { hp: 100000, ...over })
  e.def = { ...e.def, abilities: [ability] }
  return e
}

/**
 * 능력 훅을 직접 돌린다. game 의 틱을 통째로 돌리면 이동·지속피해·웨이브가 섞여
 * 무엇이 움직였는지 못 가린다. game.js 의 디스패치와 같은 모양이다.
 */
function run(g, e, hook, arg) {
  let out
  for (const ab of e.def.abilities || []) {
    const h = getEnemyAbility(ab.kind)
    if (h && h[hook]) out = h[hook](g._abilityCtx(), ab, e, arg)
  }
  return out
}

/** 오라는 스텝마다 초기화된다(game.js 의 규약) — 그 순서를 그대로 흉내낸다 */
function tick(g, e, dt = 0.1) {
  for (const en of g.enemies) { en.auraArmor = 0; en.auraSpeed = 1 }
  e.auraArmor = 0; e.auraSpeed = 1
  run(g, e, 'onTick', dt)
}

// ── 순간이동 (번개) ──────────────────────────────────────────────────────────

test('blink: 주기가 차면 길을 앞으로 건너뛴다', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'blink', every: 1, tiles: 2 })
  e.progress = 3

  tick(g, e, 0.5)
  assert.equal(e.progress, 3, '주기 전에 움직였다')

  tick(g, e, 0.6)               // 누적 1.1초 ≥ 1
  assert.equal(e.progress, 5, '건너뛰지 않았다')

  tick(g, e, 0.5)
  assert.equal(e.progress, 5, '주기가 초기화되지 않았다')
})

test('blink: below 를 주면 체력이 그 아래일 때만 건너뛴다', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'blink', every: 1, tiles: 2, below: 0.5 })
  e.progress = 3
  e.hp = e.maxHp                                  // 100%

  tick(g, e, 1.2)
  assert.equal(e.progress, 3, '체력이 높은데 건너뛰었다')

  e.hp = e.maxHp * 0.4
  tick(g, e, 1.2)
  assert.equal(e.progress, 5, '체력이 낮은데 안 건너뛰었다')
})

test('blink: 앞으로만 간다 — 뒤로 밀린 적이 이걸로 되돌아오지 않는다', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'blink', every: 1, tiles: 2 })
  e.progress = 10
  g.knockback(e, 3, 1)
  const pushed = e.progress
  assert.ok(pushed < 10, '넉백이 안 먹었다')
  tick(g, e, 1.2)
  assert.ok(e.progress > pushed, 'blink 가 앞으로 안 갔다')
})

// ── 굳기 (얼음) ─────────────────────────────────────────────────────────────

test('harden: 맞을수록 장갑이 오르고 상한에서 멈춘다', () => {
  const g = newGame()
  const ab = { kind: 'harden', perHit: 2, max: 6, decay: 3 }
  const e = withAbility(g, 'mouse', ab)
  const base = e.def.armor

  tick(g, e)
  assert.equal(g.armorOf(e), base, '안 맞았는데 굳었다')

  run(g, e, 'onDamaged', 10)
  tick(g, e)
  assert.equal(g.armorOf(e), base + 2)

  for (let i = 0; i < 10; i += 1) run(g, e, 'onDamaged', 10)
  tick(g, e)
  assert.equal(g.armorOf(e), base + 6, `상한 ${ab.max} 을 넘었다`)
})

test('harden: 안 맞으면 통째로 풀린다 (조금씩 깎이지 않는다)', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'harden', perHit: 2, max: 6, decay: 3 })
  const base = e.def.armor
  run(g, e, 'onDamaged', 10)
  run(g, e, 'onDamaged', 10)
  tick(g, e)
  assert.equal(g.armorOf(e), base + 4)

  g.time += 3.1
  tick(g, e)
  assert.equal(g.armorOf(e), base, '풀리지 않았다')

  // 다시 맞으면 처음부터 쌓인다
  run(g, e, 'onDamaged', 10)
  tick(g, e)
  assert.equal(g.armorOf(e), base + 2, '풀린 뒤 다시 안 쌓인다')
})

test('harden: onDamaged 가 피해를 바꾸지 않는다 (보호막이 아니다)', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'harden', perHit: 2, max: 6, decay: 3 })
  const out = run(g, e, 'onDamaged', 100)
  assert.ok(out === undefined || out === 100, `피해를 ${out} 로 바꿨다`)
})

test('harden: 장갑을 통과하는 한 방(truestrike)은 굳기와 무관하게 들어간다', () => {
  const g = newGame()
  const e = withAbility(g, 'mouse', { kind: 'harden', perHit: 5, max: 20, decay: 5 })
  for (let i = 0; i < 6; i += 1) run(g, e, 'onDamaged', 1)
  tick(g, e)
  assert.ok(g.armorOf(e) >= 20, `굳기가 안 쌓였다 (${g.armorOf(e)})`)

  const before = e.hp
  g.applyDamage(e, 50, { ignoreArmor: true, canCrit: false })
  assert.equal(before - e.hp, 50, '장갑 통과가 굳기에 막혔다')
})

// ── 눈부심 (빛) ─────────────────────────────────────────────────────────────

/** 타워 하나를 지어 돌려준다 */
function placeTower(g, id = 'cheese') {
  g.gold = 99999
  for (let r = 0; r < g.mapDef.rows; r += 1) {
    for (let c = 0; c < g.mapDef.cols; c += 1) {
      g.placeTower(c, r, id)
      const t = g.towerAt(c, r)
      if (t) return t
    }
  }
  assert.fail('타워를 놓을 자리를 못 찾았다')
  return null
}

test('dazzle: 사거리가 줄었다가 저절로 돌아온다', () => {
  const g = newGame()
  const t = placeTower(g)
  const base = g.rangeOf(t)
  assert.ok(base > 0)

  g.dazzle(t, 0.8, 2)
  assert.ok(Math.abs(g.rangeOf(t) - base * 0.8) < 1e-9, `사거리가 ${g.rangeOf(t)}`)

  g.time += 2.1
  assert.equal(g.rangeOf(t), base, '지속 시간이 지났는데 안 돌아왔다')
})

test('dazzle: DAZZLE_FLOOR 밑으로는 절대 안 내려간다', () => {
  const g = newGame()
  const t = placeTower(g)
  const base = g.rangeOf(t)

  g.dazzle(t, 0.01, 5)                    // 터무니없는 값을 넣어도
  assert.ok(g.rangeOf(t) >= base * DAZZLE_FLOOR - 1e-9,
    `하한을 뚫었다: ${g.rangeOf(t)} < ${base * DAZZLE_FLOOR}`)

  // 여러 번 겹쳐도 마찬가지 — 보스 둘이 겹치면 곱해져 0 에 수렴하면 안 된다
  for (let i = 0; i < 20; i += 1) g.dazzle(t, 0.5, 5)
  assert.ok(g.rangeOf(t) >= base * DAZZLE_FLOOR - 1e-9,
    `겹쳐서 하한을 뚫었다: ${g.rangeOf(t)}`)
})

test('dazzle: 겹치면 더 센 쪽이 남는다 (곱해지지 않는다)', () => {
  const g = newGame()
  const t = placeTower(g)
  const base = g.rangeOf(t)

  g.dazzle(t, 0.9, 5)
  g.dazzle(t, 0.7, 5)
  assert.ok(Math.abs(g.rangeOf(t) - base * 0.7) < 1e-9, `${g.rangeOf(t)} — 곱해졌다`)

  g.dazzle(t, 0.95, 5)                    // 약한 것은 센 것을 못 덮는다
  assert.ok(Math.abs(g.rangeOf(t) - base * 0.7) < 1e-9, '약한 눈부심이 센 것을 덮었다')
})

test('dazzle: 줄어든 사거리로 실제 조준이 좁아진다 (표시만 바뀌는 게 아니다)', () => {
  const g = newGame()
  const t = placeTower(g)
  const base = g.rangeOf(t)

  // 사거리 경계 바로 안쪽에 적을 둔다
  const e = g._createEnemy('mouse', { hp: 100000 })
  e.x = t.x + base * 0.95
  e.y = t.y
  assert.ok(g.towersInRadius(e.x, e.y, base).includes(t), '픽스처 전제: 타워가 반경 안에 있다')

  g.dazzle(t, DAZZLE_FLOOR, 5)
  assert.ok(g.rangeOf(t) < base * 0.95, '조준에 쓰는 사거리가 안 줄었다')
})

test('dazzle: towersInRadius 가 거리로만 고른다 (비행 판정에 안 걸린다)', () => {
  const g = newGame()
  const t = placeTower(g)
  assert.deepEqual(g.towersInRadius(t.x, t.y, 0.01), [t])
  assert.deepEqual(g.towersInRadius(t.x + 999, t.y, 1), [])
})

// ── 속성 균형 (이 작업의 이유) ───────────────────────────────────────────────

test('속성: 여섯 속성이 전부 보스를 갖는다 (덱을 고를 이유가 있다)', () => {
  const byElement = new Map(ELEMENTS.map((e) => [e, 0]))
  for (const e of listEnemies()) {
    if (!e.boss) continue
    byElement.set(e.element, (byElement.get(e.element) || 0) + 1)
  }
  const empty = [...byElement].filter(([, n]) => n === 0).map(([e]) => e)
  assert.deepEqual(empty, [],
    `보스가 없는 속성: ${empty.join(', ')} — 그 속성을 이기는 고양이는 보스전에서 고를 이유가 없다`)
})

test('속성: 모든 고양이 속성이 강하게 나갈 보스를 갖는다', () => {
  const bossOf = new Map(ELEMENTS.map((e) => [e, 0]))
  for (const e of listEnemies()) if (e.boss) bossOf.set(e.element, bossOf.get(e.element) + 1)
  for (const [i, el] of ELEMENTS.entries()) {
    const prey = ELEMENTS[(i + 1) % ELEMENTS.length]
    assert.ok(bossOf.get(prey) > 0,
      `${el} 고양이가 강하게 나갈 보스가 없다 (${prey} 보스 0마리)`)
  }
})

test('새 보스 셋: 기존 보스의 1등 기록을 안 뺏는다', () => {
  const NEW = ['boltearwig', 'frostworm', 'glowpigeon']
  const bosses = listEnemies().filter((e) => e.boss)
  const old = bosses.filter((b) => !NEW.includes(b.id))
  const fresh = bosses.filter((b) => NEW.includes(b.id))
  assert.equal(fresh.length, 3, '새 보스 셋이 다 등록되지 않았다')

  const best = (list, k) => Math.max(...list.map((b) => b[k] || 0))
  for (const k of ['baseHp', 'armor', 'gold', 'speed', 'livesCost']) {
    assert.ok(best(fresh, k) < best(old, k) + 1e-9,
      `새 보스가 ${k} 1등을 뺏었다 (새 ${best(fresh, k)} vs 기존 ${best(old, k)})`)
  }
})

test('새 보스 셋: 그림이 없어도 벡터로 그려진다 (sprite 가 있다)', () => {
  for (const id of ['boltearwig', 'frostworm', 'glowpigeon']) {
    const d = getEnemy(id)
    assert.ok(d, `${id} 가 등록되지 않았다`)
    assert.ok(d.sprite, `${id} 에 sprite 가 없어 그림이 없으면 안 그려진다`)
    assert.ok(d.abilities && d.abilities.length > 0, `${id} 에 능력이 없다`)
  }
})

// ── 지도 아트 (온실을 넣다가 드러난 잠복 버그) ────────────────────────────────

test('지도 아트: 맵의 art 필드가 실제로 풀린다 (검증만 통과하고 끝나지 않는다)', async () => {
  const { getMapArt, listMaps } = await import('../../web/js/content/registry.js')
  /* 전에는 맵 id 로만 찾아서, 다른 맵의 아트를 빌리는 맵(art: 'rooftop')은
   * 질감 없이 테마 단색만 나왔다. 자유 맵 여섯은 id 와 아트 키가 같아 안 드러났고,
   * 원정 맵은 자유 목록 밖이라 스모크도 못 봤다. */
  for (const m of listMaps({ mode: 'all' })) {
    const art = getMapArt(m.id)
    assert.ok(art, `맵 '${m.id}' 의 지도 아트가 안 풀린다 (art: ${m.art || '없음'})`)
    assert.ok(art.path && art.floor, `맵 '${m.id}' 의 길·바닥 질감이 비었다`)
  }
})
