/**
 * 진행도 옮기기 (X-1) — 저장을 **글자 한 줄(옮기기 코드)**로 내보내고, 다른 기기에서 붙여 넣어 가져온다.
 *
 * 왜 있나: 진행도는 기기 안(localStorage)에만 있다. 폰을 바꾸거나, 사이트판 → Play 판으로 옮기거나(앱 id 가 달라
 * 저장소가 따로다 — W-4), 브라우저판에서 앱으로 넘어가면 진행도가 따라오지 않았다. 서버가 없으니 사람이 들고 옮긴다.
 *
 * **유료로 산 것은 코드에 넣지 않는다.** 프리미엄 · 막 · 도전 팩 · 유료 스킨 · 영수증은 Play 계정에 붙어 있고,
 * 옮긴 기기에서 '구매 복원'(앱을 켤 때 조용히 도는 복원 포함)이 Play 에서 되찾아 온다. 코드에 넣으면 코드를
 * 받은 누구나 산 것을 갖게 된다. 가져올 때도 코드 안의 유료 필드는 **무시하고** 지금 기기의 것을 그대로 둔다
 * (손으로 만든 코드에 3막을 적어 넣어도 안 열린다).
 *
 * **정직하게 — 이건 위조 방지가 아니다.** 끝의 검사값(CRC-32)은 복사하다 잘리거나 한 글자 틀린 것을 잡을 뿐이다.
 * 서버가 없고 이 코드는 공개돼 있어서, 마음먹으면 누구나 캣닢·기록을 적어 넣은 코드를 만들 수 있다.
 * 그걸로 여는 건 **무료로 벌 수 있는 것**뿐이다(유료 항목은 위처럼 막힌다). 캣닢은 돈으로도 사는 재화라
 * 그만큼은 샌다 — 막으려면 계정·서버가 먼저다(출시체크리스트 §4).
 *
 * 순수 함수만 — 저장소·화면은 main.js 가 한다.
 */

import { migrate, SAVE_VERSION } from './save.js'
import { IAP_PRODUCTS } from './shop.js'
import { tr } from '../i18n/index.js'

/** 코드 머리 — 형식이 바뀌면 숫자를 올리고 decode 에 옛 형식을 남긴다 */
export const TRANSFER_PREFIX = 'CATPAW1'

/** 돈으로만 생기는 스킨 — 상품 grants 에서 계산한다(스킨을 더해도 여기는 그대로) */
export const PAID_SKINS = [...new Set(IAP_PRODUCTS.flatMap((p) => (p.grants && Array.isArray(p.grants.skins) ? p.grants.skins : [])))]

/** 붙여 넣은 글이 이보다 길면 읽지 않는다 — 실수로 다른 걸 통째로 붙였을 때 멈추지 않게 */
export const TRANSFER_MAX_CHARS = 200000

// ---------------------------------------------------------------- 바이트 ↔ 글자

let CRC_TABLE = null
/** CRC-32 (IEEE) — 잘림·오타 검사용. 보안이 아니다 */
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const hex8 = (n) => n.toString(16).padStart(8, '0')

function toBase64Url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------- 유료 항목

/** 유료 필드를 빈 값으로 — 내보낼 때와 가져올 때 둘 다 거친다 */
export function stripPaid(progress) {
  const skins = progress.skins && typeof progress.skins === 'object' ? progress.skins : { owned: [], equipped: {} }
  const owned = (Array.isArray(skins.owned) ? skins.owned : []).filter((id) => !PAID_SKINS.includes(id))
  const equipped = {}
  for (const [towerId, skinId] of Object.entries(skins.equipped || {})) {
    if (owned.includes(skinId)) equipped[towerId] = skinId
  }
  return {
    ...progress,
    purchases: [],
    premium: false,
    unlocks: { acts: [], packs: [] },
    skins: { owned, equipped },
  }
}

/**
 * 가져온 진행도에 **지금 기기의** 유료 자격과 설정을 얹는다.
 * 설정(언어·소리·진동)은 기기의 것이라 코드가 덮지 않는다.
 */
