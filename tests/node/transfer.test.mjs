/**
 * 진행도 옮기기 (X-1) — 코드 왕복 · 유료 항목이 코드로 새지 않음 · 손으로 만든 코드도 유료를 못 연다 · 잘린 코드 거부.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeTransfer, decodeTransfer, mergeImported, stripPaid, transferSummary, crc32,
  PAID_SKINS, TRANSFER_PREFIX,
} from '../../web/js/domain/transfer.js'
import { defaultProgress, SAVE_VERSION, migrate } from '../../web/js/domain/save.js'
import { IAP_PRODUCTS } from '../../web/js/domain/shop.js'

/** 오래 논 사람 — 무료로 번 것과 돈으로 산 것이 섞여 있다 */
function veteran() {
  const p = defaultProgress()
  return {
    ...p,
    unlockedMaps: ['alley', 'kitchen', 'basement'],
    bestWave: { alley: 30, kitchen: 22 },
    clears: { alley: 2 },
    catnip: 1234,
    scenario: { stars: { c1: 3, c2: 2 } },
    premium: true,
    purchases: [{ sku: 'premium_pack', token: 'tok-premium', mock: false }],
    unlocks: { acts: [3], packs: ['challenges2'] },
    skins: { owned: ['calico-blossom', 'free-skin-x'], equipped: { calico: 'calico-blossom', cheese: 'free-skin-x' } },
    stats: { ...p.stats, runs: 57 },
    settings: { ...p.settings, language: 'en' },
  }
}

test('옮기기 코드: 형식은 CATPAW1.<본문>.<검사값 8자리> 이고 왕복하면 무료 진행도가 그대로다', () => {
  const src = veteran()
  const code = encodeTransfer(src)
  assert.match(code, new RegExp(`^${TRANSFER_PREFIX}\\.[A-Za-z0-9_-]+\\.[0-9a-f]{8}$`))
  const got = decodeTransfer(code)
  assert.equal(got.ok, true, got.reason)
  const p = got.progress
  assert.deepEqual(p.unlockedMaps, src.unlockedMaps)
  assert.deepEqual(p.bestWave, src.bestWave)
  assert.deepEqual(p.scenario.stars, src.scenario.stars)
  assert.equal(p.catnip, 1234)
  assert.equal(p.stats.runs, 57)
  assert.equal(p.version, SAVE_VERSION)
})

test('옮기기 코드: 유료로 산 것(프리미엄 · 막 · 팩 · 유료 스킨 · 영수증)은 코드에 안 들어간다', () => {
  const code = encodeTransfer(veteran())
  const body = JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString('utf8'))
  assert.equal(body.premium, false)
  assert.deepEqual(body.purchases, [])
  assert.deepEqual(body.unlocks, { acts: [], packs: [] })
  assert.ok(!body.skins.owned.includes('calico-blossom'), '유료 스킨이 샜다')
  assert.ok(body.skins.owned.includes('free-skin-x'), '무료로 얻은 스킨은 따라간다')
  assert.deepEqual(body.skins.equipped, { cheese: 'free-skin-x' }, '빠진 스킨의 장착도 같이 빠진다')
  assert.ok(!('settings' in body), '기기 설정은 따라가지 않는다')
  assert.ok(!code.includes('tok-premium'))
})

test('옮기기 코드: 손으로 유료 필드를 적어 넣은 코드도 유료를 못 연다', () => {
  const forged = { ...defaultProgress(), premium: true, unlocks: { acts: [3, 4], packs: ['challenges2'] },
    skins: { owned: [...PAID_SKINS], equipped: {} }, purchases: [{ sku: 'story_act3', token: 'x' }] }
  const bytes = new TextEncoder().encode(JSON.stringify(forged))
  const code = `${TRANSFER_PREFIX}.${Buffer.from(bytes).toString('base64url')}.${crc32(bytes).toString(16).padStart(8, '0')}`
  const got = decodeTransfer(code)
  assert.equal(got.ok, true)
  assert.equal(got.progress.premium, false)
  assert.deepEqual(got.progress.unlocks, { acts: [], packs: [] })
  assert.deepEqual(got.progress.purchases, [])
  assert.equal(got.progress.skins.owned.filter((s) => PAID_SKINS.includes(s)).length, 0)
})

