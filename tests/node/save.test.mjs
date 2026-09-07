import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SAVE_VERSION, SAVE_KEY, BACKUP_KEY, defaultProgress, migrate,
  loadProgress, saveProgress, recordResult,
  recordChapter, isChapterUnlocked, setAllTowerIds, STARTING_TOWERS,
  defaultStats, accountRun, recordEndless, MAP_UNLOCK_WAVE, recordChallenge,
  GROWTH_MAX, WEEKLY_HISTORY_MAX,
} from '../../web/js/domain/save.js'
import { defaultSettings } from '../../web/js/domain/settings.js'

/** localStorage 대역 — 실제 브라우저 없이 저장 왕복을 검증한다 */
class FakeStorage {
  constructor(seed = {}) { this.data = { ...seed } }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null }
  setItem(k, v) { this.data[k] = String(v) }
}

/** 접근 자체가 막힌 저장소 (사생활 보호 모드) */
class BlockedStorage {
  getItem() { throw new Error('접근 거부') }
  setItem() { throw new Error('접근 거부') }
}

test('defaultProgress: 첫 맵만 열려 있고 기본 설정이 들어 있다', () => {
  const p = defaultProgress()
  assert.equal(p.version, SAVE_VERSION)
  assert.deepEqual(p.unlockedMaps, ['alley'])
  assert.deepEqual(p.bestWave, {})
  assert.deepEqual(p.settings, defaultSettings())
})

test('migrate: 저장 데이터가 없으면 기본값을 준다', () => {
  assert.deepEqual(migrate(null).progress, defaultProgress())
  assert.equal(migrate(null).reason, '저장 데이터 없음')
})

test('migrate: 버전 필드가 없던 v0 데이터를 v1으로 올린다', () => {
  const r = migrate({ unlockedMaps: ['alley', 'kitchen'], bestWave: { alley: 12 } })
  assert.equal(r.migrated, true)
  assert.equal(r.progress.version, SAVE_VERSION)
  assert.deepEqual(r.progress.unlockedMaps, ['alley', 'kitchen'])
  assert.equal(r.progress.bestWave.alley, 12)
})

test('migrate: 더 최신 버전이면 덮어쓰지 않고 기본값으로 시작하며 이유를 알려준다', () => {
  const r = migrate({ version: SAVE_VERSION + 5, unlockedMaps: ['rooftop'] })
  assert.deepEqual(r.progress, defaultProgress())
  assert.match(r.reason, /최신 버전/)
})

test('migrate: 손상된 값(음수·NaN·문자열)을 걸러낸다', () => {
  const r = migrate({
    version: 1,
    unlockedMaps: ['alley', 123, null],
    bestWave: { alley: -5, kitchen: 'abc', rooftop: 7.9 },
    clears: '객체아님',
  })
  assert.deepEqual(r.progress.unlockedMaps, ['alley'])
  assert.equal('alley' in r.progress.bestWave, false)
  assert.equal('kitchen' in r.progress.bestWave, false)
  assert.equal(r.progress.bestWave.rooftop, 7)
  assert.deepEqual(r.progress.clears, {})
})

test('migrate: unlockedMaps가 비면 첫 맵으로 되돌린다 (진행 불가 상태 방지)', () => {
  assert.deepEqual(migrate({ version: 1, unlockedMaps: [] }).progress.unlockedMaps, ['alley'])
})

test('loadProgress: 저장 → 불러오기 왕복이 값을 보존한다', () => {
  const st = new FakeStorage()
  const p = recordResult(defaultProgress(), 'alley', 30, true, 'kitchen')
  assert.equal(saveProgress(st, p), true)
  const back = loadProgress(st)
  assert.deepEqual(back.unlockedMaps, ['alley', 'kitchen'])
  assert.equal(back.bestWave.alley, 30)
})

test('loadProgress: 깨진 JSON은 백업 키로 옮기고 기본값으로 시작한다 (사용자 데이터 무손실)', () => {
  const st = new FakeStorage({ [SAVE_KEY]: '{망가진 json' })
  const p = loadProgress(st)
  assert.deepEqual(p, defaultProgress())
  assert.equal(st.getItem(BACKUP_KEY), '{망가진 json')
})

test('loadProgress: 미래 버전 데이터도 백업해두고 기본값으로 시작한다', () => {
  const raw = JSON.stringify({ version: 99, unlockedMaps: ['rooftop'] })
  const st = new FakeStorage({ [SAVE_KEY]: raw })
  loadProgress(st)
  assert.equal(st.getItem(BACKUP_KEY), raw)
})

test('loadProgress / saveProgress: 저장소 접근이 막혀도 예외를 밖으로 던지지 않는다', () => {
  const st = new BlockedStorage()
  assert.deepEqual(loadProgress(st), defaultProgress())
  assert.equal(saveProgress(st, defaultProgress()), false)
  assert.deepEqual(loadProgress(null), defaultProgress())
})

