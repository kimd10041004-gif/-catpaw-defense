/**
 * 실제 게임 콘텐츠 통합 검증.
 * 새 고양이·적·맵을 추가한 뒤 이 파일이 초록이면 게임이 부팅된다고 봐도 된다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import {
  validateAll, listTowers, listEnemies, listMaps, listSpecials, listWaveSets,
  getEnemy, getWaveSet, nextMapId, getEnemyAbility,
} from '../../web/js/content/registry.js'
import { buildWave, waveCount } from '../../web/js/domain/waves.js'
import { buildPath, buildableCount } from '../../web/js/domain/path.js'
import { totalInvested, sellValue, upgradeCost, maxLevel } from '../../web/js/domain/economy.js'
import { MANA_MAX, MANA_START, MANA_PER_KILL, MANA_PER_WAVE_CLEAR } from '../../web/js/domain/mana.js'

test('validateAll: 실제 콘텐츠 전체가 참조 무결성을 통과한다', () => {
  const summary = validateAll()
  assert.ok(summary.towers >= 5, `타워 ${summary.towers}종`)
  assert.ok(summary.enemies >= 10, `적 ${summary.enemies}종`)
  assert.ok(summary.maps >= 4, `맵 ${summary.maps}종`)
  assert.ok(summary.enemyAbilities >= 6, `보스 능력 ${summary.enemyAbilities}종`)
  assert.ok(summary.specials >= 4, `필살기 ${summary.specials}종`)
})

test('맵: 3개 모두 경로가 성립하고 지을 자리가 충분하다', () => {
  for (const m of listMaps()) {
    const p = buildPath(m)
    assert.ok(p.lengthTiles > 20, `${m.name} 경로 길이 ${p.lengthTiles}`)
    assert.ok(buildableCount(m, p) > 40, `${m.name} 건설 가능 타일 ${buildableCount(m, p)}`)
  }
})

test('맵: 뒤로 갈수록 난이도가 높아지고 마지막 맵 다음은 없다', () => {
  const maps = listMaps()
  for (let i = 1; i < maps.length; i += 1) {
    assert.ok(maps[i].difficulty > maps[i - 1].difficulty, `${maps[i].name} 난이도`)
  }
  assert.equal(nextMapId(maps[maps.length - 1].id), null)
  assert.equal(nextMapId(maps[0].id), maps[1].id)
})

// ─────────────────────────────────────────────────────────────────────────────
// 웨이브셋 — 등록된 전부를 같은 기준으로 검사한다.
//
// 예전엔 standard30 만 하드코딩해서 봤다. 맵마다 전용 셋을 만들면서 그러면 새 셋
// 넷이 아무 검사도 안 받게 되므로, 레지스트리를 순회하도록 바꿨다.
//
// 기준이 둘로 갈린다:
//   모든 셋       스폰 생성 · 5웨이브 간격 증가 · 적 3종 이상 · 마지막 웨이브 보스 최다
//   30웨이브 셋   그 위에 보스 자리(10·15·20·25·30) · 끝/처음 20배 · 등급 사다리
// 시나리오 전용 셋(airborne12·bossrush10·swarm14)은 일부러 다른 모양이라
// 30웨이브 계약을 강요하면 안 된다 — 12웨이브짜리가 20배로 자랄 수는 없다.
// ─────────────────────────────────────────────────────────────────────────────

/** 웨이브셋 하나를 웨이브별로 펼친다 */
const spreadWaves = (table) => {
  const n = waveCount(table)
  const out = []
  for (let w = 1; w <= n; w += 1) out.push(buildWave(table, w, { getEnemy }))
  return out
}

test('웨이브: 등록된 모든 웨이브셋이 웨이브마다 스폰을 만든다', () => {
  const sets = listWaveSets()
  assert.ok(sets.length >= 6, `웨이브셋 ${sets.length}종`)
  for (const { id, table } of sets) {
    for (const [i, wave] of spreadWaves(table).entries()) {
      assert.ok(wave.count > 0, `${id} ${i + 1}웨이브 스폰 수`)
      assert.ok(wave.totalHp > 0, `${id} ${i + 1}웨이브 총 체력`)
    }
  }
})

test('웨이브: 모든 웨이브셋이 5웨이브 간격으로 세진다', () => {
  for (const { id, table } of listWaveSets()) {
    const hp = spreadWaves(table).map((w) => w.totalHp)
    // 국소적 완급은 허용하되 5웨이브 간격으로는 반드시 올라야 한다
    for (let i = 5; i < hp.length; i += 5) {
      assert.ok(hp[i] > hp[i - 5],
        `${id}: ${i + 1}웨이브(${hp[i]})가 ${i - 4}웨이브(${hp[i - 5]})보다 세야 한다`)
    }
  }
})