test('가져오기: 지금 기기의 유료 자격 · 영수증 · 설정은 그대로 남고 나머지는 코드의 것이 된다', () => {
  const here = { ...defaultProgress(), premium: true, unlocks: { acts: [4], packs: [] }, catnip: 5,
    purchases: [{ sku: 'story_act4', token: 'here-tok' }],
    skins: { owned: ['siamese-snow'], equipped: { siamese: 'siamese-snow' } },
    settings: { ...defaultProgress().settings, language: 'ko' } }
  const { progress: imported } = decodeTransfer(encodeTransfer(veteran()))
  const merged = mergeImported(here, imported)
  assert.equal(merged.catnip, 1234, '캣닢은 코드의 것')
  assert.deepEqual(merged.bestWave, veteran().bestWave)
  assert.equal(merged.premium, true, '이 기기에서 산 프리미엄은 남는다')
  assert.deepEqual(merged.unlocks.acts, [4])
  assert.deepEqual(merged.purchases, here.purchases, '영수증은 이 기기의 것 — 중복 지급 방지 기록이 사라지면 안 된다')
  assert.ok(merged.skins.owned.includes('siamese-snow') && merged.skins.owned.includes('free-skin-x'))
  assert.equal(merged.skins.equipped.siamese, 'siamese-snow')
  assert.equal(merged.settings.language, 'ko', '기기 설정은 코드가 덮지 않는다')
  assert.equal(migrate(JSON.parse(JSON.stringify(merged))).reason, null, '합친 결과가 저장 형식으로 유효하다')
})

test('옮기기 코드: 메신저가 끼워 넣은 줄바꿈 · 띄어쓰기는 무시한다', () => {
  const code = encodeTransfer(veteran())
  const wrapped = `  ${code.match(/.{1,40}/g).join('\n')}  \n`
  assert.equal(decodeTransfer(wrapped).ok, true)
})

test('옮기기 코드: 잘리거나 한 글자 틀리거나 남의 글이면 이유와 함께 거부한다 — 진행도를 덮지 않는다', () => {
  const code = encodeTransfer(veteran())
  const cases = {
    empty: '',
    other: 'hello world',
    cut: code.slice(0, code.length - 30) + code.slice(-9),
    typo: code.replace(/\.([A-Za-z0-9_-])/, (m, c) => `.${c === 'A' ? 'B' : 'A'}`),
    badCrc: code.slice(0, -8) + '00000000',
  }
  for (const [name, text] of Object.entries(cases)) {
    const got = decodeTransfer(text)
    assert.equal(got.ok, false, `${name} 가 통과했다`)
    assert.ok(typeof got.reason === 'string' && got.reason.length > 3, `${name} 에 이유가 없다`)
  }
})

test('옮기기 코드: 더 새 저장 버전의 코드는 거부한다 (덮어쓰면 새 필드를 잃는다)', () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...defaultProgress(), version: SAVE_VERSION + 1 }))
  const code = `${TRANSFER_PREFIX}.${Buffer.from(bytes).toString('base64url')}.${crc32(bytes).toString(16).padStart(8, '0')}`
  const got = decodeTransfer(code)
  assert.equal(got.ok, false)
  assert.match(got.reason, /업데이트|update/i)
})

test('옮기기 코드: 유료 스킨 목록은 상품표에서 나온다 — 스킨 상품을 더하면 저절로 막힌다', () => {
  const fromShop = IAP_PRODUCTS.flatMap((p) => p.grants?.skins || [])
  assert.deepEqual([...PAID_SKINS].sort(), [...new Set(fromShop)].sort())
  assert.ok(PAID_SKINS.length >= 7)
})

test('옮기기 요약: 가져오기 전에 보여 줄 숫자', () => {
  assert.deepEqual(transferSummary(veteran()), { maps: 3, stars: 5, bestWave: 30, catnip: 1234, runs: 57 })
  assert.deepEqual(transferSummary(defaultProgress()), { maps: 1, stars: 0, bestWave: 0, catnip: 30, runs: 0 })
})

test('stripPaid 는 원본을 건드리지 않는다', () => {
  const src = veteran()
  const before = JSON.stringify(src)
  stripPaid(src)
  assert.equal(JSON.stringify(src), before)
})
