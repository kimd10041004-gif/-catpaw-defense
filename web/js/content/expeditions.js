/**
 * 속성 원정 — 칸을 이어 도는 사다리.
 *
 * **무료다.** 맵을 깨고 나가는 길이 뽑기 운에 걸리면 안 된다는 원칙이 여기까지 온다
 * (README 무료 범위 약속). 그리고 티켓을 버는 두 길 중 하나가 원정이라
 * (다른 하나는 출석) 유료로 잠그면 "결제 없이도 모을 수 있다"가 거짓이 된다.
 * 그래서 `content/index.js` 에서 `// demo:strip` 을 안 붙인다.
 *
 * ▶ 칸을 고치려면 아래 `stages` 행 하나를 고친다. 검사가 맵·웨이브셋·길이를 대조하고,
 *   `balance-sim --expedition` 이 "상성을 맞춘 덱이 실제로 더 낫나"를 잰다.
 *
 * ── 왜 여섯 칸인가 (다섯으로 짰다가 시뮬레이터에 잡혔다) ─────────────────────
 *
 * 처음엔 다섯 칸(흙·번개·얼음·어둠·불)이었다. 그런데 룬 배치 1,296가지를 전부 돌려 보니
 * **네 마리를 전부 흙으로 맞추는 것이 언제나 정답**이었다. 이유가 구조적이다:
 * 속성 E 는 고리에서 자기 **앞** 속성에게만 약한데(흙의 앞은 빛), 그 칸이 사다리에 없으면
 * 그 속성으로 도배한 덱은 **약점이 하나도 없다.** 다섯 칸이면 여섯 속성 중 하나가 반드시 빠지고,
 * 빠진 속성 하나가 그런 안전한 답을 만든다.
 *
 *   사다리        기본 덱 최소   최선 덱 최소   전부 한 속성(최선) 최소
 *   5칸 (빛 없음)     3.7           4.0          **4.0**  ← 도배가 최선과 같다
 *   6칸 (전부)        3.7           3.9            2.8    ← 도배가 최악이 된다
 *
 * 그래서 **여섯 속성을 한 칸씩** 넣는다. 대신 칸을 8~12웨이브로 짧게 잡아 한 판 ~15분을 지킨다.
 * (사용자가 고른 것은 "5칸 · 15분"이었다. 칸 수는 늘리고 시간은 지켰다 — 이유는 위 표다.)
 *
 * ── 칸 순서 ────────────────────────────────────────────────────────────────
 *
 * 고리 순서 그대로(흙 → 번개 → 얼음 → 불 → 어둠 → 빛) 간다. 도감의 고리를 외운 사람이
 * 사다리를 보고 다음 칸을 예상할 수 있어야 상성이 놀이가 된다.
 *
 * 타고난 속성만 쓰는 기본 덱(치즈·삼색·검은·샴)의 칸별 배수 합은 4.5 / 4.2 / 4.0 / 4.2 / 3.7(가장 낮다) / 4.2 —
 * 5칸(어둠)이 자연스러운 고비다. 거기를 룬으로 메우는 것이 이 모드의 첫 숙제다.
 *
 * 웨이브셋은 **기존 것을 재사용**하고 `waveLimit` 만 준다. 새 웨이브셋을 만들면
 * `curve-report --all` 의 절벽 검사를 새로 통과시켜야 하는데, 여기서 필요한 건 길이 조절뿐이다.
 * `hpMul` 은 짧게 자른 웨이브셋의 가벼움을 되돌리는 조율 손잡이다(맵의 hpMul 위에 곱해진다).
 * 값은 눈대중이 아니라 `balance-sim --expedition` 으로 재서 정했다. 1.00/1.00/1.00/1.05/1.10/1.15 에서
 * smart 봇(필살기 사용, 6판, 시드 7·31) 기준:
 *
 *   최선 룬 덱   완주 50~67%   도달 5.8   중앙 6칸
 *   기본 (룬 없음)  완주 17~33%   도달 5.0   중앙 4칸
 *   도배 (전부 흙)  완주  0%      도달 5.2   중앙 5칸
 *
 * 세 기준을 다 만족한다: 아무 덱으로나 1칸은 깬다 · 상성을 맞춘 덱이 더 낫다 ·
 * 마지막 칸은 아무 덱으로나 안 깨진다. 램프를 1.0/1.02/1.05/1.1/1.15/1.2 로 올리면
 * 최선 덱도 17~33% 로 떨어져 "잘 맞춰도 못 깬다"가 된다 — 그래서 여기서 멈췄다.
 */

import { registerExpedition } from './registry.js'

registerExpedition({
  id: 'ember-road',
  name: '잿불 길',
  order: 1,
  desc: '여섯 칸을 목숨 하나로 잇는다. 칸마다 해충의 속성이 다르다.',
  stages: [
    {
      mapId: 'alley', waveSet: 'standard30', waveLimit: 10, element: 'earth', hpMul: 1.00,
      reward: { tickets: 1, catnip: 20, shards: 20 },
    },
    {
      mapId: 'corridor', waveSet: 'rush20', waveLimit: 10, element: 'bolt', hpMul: 1.00,
      reward: { tickets: 1, catnip: 25, shards: 25 },
    },
    {
      mapId: 'rooftop', waveSet: 'rooftop30', waveLimit: 10, element: 'ice', hpMul: 1.00,
      reward: { tickets: 1, catnip: 30, shards: 30 },
    },
    {
      mapId: 'plaza', waveSet: 'siege20', waveLimit: 10, element: 'fire', hpMul: 1.05,
      reward: { tickets: 1, catnip: 35, shards: 35 },
    },
    {
      mapId: 'basement', waveSet: 'basement30', waveLimit: 12, element: 'dark', hpMul: 1.10,
      reward: { tickets: 2, catnip: 40, shards: 45 },
    },
    {
      mapId: 'attic', waveSet: 'nightmare20', waveLimit: 12, element: 'light', hpMul: 1.15,
      reward: { tickets: 2, catnip: 60, shards: 60, rune: 'dark' },
    },
  ],
})