test('recordResult: 최고 웨이브는 더 높을 때만 갱신된다', () => {
  let p = recordResult(defaultProgress(), 'alley', 12, false)
  assert.equal(p.bestWave.alley, 12)
  p = recordResult(p, 'alley', 5, false)
  assert.equal(p.bestWave.alley, 12)
  p = recordResult(p, 'alley', 20, false)
  assert.equal(p.bestWave.alley, 20)
})

test('recordResult: 클리어해야 다음 맵이 해금되고 클리어 횟수가 쌓인다', () => {
  const failed = recordResult(defaultProgress(), 'alley', 18, false, 'kitchen')
  assert.deepEqual(failed.unlockedMaps, ['alley'])
  assert.equal(failed.clears.alley, undefined)

  const cleared = recordResult(defaultProgress(), 'alley', 30, true, 'kitchen')
  assert.deepEqual(cleared.unlockedMaps, ['alley', 'kitchen'])
  assert.equal(cleared.clears.alley, 1)

  const twice = recordResult(cleared, 'alley', 30, true, 'kitchen')
  assert.equal(twice.clears.alley, 2)
  assert.deepEqual(twice.unlockedMaps, ['alley', 'kitchen']) // 중복 해금되지 않는다
})

test('recordResult: 원본 진행도를 변경하지 않는다 (새 객체 반환)', () => {
  const before = defaultProgress()
  const after = recordResult(before, 'alley', 9, true, 'kitchen')
  assert.deepEqual(before.unlockedMaps, ['alley'])
  assert.deepEqual(before.bestWave, {})
  assert.notEqual(before, after)
})

// ── v3: 시나리오 별 기록 + 고양이 해금 ─────────────────────────

test('v2 → v3: 자유 모드 진행이 있으면 고양이를 전부 열어준 채로 올린다', () => {
  // 쓰던 고양이를 빼앗으면 안 된다. 이게 v3 마이그레이션의 핵심이다.
  const v2 = {
    version: 2, unlockedMaps: ['alley', 'kitchen'], bestWave: { alley: 30 },
    clears: { alley: 1 }, catnip: 50, purchases: [], premium: false,
  }
  const { progress, migrated } = migrate(v2)
  assert.equal(migrated, true)
  assert.equal(progress.version, SAVE_VERSION)
  assert.deepEqual(progress.unlockedTowers, ['cheese', 'calico', 'siamese', 'black', 'chonk'])
  assert.deepEqual(progress.scenario, { stars: {} })
  assert.equal(progress.catnip, 50, '기존 캣닢은 그대로여야 한다')
})

test('v2 → v3: 한 판도 안 한 저장은 시작 고양이 두 마리만 준다', () => {
  const v2 = {
    version: 2, unlockedMaps: ['alley'], bestWave: {}, clears: {},
    catnip: 30, purchases: [], premium: false,
  }
  assert.deepEqual(migrate(v2).progress.unlockedTowers, ['cheese', 'calico'])
})

test('setAllTowerIds: 고양이를 추가해도 전부 열림이 따라온다', () => {
  setAllTowerIds(['cheese', 'calico', 'siamese', 'black', 'chonk', 'newcat'])
  const v2 = { version: 2, bestWave: { alley: 5 } }
  assert.ok(migrate(v2).progress.unlockedTowers.includes('newcat'))
  setAllTowerIds(['cheese', 'calico', 'siamese', 'black', 'chonk'])   // 원상복구
})

test('scenario.stars 는 0~3 정수만 남는다', () => {
  const raw = {
    version: 3, bestWave: {}, unlockedTowers: ['cheese'],
    scenario: { stars: { ch1: 3, ch2: '2', ch3: -1, ch4: 99, ch5: null, ch6: 1.7 } },
  }
  assert.deepEqual(migrate(raw).progress.scenario.stars, { ch1: 3, ch2: 2, ch4: 3, ch6: 1 })
})

test('unlockedTowers 가 망가져 있으면 시작 두 마리로 떨어진다', () => {
  const raw = { version: 3, bestWave: {}, scenario: { stars: {} }, unlockedTowers: '고양이' }
  assert.deepEqual(migrate(raw).progress.unlockedTowers, ['cheese', 'calico'])
})

test('recordChapter: 별은 최고 기록만 남고 낮은 기록으로 덮이지 않는다', () => {
  let p = defaultProgress()
  p = recordChapter(p, 'ch1', 3, {}).progress
  assert.equal(p.scenario.stars.ch1, 3)
  p = recordChapter(p, 'ch1', 1, {}).progress
  assert.equal(p.scenario.stars.ch1, 3, '다시 돌아서 별이 덜 나와도 기록은 유지된다')
})

