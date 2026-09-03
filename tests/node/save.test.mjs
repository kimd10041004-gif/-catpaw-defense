import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SAVE_VERSION, SAVE_KEY, BACKUP_KEY, defaultProgress, migrate,
  loadProgress, saveProgress, recordResult,
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
