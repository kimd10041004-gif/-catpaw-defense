/**
 * 헤드리스 Game 검사 — game.js 는 DOM 을 안 쓰므로 실제 콘텐츠로 그대로 돌린다.
 * (balance-sim.mjs 가 쓰는 것과 같은 방식. 여기서는 한 판을 돌리지 않고 순간을 본다.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getMap, getEnemy, getChallenge, listSpecials, getPet } from '../../web/js/content/registry.js'
import { Game, PLACE_FAIL, REFUND80_RATE } from '../../web/js/game.js'
import { sellValue } from '../../web/js/domain/economy.js'
import { defaultProgress } from '../../web/js/domain/save.js'
import { mulberry32 } from '../../web/js/domain/rng.js'
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

// ───────────────────────────── 무한 모드

/** 웨이브를 강제로 끝낸다 (적을 전부 치우고 한 스텝) */
function forceFinishWave(g) {
  g.startWave()
  g.pending.length = 0
  g.enemies.length = 0
  g.update(1 / 60)
}

test('무한 모드: 승리 뒤에만 이어지고, 표 밖 웨이브가 나오며, 캣닢은 상한까지만', () => {
  const g = newGame({ waveLimit: 2 })
  assert.equal(g.continueEndless(), false, '승리 전엔 안 된다')
  forceFinishWave(g)
  forceFinishWave(g)
  assert.equal(g.phase, 'victory')
  assert.equal(g.tableWaves, 2)
  assert.equal(g.continueEndless(), true)
  assert.equal(g.endless, true)
  assert.equal(g.totalWaves, Infinity)
  assert.equal(g.phase, 'prep')
  assert.equal(g.nextWave.waveNo, 3, '표 밖 첫 웨이브를 미리 본다')
  assert.ok(g.startWave())
  assert.equal(g.waveNo, 3)
  assert.ok(g.currentWave.count > 0)
  assert.equal(g.summary().endlessWaves, 1)
  assert.equal(g.summary().endless, true)

  // 캣닢 상한 — 보스를 아무리 잡아도 무한 시작 뒤 +20 까지만
  const start = g.catnipEarned
  for (let i = 0; i < 30; i += 1) g._killEnemy(g._createEnemy('demonking', { fromWave: true }))
  assert.equal(g.catnipEarned - start, 20)
})

test('무한 모드: 표 밖에서는 웨이브를 깨도 승리가 다시 오지 않는다', () => {
  const g = newGame({ waveLimit: 1 })
  forceFinishWave(g)
  assert.equal(g.phase, 'victory')
  g.continueEndless()
  let victories = 0
  g.on('victory', () => { victories += 1 })
  forceFinishWave(g)
  assert.equal(g.phase, 'prep')
  assert.equal(victories, 0)
  assert.equal(g.nextWave.waveNo, 3)
})

// ───────────────────────────── 도전 규칙

test('도전 여섯 마리: 일곱 번째 고양이를 거부하고 사유를 적는다', () => {
  const g = newGame({ challenge: getChallenge('six-cats') })
  g.gold = 100000
  for (let i = 0; i < 6; i += 1) placeSomewhere(g)
  assert.equal(g.towers.length, 6)
  assert.throws(() => placeSomewhere(g), /놓을 자리가 없다/)
  // 빈 칸이 있는데도 LIMIT 으로 막힌다 — 자리 문제가 아니다
  let res = null
  for (let r = 0; r < g.mapDef.rows && !(res && res.code === 'LIMIT'); r += 1) {
    for (let c = 0; c < g.mapDef.cols; c += 1) { res = g.placeTower(c, r, 'cheese'); if (res.code === 'LIMIT') break }
  }
  assert.equal(res.code, 'LIMIT')
  assert.equal(res.reason, PLACE_FAIL.LIMIT.replace('{n}', 6))
  assert.equal(g.summary().challengeId, 'six-cats')
})

test('도전 맨손: 필살기를 거부한다 (마나가 있어도)', () => {
  const g = newGame({ challenge: getChallenge('bare-paws') })
  g.mana = g.manaMax
  const id = listSpecials()[0].id
  const res = g.useSpecial(id)
  assert.equal(res.ok, false)
  assert.equal(res.code, 'NO_SPECIALS')
  assert.equal(g.mana, g.manaMax, '거부됐으면 마나도 안 빠진다')
  const plain = newGame()
  plain.mana = plain.manaMax
  assert.equal(plain.useSpecial(id).ok, true, '도전이 아니면 같은 조건에서 쓸 수 있다')
})