test('recordChapter: 보상은 처음 깼을 때만 준다 (캣닢 농사 방지)', () => {
  let p = defaultProgress()
  const first = recordChapter(p, 'ch2', 2, { catnip: 15, tower: 'siamese' })
  assert.equal(first.gained.catnip, 15)
  assert.equal(first.gained.tower, 'siamese')
  assert.ok(first.progress.unlockedTowers.includes('siamese'))
  assert.equal(first.progress.catnip, defaultProgress().catnip + 15)

  const again = recordChapter(first.progress, 'ch2', 3, { catnip: 15, tower: 'siamese' })
  assert.equal(again.gained.catnip, 0, '두 번째는 캣닢을 주지 않는다')
  assert.equal(again.gained.tower, null)
  assert.equal(again.progress.catnip, first.progress.catnip)
  assert.equal(again.progress.scenario.stars.ch2, 3, '별은 올라간다')
})

test('recordChapter: 별 0개(실패)면 보상도 없고 다음 장도 안 열린다', () => {
  const p = recordChapter(defaultProgress(), 'ch1', 0, { catnip: 10 }).progress
  assert.equal(p.catnip, defaultProgress().catnip)
  assert.equal(p.scenario.stars.ch1, 0)
})

test('recordChapter: 자유 모드 기록(bestWave·unlockedMaps)을 건드리지 않는다', () => {
  // waveLimit 6짜리 챕터가 그 맵의 bestWave 를 6으로 써버리면 자유 모드 기록이 망가진다
  let p = { ...defaultProgress(), bestWave: { alley: 30 }, unlockedMaps: ['alley', 'kitchen'] }
  p = recordChapter(p, 'ch1', 3, { catnip: 10 }).progress
  assert.deepEqual(p.bestWave, { alley: 30 })
  assert.deepEqual(p.unlockedMaps, ['alley', 'kitchen'])
})

test('isChapterUnlocked: 1장은 항상 열려 있고 그 다음은 앞 장을 깨야 한다', () => {
  const chapters = [
    { id: 'ch1', order: 1 }, { id: 'ch2', order: 2 }, { id: 'ch3', order: 3 },
  ]
  let p = defaultProgress()
  assert.equal(isChapterUnlocked(p, chapters[0], chapters), true)
  assert.equal(isChapterUnlocked(p, chapters[1], chapters), false)

  p = recordChapter(p, 'ch1', 1, {}).progress
  assert.equal(isChapterUnlocked(p, chapters[1], chapters), true)
  assert.equal(isChapterUnlocked(p, chapters[2], chapters), false, '건너뛸 수는 없다')
})

// ── v3 → v4 : 펫과 조합 도감 ──────────────────────────────────
// 새 필드를 정규화 블록에 안 넣으면 마이그레이션이 만든 값이 저장 한 번에 사라진다.
// v3 때 실제로 그렇게 날린 적이 있어서 여기서 못 박는다.

test('v3 → v4: 기존 진행도를 하나도 잃지 않고 펫·조합 도감이 생긴다', () => {
  const { progress, migrated } = migrate({
    version: 3,
    unlockedMaps: ['alley', 'kitchen'],
    bestWave: { alley: 22 },
    clears: { alley: 3 },
    catnip: 77,
    premium: true,
    scenario: { stars: { ch1: 3, ch2: 2 } },
    unlockedTowers: ['cheese', 'calico', 'siamese'],
  })
  assert.equal(migrated, true)
  assert.equal(progress.version, SAVE_VERSION)
  // 있던 것이 그대로다
  assert.deepEqual(progress.unlockedMaps, ['alley', 'kitchen'])
  assert.equal(progress.bestWave.alley, 22)
  assert.equal(progress.catnip, 77)
  assert.equal(progress.premium, true)
  assert.deepEqual(progress.scenario.stars, { ch1: 3, ch2: 2 })
  assert.deepEqual(progress.unlockedTowers, ['cheese', 'calico', 'siamese'])
  // 새로 생긴 것
  assert.deepEqual(progress.pets, { owned: ['hamster'], equipped: 'hamster' })
  assert.deepEqual(progress.combosSeen, [])
})

test('v4: 저장했다 다시 읽어도 펫과 조합 기록이 남는다', () => {
  const store = new FakeStorage()
  const p = defaultProgress()
  p.pets = { owned: ['hamster', 'sparrow'], equipped: 'sparrow' }
  p.combosSeen = ['cheese-trio', 'ice-garden']
  saveProgress(store, p)
  const back = loadProgress(store)
  assert.deepEqual(back.pets, { owned: ['hamster', 'sparrow'], equipped: 'sparrow' })
  assert.deepEqual(back.combosSeen, ['cheese-trio', 'ice-garden'])
})

test('v4: 안 가진 펫을 끼고 있으면 가진 것으로 되돌린다', () => {
  // 펫을 콘텐츠에서 빼거나 저장이 손상되면 "없는 펫을 낀 상태"가 된다.
  // 그대로 두면 판마다 조용히 아무 효과도 안 나고 원인을 알 방법이 없다.
  const { progress } = migrate({
    version: 4, pets: { owned: ['hamster'], equipped: 'sparrow' },
  })
  assert.equal(progress.pets.equipped, 'hamster')
})

