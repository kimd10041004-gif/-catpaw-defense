import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SETTINGS_SCHEMA, DIFFICULTIES, defaultSettings, coerce, normalizeSettings,
  settingsGroups, schemaItem, difficultyOf,
} from '../../web/js/domain/settings.js'

test('SETTINGS_SCHEMA: 모든 항목이 id·group·type·label·default를 갖는다', () => {
  for (const item of SETTINGS_SCHEMA) {
    assert.equal(typeof item.id, 'string', `${item.id}의 id`)
    assert.equal(typeof item.group, 'string', `${item.id}의 group`)
    assert.ok(['toggle', 'range', 'select'].includes(item.type), `${item.id}의 type`)
    assert.equal(typeof item.label, 'string', `${item.id}의 label`)
    assert.notEqual(item.default, undefined, `${item.id}의 default`)
  }
})

test('SETTINGS_SCHEMA: id가 중복되지 않는다', () => {
  const ids = SETTINGS_SCHEMA.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('SETTINGS_SCHEMA: select 항목의 기본값은 반드시 선택지 안에 있다', () => {
  for (const item of SETTINGS_SCHEMA.filter((s) => s.type === 'select')) {
    const allowed = item.options.map((o) => o[0])
    assert.ok(allowed.includes(item.default), `${item.id}의 기본값이 선택지에 없다`)
  }
})

test('defaultSettings: 스키마의 모든 키를 기본값으로 채운다', () => {
  const s = defaultSettings()
  assert.equal(Object.keys(s).length, SETTINGS_SCHEMA.length)
  assert.equal(s.sfx, true)
  assert.equal(s.difficulty, 'normal')
})

test('coerce: toggle은 불리언이 아니면 기본값으로 되돌린다', () => {
  const item = schemaItem('sfx')
  assert.equal(coerce(item, false), false)
  assert.equal(coerce(item, 'yes'), item.default)
  assert.equal(coerce(item, undefined), item.default)
})

test('coerce: range는 min~max 범위로 잘라낸다', () => {
  const item = schemaItem('volume')
  assert.equal(coerce(item, 0.3), 0.3)
  assert.equal(coerce(item, 99), item.max)
  assert.equal(coerce(item, -99), item.min)
  assert.equal(coerce(item, '숫자아님'), item.default)
})

test('coerce: select는 선택지에 없는 값을 기본값으로 되돌린다', () => {
  const item = schemaItem('difficulty')
  assert.equal(coerce(item, 'stray'), 'stray')
  assert.equal(coerce(item, '치트'), 'normal')
})

test('coerce: 숫자 선택지(배속)도 값 그대로 비교한다', () => {
  const item = schemaItem('defaultSpeed')
  assert.equal(coerce(item, 3), 3)
  assert.equal(coerce(item, 5), 1)
  assert.equal(coerce(item, '2'), 1) // 문자열 '2'는 선택지에 없다
})

test('normalizeSettings: 스키마에 없는 키는 버리고 빠진 키는 기본값으로 채운다', () => {
  const s = normalizeSettings({ sfx: false, 알수없는키: 123 })
  assert.equal(s.sfx, false)
  assert.equal('알수없는키' in s, false)
  assert.equal(s.volume, schemaItem('volume').default)
})

test('normalizeSettings: null이나 배열을 넣어도 기본 설정을 돌려준다', () => {
  assert.deepEqual(normalizeSettings(null), defaultSettings())
  assert.deepEqual(normalizeSettings([1, 2]), defaultSettings())
})

test('settingsGroups: 스키마 등장 순서대로 그룹을 중복 없이 준다', () => {
  assert.deepEqual(settingsGroups(), ['소리', '게임', '표시'])
})

test('difficultyOf: 모르는 난이도는 보통(normal)으로 처리한다', () => {
  assert.equal(difficultyOf({ difficulty: 'stray' }).id, 'stray')
  assert.equal(difficultyOf({ difficulty: '없음' }).id, 'normal')
  assert.equal(difficultyOf(null).id, 'normal')
})

test('DIFFICULTIES: 쉬움일수록 체력이 낮고 골드가 많다', () => {
  assert.ok(DIFFICULTIES.kitten.hpMul < DIFFICULTIES.normal.hpMul)
  assert.ok(DIFFICULTIES.stray.hpMul > DIFFICULTIES.normal.hpMul)
  assert.ok(DIFFICULTIES.kitten.goldMul > DIFFICULTIES.stray.goldMul)
})
