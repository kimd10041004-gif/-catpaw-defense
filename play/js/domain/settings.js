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
/**
 * 난이도 프리셋.
 *
 * ── K 에서 올렸다 (사람이 "쉽다"고 했다) ────────────────────────────────────
 *
 * 집냥이 1.00 → **1.03**, 길냥이 1.20 → **1.35**. 아깽이는 안 건드렸다 — 처음 하는 사람이 고르는 자리다.
 *
 * **집냥이가 3% 밖에 못 오르는 게 이 작업의 발견이다.** 위아래에서 눌린다:
 *
 *   · **아래(치즈냥 봇 바닥)** — 1.05 면 맵 순서가 깨지고, **1.10 이면 부엌이 1웨이브에 뚫린다**
 *     (`balance-sim.test` 의 '첫 실점이 5웨이브보다 이르지 않다'). 그게 상한이다.
 *   · **위(잘 두는 봇)** — `--policy deck` 으로 자유 맵 일곱을 재면 **첫 실점이 27.9웨이브**고
 *     목숨이 새는 웨이브가 **0.0개**다(30웨이브 맵에서). 체력을 **20%** 올려도 27.9 → 27.4 로
 *     반 웨이브 움직이고 완주율은 71% 그대로다.
 *
 * 즉 프리셋은 **전체를 같은 비율로 곱할 뿐**이라, 처음 하는 사람이 뚫리기 시작하는 지점과
 * 잘 두는 사람이 뭔가 느끼기 시작하는 지점 사이가 너무 멀다. **평평함은 웨이브 표에 있지
 * 프리셋에 있지 않다.** 그래서 여기서는 잰 상한까지만 올리고, 기울기는 챕터·맵·원정 칸의
 * `hpMul` 로 만든다.
 *
 * 길냥이는 1.35 까지 올라간다 — 1.40 이면 창고가 2웨이브에 뚫린다.
 *
 * ▶ 남은 의문 하나: 이 상한을 정하는 치즈냥 봇은 **자리를 나쁘게 고르는 봇**이다(K 에서 확인).
 *   사람은 그보다 잘 둔다. 그래서 이 바닥이 지나치게 보수적일 수 있다 —
 *   바꾸려면 그건 프로젝트의 안전 기준을 바꾸는 일이라 따로 정한다.
 */
export const DIFFICULTIES = {
  kitten: { id: 'kitten', name: '아깽이 (쉬움)', hpMul: 0.75, goldMul: 1.25, livesMul: 1.5, catnipMul: 1.0 },
  normal: { id: 'normal', name: '집냥이 (보통)', hpMul: 1.03, goldMul: 1.00, livesMul: 1.0, catnipMul: 1.0 },
  stray:  { id: 'stray',  name: '길냥이 (어려움)', hpMul: 1.35, goldMul: 1.00, livesMul: 0.85, catnipMul: 1.5 },
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