test('v4: 펫 목록이 망가져 있으면 기본값으로 되돌린다', () => {
  for (const bad of [null, 'x', { owned: 'nope' }, { owned: [] }, { owned: [1, 2] }]) {
    const { progress } = migrate({ version: 4, pets: bad })
    assert.deepEqual(progress.pets, { owned: ['hamster'], equipped: 'hamster' }, JSON.stringify(bad))
  }
})

test('v4: 조합 기록에서 문자열이 아닌 것과 중복은 걸러낸다', () => {
  const { progress } = migrate({
    version: 4, combosSeen: ['a', 'a', '', null, 3, 'b'],
  })
  assert.deepEqual(progress.combosSeen, ['a', 'b'])
})

// ───────────────────────────── v5: 첫 판 안내 · 평생 기록 · 업적 · 출석 · 무한 · 도전

/** 모든 필드를 기본값이 아닌 값으로 채운 v4 저장. 무손실 검사의 기준이다. */
const v4Fixture = () => ({
  version: 4,
  unlockedMaps: ['alley', 'kitchen', 'rooftop'],
  bestWave: { alley: 30, kitchen: 17 },
  clears: { alley: 2 },
  catnip: 123,
  purchases: [
    { productId: 'catnip_small', sku: 'catnip_100', token: 'real-1', mock: false, at: 1000 },
    { productId: 'premium', sku: 'premium_pack', token: 'mock-premium_pack-2', mock: true, at: 2000 },
  ],
  premium: true,
  scenario: { stars: { ch1: 3, ch2: 1, ch3: 2 } },
  unlockedTowers: ['cheese', 'calico', 'siamese', 'black'],
  pets: { owned: ['hamster', 'turtle', 'magpie'], equipped: 'magpie' },
  combosSeen: ['cheese-trio', 'monochrome'],
  settings: { ...defaultSettings(), sfx: false, difficulty: 'stray', leftHanded: true },
})

test('v4 → v5: v4 의 모든 필드가 값 그대로 남는다 (무손실)', () => {
  const raw = v4Fixture()
  const { progress, migrated } = migrate(raw)
  assert.equal(migrated, true)
  assert.equal(progress.version, SAVE_VERSION)
  for (const k of Object.keys(raw)) {
    if (k === 'version') continue
    assert.deepEqual(progress[k], raw[k], `v4 필드 '${k}' 가 달라졌다`)
  }
  // 새 필드는 비어서 생긴다
  const base = defaultProgress()
  for (const k of ['hintsSeen', 'stats', 'achievements', 'daily', 'endless', 'challenge']) {
    assert.deepEqual(progress[k], base[k], `새 필드 '${k}' 가 기본값이 아니다`)
  }
})

test('v5 → v5: 마이그레이션은 멱등이다', () => {
  const once = migrate(v4Fixture()).progress
  const twice = migrate(once)
  assert.equal(twice.migrated, false)
  assert.deepEqual(twice.progress, once)
})

test('v5: 저장→불러오기 왕복에서 새 필드가 남는다', () => {
  const store = new FakeStorage()
  const p = defaultProgress()
  p.hintsSeen = ['place', 'wave']
  p.stats = { ...defaultStats(), runs: 4, wins: 1, killed: 812, bossKills: { ratking: 3 }, towerUse: { cheese: 4 } }
  p.achievements = { unlocked: { 'first-win': 1700000000000 } }
  p.daily = { lastClaim: '2026-09-05', streak: 3 }
  p.endless = { best: { alley: 7 } }
  p.challenge = { best: { 'alley:half-gold': 21 }, clears: { 'alley:half-gold': 1 } }
  saveProgress(store, p)
  const back = loadProgress(store)
  for (const k of ['hintsSeen', 'stats', 'achievements', 'daily', 'endless', 'challenge']) {
    assert.deepEqual(back[k], p[k], `'${k}' 가 왕복에서 달라졌다`)
  }
})

test('v5: 망가진 stats·daily·achievements 는 기본값으로 떨어진다', () => {
  const { progress } = migrate({
    ...v4Fixture(), version: 5,
    stats: { runs: -3, killed: 'many', bossKills: { ratking: 'x', molelord: 2 }, unknown: 9, playSec: 12.9 },
    achievements: { unlocked: { 'first-win': -1, 'wave-10': 5 } },
    daily: { lastClaim: '어제', streak: 99 },
    endless: { best: { alley: -1, kitchen: 4 } },
  })
  assert.equal(progress.stats.runs, 0)
  assert.equal(progress.stats.killed, 0)
  assert.deepEqual(progress.stats.bossKills, { molelord: 2 })
  assert.equal(progress.stats.playSec, 12)
  assert.equal('unknown' in progress.stats, false, '모르는 키는 버린다')
  assert.deepEqual(progress.achievements, { unlocked: { 'wave-10': 5 } })
  assert.deepEqual(progress.daily, { lastClaim: null, streak: 7 })
  assert.deepEqual(progress.endless, { best: { kitchen: 4 } })
})