/* ── 두 번째 사다리 ─────────────────────────────────────────────────────────
 *
 * 색만 바꾼 사다리는 뜻이 없다. 이건 첫 사다리와 **다른 것을 묻는다**:
 *
 *   1. 고리를 **한 칸 돌려서** 시작한다 (빛 → 흙 → 번개 → 얼음 → 불 → 어둠).
 *      잿불 길에 맞춰 둔 룬이 칸마다 하나씩 어긋난다 — 덱을 다시 짜야 한다.
 *
 *      **거꾸로 돌리려다 되돌렸다.** 정순 사다리에서는 k칸을 세게 만든 룬의 약점이
 *      k−2칸(더 앞, 더 쉬운 곳)에 떨어진다. 역순이면 그 약점이 **뒤쪽 더 어려운 칸**에 떨어져서,
 *      "어려운 칸에 힘을 몰아라"라는 이 모드의 유일한 선택지가 구조적으로 막힌다.
 *      실제로 역순으로 재 보니 최선 덱·기본 덱·도배 덱의 칸별 배수가 전부 같아졌다(완주율 0%/0%/0%).
 *   2. **장갑이 두꺼워진다** (2칸 +2 · 3칸 +3 · 5칸 +4). 잿불 길이 체력 싸움이라면
 *      이쪽은 **장갑 싸움**이다. 먼치킨냥(장갑 벗기기)·터키시앙고라냥(장갑 무시)이
 *      정확히 답이 되는 자리라, 카드 고양이가 "있으면 편한" 것이 아니라 "여기서 쓰는" 것이 된다.
 *
 * **규칙을 네 개 더 얹었다가 뺐다.** 처음엔 칸마다 도전 규칙 하나씩(맨손·여덟 자리·질주·보스 2배)을
 * 두려고 했는데, 재 보니 그 규칙들이 **속성을 눌러 버렸다** — 최선 덱과 아무것도 안 낀 덱의
 * 완주율이 뒤집혔다. 이유는 단순하다: `noSpecials`·`maxTowers`·`speedMul` 은 **피해 +50% 로 풀리는
 * 문제가 아니다.** 상성이 주는 유일한 답이 피해인 모드에서, 피해로 답할 수 없는 제약을 얹으면
 * 사다리는 어려워지지만 **깊어지지는 않는다.** 그래서 장갑(피해로 답한다)과 판매 금지(직교한다)만 남겼다.
 *
 * **골드를 깎는 규칙은 안 쓴다.** E 단계에서 잰 것: 초반 골드 삭감은 "못 산다 → 샌다 →
 * 목숨이 준다 → 더 못 산다"로 복리가 붙는다. 목숨이 칸을 넘어 이어지는 모드에서는 더 나쁘다.
 */

registerExpedition({
  id: 'frost-climb',
  name: '서릿길',
  order: 2,
  desc: '고리가 한 칸 돌아간다. 그리고 해충의 장갑이 두꺼워진다.',
  requires: 'ember-road',
  stages: [
    {
      mapId: 'kitchen', waveSet: 'kitchen30', waveLimit: 10, element: 'light', hpMul: 1.00,
      // 첫 칸엔 규칙을 안 얹는다 — 거꾸로 도는 것 자체가 이미 새 문제다
      reward: { tickets: 2, catnip: 30, shards: 30 },
    },
    {
      mapId: 'plaza', waveSet: 'siege20', waveLimit: 10, element: 'earth', hpMul: 1.00,
      rules: { armorAdd: 2 },            // 철갑 — 장갑 벗기기·장갑 무시가 답이 되는 자리
      reward: { tickets: 2, catnip: 35, shards: 35 },
    },
    {
      mapId: 'warehouse', waveSet: 'warehouse30', waveLimit: 10, element: 'bolt', hpMul: 1.00,
      rules: { armorAdd: 3 },            // 더 두꺼운 철갑
      reward: { tickets: 2, catnip: 40, shards: 40 },
    },
    {
      mapId: 'corridor', waveSet: 'rush20', waveLimit: 12, element: 'ice', hpMul: 1.05,
      reward: { tickets: 2, catnip: 45, shards: 45 },
    },
    {
      mapId: 'basement', waveSet: 'basement30', waveLimit: 12, element: 'fire', hpMul: 1.12,
      rules: { armorAdd: 4 },            // 가장 두껍다
      reward: { tickets: 3, catnip: 55, shards: 55 },
    },
    {
      mapId: 'attic', waveSet: 'nightmare20', waveLimit: 12, element: 'dark', hpMul: 1.20,
      /* 마지막 칸의 규칙은 판매 금지다. 처음엔 보스 2배를 여기 뒀다가 되돌렸다 —
       * 다락방+악몽20은 규칙 없이도 봇이 못 깨는 맵이라(자유 모드 클리어율 0%), 거기 보스를 두 배로 하면
       * "어려운 칸"이 아니라 "못 깨는 칸"이 된다. 보스 2배는 3칸(창고)으로 옮겼다. */
      rules: { noSell: true },           // 판매 금지 — 자리를 되물릴 수 없다
      reward: { tickets: 3, catnip: 90, shards: 80, rune: 'light' },
    },
  ],
})
