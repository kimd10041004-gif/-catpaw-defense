/**
 * 헤드리스 Game 검사 — game.js 는 DOM 을 안 쓰므로 실제 콘텐츠로 그대로 돌린다.
 * (balance-sim.mjs 가 쓰는 것과 같은 방식. 여기서는 한 판을 돌리지 않고 순간을 본다.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getMap, getEnemy } from '../../web/js/content/registry.js'
import { Game } from '../../web/js/game.js'
import { buildWave } from '../../web/js/domain/waves.js'

const newGame = (o = {}) => new Game({ mapDef: getMap('alley'), ...o })

/** 길 옆 첫 빈칸에 고양이를 놓는다 */
function placeSomewhere(game, id = 'cheese') {
  for (let r = 0; r < game.mapDef.rows; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) {
      const res = game.placeTower(c, r, id)
      if (res.ok) return res.tower
    }
  }
  throw new Error('놓을 자리가 없다')
}

/** 웨이브가 끝날 때까지 돌린다 (준비 단계 복귀 또는 승리·패배) */
function runWave(game, maxSec = 400) {
  let t = 0
  while (game.phase === 'wave' && t < maxSec) { game.update(1 / 60); t += 1 / 60 }
  assert.notEqual(game.phase, 'wave', '웨이브가 끝나지 않았다')
}

// ───────────────────────────── 웨이브 미리보기

test('nextWave: 준비 단계에 있고 startWave 가 실제로 만드는 웨이브와 같다', () => {
  const g = newGame()
  assert.ok(g.nextWave, '시작 직후 준비 단계에는 미리보기가 있어야 한다')
  assert.equal(g.nextWave.waveNo, 1)
  const expected = buildWave(g.waveTable, 1, { getEnemy, mapHpMul: g.mapDef.hpMul, hpMul: 1, goldMul: 1 })
  assert.equal(g.nextWave.count, expected.count)
  assert.equal(g.nextWave.totalHp, expected.totalHp)
  g.startWave()
  assert.equal(g.nextWave, null, '웨이브 중엔 미리보기가 없다')
  assert.equal(g.currentWave.count, expected.count, 'startWave 가 같은 웨이브를 만든다')
})

test('nextWave: 웨이브를 깨면 다음 웨이브로 갱신되고, 마지막 웨이브 뒤엔 null 이다', () => {
  const g = newGame({ waveLimit: 2 })
  placeSomewhere(g)
  g.startWave()
  runWave(g)
  assert.equal(g.phase, 'prep')
  assert.equal(g.nextWave.waveNo, 2)
  g.startWave()
  runWave(g)
  assert.equal(g.nextWave, null, '표가 끝나면 미리볼 것이 없다')
})

// ───────────────────────────── 보스 등장

test('보스 등장: 웨이브 스폰이면 배너·이벤트·효과음이 한 번 나가고 bossOnField 가 1 이다', () => {
  const g = newGame()
  const seen = { spawn: 0, sfx: [] }
  g.on('bossspawn', () => { seen.spawn += 1 })
  g.on('sfx', (n) => seen.sfx.push(typeof n === 'string' ? n : n && n.name))
  const boss = g._createEnemy('ratking', { fromWave: true })
  assert.equal(seen.spawn, 1)
  assert.equal(g.bossOnField, 1)
  assert.ok(g.bossAnnounce && g.bossAnnounce.name === boss.def.name)
  assert.ok(g.bossAnnounce.text.length > 0, '능력 요약이 배너에 실린다')
  assert.ok(seen.sfx.includes('boss_in'), `효과음: ${seen.sfx.join(',')}`)
  // 배너는 1.8초 뒤에 걷힌다
  for (let i = 0; i < 130; i += 1) g.update(1 / 60)
  assert.equal(g.bossAnnounce, null)
})

test('보스 등장: 잡몹 스폰과 소환된 개체는 등장 연출이 없다', () => {
  const g = newGame()
  let n = 0
  g.on('bossspawn', () => { n += 1 })
  g._createEnemy('rat', { fromWave: true })
  g.spawnMinion('ratking', { progress: 0 })
  assert.equal(n, 0)
  assert.equal(g.bossOnField, 1, '소환된 보스도 전장에는 센다 (테마 전환용)')
})

test('보스 등장: 처치·누출하면 bossOnField 가 줄어든다', () => {
  const g = newGame()
  const a = g._createEnemy('ratking', { fromWave: true })
  const b = g._createEnemy('molelord', { fromWave: true })
  assert.equal(g.bossOnField, 2)
  g._killEnemy(a)
  assert.equal(g.bossOnField, 1)
  g._leak(b)
  assert.equal(g.bossOnField, 0)
})

// ───────────────────────────── 비용 플로터

test('비용 플로터: 짓기·업그레이드가 판매처럼 금액을 띄운다', () => {
  const g = newGame()
  g.gold = 10000
  const tower = placeSomewhere(g)
  const texts = () => g.floaters.map((f) => f.text)
  assert.ok(texts().some((t) => /^-\d+$/.test(t)), `짓기 플로터가 없다: ${texts().join(',')}`)
  const before = g.floaters.length
  assert.ok(g.upgradeTower(tower))
  assert.ok(g.floaters.length > before && /^-\d+$/.test(g.floaters[g.floaters.length - 1].text))
  g.sellTower(tower)
  assert.ok(/^\+\d+$/.test(g.floaters[g.floaters.length - 1].text), '판매는 그대로 +환급')
})