/** 한 판의 요약을 흉내 낸다 */
const summaryOf = (over = {}) => ({
  mapId: 'alley', reachedWave: 12, totalWaves: 30, tableWaves: 30, cleared: false, livesLeft: 15,
  catnipEarned: 6, goldLeft: 400, elapsed: 310.4, endless: false, endlessWaves: 0,
  killed: 140, leaked: 5, goldEarned: 2100, damageDealt: 9876.5, bossesKilled: 1, crits: 30,
  specialsUsed: 2, towersBuilt: 6, towersSold: 1, upgradesBought: 4, revives: 0,
  towerIdsUsed: ['cheese', 'calico'], bossIdsKilled: ['ratking'], combosMade: [],
  bossKillCounts: { ratking: 1 },
  ...over,
})

test('accountRun: 같은 판을 두 번 반영해도 두 번 세지 않는다', () => {
  const s = summaryOf({ cleared: true, reachedWave: 30 })
  const once = accountRun(defaultProgress(), s, null, 5000).progress
  assert.equal(once.stats.runs, 1)
  assert.equal(once.stats.wins, 1)
  assert.equal(once.stats.killed, 140)
  assert.equal(once.stats.playSec, 310)
  assert.deepEqual(once.stats.bossKills, { ratking: 1 })
  assert.deepEqual(once.stats.towerUse, { cheese: 1, calico: 1 })
  assert.equal(once.stats.firstPlayedAt, 5000)
  // 결과 시트 → '맵 선택으로' 가 같은 summary 로 또 부른다
  const twice = accountRun(once, s, s, 6000).progress
  assert.equal(twice.stats.runs, 1)
  assert.equal(twice.stats.wins, 1)
  assert.equal(twice.stats.killed, 140)
  assert.deepEqual(twice.stats.towerUse, { cheese: 1, calico: 1 })
  assert.equal(twice.stats.firstPlayedAt, 5000, '첫 플레이 시각은 그대로')
  assert.equal(twice.stats.lastPlayedAt, 6000)
})

test('accountRun: 이어하기로 계속된 판은 차분만 더한다', () => {
  const first = summaryOf()
  const p1 = accountRun(defaultProgress(), first, null).progress
  const later = summaryOf({ reachedWave: 20, killed: 300, revives: 1, elapsed: 600,
    towerIdsUsed: ['cheese', 'calico', 'black'], bossKillCounts: { ratking: 1, molelord: 1 }, bossesKilled: 2 })
  const p2 = accountRun(p1, later, first).progress
  assert.equal(p2.stats.runs, 1, '같은 판이다')
  assert.equal(p2.stats.killed, 300)
  assert.equal(p2.stats.wavesReached, 20)
  assert.equal(p2.stats.revives, 1)
  assert.equal(p2.stats.playSec, 600)
  assert.deepEqual(p2.stats.bossKills, { ratking: 1, molelord: 1 })
  assert.deepEqual(p2.stats.towerUse, { cheese: 1, calico: 1, black: 1 })
})

test('accountRun: 원본 진행도를 변경하지 않는다', () => {
  const p = defaultProgress()
  const snapshot = JSON.stringify(p)
  accountRun(p, summaryOf(), null)
  assert.equal(JSON.stringify(p), snapshot)
})

test(`recordResult: ${MAP_UNLOCK_WAVE}웨이브에 닿으면 클리어 없이도 다음 맵이 열린다`, () => {
  const p = recordResult(defaultProgress(), 'alley', MAP_UNLOCK_WAVE, false, 'kitchen')
  assert.ok(p.unlockedMaps.includes('kitchen'))
  assert.equal(p.clears.alley, undefined, '클리어로 세지는 않는다')
})

test(`recordResult: ${MAP_UNLOCK_WAVE - 1}웨이브는 다음 맵을 열지 않는다`, () => {
  const p = recordResult(defaultProgress(), 'alley', MAP_UNLOCK_WAVE - 1, false, 'kitchen')
  assert.equal(p.unlockedMaps.includes('kitchen'), false)
})

test('recordChapter: 별을 따면 그 장의 맵만 열리고 다음 맵은 안 열린다', () => {
  const { progress } = recordChapter(defaultProgress(), 'ch3', 2, {}, 'kitchen')
  assert.ok(progress.unlockedMaps.includes('kitchen'))
  assert.equal(progress.unlockedMaps.includes('rooftop'), false)
  // 별 0개면 안 열린다
  const fail = recordChapter(defaultProgress(), 'ch3', 0, {}, 'kitchen').progress
  assert.equal(fail.unlockedMaps.includes('kitchen'), false)
})

test('recordEndless: 표 밖 최고 기록만 남는다', () => {
  let p = recordEndless(defaultProgress(), 'alley', 7)
  p = recordEndless(p, 'alley', 4)
  p = recordEndless(p, 'kitchen', -2)
  assert.deepEqual(p.endless.best, { alley: 7, kitchen: 0 })
})