export function mergeImported(current, imported) {
  const base = stripPaid(imported)
  const curSkins = current.skins || { owned: [], equipped: {} }
  const paidOwned = (curSkins.owned || []).filter((id) => PAID_SKINS.includes(id))
  const owned = [...new Set([...base.skins.owned, ...paidOwned])]
  const equipped = { ...base.skins.equipped }
  for (const [towerId, skinId] of Object.entries(curSkins.equipped || {})) {
    if (paidOwned.includes(skinId)) equipped[towerId] = skinId
  }
  return {
    ...base,
    purchases: Array.isArray(current.purchases) ? [...current.purchases] : [],
    premium: !!current.premium,
    unlocks: {
      acts: [...((current.unlocks && current.unlocks.acts) || [])],
      packs: [...((current.unlocks && current.unlocks.packs) || [])],
    },
    skins: { owned, equipped },
    settings: current.settings,
    version: SAVE_VERSION,
  }
}

// ---------------------------------------------------------------- 코드

/** 진행도 → 옮기기 코드 (`CATPAW1.<본문>.<검사값>`) */
export function encodeTransfer(progress) {
  const plain = stripPaid({ ...progress, version: SAVE_VERSION })
  delete plain.settings // 기기 설정은 따라가지 않는다
  const bytes = new TextEncoder().encode(JSON.stringify(plain))
  return `${TRANSFER_PREFIX}.${toBase64Url(bytes)}.${hex8(crc32(bytes))}`
}

/**
 * 옮기기 코드 → 진행도(유료 필드는 비운 채). 실패하면 이유를 사람 말로 돌려준다.
 * 줄바꿈·띄어쓰기는 무시한다(메신저가 긴 글을 접어 붙이는 일이 흔하다).
 * @returns {{ok:true, progress:object} | {ok:false, reason:string}}
 */
export function decodeTransfer(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: tr('코드가 비어 있다') }
  if (text.length > TRANSFER_MAX_CHARS) return { ok: false, reason: tr('코드가 너무 길다 — 다른 글이 섞였는지 본다') }
  const compact = text.replace(/\s+/g, '')
  const parts = compact.split('.')
  if (parts.length !== 3 || parts[0] !== TRANSFER_PREFIX) {
    return { ok: false, reason: tr('캣포 디펜스 옮기기 코드가 아니다 (CATPAW1. 로 시작해야 한다)') }
  }
  let bytes
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[0-9a-f]{8}$/i.test(parts[2])) throw new Error('shape')
    bytes = fromBase64Url(parts[1])
  } catch {
    return { ok: false, reason: tr('코드가 깨졌다 — 처음부터 끝까지 다시 복사해 붙인다') }
  }
  if (hex8(crc32(bytes)) !== parts[2].toLowerCase()) {
    return { ok: false, reason: tr('코드가 잘렸거나 한 글자가 틀렸다 — 처음부터 끝까지 다시 복사해 붙인다') }
  }
  let raw
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return { ok: false, reason: tr('코드가 깨졌다 — 처음부터 끝까지 다시 복사해 붙인다') }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: tr('코드가 깨졌다 — 처음부터 끝까지 다시 복사해 붙인다') }
  }
  if (Number.isInteger(raw.version) && raw.version > SAVE_VERSION) {
    return { ok: false, reason: tr('더 새 버전에서 만든 코드다 — 이 기기의 앱을 업데이트한 뒤 가져온다') }
  }
  const { progress, reason } = migrate(raw)
  if (reason) return { ok: false, reason }
  return { ok: true, progress: stripPaid(progress) }
}

/** 가져오기 전에 보여 줄 요약 — 무엇을 덮어쓰는지 사람이 보고 고르게 */
export function transferSummary(progress) {
  const stars = Object.values((progress.scenario && progress.scenario.stars) || {})
    .reduce((s, n) => s + (Number(n) || 0), 0)
  const bestWave = Math.max(0, ...Object.values(progress.bestWave || {}).map((n) => Number(n) || 0))
  return {
    maps: Array.isArray(progress.unlockedMaps) ? progress.unlockedMaps.length : 0,
    stars,
    bestWave,
    catnip: Math.max(0, Number(progress.catnip) || 0),
    runs: (progress.stats && Number(progress.stats.runs)) || 0,
  }
}