test('웨이브: 모든 웨이브셋에 적이 3종 이상 나온다 (한 종류만 나오는 셋 금지)', () => {
  for (const { id, table } of listWaveSets()) {
    const types = new Set()
    for (const w of spreadWaves(table)) for (const s2 of w.spawns) types.add(s2.enemyId)
    assert.ok(types.size >= 3, `${id}: ${types.size}종 (${[...types]})`)
  }
})

test('웨이브: 모든 웨이브셋에서 최종 보스는 마지막 웨이브에만 나온다', () => {
  for (const { id, table } of listWaveSets()) {
    const waves = spreadWaves(table)
    waves.forEach((w, i) => {
      const hasFinal = w.spawns.some((s2) => s2.enemyId === 'demonking')
      if (i < waves.length - 1) assert.equal(hasFinal, false, `${id} ${i + 1}웨이브`)
    })
  }
})

test('웨이브: 모든 웨이브셋에서 마지막 웨이브의 보스가 가장 많다', () => {
  for (const { id, table } of listWaveSets()) {
    const boss = spreadWaves(table).map((w) => w.bossCount)
    assert.equal(boss[boss.length - 1], Math.max(...boss), `${id} 보스 수 ${boss}`)
  }
})

/** 자유 모드 맵이 쓰는 30웨이브 계열 (시나리오 전용 셋은 일부러 모양이 다르다) */
const standardSets = () => listWaveSets().filter(({ table }) => waveCount(table) === 30)

test('웨이브: 30웨이브 셋은 보스가 10 / 15 / 20 / 25 / 30 에만 나온다', () => {
  const sets = standardSets()
  assert.ok(sets.length >= 5, `30웨이브 셋 ${sets.length}종`)
  for (const { id, table } of sets) {
    const bossWaves = spreadWaves(table)
      .map((w, i) => (w.bossCount > 0 ? i + 1 : null)).filter(Boolean)
    assert.deepEqual(bossWaves, [10, 15, 20, 25, 30], id)
  }
})

test('웨이브: 30웨이브 셋은 끝이 처음보다 20배 이상 세다', () => {
  for (const { id, table } of standardSets()) {
    const hp = spreadWaves(table).map((w) => w.totalHp)
    assert.ok(hp[29] > hp[0] * 20, `${id}: 1웨이브 ${hp[0]} → 30웨이브 ${hp[29]}`)
  }
})

