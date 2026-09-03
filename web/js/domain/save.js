/**
 * 진행도 저장/불러오기 — 버전과 마이그레이션을 처음부터 넣어둔다.
 * 나중에 맵이나 기능을 추가해도 기존 저장 데이터가 깨지지 않게 하는 것이 목적이다.
 */

import { normalizeSettings } from './settings.js'

/** 현재 저장 포맷 버전. 구조를 바꿀 때마다 올리고 migrate에 단계를 추가한다. */
export const SAVE_VERSION = 2

/** localStorage 키 */
export const SAVE_KEY = 'catpaw.progress'
/** 읽을 수 없는 저장 데이터를 버리지 않고 옮겨두는 백업 키 (사용자 데이터 무손실) */
export const BACKUP_KEY = 'catpaw.progress.backup'

/** 처음 시작할 때의 진행도. 첫 맵만 열려 있고 캣닢은 조금 준다. */
export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedMaps: ['alley'],
    bestWave: {},
    clears: {},
    catnip: 30,          // 필살기 한 번은 눌러볼 수 있게 주고 시작한다
    purchases: [],       // 결제 영수증 기록 (중복 적용 방지용 token 포함)
    premium: false,      // 프리미엄 팩 구매 여부
    settings: normalizeSettings(null),
  }
}

/**
 * 어떤 형태로 저장돼 있든 현재 버전의 진행도로 끌어올린다.
 * @param {any} raw 파싱된 저장 객체 (없으면 null)
 * @returns {{progress:object, migrated:boolean, reason:string|null}}
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { progress: defaultProgress(), migrated: false, reason: '저장 데이터 없음' }
  }

  const version = Number.isInteger(raw.version) ? raw.version : 0

  // 미래 버전은 이 코드가 해석할 수 없다. 덮어쓰지 말고 기본값으로 시작한다.
  if (version > SAVE_VERSION) {
    return {
      progress: defaultProgress(),
      migrated: false,
      reason: `저장 데이터가 더 최신 버전입니다 (v${version} > v${SAVE_VERSION})`,
    }
  }

  let cur = { ...raw }
  let migrated = false

  // --- v0 → v1 : 버전 필드가 없던 초기 데이터 ---
  if (version < 1) {
    cur = {
      version: 1,
      unlockedMaps: Array.isArray(cur.unlockedMaps) ? cur.unlockedMaps : ['alley'],
      bestWave: cur.bestWave && typeof cur.bestWave === 'object' ? cur.bestWave : {},
      clears: cur.clears && typeof cur.clears === 'object' ? cur.clears : {},
      settings: cur.settings,
    }
    migrated = true
  }

  // --- v1 → v2 : 캣닢/결제 필드 추가 ---
  // 다음 버전을 추가할 때는 아래에 `if (version < 3) { ... }` 블록을 이어 붙인다.
  if (version < 2) {
    cur = {
      ...cur,
      version: 2,
      catnip: typeof cur.catnip === 'number' ? cur.catnip : 30,
      purchases: Array.isArray(cur.purchases) ? cur.purchases : [],
      premium: cur.premium === true,
    }
    migrated = true
  }

  const base = defaultProgress()
  const progress = {
    version: SAVE_VERSION,
    unlockedMaps: sanitizeMapList(cur.unlockedMaps, base.unlockedMaps),
    bestWave: sanitizeNumberMap(cur.bestWave),
    clears: sanitizeNumberMap(cur.clears),
    catnip: sanitizeCount(cur.catnip, base.catnip),
    purchases: sanitizePurchases(cur.purchases),
    premium: cur.premium === true,
    settings: normalizeSettings(cur.settings),
  }
  return { progress, migrated, reason: null }
}

/** 음수·NaN·문자열을 막고 0 이상의 정수로 만든다. */
function sanitizeCount(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/** 영수증 배열에서 형식이 맞는 것만 남긴다 (중복 적용 방지의 근거가 되므로 token은 필수). */
function sanitizePurchases(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && typeof p === 'object' && typeof p.sku === 'string' && typeof p.token === 'string')
    .map((p) => ({
      productId: String(p.productId || ''),
      sku: p.sku,
      token: p.token,
      mock: p.mock === true,
      at: Number.isFinite(Number(p.at)) ? Number(p.at) : 0,
    }))
}

/** 문자열 맵 id만 남긴다. 비면 기본값. */
function sanitizeMapList(list, fallback) {
  if (!Array.isArray(list)) return [...fallback]
  const out = list.filter((v) => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? Array.from(new Set(out)) : [...fallback]
}

/** { 맵id: 숫자 } 형태만 남긴다 (음수·NaN·문자열 방어). */
function sanitizeNumberMap(obj) {
  const out = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v)
    if (typeof k === 'string' && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n)
  }
  return out
}

/**
 * 저장소에서 진행도를 읽는다. 손상됐으면 원본을 백업 키로 옮기고 기본값으로 시작한다.
 * @param {{getItem:Function, setItem:Function}} storage localStorage 호환 객체
 */
export function loadProgress(storage) {
  if (!storage) return defaultProgress()
  let text = null
  try {
    text = storage.getItem(SAVE_KEY)
  } catch {
    return defaultProgress() // 사생활 보호 모드 등으로 접근이 막힌 경우
  }
  if (!text) return defaultProgress()

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    backup(storage, text)
    return defaultProgress()
  }

  const { progress, reason } = migrate(parsed)
  if (reason) backup(storage, text)
  return progress
}

/** 해석할 수 없는 원본을 백업해둔다 (덮어쓰기 전에 반드시 호출). */
function backup(storage, text) {
  try {
    storage.setItem(BACKUP_KEY, text)
  } catch { /* 백업 실패는 치명적이지 않으므로 무시한다 */ }
}

/** 진행도를 저장한다. 실패해도 게임은 계속 돌아가야 하므로 예외를 밖으로 던지지 않는다. */
export function saveProgress(storage, progress) {
  if (!storage) return false
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...progress, version: SAVE_VERSION }))
    return true
  } catch {
    return false
  }
}

/**
 * 한 판이 끝났을 때 진행도를 갱신한다 (제자리 변경 없이 새 객체 반환).
 * @param {object} progress 현재 진행도
 * @param {string} mapId 방금 플레이한 맵
 * @param {number} reachedWave 도달한 웨이브
 * @param {boolean} cleared 클리어 여부
 * @param {string|null} nextMapId 클리어 시 해금할 다음 맵 (없으면 null)
 */
export function recordResult(progress, mapId, reachedWave, cleared, nextMapId = null) {
  const bestWave = { ...progress.bestWave }
  bestWave[mapId] = Math.max(bestWave[mapId] || 0, reachedWave)

  const clears = { ...progress.clears }
  if (cleared) clears[mapId] = (clears[mapId] || 0) + 1

  const unlockedMaps = [...progress.unlockedMaps]
  if (cleared && nextMapId && !unlockedMaps.includes(nextMapId)) unlockedMaps.push(nextMapId)

  return { ...progress, bestWave, clears, unlockedMaps }
}

/**
 * 캣닢을 더한다 (음수면 차감). 0 아래로는 내려가지 않는다.
 * @returns {object} 새 진행도
 */
export function addCatnip(progress, amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return progress
  return { ...progress, catnip: Math.max(0, (progress.catnip || 0) + Math.round(n)) }
}