test('도전 골드 절반: 시작 골드가 반이고 웨이브 골드 배율이 반이다', () => {
  const plain = newGame()
  const half = newGame({ challenge: getChallenge('half-gold') })
  assert.equal(half.gold, Math.round(plain.gold * 0.5))
  assert.equal(half._waveOpts().goldMul, plain._waveOpts().goldMul * 0.5)
  assert.equal(half.lives, plain.lives, '목숨 규칙은 없으니 그대로다')
})

test('도전 공중만: 1웨이브가 전부 날아오고, 보스 2배: 10웨이브 보스가 두 마리다', () => {
  const air = newGame({ challenge: getChallenge('air-only') })
  assert.ok(air.nextWave.count > 0)
  for (const sp of air.nextWave.spawns) assert.ok(getEnemy(sp.enemyId).flying, `${sp.enemyId} 는 지상이다`)
  const dbl = newGame({ challenge: getChallenge('double-boss') })
  const w10 = dbl._buildWaveNo(10)
  assert.equal(w10.bossCount, newGame()._buildWaveNo(10).bossCount * 2)
})

test('도전: 이기고 나서도 무한으로는 못 간다 (기록이 표 기준이다)', () => {
  const g = newGame({ waveLimit: 1, challenge: getChallenge('half-gold') })
  forceFinishWave(g)
  assert.equal(g.phase, 'victory')
  assert.equal(g.continueEndless(), false)
  assert.equal(g.phase, 'victory')
})

test('너구리 펫: 판매 환급률이 0.8 이고 패널의 sellValue 도 같다', () => {
  const progress = { ...defaultProgress(), pets: { owned: ['raccoon'], equipped: 'raccoon' } }
  const g = newGame({ progress })
  assert.equal(g.pet && g.pet.id, 'raccoon')
  const t = placeSomewhere(g)
  const expected = sellValue(t.def, 1, REFUND80_RATE)
  assert.ok(expected > sellValue(t.def, 1), '기본 환급률보다 많이 돌려받는다')
  assert.equal(g.towerInfo(t).sellValue, expected)
  const before = g.gold
  g.sellTower(t)
  assert.equal(g.gold - before, expected)
  // 펫이 없으면 기본값이다
  const plain = newGame()
  const t2 = placeSomewhere(plain)
  assert.equal(plain.towerInfo(t2).sellValue, sellValue(t2.def, 1))
  assert.ok(getPet('owl').startLives === 2 && getPet('owl').startGold === 40)
})

// ───────────────────────────── 훈련

test('훈련: 진행도의 단계가 타워 공격력 배수로 걸리고, setProgress 로 진행 중인 판에도 반영된다', () => {
  const g = newGame()
  const t = placeSomewhere(g)
  const base = g.towerInfo(t).eff.damage
  g.setProgress({ ...defaultProgress(), growth: { cheese: 2 } })
  assert.ok(Math.abs(g.towerInfo(t).eff.damage / base - 1.10) < 1e-9, `${g.towerInfo(t).eff.damage} / ${base}`)
  const g2 = newGame({ progress: { ...defaultProgress(), growth: { cheese: 3 } } })
  const t2 = placeSomewhere(g2)
  assert.ok(Math.abs(g2.towerInfo(t2).eff.damage / base - 1.15) < 1e-9)
  // 다른 고양이의 단계는 무관하다
  const g3 = newGame({ progress: { ...defaultProgress(), growth: { black: 3 } } })
  assert.equal(g3.towerInfo(placeSomewhere(g3)).eff.damage, base)
})

// ───────────────────────────── 주간 도전 (시드 결정성)

/** 같은 배치로 8웨이브까지 돌린 요약 */
function playSeeded(seed, waves = 8) {
  const g = newGame({ random: mulberry32(seed), weekly: '2026-W36', challenge: getChallenge('half-gold') })
  g.gold = 5000
  for (let i = 0; i < 4; i += 1) placeSomewhere(g)
  const elites = []
  for (let w = 0; w < waves && g.phase !== 'defeat'; w += 1) {
    g.startWave()
    let t = 0
    while (g.phase === 'wave' && t < 400) {
      g.update(1 / 60); t += 1 / 60
      for (const e of g.enemies) if (e.elite && !elites.includes(e.uid)) elites.push(e.uid)
    }
  }
  const s = g.summary()
  return { elites: elites.length, killed: s.killed, crits: s.crits, gold: g.gold, weeklyKey: s.weeklyKey, endless: g.continueEndless() }
}

test('주간 도전: 같은 시드는 같은 판(엘리트·크리티컬·골드)이고, 무한으로는 못 가며, 요약에 주 키가 실린다', () => {
  const a = playSeeded(7)
  const b = playSeeded(7)
  assert.deepEqual(a, b)
  assert.equal(a.weeklyKey, '2026-W36')
  assert.equal(a.endless, false)
  assert.ok(a.killed > 0)
})