test('웨이브: 30웨이브 셋은 마지막 웨이브에 보스가 4마리 이상이다', () => {
  for (const { id, table } of standardSets()) {
    assert.ok(buildWave(table, 30, { getEnemy }).bossCount >= 4, id)
    assert.equal(buildWave(table, 10, { getEnemy }).bossCount, 1, id)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 고등급 보스 · 보스 능력 · 필살기
// ─────────────────────────────────────────────────────────────────────────────

/** 특정 웨이브에 등장하는 적 id 집합 */
const enemiesAt = (waveSetId, waveNo) =>
  new Set(buildWave(getWaveSet(waveSetId), waveNo, { getEnemy }).spawns.map((s) => s.enemyId))

test('보스: 30웨이브 셋 전부에서 갈수록 높은 등급의 보스가 나온다 (사다리)', () => {
  for (const { id } of standardSets()) {
    const tierAt = (w) => Math.max(...[...enemiesAt(id, w)]
      .map((eid) => (getEnemy(eid).boss ? getEnemy(eid).tier || 1 : 0)))
    assert.equal(tierAt(10), 1, `${id} 10웨이브는 1등급 보스`)
    assert.equal(tierAt(15), 2, `${id} 15웨이브는 2등급 보스`)
    assert.equal(tierAt(20), 2, id)
    assert.equal(tierAt(25), 2, id)
    assert.equal(tierAt(30), 3, `${id} 30웨이브는 최종 보스`)
  }
})

test('보스: 모든 보스가 최소 하나의 능력을 갖는다 (체력만 많은 보스는 없다)', () => {
  for (const e of listEnemies().filter((x) => x.boss)) {
    assert.ok(Array.isArray(e.abilities) && e.abilities.length > 0, `${e.name}의 능력`)
    for (const ab of e.abilities) {
      assert.notEqual(getEnemyAbility(ab.kind), null, `${e.name}의 '${ab.kind}' 능력이 등록돼야 한다`)
    }
  }
})

test('보스: 등급이 높을수록 능력이 많고 뚫렸을 때 더 아프다', () => {
  const byTier = (t) => listEnemies().filter((e) => e.boss && (e.tier || 1) === t)
  const t1 = byTier(1)[0]
  const t3 = byTier(3)[0]
  assert.ok(t3.abilities.length > t1.abilities.length, '최종 보스가 능력이 더 많아야 한다')
  assert.ok(t3.livesCost > t1.livesCost, '최종 보스가 목숨을 더 많이 앗아가야 한다')
  assert.ok(t3.baseHp > t1.baseHp * 3, '최종 보스가 훨씬 두꺼워야 한다')
})

test('보스 능력: 소환·분열이 가리키는 부하가 실제로 등록돼 있다', () => {
  for (const e of listEnemies()) {
    for (const ab of e.abilities || []) {
      if (ab.enemyId) {
        assert.notEqual(getEnemy(ab.enemyId), null, `${e.name}이 부르는 '${ab.enemyId}'`)
      }
    }
  }
})

test('보스 능력: 분열체는 다시 분열하지 않는다 (거듭제곱 폭주 방지)', () => {
  const split = getEnemyAbility('split')
  const spawned = []
  const ctx = {
    spawnMinion: (id, opts) => { spawned.push({ id, ...opts }); return {} },
    addFloater: () => {}, spawnParticle: () => {}, playSfx: () => {},
  }
  const ab = { kind: 'split', enemyId: 'roach', count: 3, hpMul: 0.5 }

  split.onDeath(ctx, ab, { progress: 5, x: 0, y: 0, noSplit: false })
  assert.equal(spawned.length, 3, '원본은 정상적으로 쪼개져야 한다')
  assert.ok(spawned.every((m) => m.noSplit === true),
    '쪼개져 나온 개체에는 전부 noSplit 표시가 붙어야 한다')

  // 표시가 붙은 개체가 죽어도 더는 쪼개지지 않는다.
  // 이게 없으면 enemyId 를 자기 자신으로 적는 순간 count 의 거듭제곱으로 늘어난다.
  spawned.length = 0
  split.onDeath(ctx, ab, { progress: 5, x: 0, y: 0, noSplit: true })
  assert.equal(spawned.length, 0, '분열체가 또 분열하면 게임이 멈춘다')
})

test('악몽의 다락방: 보스가 훨씬 자주 나오는 별도 웨이브 구성을 쓴다', () => {
  const attic = listMaps().find((m) => m.id === 'attic')
  assert.equal(attic.waveSet, 'nightmare20')
  const table = getWaveSet('nightmare20')
  assert.equal(waveCount(table), 20)

  let bossWaves = 0
  for (let w = 1; w <= 20; w += 1) {
    if (buildWave(table, w, { getEnemy }).bossCount > 0) bossWaves += 1
  }
  assert.ok(bossWaves >= 8, `보스 웨이브 ${bossWaves}개는 20웨이브 중 8개 이상이어야 한다`)
  assert.equal(enemiesAt('nightmare20', 20).has('demonking'), true, '마지막은 최종 보스')
})

test('필살기: 전부 마나 비용·쿨다운·캣닢 가격을 갖고 실행 가능한 함수다', () => {
  const specials = listSpecials()
  assert.ok(specials.length >= 4)
  for (const sp of specials) {
    // 진짜 관문은 마나다. 쿨다운은 같은 필살기를 연타하지 못하게 막는 역할만 한다.
    assert.ok(sp.mana > 0, `${sp.name}에 마나 비용이 없다 — 공짜 필살기가 된다`)
    assert.ok(sp.mana <= MANA_MAX, `${sp.name} 비용 ${sp.mana}는 최대 마나 ${MANA_MAX}를 넘어 영원히 못 쓴다`)
    assert.ok(sp.cooldown >= 10, `${sp.name} 쿨다운 ${sp.cooldown}초는 연타를 막기엔 너무 짧다`)
    assert.ok(sp.catnip > 0, `${sp.name}의 캣닢 가격`)
    assert.equal(typeof sp.run, 'function')
    assert.equal(typeof sp.icon, 'string')
  }
})

test('필살기: 마나 경제로 실제로 돌아간다 (전부 쓸 수 있고, 한 번에 다 쓸 순 없다)', () => {
  const specials = listSpecials()
  const cheapest = Math.min(...specials.map((s) => s.mana))
  const total = specials.reduce((a, s) => a + s.mana, 0)

  assert.ok(cheapest <= MANA_START,
    `가장 싼 필살기가 ${cheapest}인데 시작 마나는 ${MANA_START} — 첫 판에 아무것도 못 쓴다`)
  assert.ok(total > MANA_MAX,
    `전부 합쳐 ${total}인데 최대 마나가 ${MANA_MAX} — 가득 차면 전부 한 번에 쏟을 수 있어 선택이 사라진다`)

  // 중반 웨이브(적 20마리) 수입으로 필살기 하나는 나와야 페이스가 유지된다
  const perWave = 20 * MANA_PER_KILL + MANA_PER_WAVE_CLEAR
  assert.ok(perWave >= cheapest,
    `웨이브 수입 ${perWave}로는 가장 싼 필살기(${cheapest})조차 못 채운다`)
})

test('필살기: id와 순서가 겹치지 않는다', () => {
  const specials = listSpecials()
  assert.equal(new Set(specials.map((s) => s.id)).size, specials.length)
  assert.equal(new Set(specials.map((s) => s.order)).size, specials.length)
})

test('적: 공중 유닛과 중장갑 유닛이 최소 하나씩 있어 타워 선택이 강제된다', () => {
  const enemies = listEnemies()
  assert.ok(enemies.some((e) => e.flying), '공중 적이 있어야 한다')
  assert.ok(enemies.some((e) => e.armor >= 8), '중장갑 적이 있어야 한다')
  assert.ok(enemies.some((e) => e.boss && e.livesCost > 1), '보스는 목숨을 더 앗아가야 한다')
})

test('타워: 지상 전용이 최소 하나 있어 공중 대응을 고민하게 만든다', () => {
  assert.ok(listTowers().some((t) => t.targets === 'ground'))
})

test('타워: 레벨이 오를수록 초당 피해량이 증가한다', () => {
  for (const t of listTowers()) {
    for (let i = 1; i < t.levels.length; i += 1) {
      const prev = t.levels[i - 1].damage * t.levels[i - 1].fireRate
      const cur = t.levels[i].damage * t.levels[i].fireRate
      assert.ok(cur > prev, `${t.name} 레벨 ${i + 1}의 DPS가 더 높아야 한다`)
    }
  }
})

test('타워: 모든 고양이가 적어도 한 축에서 1등이다 (존재 이유가 없는 고양이 금지)', () => {
  const towers = listTowers()
  const last = (t) => t.levels[t.levels.length - 1]
  const dps = (t) => last(t).damage * last(t).fireRate
  const kinds = (t) => new Set(t.levels.flatMap((lv) => (lv.effects || []).map((e) => e.kind)))

  // 어떤 kind 를 가진 고양이가 몇 마리인지
  const kindCount = new Map()
  for (const t of towers) for (const k of kinds(t)) kindCount.set(k, (kindCount.get(k) || 0) + 1)

  const best = (pick) => Math.max(...towers.map(pick))
  const cheapest = Math.min(...towers.map((t) => t.levels[0].cost))

  for (const t of towers) {
    const axes = []
    if (t.levels[0].cost === cheapest) axes.push('가장 싸다')
    if (last(t).range === best((x) => last(x).range)) axes.push('사거리 최장')
    if (last(t).damage === best((x) => last(x).damage)) axes.push('한 방 최대')
    if (dps(t) === best(dps)) axes.push('초당 피해 최대')
    for (const k of kinds(t)) if (kindCount.get(k) === 1) axes.push(`${k} 유일`)
    // 광역을 나눠 갖는 삼색냥/뚱냥처럼 kind 로만은 안 갈리는 경우를 위해 가격 축을 하나 더 둔다
    const areaTowers = towers.filter((x) => kinds(x).has('splash') || kinds(x).has('aura'))
    if (areaTowers.length > 1 && areaTowers.includes(t)
        && t.levels[0].cost === Math.min(...areaTowers.map((x) => x.levels[0].cost))) {
      axes.push('가장 싼 광역')
    }
    assert.ok(axes.length > 0,
      `${t.name}이 어느 축에서도 1등이 아니다 — 이 고양이를 고를 이유가 없다`)
  }
})

test('타워: 만렙까지 경제 계산이 성립하고 판매금은 항상 투자금보다 적다', () => {
  for (const t of listTowers()) {
    const top = maxLevel(t)
    assert.equal(upgradeCost(t, top), null, `${t.name} 만렙에서는 업그레이드가 없어야 한다`)
    assert.ok(sellValue(t, top) < totalInvested(t, top), `${t.name} 판매금`)
    assert.ok(totalInvested(t, top) > totalInvested(t, 1))
  }
})

test('타워: 중장갑(방어 8)을 뚫을 수 있는 고양이가 존재한다', () => {
  const heaviest = Math.max(...listEnemies().map((e) => e.armor))
  const canPierce = listTowers().some((t) => t.levels[0].damage > heaviest * 2)
  assert.ok(canPierce, `방어력 ${heaviest}를 1레벨부터 확실히 뚫는 타워가 있어야 한다`)
})
