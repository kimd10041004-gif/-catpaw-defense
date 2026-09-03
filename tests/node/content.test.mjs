/**
 * 실제 게임 콘텐츠 통합 검증.
 * 새 고양이·적·맵을 추가한 뒤 이 파일이 초록이면 게임이 부팅된다고 봐도 된다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import {
  validateAll, listTowers, listEnemies, listMaps, getEnemy, getWaveSet, nextMapId,
} from '../../web/js/content/registry.js'
import { buildWave, waveCount } from '../../web/js/domain/waves.js'
import { buildPath, buildableCount } from '../../web/js/domain/path.js'
import { totalInvested, sellValue, upgradeCost, maxLevel } from '../../web/js/domain/economy.js'

test('validateAll: 실제 콘텐츠 전체가 참조 무결성을 통과한다', () => {
  const summary = validateAll()
  assert.ok(summary.towers >= 5, `타워 ${summary.towers}종`)
  assert.ok(summary.enemies >= 6, `적 ${summary.enemies}종`)
  assert.ok(summary.maps >= 3, `맵 ${summary.maps}종`)
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

test('웨이브: standard30의 30웨이브가 모두 스폰 스케줄로 만들어진다', () => {
  const table = getWaveSet('standard30')
  assert.equal(waveCount(table), 30)
  for (let w = 1; w <= 30; w += 1) {
    const wave = buildWave(table, w, { getEnemy })
    assert.ok(wave.count > 0, `${w}웨이브 스폰 수`)
    assert.ok(wave.totalHp > 0, `${w}웨이브 총 체력`)
  }
})

test('웨이브: 웨이브가 진행될수록 총 체력이 우상향한다', () => {
  const table = getWaveSet('standard30')
  const hp = []
  for (let w = 1; w <= 30; w += 1) hp.push(buildWave(table, w, { getEnemy }).totalHp)
  assert.ok(hp[29] > hp[0] * 20, `1웨이브 ${hp[0]} → 30웨이브 ${hp[29]}`)
  // 5웨이브 단위로 보면 항상 증가해야 한다 (국소적 완급은 허용)
  for (let i = 5; i < 30; i += 5) {
    assert.ok(hp[i] > hp[i - 5], `${i + 1}웨이브가 ${i - 4}웨이브보다 세야 한다`)
  }
})

test('웨이브: 보스는 10 / 15 / 20 / 25 / 30 웨이브에만 나온다', () => {
  const table = getWaveSet('standard30')
  const bossWaves = []
  for (let w = 1; w <= 30; w += 1) {
    if (buildWave(table, w, { getEnemy }).bossCount > 0) bossWaves.push(w)
  }
  assert.deepEqual(bossWaves, [10, 15, 20, 25, 30])
})

test('웨이브: 마지막 웨이브의 보스가 가장 많다', () => {
  const table = getWaveSet('standard30')
  assert.equal(buildWave(table, 30, { getEnemy }).bossCount, 4)
  assert.equal(buildWave(table, 10, { getEnemy }).bossCount, 1)
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