test('recordChapter: 펫 보상은 처음 깼을 때 한 번만 식구가 된다', () => {
  const first = recordChapter(defaultProgress(), 'ch14', 1, { catnip: 30, pet: 'owl' })
  assert.equal(first.gained.pet, 'owl')
  assert.ok(first.progress.pets.owned.includes('owl'))
  const again = recordChapter(first.progress, 'ch14', 3, { catnip: 30, pet: 'owl' })
  assert.equal(again.gained.pet, null)
  assert.equal(again.progress.pets.owned.filter((id) => id === 'owl').length, 1)
  // 실패(별 0)면 펫도 없다
  assert.equal(recordChapter(defaultProgress(), 'ch14', 0, { pet: 'owl' }).gained.pet, null)
})

test('recordChallenge: 최고 웨이브는 최고만 남고, 첫 클리어 보상은 한 번만, 클리어 수는 cleared 일 때만 오른다', () => {
  const base = defaultProgress().catnip
  let p = recordChallenge(defaultProgress(), 'alley:air-only', 12, false, 20)
  assert.equal(p.challenge.best['alley:air-only'], 12)
  assert.equal(p.challenge.clears['alley:air-only'], undefined)
  assert.equal(p.catnip, base, '못 깼으면 보상이 없다')

  p = recordChallenge(p, 'alley:air-only', 9, false, 20)
  assert.equal(p.challenge.best['alley:air-only'], 12, '낮은 기록으로 덮이지 않는다')

  p = recordChallenge(p, 'alley:air-only', 30, true, 20)
  assert.equal(p.challenge.clears['alley:air-only'], 1)
  assert.equal(p.catnip, base + 20)

  p = recordChallenge(p, 'alley:air-only', 30, true, 20)
  assert.equal(p.challenge.clears['alley:air-only'], 2)
  assert.equal(p.catnip, base + 20, '두 번째 클리어는 캣닢을 주지 않는다')
  // 자유 모드 기록은 그대로다
  assert.deepEqual(p.bestWave, defaultProgress().bestWave)
  assert.deepEqual(p.clears, defaultProgress().clears)
})

test('recordChallenge: 저장 왕복에서 살아남고 잘못된 값은 걸러진다', () => {
  const p = recordChallenge(defaultProgress(), 'alley:six-cats', 7, true, 15)
  const back = migrate(JSON.parse(JSON.stringify(p))).progress
  assert.equal(back.challenge.best['alley:six-cats'], 7)
  assert.equal(back.challenge.clears['alley:six-cats'], 1)
  const dirty = migrate({ ...p, challenge: { best: { x: -3, y: 'a' }, clears: 7 } }).progress
  assert.deepEqual(dirty.challenge.best, {})
  assert.deepEqual(dirty.challenge.clears, {})
})

// ───────────────────────────── v6: 훈련 · 스킨 · 유료 콘텐츠 자격 · 주간 도전

/** v5 저장 전체를 기본값이 아닌 값으로 채운 픽스처 */
function v5Fixture() {
  return {
    ...v4Fixture(), version: 5,
    hintsSeen: ['place', 'wave', 'panel'],
    stats: { ...defaultStats(), runs: 9, wins: 2, killed: 1234, bossKills: { ratking: 4 }, towerUse: { cheese: 9, calico: 3 } },
    achievements: { unlocked: { 'first-win': 1700000000000, 'wave-10': 1700000001000 } },
    daily: { lastClaim: '2026-09-04', streak: 5 },
    endless: { best: { alley: 7, kitchen: 2 } },
    challenge: { best: { 'alley:half-gold': 21, 'alley:air-only': 30 }, clears: { 'alley:air-only': 2 } },
  }
}

test('v5 → v6: v5 의 모든 필드가 값 그대로 남는다 (무손실)', () => {
  const raw = v5Fixture()
  const { progress, migrated } = migrate(raw)
  assert.equal(migrated, true)
  assert.equal(progress.version, SAVE_VERSION)
  for (const k of Object.keys(raw)) {
    if (k === 'version') continue
    assert.deepEqual(progress[k], raw[k], `v5 필드 '${k}' 가 달라졌다`)
  }
  const base = defaultProgress()
  for (const k of ['growth', 'skins', 'unlocks', 'weekly']) {
    assert.deepEqual(progress[k], base[k], `새 필드 '${k}' 가 기본값이 아니다`)
  }
})

test('v7 → v7: 마이그레이션은 멱등이다', () => {
  const once = migrate(v5Fixture()).progress
  const twice = migrate(once)
  assert.equal(twice.migrated, false)
  assert.deepEqual(twice.progress, once)
})

/** v6 세이브 — v5 픽스처에 v6 필드를 비기본값으로 채운 것 */
function v6Fixture() {
  return {
    ...v5Fixture(), version: 6,
    growth: { cheese: 2, black: 3 },
    skins: { owned: ['cheese-ember'], equipped: { cheese: 'cheese-ember' } },
    unlocks: { acts: [3], packs: ['challenges2'] },
    weekly: { best: { '2026-W36': 17 }, cleared: { '2026-W35': true }, history: ['2026-W35', '2026-W36'] },
  }
}

