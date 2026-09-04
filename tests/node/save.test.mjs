import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SAVE_VERSION, SAVE_KEY, BACKUP_KEY, defaultProgress, migrate,
  loadProgress, saveProgress, recordResult,
  recordChapter, isChapterUnlocked, setAllTowerIds, STARTING_TOWERS,
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
