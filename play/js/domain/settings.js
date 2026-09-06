/**
 * 게임 설정 — 스키마가 곧 UI다.
 * 설정을 하나 추가하고 싶으면 SETTINGS_SCHEMA 배열에 한 줄만 넣으면 된다.
 * 설정 화면 DOM은 ui.js가 이 배열을 순회해 자동 생성하므로 UI 코드는 손댈 필요가 없다.
 */

/**
 * 난이도 프리셋 — 여기에 항목을 추가하면 설정의 난이도 선택지에 자동으로 나타난다.
 *
 * ── 골드는 깎지 않는다 ──────────────────────────────────────────────────────
 * 길냥이는 원래 `goldMul: 0.85` 였고, 그래서 놀 수가 없었다. 봇으로 재 보니 첫 실점이 4~6웨이브였고
 * 실점이 보스가 아니라 잡몹 웨이브에 흩어져 있었다 — "어렵다"가 아니라 "시작하자마자 무너진다"다.
 * 다른 것을 그대로 두고 골드 배수만 0.85 → 1.00 으로 올리자 부엌 도달 중앙이 5 → 30웨이브로 뛰었다.
 * 초반 골드 삭감은 복리가 붙는다: 첫 두세 마리를 못 산다 → 샌다 → 목숨이 준다 → 더 못 산다.
 * 그래서 난이도는 **적 체력과 목숨으로만** 가른다. 실수의 여유가 줄지, 시작이 막히지 않는다.
 *
 * catnipMul — 어려움을 고를 이유. 쉬움에는 벌점이 없다(1.0 아래로 내리지 않는다):
 * "결제 없이도 모을 수 있다"는 약속을 난이도로 깨지 않는다. content.test 가 이걸 지킨다.
 *
 * 값은 `node tools/balance-sim.mjs --policy smart --specials` 로 잰 것이다 (8판·시드 7):
 *   아깽이  100/100/100/100/100/38%  (마지막 맵만 남는다)
 *   집냥이  100/100/100/100/  0/  0%  (t5·t6 는 끝 웨이브까지 가서 진다)
 *   길냥이   13/ 75/ 50/ 88/  0/  0%  (어렵지만 깰 수 있고, 첫 실점은 빨라야 10웨이브)
 */
export const DIFFICULTIES = {
  kitten: { id: 'kitten', name: '아깽이 (쉬움)', hpMul: 0.75, goldMul: 1.25, livesMul: 1.5, catnipMul: 1.0 },
  normal: { id: 'normal', name: '집냥이 (보통)', hpMul: 1.00, goldMul: 1.00, livesMul: 1.0, catnipMul: 1.0 },
  stray:  { id: 'stray',  name: '길냥이 (어려움)', hpMul: 1.20, goldMul: 1.00, livesMul: 0.85, catnipMul: 1.5 },
}

const difficultyOptions = () => Object.values(DIFFICULTIES).map((d) => [d.id, d.name])

/**
 * 설정 스키마.
 * type: 'toggle' | 'range' | 'select'
 * options: select일 때 [값, 표시이름] 쌍의 배열
 */
export const SETTINGS_SCHEMA = [
  { id: 'sfx',    group: '소리', type: 'toggle', default: true, label: '효과음' },
  { id: 'bgm',    group: '소리', type: 'toggle', default: true, label: '배경음' },
  { id: 'volume', group: '소리', type: 'range', default: 0.7, min: 0, max: 1, step: 0.1, label: '음량' },

  { id: 'language', group: '게임', type: 'select', default: 'auto',
    options: [['auto', '기기 언어'], ['ko', '한국어'], ['en', 'English']], label: '언어',
    hint: '바꾸면 다시 시작한다' },
  { id: 'difficulty', group: '게임', type: 'select', default: 'normal',
    options: difficultyOptions(), label: '난이도',
    hint: '다음 판부터 적용 · 길냥이는 캣닢 1.5배' },
  { id: 'defaultSpeed', group: '게임', type: 'select', default: 1,
    options: [[1, '1배'], [2, '2배'], [3, '3배']], label: '기본 배속' },
  { id: 'autoStartWave', group: '게임', type: 'toggle', default: false, label: '웨이브 자동 시작' },
  { id: 'confirmSell', group: '게임', type: 'toggle', default: true, label: '타워 판매 전 확인' },

  { id: 'showAllRanges', group: '표시', type: 'toggle', default: false, label: '모든 타워 사거리 항상 표시' },
  { id: 'showDamageNumbers', group: '표시', type: 'toggle', default: true, label: '데미지 숫자 표시' },
  { id: 'hpBars', group: '표시', type: 'select', default: 'damaged',
    options: [['always', '항상'], ['damaged', '피해 입으면'], ['never', '숨김']], label: '적 체력바' },
  { id: 'reducedMotion', group: '표시', type: 'toggle', default: false, label: '화면 흔들림 줄이기' },
  { id: 'haptics', group: '표시', type: 'toggle', default: true, label: '진동(햅틱)' },
  { id: 'leftHanded', group: '표시', type: 'toggle', default: false, label: '왼손 모드' },
  { id: 'hints', group: '표시', type: 'toggle', default: true, label: '첫 판 도움말',
    hint: '한 번 본 안내는 다시 안 뜬다' },
  { id: 'textSize', group: '표시', type: 'select', default: 'normal',
    options: [['normal', '보통'], ['large', '크게']], label: '글자 크기',
    hint: '메뉴와 시트에 적용' },
]

/** 스키마에 정의된 그룹을 등장 순서대로 (설정 화면 섹션 순서) */
export function settingsGroups() {
  const seen = []
  for (const item of SETTINGS_SCHEMA) if (!seen.includes(item.group)) seen.push(item.group)
  return seen
}

/** id로 스키마 항목 찾기 */
export function schemaItem(id) {
  return SETTINGS_SCHEMA.find((s) => s.id === id) || null
}

/** 스키마의 기본값만으로 채운 설정 객체 */
export function defaultSettings() {
  const out = {}
  for (const item of SETTINGS_SCHEMA) out[item.id] = item.default
  return out
}

/**
 * 저장된 값이 손상됐거나 범위를 벗어났을 때 안전한 값으로 강제한다.
 * (사용자가 localStorage를 직접 만졌거나, 예전 버전의 값이 남아 있는 경우 방어)
 */
export function coerce(item, value) {
  if (value === undefined || value === null) return item.default

  switch (item.type) {
    case 'toggle':
      return typeof value === 'boolean' ? value : item.default

    case 'range': {
      const n = Number(value)
      if (!Number.isFinite(n)) return item.default
      return Math.min(item.max, Math.max(item.min, n))
    }

    case 'select': {
      const allowed = item.options.map((o) => o[0])
      return allowed.includes(value) ? value : item.default
    }

    default:
      return item.default
  }
}

/**
 * 임의의 객체를 스키마에 맞는 설정으로 정규화한다.
 * 스키마에 없는 키는 버리고, 빠진 키는 기본값으로 채운다.
 */
export function normalizeSettings(raw) {
  const out = {}
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const item of SETTINGS_SCHEMA) out[item.id] = coerce(item, src[item.id])
  return out
}

/** 난이도 프리셋 조회 (모르는 id면 보통 난이도) */
export function difficultyOf(settings) {
  return DIFFICULTIES[settings && settings.difficulty] || DIFFICULTIES.normal
}