test('v6 → v7: v6 의 모든 필드가 값 그대로 남는다 (무손실)', () => {
  const raw = v6Fixture()
  const { progress, migrated } = migrate(raw)
  assert.equal(migrated, true)
  assert.equal(progress.version, SAVE_VERSION)
  for (const k of Object.keys(raw)) {
    if (k === 'version') continue
    assert.deepEqual(progress[k], raw[k], `v6 필드 '${k}' 가 달라졌다`)
  }
  const base = defaultProgress()
  for (const k of ['cards', 'runes', 'tickets', 'expedition']) {
    assert.deepEqual(progress[k], base[k], `새 필드 '${k}' 가 기본값이 아니다`)
  }
})

test('v7: 저장→불러오기 왕복에서 새 필드가 남는다', () => {
  const store = new FakeStorage()
  const p = defaultProgress()
  p.cards = { owned: { cheese: 3, black: 1 }, shards: 40 }
  p.runes = { owned: { fire: 2, ice: 1 }, equipped: { cheese: 'fire' } }
  p.tickets = 5
  p.expedition = { best: { 'ember-road': 4 }, cleared: ['ember-road'], deck: ['cheese', 'black'] }
  saveProgress(store, p)
  const back = loadProgress(store)
  for (const k of ['cards', 'runes', 'tickets', 'expedition']) {
    assert.deepEqual(back[k], p[k], `'${k}' 가 왕복에서 달라졌다`)
  }
})

test('v7 룬: 모르는 속성은 버리고, 보유량이 0인 룬은 벗긴다', () => {
  /* 룬은 카드와 달리 전투 계산에 바로 들어간다(game.placeTower 가 tower.element 로 굳힌다).
   * 모르는 값이 남으면 상성이 조용히 1.0 이 돼 "낀 것 같은데 아무 일도 안 나는" 상태가 된다. */
  const { progress } = migrate({
    ...v6Fixture(), version: 7,
    runes: {
      owned: { fire: 2, fier: 9, ice: 0, bolt: -1 },
      equipped: { cheese: 'fire', calico: 'fier', siamese: 'ice', black: 'nope' },
    },
  })
  assert.deepEqual(progress.runes.owned, { fire: 2 }, '모르는 속성이나 0 이하가 남았다')
  assert.deepEqual(progress.runes.equipped, { cheese: 'fire' }, '보유 안 한 룬이 장착된 채로 남았다')
})

test('v7 카드: 모르는 고양이 id 는 남긴다 (콘텐츠를 잠깐 빼도 세이브가 안 날아간다)', () => {
  /* 룬과 반대다. 카드는 도감에 그릴 때 getTower 로 걸러 내면 그만이라, 콘텐츠를 잠깐 뺐다
   * 되돌리는 경우에 대비해 남긴다 — 스킨 owned 와 같은 규칙. */
  const { progress } = migrate({
    ...v6Fixture(), version: 7,
    cards: { owned: { cheese: 2, someFutureCat: 1, bad: 0, worse: -3 }, shards: 12 },
  })
  assert.deepEqual(progress.cards.owned, { cheese: 2, someFutureCat: 1 })
  assert.equal(progress.cards.shards, 12)
})

test('v6: 저장→불러오기 왕복에서 새 필드가 남는다', () => {
  const store = new FakeStorage()
  const p = defaultProgress()
  p.growth = { cheese: 2, black: 3 }
  p.skins = { owned: ['cheese-golden', 'black-midnight'], equipped: { cheese: 'cheese-golden' } }
  p.unlocks = { acts: [3], packs: ['challenges2'] }
  p.weekly = { best: { '2026-W36': 17 }, cleared: { '2026-W35': true }, history: ['2026-W35', '2026-W36'] }
  saveProgress(store, p)
  const back = loadProgress(store)
  for (const k of ['growth', 'skins', 'unlocks', 'weekly']) {
    assert.deepEqual(back[k], p[k], `'${k}' 가 왕복에서 달라졌다`)
  }
})

test('v6: 망가진 growth·skins·unlocks·weekly 는 걸러진다', () => {
  const { progress } = migrate({
    ...v5Fixture(), version: 6,
    growth: { cheese: 9, black: -1, calico: '2', siamese: 0, chonk: 'x' },
    skins: { owned: ['a', 'a', 7, ''], equipped: { cheese: 'a', black: 'zzz', calico: 3 } },
    unlocks: { acts: [3, 3, '4', 0, -2, 2.5, 'x'], packs: ['challenges2', 5, 'challenges2'] },
    weekly: {
      best: { '2026-W36': 17.8, '2026-W35': -3 },
      cleared: { '2026-W35': true, '2026-W34': 'yes', '2026-W33': 1 },
      history: Array.from({ length: 20 }, (_, i) => `2026-W${10 + i}`),
    },
  })
  assert.deepEqual(progress.growth, { cheese: GROWTH_MAX, calico: 2 }, '상한으로 자르고 0·음수·문자는 버린다')
  assert.deepEqual(progress.skins, { owned: ['a'], equipped: { cheese: 'a' } }, '안 가진 스킨은 벗긴다')
  assert.deepEqual(progress.unlocks, { acts: [3, 4], packs: ['challenges2'] })
  assert.deepEqual(progress.weekly.best, { '2026-W36': 17 })
  assert.deepEqual(progress.weekly.cleared, { '2026-W35': true })
  assert.equal(progress.weekly.history.length, WEEKLY_HISTORY_MAX)
  assert.equal(progress.weekly.history[WEEKLY_HISTORY_MAX - 1], '2026-W29', '최근 것을 남긴다')
})

test('recordChapter: 스킨 보상은 첫 클리어에 한 번만 보유 목록에 들어가고 장착은 안 바꾼다', () => {
  const first = recordChapter(defaultProgress(), 'ch24', 2, { catnip: 150, skin: 'black-midnight' })
  assert.equal(first.gained.skin, 'black-midnight')
  assert.deepEqual(first.progress.skins, { owned: ['black-midnight'], equipped: {} })
  const again = recordChapter(first.progress, 'ch24', 3, { catnip: 150, skin: 'black-midnight' })
  assert.equal(again.gained.skin, null)
  assert.deepEqual(again.progress.skins.owned, ['black-midnight'])
  assert.equal(recordChapter(defaultProgress(), 'ch24', 0, { skin: 'black-midnight' }).gained.skin, null)
})

test('isChapterUnlocked: 유료 막은 앞 장을 다 깼어도 자격이 없으면 잠긴다', () => {
  const chapters = [
    { id: 'a', order: 1, act: 1 }, { id: 'b', order: 2, act: 1 }, { id: 'c', order: 3, act: 3 },
  ]
  const p = { ...defaultProgress(), scenario: { stars: { a: 3, b: 3 } } }
  assert.equal(isChapterUnlocked(p, chapters[1], chapters), true)
  assert.equal(isChapterUnlocked(p, chapters[2], chapters), false)
  assert.equal(isChapterUnlocked({ ...p, unlocks: { acts: [3], packs: [] } }, chapters[2], chapters), true)
})


/** v7 세이브 — v6 픽스처에 v7 필드를 비기본값으로 채운 것 */
function v7Fixture() {
  return {
    ...v6Fixture(), version: 7,
    cards: { owned: { munchkin: 2 }, shards: 30 },
    runes: { owned: { fire: 1 }, equipped: { cheese: 'fire' } },
    tickets: 3,
    expedition: { best: { 'ember-road': 2 }, cleared: [], deck: ['cheese', 'calico', 'black', 'siamese'] },
  }
}

test('v7 → v8: 필살기 필드가 비어 있는 채로 생기고 v7 의 모든 필드는 값 그대로 남는다', () => {
  const src = v7Fixture()
  const { progress, migrated } = migrate(src)
  assert.equal(migrated, true)
  assert.equal(progress.version, 8)
  assert.deepEqual(progress.specials, { loadout: [], ranks: {} }, '빈 로드아웃 = 기본 넷, 단계 0 — 아무것도 안 바뀐다')
  for (const k of ['cards', 'runes', 'tickets', 'expedition', 'growth', 'skins', 'unlocks', 'weekly']) {
    assert.deepEqual(progress[k], src[k], `v7 필드 ${k} 가 마이그레이션에서 변했다`)
  }
})

test('v8 필살기: 로드아웃은 중복 없이 문자열만, 모르는 id 는 남기고, 단계는 트리별 0~최고로 자른다', () => {
  const { progress } = migrate({
    ...v7Fixture(), version: 8,
    specials: {
      loadout: ['hiss', 'churu', 'hiss', 7, null, 'ghost'],
      ranks: { churu: { power: 9, cooldown: 0 }, nap: { power: 'x', cooldown: 2.7 }, bad: 'no', zero: { power: 0 } },
    },
  })
  assert.deepEqual(progress.specials.loadout, ['hiss', 'churu', 'ghost'], '중복·문자열 아님은 빠지고 모르는 id 는 남는다')
  assert.deepEqual(progress.specials.ranks, { churu: { power: 3 }, nap: { cooldown: 2 } }, '상한으로 자르고 0·망가진 값은 안 남긴다')
})

test('v8: 저장→불러오기 왕복에서 필살기 필드가 남는다', () => {
  const storage = new FakeStorage()
  const p = migrate(v7Fixture()).progress
  p.specials = { loadout: ['milk', 'churu'], ranks: { milk: { power: 2, cooldown: 1 } } }
  saveProgress(storage, p)
  const back = loadProgress(storage)
  assert.deepEqual(back.specials, { loadout: ['milk', 'churu'], ranks: { milk: { power: 2, cooldown: 1 } } })
  assert.equal(back.version, 8)
})
