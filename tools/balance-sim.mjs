/**
 * 밸런스 시뮬레이터 — 자동 플레이어가 실제로 판을 돌려 본다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * 지금까지 밸런스는 '수치 설계'였다. balance.test.mjs 는 applyArmor·scaleHp 같은
 * 공식이 맞는지만 보고, content.test.mjs 의 '맵: 뒤로 갈수록 난이도가 높아진다'는
 * 맵에 적어 둔 difficulty 숫자만 비교한다. 아무도 끝까지 플레이해 본 적이 없다.
 *
 * 그런데 game.js 는 DOM 을 전혀 안 쓴다(파일 첫 줄이 그렇게 선언하고 실제로 그렇다).
 * Node 에서 그대로 돌아가고 한 판이 76ms 다. 처음 돌려 보니 선언 난이도와 실제
 * 플레이가 거의 무관했다 — 창고(1.45)가 중앙값 4웨이브인데 지하실(1.52)은 10,
 * 다락방은 20판 전부 1웨이브였다. 검사가 못 잡은 이유는 하나, 안 해봤기 때문이다.
 *
 * ── 자동 플레이어가 하는 것 ────────────────────────────────────────────────
 *   · 길에서 가까운 칸부터 짓는다. 좌상단부터 채우면 사거리 밖이라 맵끼리
 *     비교가 불공평해진다 (첫 시도에서 실제로 그래서 결과가 뒤집혔다)
 *   · 업그레이드를 먼저, 그다음 신축. 돈이 다 떨어질 때까지
 *   · --specials 를 주면 적이 6마리 넘게 몰릴 때 쓸 수 있는 필살기를 쓴다
 *
 * 치즈냥만 쓰고 펫·조합·표적 모드를 안 쓴다. 그래서 절대 수치는 사람보다
 * 비관적이다. 하지만 모든 맵에 같은 정책을 대므로 맵끼리의 비교는 유효하다.
 *
 *   node tools/balance-sim.mjs                    맵 6종 × 난이도 3종, 각 5판
 *   node tools/balance-sim.mjs --runs 20          판 수를 늘린다
 *   node tools/balance-sim.mjs --difficulty normal --runs 20 --specials
 *   node tools/balance-sim.mjs --json             검사가 먹을 수 있는 형태로
 *   node tools/balance-sim.mjs --growth 3 --seed 7  훈련 만렙(고양이마다 공격 +15%)이 후반을 얼마나 쉽게 만드는지 — 같은 시드로 0단계와 비교
 *   node tools/balance-sim.mjs --policy smart --specials    사람에 가장 가까운 봇(공중 인식·표적 모드·펫) — 난이도를 잡을 때 쓰는 기준
 *   node tools/balance-sim.mjs --expedition frost-climb --policy deck --deck munchkin,angora,forest,bengal
 *                                                 smart + 임의의 덱을 들 수 있는 봇 — 카드 고양이 덱을 재는 유일한 길
 *   node tools/balance-sim.mjs --expedition ember-road --search-runes --runs 2 --seed 7
 *                                                 룬 배치를 실제 판으로 탐색해 referenceRunes 에 붙일 모양으로 찍는다 (~5분)
 */
import { mulberry32 } from '../web/js/domain/rng.js'
import '../web/js/content/index.js'
import { Game } from '../web/js/game.js'
import { getEnemy, getMap, getTower, listBossIds, listMaps, listSpecials, listTowers } from '../web/js/content/registry.js'
import { pointAtDistance } from '../web/js/domain/path.js'
import { defaultProgress } from '../web/js/domain/save.js'
import { DIFFICULTIES } from '../web/js/domain/settings.js'
import { getExpedition, listExpeditions } from '../web/js/content/registry.js'
import { DECK_SIZE, stageRules } from '../web/js/domain/expedition.js'
import { ELEMENTS, elementMul } from '../web/js/domain/elements.js'
import { buildCost } from '../web/js/domain/economy.js'

export { mulberry32 }

/**
 * 'mixed' 정책의 건설 순서. 치즈냥만 쓰는 봇은 바닥이고, 이 봇이 사람에 조금 더 가까운 기준이다.
 * (지상 광역·저격·둔화·범위 전체가 섞인다. 펫·조합·표적 모드는 여전히 안 쓴다.)
 */
export const MIXED_ORDER = ['cheese', 'cheese', 'calico', 'black', 'siamese', 'cheese', 'black', 'chonk']

/**
 * 'smart' 정책 — 사람에 더 가까운 기준. mixed 와 다른 것 넷:
 *   · 다음 웨이브의 공중 비율을 보고 지상 전용 고양이를 건너뛴다.
 *     mixed 는 순서가 고정이라 공중만 오는 웨이브에도 삼색냥(지상 전용)을 놓고, 그 골드는 그냥 버려진다.
 *   · 펫을 데려간다. 사람은 늘 하나 데려가는데 봇만 맨몸이었다.
 *   · 필살기를 보스가 살아 있을 때도 쓴다. mixed 는 '적 일곱 마리 이상'만 봐서 보스 한 마리에는 쓰지 않았다.
 * 그래도 조합·판매·소모품·업그레이드 우선순위는 안 쓴다. 사람은 여전히 이보다 잘한다.
 *
 * 표적 모드는 **일부러 안 쓴다.** 검은냥·고등어냥을 '강력'으로 두면 사람처럼 보이지만 재 보면 더 나쁘다 —
 * 보스 맵에서 한 방이 무거운 고양이들이 전부 보스만 때리는 동안 잡몹이 그대로 지나간다
 * (아깽이 지하실 100% → 0%, 다락방 38% → 0%). 사람은 상황을 보고 바꾸지, 켜 두지 않는다.
 *
 * ── 'deck' 정책 — **임의의 덱을 들 수 있는 봇** ─────────────────────────────
 *
 * `smart` 는 고양이 열다섯 중 **여섯을 못 든다.** 건설 순서가 `MIXED_ORDER` 한 줄에 손으로 박혀 있고
 * 거기 카드 고양이가 하나도 없어서다. 그래서 원정 덱에 카드 고양이를 넣으면
 * **1칸도 못 넘긴다**(먼치킨·앙고라·숲·메인쿤 덱은 3웨이브에 죽는다. 기본 넷은 10웨이브를 다 깬다).
 * 서릿길이 장갑 사다리라 그 답이 먼치킨·앙고라인데, **그 답을 쥔 봇이 없어서 사다리를 못 쟀다.**
 *
 * `deck` 이 `smart` 에 더하는 것은 **하나뿐이다: 덱에서 건설 순서를 만든다.**
 * `MIXED_ORDER` 에서 걸러낸 뒤 남은 덱 고양이를 **버리지 않고** 비용 오름차순으로 뒤에 붙인다
 * (`deckOrder`). 그래서 섞인 덱에서 카드 고양이가 처음으로 판에 놓인다 —
 * 재 보면 눈에 보인다(치즈·검은·먼치킨·앙고라 덱, 서릿길 3칸):
 *
 *   smart  {치즈 4, 검은 2}                  ← 먼치킨·앙고라가 **한 번도 안 놓인다**
 *   deck   {치즈 3, 검은 2, 먼치킨 1}
 *
 * ── 넣었다가 **재 보고 버린 것 둘** ────────────────────────────────────────
 *
 * 둘 다 "비싼 고양이를 사게 하자"는 시도였고 둘 다 판을 더 나쁘게 만들었다. 남겨 두는 이유는
 * 다음 사람이 같은 걸 다시 시도하지 않게 하기 위해서다.
 *
 *   1. **못 사면 싼 것으로 대신 놓기** (웨이브당 한 번으로 묶어서). 원 주석이 경고한 그대로
 *      퇴화했다 — 서릿길 1칸 구성이 `치즈3·검은2` → **`치즈8`** 이 됐다. 골드를 쓰면
 *      비싼 쪽은 영영 안 온다.
 *   2. **다음에 살 것이 비싸면 업그레이드를 멈추고 모으기** (절반 이상 모았을 때만).
 *      6칸이 `12/12 승` → **`3/12 패 {치즈2}`** 로 무너졌다. 앉아서 모으는 동안 판이 얇아진다.
 *
 * 그래서 **비싼 유틸 고양이(숲 260 · 앙고라 300 · 사바나 360 · 메인쿤 400)는 여전히 잘 안 놓인다.**
 * 봇에 '모으기'가 없기 때문이다. 이건 남은 한계로 그대로 적는다.
 *
 * ── 자리 고르기 — 절반만 값을 했다 ─────────────────────────────────────────
 *
 * 유틸 고양이를 놓게 했더니 성적이 떨어졌길래(아래) **자리를 안 보는 것**이 원인일 거라 보고
 * `spotScore` 를 넣었다. 여섯 시드 × 12판으로 재니 **갈렸다**:
 *
 *   딜러3+먼치킨(디버프)   자리 안 봄 22.2%  →  자리 봄 **32.0%**   (여섯 중 넷 개선, 한 번도 안 나빠짐)
 *   딜러3+숲(아우라)       자리 안 봄 34.8%  →  자리 봄   34.8%    ← **완전히 동일**
 *
 * 아우라형은 **탐욕 배치가 이미 최적이었다** — 첫 빈 칸과 최고 점수 칸이 같은 칸으로 나왔다
 * (맵 126칸에 타워가 길을 따라 붙어 서니 반경 안에 늘 이웃이 있다). 그래서 아우라 가지는 **뺐다.**
 *
 * **그리고 합격선은 못 넘었다.** 같은 여섯 시드에서 `smart` 는 48.7% 다 —
 * 유틸 고양이를 **아예 안 놓는 쪽**이 여전히 낫다(32.0% 대 48.7%).
 * 자리를 봐서 격차를 26.5pp → 16.7pp 로 줄였을 뿐이다.
 *
 * 왜 안 뒤집히나: 먼치킨은 90골드에 초당피해 15.4 · 사거리 1.4 인데, 그 자리에 치즈(80골드 ·
 * 19.2 · 2.6)를 하나 더 놓는 것과 겨뤄야 한다. `sunder` 의 장갑 -3 은 **여러 딜러가 같은 적을
 * 때릴 때** 값을 하는데, 봇의 판은 타워 대여섯이 길을 따라 **퍼져** 있다. 사람은 길목 하나에
 * 화력을 모으고 거기 먼치킨을 붙인다 — 그 '길목 집중'이 봇에 없는 다음 레버다.
 * **자리를 보게 해도 유틸은 아직 봇에게 제값을 못 한다.** 그대로 적는다.
 *
 * ── 카드 고양이만 넷인 덱은 봇 문제가 **아니다** ────────────────────────────
 *
 * 그런 덱은 상성이 아예 없는 자유 맵에서도 2~4웨이브에 죽는다(기본 넷은 30/30 완주).
 * 이유가 로스터에 있다: **카드 고양이에는 싼 전천후 딜러가 없다.**
 * 치즈 80·전천후·사거리 2.6·피해/골드 24.0 에 해당하는 카드가 없다 —
 * 벵갈(26.2)은 공중 전용, 먼치킨(17.1)은 사거리 1.4 로 게임 최단, 나머지 넷은 6.6 이하다.
 * 사람이 들어도 안 되는 덱이다. 카드 고양이는 **싼 딜러를 깔고 그 위에 얹는** 조각이다.
 *
 * **`smart` 는 한 줄도 안 건드렸다.** 그 숫자가 `balance-sim.test`·`balance-sim-expedition.test` 와
 * README·확장가이드·속성과카드·expeditions.js 머리말에 전부 문서화돼 있다. 얼려 두면
 * "안 움직였다"를 대조로 증명할 수 있다 — 실제로 그렇게 확인했다.
 *
 * ▶ **두 봇의 숫자를 섞어 비교하면 거짓말이 된다.** 어디에 적든 정책 이름을 같이 적는다.
 */
/** smart 가 데려가는 펫 (시작 골드 +80) */
export const SMART_PET = 'hamster'
/** 보스가 없을 때 필살기를 쓰는 최소 적 수 (mixed 와 같다) */
const SMART_SPECIAL_COUNT = 6

/** 한 웨이브가 이 시간을 넘기면 못 깨는 것으로 본다 (무한 루프 방지) */
const WAVE_TIMEOUT_SEC = 400
const SPECIAL_IDS = listSpecials().map((s) => s.id)

/**
 * 덱에서 건설 순서를 만든다 — `MIXED_ORDER` 를 **손이 아니라 규칙으로** 일반화한 것이다.
 *
 * `MIXED_ORDER` 의 모양에서 가져온 것 하나: **가장 싼 것을 한 번 더 깐다**
 * (`cheese cheese calico …` — 치즈 80 이 맨 앞에 둘). 첫 웨이브 전에 타워를 둘 세우려면
 * 그게 필요하다. 나머지는 비용 오름차순이다.
 * (`MIXED_ORDER` 의 나머지 반복은 손으로 맞춘 것이라 규칙으로 안 옮긴다 — 옮기면 그건 추측이다.)
 *
 * **걸러낸 것을 앞에 두고 나머지를 뒤에 붙인다.** 버리지 않는 것이 핵심이다 —
 * 지금까지 섞인 덱(기본 둘 + 카드 둘)에서는 카드 고양이가 순서에서 **조용히 사라져서**
 * 판에 한 번도 안 놓였다. 그러면 그 고양이를 "재 봤다"고 말할 수 없다.
 *
 * `filtered` 가 비어 있지 않으면 그 앞부분은 `MIXED_ORDER` 순서 그대로다 —
 * 그래서 **기본 넷만 든 덱은 결과가 한 톨도 안 달라진다**(붙일 것이 없다). 그게 안전장치고,
 * `balance-sim-deck.test` 가 그걸 검사로 못 박는다.
 *
 * @param {string[]} deck
 * @param {string[]} filtered MIXED_ORDER 에서 덱 안으로 걸러낸 순서 (비어 있을 수 있다)
 */
export function deckOrder(deck, filtered = []) {
  const cost = (id) => buildCost(getTower(id))
  const rest = deck.filter((id) => !filtered.includes(id)).sort((a, b) => cost(a) - cost(b) || a.localeCompare(b))
  if (filtered.length > 0) return [...filtered, ...rest]
  // 하나도 안 걸렸다(카드 고양이만 든 덱) — MIXED_ORDER 의 모양대로 처음부터 짓는다
  return rest.length > 1 ? [rest[0], ...rest] : [...rest]
}

/**
 * 봇이 **디버프형**으로 보는 효과. 맞은 적을 약하게 만드는 것들이라, 그 적을 **딜러도 같이 쏴야**
 * 값이 있다 — 그래서 자리가 값이다.
 *
 * **이건 봇의 어림짐작이지 콘텐츠의 계약이 아니다.** `registerEffect` 에 표시를 더하면
 * 콘텐츠가 봇을 위해 바뀌는 것이라 그러지 않았다. 목록에 없는 효과는 '그 밖'으로 떨어져
 * **지금과 똑같이** 동작한다 — 새 효과가 생겨도 조용히 나빠지지 않는다.
 */
const DEBUFF_KINDS = ['sunder', 'mark', 'slow']

/** 이 고양이가 적에게 디버프를 거는가 */
export function isDebuffCat(def) {
  return ((def.levels && def.levels[0] && def.levels[0].effects) || [])
    .some((e) => e && DEBUFF_KINDS.includes(e.kind))
}

/**
 * `deck` 정책의 **자리 점수.** 높을수록 좋은 자리다. 0 이면 지금까지의 규칙(길에서 가까운 순)과 같다.
 *
 * 왜 필요한가: 지금 봇은 `spots.some(s => placeTower(...).ok)` 로 **길에서 가까운 첫 빈 칸**에
 * 무조건 놓는다. 딜러는 그래도 되지만 디버프 고양이는 자리가 값이다 — 먼치킨은 사거리 1.4
 * (게임 최단)에 장갑 벗기기라, 딜러가 쏘는 **같은 구간**을 같이 훑어야 벗긴 장갑이 값을 한다.
 *
 * ── **길목 집중 — 딜러도 자리를 본다** ─────────────────────────────────────
 *
 * 딜러는 "길에서 가까운 첫 빈 칸"이면 된다고 봤는데, **재 보니 아니었다.**
 * 길을 0.25타일 간격으로 훑어 칸마다 "이 사거리로 보이는 길 표본 수"를 세 봤다(사거리 2.6):
 *
 *   맵          봇이 쓰는 앞 8칸   고를 수 있던 최고 8칸   격차
 *   골목길           18.1              39.9          +120%
 *   부엌             19.6              40.8          +108%
 *   지붕             22.8              42.0           +85%
 *   창고             18.8              39.5          +111%
 *   지하실           16.0              28.0           +75%
 *   다락방           18.8              39.8          +112%
 *   유리 온실        23.8              41.9           +76%
 *
 * 같은 타워 수로 **75~120% 더 많은 길을 볼 수 있었다.** '길에서 가까운 순'은 길에 바짝 붙었지만
 * **짧은 구간만 보는 칸**을 먼저 집는다. 길이 되꺾이는 자리(골목길·창고는 최고 칸이 중앙값의
 * 정확히 2.00배를 덮는다 — 길이 두 번 지나간다)는 길에서 조금 떨어져 있어 뒤로 밀린다.
 * 그래서 딜러의 점수를 **'이 자리가 보는 길 길이'** 로 바꿨다(사거리별로 판당 한 번 세서 캐시).
 *
 * ── **결과가 컸다. 그리고 그게 불편한 사실을 하나 드러냈다** ──────────────────
 *
 * 자리만 바꿨는데 다락방 한 칸에서 `smart` 는 타워 5개로 6웨이브에 죽고 `deck` 은 **12개로 완주**한다.
 * 복리다: 덜 새면 목숨과 골드가 남고, 남으면 더 짓고, 더 지으면 더 안 샌다.
 *
 * 원정 사다리 셋을 재니 **전부 100% 가 됐다 — 도배 여섯까지 포함해서.**
 *
 *              최선 룬        룬 없음      도배 최고
 *   잿불 길    56% → 100%   22% → 100%   11% → 100%
 *   서릿길     89% → 100%    0% → 100%   31% → 100%
 *   천둥 고개  45% → 100%    6% → 100%    0% → 100%
 *
 * 여기서 **"상성이 봇에게는 아무 차이도 안 만든다"고 적었었다. 틀렸다 (K-5 에서 뒤집었다).**
 * 완주율이 포화했을 뿐이다 — 같은 세 덱이 남긴 목숨은 20 / 12 / 9 로 갈려 있었고, 룬 배치를
 * 실제 판으로 탐색하니 같은 네 마리로 0%~100% 가 났다. 상성은 작동한다. 못 읽은 것은 지표
 * (`clearRate`·`reachScore`)와 덱을 고르던 공식이었다 — `holdScore` 와 `searchRunes` 가 그 자리다.
 * 맞는 부분은 남긴다: 사다리의 난이도가 **봇의 나쁜 자리 고르기**에 기대고 있었던 것은 사실이고,
 * 문서의 원정 숫자는 전부 그 위에 서 있었다.
 *
 * 이게 "게임이 너무 쉽다"는 뜻인지는 **아직 모른다.** `deck` 이 사람보다 잘한다고 볼 이유도 없다 —
 * 사람은 조합·판매·표적 모드·업그레이드 우선순위를 쓰는데 이 봇은 하나도 안 쓴다. 반대로
 * "길이 잘 보이는 자리에 놓는다"는 **사람이 자연스럽게 하는 일**이라 `smart` 쪽이 사람을 과소평가해 왔을
 * 가능성이 크다. 어느 쪽이든 **전체 재측정은 따로 정할 일**이라 이 커밋에서는 안 건드렸다.
 *
 * ── **아우라형은 재 보고 뺐다** ────────────────────────────────────────────
 *
 * 노르웨이숲·턱시도의 아우라(`towerModsFor` 가 `거리 <= radius` 로 센다)도 자리가 값일 줄 알고
 * '반경 안 이웃 수'로 점수를 매겼는데, **탐욕 배치가 이미 최적이었다** — 부엌·창고·지하실에서
 * 첫 빈 칸과 최고 점수 칸이 **같은 칸**으로 나왔다(이웃 2 대 2). 맵이 126칸이고 타워가 길을 따라
 * 붙어 서기 때문이다. 실제 완주율도 여섯 시드에서 **34.8% 대 34.8% 로 완전히 같았다.**
 * 값을 못 하는 코드라 뺐다.
 */
export function spotScore(def, spot, towers, sampleAt) {
  const range = def.levels[0].range
  const cx = spot.c + 0.5
  const cy = spot.r + 0.5
  if (isDebuffCat(def) && towers.length > 0) {
    /* 디버프형 — 이 자리의 사거리와 **기존 타워의 사거리가 함께 덮는 길 길이**.
     * 혼자 다른 구간을 긁으면 0 이고, 딜러가 쏘는 구간을 같이 훑으면 커진다. */
    let both = 0
    for (const p of sampleAt) {
      if (Math.hypot(p.x - cx, p.y - cy) > range) continue
      for (const t of towers) {
        const r2 = t.def.levels[t.level - 1].range
        if (Math.hypot(p.x - (t.c + 0.5), p.y - (t.r + 0.5)) <= r2) { both += 1; break }
      }
    }
    return both
  }
  // 그 밖(딜러) — **이 자리가 보는 길 길이.** 아래 '길목 집중' 주석이 이유를 적는다.
  let seen = 0
  for (const p of sampleAt) if (Math.hypot(p.x - cx, p.y - cy) <= range) seen += 1
  return seen
}

/** 자리 점수를 매길 때 훑는 길 위의 점들 — 0.5타일 간격이면 사거리(1.4~5)를 가르기에 충분하다 */
function samplePath(path) {
  const out = []
  for (let d = 0; d <= path.lengthTiles; d += 0.5) out.push(pointAtDistance(path, d))
  return out
}

/**
 * 한 판을 끝까지 돌린다.
 *
 * @param {string} mapId
 * @param {string} diffId
 * @param {{ specials?: boolean, policy?: string, seed?: number, growth?: number,
 *   rules?: object, lives?: number, waveSet?: string, waveLimit?: number,
 *   deck?: string[], runes?: object }} opts
 *   growth — 모든 고양이의 훈련 단계(0~3). 기본 0 이라 밸런스 검사는 훈련 없는 판을 본다.
 *   rules/lives/waveSet/waveLimit — 원정 칸을 그대로 재현하는 데 쓴다(Game 생성자로 들어간다).
 *   deck — 이 판에 데려갈 고양이. 주면 봇의 건설 순서를 덱 안으로 줄인다(rules.bannedTowers 와 짝).
 *   order — 건설 순서를 통째로 갈아 끼운다(--order). 카드 고양이를 재는 유일한 길이다.
 *   runes — { 고양이id: 속성 }. progress.runes.equipped 로 들어가 타워의 속성을 바꾼다.
 */
export function playOnce(mapId, diffId, opts = {}) {
  // 진행도를 주면 game 이 고양이 해금(unlockedTowers)·펫·훈련을 전부 진행도에서 읽는다. 그래서 필요한 것만 켜고
  // 나머지는 '진행도 없음'과 같게 맞춘다 — 기본 진행도를 그냥 넘기면 치즈·삼색만 열려 순서가 막히고
  // 햄스터(+80 골드)가 따라붙어 비교가 뒤집힌다(실제로 그렇게 만들었다가 잡았다).
  /* deck 은 smart 를 그대로 물려받는다 — 아래에서 smart 를 켜 두고 두 가지만 더 얹는다.
   * 물려받지 않으면 "덱을 들 수 있게 됐는데 공중을 못 본다" 같은 반쪽 봇이 하나 더 생긴다. */
  const deckAware = opts.policy === 'deck'
  const smart = opts.policy === 'smart' || deckAware
  const growth = Math.max(0, Math.min(3, Number(opts.growth || 0)))
  const runes = opts.runes && Object.keys(opts.runes).length > 0 ? opts.runes : null
  const progress = (smart || growth > 0 || runes)
    ? {
      ...defaultProgress(),
      unlockedTowers: listTowers().map((t) => t.id),
      pets: smart ? { owned: [SMART_PET], equipped: SMART_PET } : { owned: [], equipped: null },
      growth: growth > 0 ? Object.fromEntries(listTowers().map((t) => [t.id, growth])) : {},
      // 룬을 끼운 고양이는 그 속성으로 때린다(game.placeTower 가 여기서 읽는다)
      runes: { owned: {}, equipped: { ...(runes || {}) } },
    }
    : null
  const game = new Game({
    mapDef: getMap(mapId),
    difficulty: DIFFICULTIES[diffId],
    settings: {},
    progress,
    rules: opts.rules || null,
    lives: opts.lives || 0,
    waveSet: opts.waveSet || null,
    waveLimit: opts.waveLimit || 0,
    random: opts.seed === undefined ? Math.random : mulberry32(opts.seed),
  })

  // 길에서 가까운 순으로 칸을 정렬해 둔다. 매 판 다시 계산할 필요가 없다.
  const spots = []
  for (let r = 0; r < game.mapDef.rows; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) {
      let d = Infinity
      for (const p of game.path.points) {
        d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
      }
      spots.push({ c, r, d })
    }
  }
  spots.sort((a, b) => a.d - b.d)
  // 길 위의 표본 — 자리 점수에 쓴다. 판마다 한 번만 만든다.
  const pathSamples = deckAware ? samplePath(game.path) : []
  /* 사거리별 '칸이 보는 길 길이' 표. **캐시가 없으면 안 된다** — 칸 126 × 표본 190 을 건설마다
   * 다시 세면 npm test(대부분이 이 시뮬레이터다)가 몇 배로 늘어난다. 덱 하나에 서로 다른
   * 사거리가 네댓 개뿐이라 사거리별로 한 번만 세고 재사용한다. */
  const covCache = new Map()
  const coverageTable = (range) => {
    let table = covCache.get(range)
    if (table) return table
    table = new Int16Array(game.mapDef.rows * game.mapDef.cols)
    for (let r = 0; r < game.mapDef.rows; r += 1) {
      for (let c = 0; c < game.mapDef.cols; c += 1) {
        let seen = 0
        for (const p of pathSamples) if (Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)) <= range) seen += 1
        table[r * game.mapDef.cols + c] = seen
      }
    }
    covCache.set(range, table)
    return table
  }

  // smart 는 mixed 와 같은 건설 순서를 쓴다 — 순서까지 바꾸면 무엇이 개선인지 못 가른다.
  // 다른 것은 네 가지 행동뿐이다(공중 건너뛰기·표적 모드·펫·필살기 문턱).
  let order = Array.isArray(opts.order) && opts.order.length > 0
    ? opts.order
    : (smart || opts.policy === 'mixed' ? MIXED_ORDER : ['cheese'])
  if (Array.isArray(opts.deck) && opts.deck.length > 0) {
    /* 원정: 덱 밖의 고양이는 rules.bannedTowers 로 막혀 있어서, 순서에 남겨 두면
     * placeTower 가 거절하고 build() 가 그 자리에서 멈춘다(더 싼 것으로 대체하지 않는 봇이라).
     * 그래서 순서를 덱 안으로 줄인다. MIXED_ORDER 의 상대 비중은 그대로 살린다. */
    const inDeck = order.filter((id) => opts.deck.includes(id))
    order = inDeck.length > 0 ? inDeck : [...opts.deck]
    if (deckAware) order = deckOrder(opts.deck, inDeck)
  }
  let orderAt = 0

  /** 다음 웨이브가 공중 위주인가 (절반 초과) */
  const airHeavy = () => {
    const spawns = game.nextWave && game.nextWave.spawns
    if (!spawns || spawns.length === 0) return false
    let flying = 0
    for (const sp of spawns) {
      const def = getEnemy(sp.enemyId)
      if (def && def.flying) flying += 1
    }
    return flying * 2 > spawns.length
  }

  const build = () => {
    // 순서의 다음 고양이를 놓는다. 살 돈이 없으면 그 자리에서 멈춘다 (더 싼 것으로 대체하지
    // 않는다 — 대체하면 결국 치즈냥만 잔뜩 놓는 봇으로 되돌아간다)
    let at = orderAt
    let def = getTower(order[at % order.length])
    // smart 만: 공중이 몰려오는 웨이브에 지상 전용을 놓지 않는다. 순서에서 다음 대공 고양이로 건너뛴다.
    if (smart && def.targets === 'ground' && airHeavy()) {
      for (let k = 1; k < order.length; k += 1) {
        const d = getTower(order[(orderAt + k) % order.length])
        if (d.targets !== 'ground') { at = orderAt + k; def = d; break }
      }
    }
    if (game.gold < buildCost(def)) return false
    /* deck 정책만: **자리를 보고 놓는다** (위 spotScore 주석에 이유와 측정이 있다).
     * 점수가 같으면 예전 규칙(길에서 가까운 순)으로 가른다 — 그래서 순서가 재현된다.
     * 칸 전부를 훑는다: 좋은 칸이 '길에서 가까운 앞 40칸' 밖에 있을 수 있어서다(실제로 그렇다). */
    let tries = spots
    if (deckAware) {
      /* 딜러는 '보이는 길 길이'(사거리별로 판당 한 번 세서 캐시), 디버프형은 '딜러와 겹치는 길'.
       * 디버프형만 매번 다시 세는 이유는 점수가 **이미 놓인 타워에 달려 있어서**다. */
      const table = isDebuffCat(def) ? null : coverageTable(def.levels[0].range)
      tries = spots
        .map((sp, i) => ({
          sp,
          i,
          score: table ? table[sp.r * game.mapDef.cols + sp.c] : spotScore(def, sp, game.towers, pathSamples),
        }))
        .sort((a, b) => b.score - a.score || a.i - b.i)      // 동점이면 길에서 가까운 순
        .map((x) => x.sp)
    }
    const ok = tries.some((s) => game.placeTower(s.c, s.r, def.id).ok)
    if (!ok) return false
    orderAt = at + 1
    return true
  }

  const upgrade = () => game.towers.some((t) => game.upgradeTower(t))

  /**
   * 지금 필살기를 쓸 때인가.
   * mixed·cheese 는 예전 그대로(적 일곱 마리 이상) — 기존 회귀 값이 움직이면 안 된다.
   * smart 는 여기에 '보스가 살아 있으면 쓴다'를 더한다. 사람은 필살기를 보스에 아낀다.
   *
   * 처음에는 '이 웨이브 총 체력의 30% 이상이 살아 있으면'으로 썼다가 되돌렸다: 보스는 혼자 나오고
   * 웨이브 총 체력에서 차지하는 몫이 작아서(다락방 20웨이브는 78,185 중 5,392) 문턱을 영영 못 넘었다.
   * 그래서 보스 맵에서만 필살기를 아예 안 쓰는 봇이 됐고, 아깽이 지하실 클리어율이 100% → 38% 로 떨어졌다.
   */
  const wantSpecial = () => {
    if (game.enemies.length === 0) return false
    if (smart && game.enemies.some((e) => e.def && e.def.boss)) return true
    return game.enemies.length > SMART_SPECIAL_COUNT
  }

  const waves = []
  while (game.phase !== 'defeat' && game.phase !== 'victory') {
    // 업그레이드가 신축보다 골드 효율이 좋다 (칸을 안 먹고 시너지도 유지된다)
    while (upgrade() || build()) { /* 돈이 다 떨어질 때까지 */ }
    const livesBefore = game.lives
    game.startWave()
    const boss = !!(game.currentWave && game.currentWave.bossCount > 0)

    let t = 0
    while (game.phase === 'wave' && t < WAVE_TIMEOUT_SEC) {
      game.update(1 / 60)
      t += 1 / 60
      if (opts.specials && wantSpecial()) {
        for (const id of SPECIAL_IDS) {
          // useSpecial 은 { ok } 객체를 돌려준다 — 객체는 늘 참이라 전에는 첫 필살기만 시도했다
          try { if (game.useSpecial(id).ok) break } catch { /* 못 쓰는 것은 넘긴다 */ }
        }
      }
    }
    waves.push({ wave: game.waveNo, boss, towers: game.towers.length, gold: game.gold,
      lives: game.lives, lost: livesBefore - game.lives })
    if (t >= WAVE_TIMEOUT_SEC) break   // 못 깨고 멈췄다
  }

  /* 어느 고양이를 실제로 놓았나. 덱을 넘겼는데 그중 한 마리가 여기 없으면
   * **그 고양이는 재 본 적이 없는 것**이다 — deck 정책을 만든 이유가 정확히 그것이라
   * (smart 는 MIXED_ORDER 밖 고양이를 순서에서 조용히 버린다) 결과에 같이 실어 보낸다. */
  const built = {}
  for (const t of game.towers) built[t.def.id] = (built[t.def.id] || 0) + 1

  return {
    wave: game.waveNo,
    total: game.totalWaves,
    win: game.phase === 'victory',
    lives: game.lives,
    maxLives: game.maxLives,
    towers: game.towers.length,
    built,
    waves,
  }
}

/**
 * 속성 원정 한 판 — 칸을 이어 돌면서 **목숨을 넘긴다.**
 *
 * 한 칸이라도 지면 거기서 끝이다(그게 이 모드의 규칙이라 시뮬레이터도 같아야 한다).
 * 덱 밖 고양이는 `stageRules` 가 만든 `bannedTowers` 로 막히고, 룬은 `opts.runes` 로 들어간다.
 *
 * @param {string} expId
 * @param {string} diffId
 * @param {{ deck: string[], runes?: object, seed?: number, specials?: boolean, policy?: string }} opts
 * @returns {{ stages: number, cleared: boolean, lives: number, rows: Array }}
 */
export function playExpedition(expId, diffId, opts = {}) {
  const exp = getExpedition(expId)
  if (!exp) throw new Error(`모르는 원정: ${expId}`)
  const all = listTowers().map((t) => t.id)
  const deck = (opts.deck || []).slice(0, DECK_SIZE)
  const rows = []
  let lives = 0
  let cleared = 0

  for (let i = 0; i < exp.stages.length; i += 1) {
    const st = exp.stages[i]
    const r = playOnce(st.mapId, diffId, {
      ...opts,
      rules: stageRules(st, deck, all, listBossIds()),
      lives,
      waveSet: st.waveSet,
      waveLimit: st.waveLimit,
      deck,
      // 칸마다 시드를 흔든다 — 같은 시드로 다섯 칸을 돌면 같은 웨이브가 다섯 번 나온다
      seed: opts.seed === undefined ? undefined : opts.seed + i * 101,
    })
    rows.push({ stage: i + 1, mapId: st.mapId, element: st.element, wave: r.wave, total: r.total, win: r.win,
      lives: r.lives, maxLives: r.maxLives })
    if (!r.win) break
    cleared += 1
    lives = r.lives
  }
  /* maxLives 는 **첫 칸**의 것이다. 뒤 칸은 넘겨받은 목숨으로 시작하므로 그 칸의 maxLives 가
   * 곧 "직전에 남은 수"가 된다 — 사다리 전체에서 얼마나 흘렸나를 재려면 처음 통이 기준이어야 한다. */
  return { stages: cleared, cleared: cleared === exp.stages.length, lives, maxLives: rows[0].maxLives, rows }
}

/** 원정을 N판 돌려 평균을 낸다 */
export function playExpeditionMany(expId, diffId, runs, opts = {}) {
  const rs = Array.from({ length: runs }, (_, i) => playExpedition(expId, diffId,
    opts.seed === undefined ? opts : { ...opts, seed: opts.seed + i * 1009 }))
  const stages = rs.map((r) => r.stages).sort((a, b) => a - b)
  return {
    runs: rs.length,
    clearRate: rs.filter((r) => r.cleared).length / rs.length,
    minStages: stages[0],
    maxStages: stages[stages.length - 1],
    medianStages: stages[Math.floor(stages.length / 2)],
    /* 도달 점수 — 깬 칸 수 + 마지막 칸에서 얼마나 갔나(0~1). 칸 수만 세면
     * "1칸에서 1웨이브 만에 죽었다"와 "1칸을 깨고 2칸 마지막 웨이브에서 죽었다"가 같아진다. */
    reachScore: rs.reduce((a, r) => {
      const last = r.rows[r.rows.length - 1]
      return a + r.stages + (last && !last.win ? Math.min(1, last.wave / last.total) : 0)
    }, 0) / rs.length,
    /* 버팀 점수 — 도달 점수에 **완주한 뒤 남은 목숨**을 잇는다(칸 수 + 남은 목숨 비율, 0~7).
     * 완주율과 도달 점수는 잘 두는 봇 앞에서 **포화한다**: `deck` 은 실점이 0 이라 세 덱이 전부
     * 100% / 6.00 으로 같아 보였고, 그래서 "상성이 결과를 안 바꾼다"고 잘못 적었다. 그런데 사다리를
     * 지나며 남은 목숨은 최선 20 · 룬 없음 12 · 도배 9 로 갈려 있었다 — 신호는 있었고 지표가 못 읽었다.
     * 완주하면 6 + 남은 목숨/첫 칸 최대 목숨, 못 하면 도달 점수 그대로라 순서가 절대 안 뒤집힌다. */
    holdScore: rs.reduce((a, r) => {
      const last = r.rows[r.rows.length - 1]
      if (r.cleared) return a + r.stages + (r.maxLives > 0 ? r.lives / r.maxLives : 0)
      return a + r.stages + (last && !last.win ? Math.min(1, last.wave / last.total) : 0)
    }, 0) / rs.length,
    rows: rs,
  }
}

/** 한 조합을 N판 돌려 통계를 낸다. opts.seed 를 주면 판마다 seed+i 로 재현 가능하다. */
export function playMany(mapId, diffId, runs, opts = {}) {
  const rs = Array.from({ length: runs }, (_, i) => playOnce(mapId, diffId,
    opts.seed === undefined ? opts : { ...opts, seed: opts.seed + i }))
  const reached = rs.map((r) => r.wave).sort((a, b) => a - b)
  /* 다들 마지막 웨이브까지 닿아서 죽으면 도달 웨이브로도 남은 목숨으로도
   * 사다리가 안 보인다(둘 다 포화). '첫 목숨을 잃은 웨이브'가 압박이 언제
   * 시작되는지를 직접 잰다 — 골목길은 14웨이브까지 한 대도 안 맞았다. */
  const firstLoss = rs.map((r) => {
    const hit = r.waves.find((w) => w.lost > 0)
    return hit ? hit.wave : r.total + 1        // 끝까지 한 대도 안 맞았다
  }).sort((a, b) => a - b)
  /* 동적 곡선 — 실점이 '어디서' 나는지. 정적 체력 곡선이 매끈해도 실점이 보스 웨이브에만
   * 몰리면 잡몹 웨이브는 그냥 기다리는 시간이다. */
  const total = rs[0].total
  const lossCurve = Array.from({ length: total }, (_, i) => {
    const at = rs.map((r) => r.waves[i] ? r.waves[i].lost : 0)
    return at.reduce((a, b) => a + b, 0) / runs
  })
  const bossAt = new Set()
  for (const r of rs) for (const w of r.waves) if (w.boss) bossAt.add(w.wave)
  const totalLoss = lossCurve.reduce((a, b) => a + b, 0)
  const bossLoss = lossCurve.reduce((a, b, i) => a + (bossAt.has(i + 1) ? b : 0), 0)
  const bleedWaves = lossCurve.filter((v, i) => v > 0 && !bossAt.has(i + 1)).length
  const reachScore = rs.map((r) => (r.win ? r.total : r.wave - 1) + r.lives / r.maxLives).sort((a, b) => a - b)

  return {
    mapId,
    diffId,
    runs,
    clearRate: rs.filter((r) => r.win).length / runs,
    min: reached[0],
    max: reached[reached.length - 1],
    median: reached[Math.floor(runs / 2)],
    firstLoss: firstLoss[Math.floor(runs / 2)],
    total,
    lossCurve,
    bossLossShare: totalLoss > 0 ? bossLoss / totalLoss : 0,
    bleedWaves,
    finalWaveLoss: lossCurve[total - 1] / rs[0].maxLives,
    reachScore: reachScore[Math.floor(runs / 2)],
  }
}

/**
 * 원정 검사용 덱 셋 — **같은 네 마리, 룬만 다르게.**
 *
 * 이 모드에서 물어야 할 것은 하나다: "속성이 실제로 결과를 바꾸나". 그러려면
 * **고양이는 고정하고 속성만 갈라야 한다.** 처음엔 '상성 맞는 고양이로 짠 덱' vs '아닌 덱' 으로 쟀는데,
 * 그건 상성이 아니라 고양이 화력을 잰 것이었다(검은냥이 든 '안 맞춘 덱'이 늘 이겼다).
 *
 * ── 최적 기준을 두 번 고쳤다. 두 번째가 이 모드의 수학이다 ────────────────────
 *
 * 여섯 속성을 한 칸씩 쓰는 사다리에서 고양이 하나가 사다리 전체에 기여하는 배수의 합은
 * **룬과 무관하게 늘 같다**: 유리 1.5 + 불리 0.7 + 무관 1.0×4 = 6.2. 네 마리면 24.8.
 * 즉 **룬은 힘을 더하지 않는다 — 어느 칸에 몰지를 정할 뿐이다.**
 *
 * 그래서 "최약칸을 최대화"는 틀린 기준이었다(그걸로 고른 덱이 아무것도 안 낀 덱에 졌다).
 * 다음엔 **어려운 칸에 강한가**로 바꿨다: 칸의 배수 합을 그 칸의 hpMul 로 나눈 값의 최솟값을 최대화한다.
 *
 * ── 그 공식도 틀렸다 (K-5). "최선"은 이제 **재서 고른 덱**이다 ─────────────────
 *
 * 룬 배치를 공식이 아니라 **시뮬레이션으로 탐색**해 보니(잿불 길, 램프 ×1.4, `deck` 봇, 시드 다섯)
 * 같은 네 마리로 완주율이 **0% 에서 100% 까지** 갈렸다. 그런데 공식이 고른 "최선"은 26개 후보 중
 * **하위권(10%)** 이었고, 측정 1위 `bolt·earth·dark·earth` 는 공식 순위 369/1296 이었다.
 * 공식이 못 맞히는 이유가 둘이다:
 *   · 위 불변량 때문에 상위 수백 개가 공식 값으로는 거의 같다 — 잿불 길에서 최선과 룬 없음의
 *     최약칸이 **똑같이 3.70** 이고 마지막 칸 값도 **똑같이 4.2** 다. 공식은 이 둘을 구별 못 한다.
 *   · 칸의 hpMul 만 보고 **맵의 hpMul 을 안 곱했다**. 실제 체력은 둘의 곱이라(game.js `_waveOpts`)
 *     천둥 고개 6칸(유리 온실 1.80 × 0.84 = 1.51, 가장 무겁다)을 가장 가벼운 칸으로 봤다.
 *   맵 hpMul 을 넣어도 측정 1위는 227/1296 이다 — 공식으로는 안 된다.
 *
 * 그래서 "최선"은 콘텐츠가 들고 있는 **`referenceRunes`** 를 쓴다 — `searchRunes` 로 실제 판을 돌려
 * 고르고 그 조건을 옆에 적어 둔 것이다(`--search-runes`). 없으면 공식으로 떨어지되 이름에 표시한다.
 * 공식은 도배 여섯 중 고르기와 구조 검사(`min`)에만 쓴다 — 거기선 순위가 아니라 값의 모양을 본다.
 *
 * 세 벌: 최선(측정) · 기본(룬 없음) · 도배(한 속성). 도배는 여섯 칸 사다리에서 함정이어야 한다.
 */
export function buildTestDecks(exp, deck = ['cheese', 'calico', 'black', 'siamese']) {
  const stages = exp.stages
  /* 칸이 묻는 속성은 **둘**이다 — 잡몹(`element`)과 보스(제 속성, J-6 부터 안 덮어쓴다).
   * 둘을 평균 내지 않고 **못하는 쪽**을 쓴다: 잡몹을 아무리 잘 녹여도 보스를 못 잡으면 그 칸에서 끝난다.
   *
   * 이건 모델일 뿐이고 판정은 완주율이 한다. 실제로 이 모델은 순위를 다 못 맞힌다 —
   * 도배 번개와 도배 얼음은 이 셈으로 값이 같은데(2.8) 완주율은 67% 대 83% 로 갈렸다.
   * 약점이 **어느 칸**에 떨어지느냐가 값에 안 들어 있어서다. 그래서 아래 세 덱은
   * "정답"이 아니라 **비교용 기준선**이고, 진짜 답은 늘 돌려 본 숫자다. */
  const bossElement = (st) => ((getEnemy(st.boss) || {}).element || st.element)
  const sumVs = (assign, target) => assign.reduce((a, e) => a + elementMul(e, target), 0)
  const sumAt = (assign, st) => Math.min(sumVs(assign, st.element), sumVs(assign, bossElement(st)))
  /** 칸이 요구하는 세기 — **맵 hpMul × 칸 hpMul**. 칸 것만 보면 맵이 무거운 칸을 가볍다고 읽는다 */
  const effHp = (st) => ((getMap(st.mapId) || {}).hpMul || 1) * (st.hpMul || 1)
  const weighted = (assign) => Math.min(...stages.map((st) => sumAt(assign, st) / effHp(st)))
  const minOf = (assign) => Math.min(...stages.map((st) => sumAt(assign, st)))

  let best = null
  const cur = []
  const rec = (i) => {
    if (i === deck.length) {
      const v = weighted(cur)
      if (!best || v > best.v) best = { a: [...cur], v }
      return
    }
    for (const e of ELEMENTS) { cur.push(e); rec(i + 1); cur.pop() }
  }
  rec(0)

  let uniform = null
  for (const e of ELEMENTS) {
    const v = weighted(deck.map(() => e))
    if (!uniform || v > uniform.v) uniform = { e, v }
  }

  const asRunes = (list) => Object.fromEntries(deck.map((id, i) => [id, list[i]]))
  // 콘텐츠가 재서 적어 둔 기준 덱이 있으면 그것이 "최선"이다. 덱이 같을 때만 — 다른 네 마리면 그 룬은 남의 것이다.
  const ref = exp.referenceRunes && exp.referenceRunes.deck && deck.every((id, i) => exp.referenceRunes.deck[i] === id)
    ? exp.referenceRunes : null
  const bestRunes = ref ? ref.runes : asRunes(best.a)
  const bestList = deck.map((id) => bestRunes[id] || (getTower(id) || {}).element)
  return [
    { name: `최선 룬 (${bestList.join('·')}${ref ? '' : ' · 공식 — 측정 안 됨'})`, deck, runes: bestRunes, min: minOf(bestList), measured: !!ref },
    { name: '기본 (룬 없음)', deck, runes: {}, min: minOf(deck.map((id) => (getTower(id) || {}).element)) },
    { name: `도배 (전부 ${uniform.e})`, deck, runes: asRunes(deck.map(() => uniform.e)), min: minOf(deck.map(() => uniform.e)) },
  ]
}

/**
 * 룬 배치를 **실제 판을 돌려** 고른다 — 공식이 못 하는 일이다(위 buildTestDecks 머리말).
 *
 * 후보: 룬 없음 · 도배 여섯 · '룬 없음에서 한 마리만 바꾼 것' 24 · 공식 최선 · 콘텐츠의 지금 referenceRunes ·
 * 무작위로 `candidates` 까지 채움. 그다음 상위 둘 주변(한 마리씩 바꾼 24개씩)을 한 번 더 돌려 다듬는다.
 * 1,296가지 전수는 한 판 ~3초라 한 시간이 넘어 안 한다 — 그래서 **전역 최선을 보장하지 않는다.**
 * (실제로 잿불 길에서 손으로 찍은 무작위 배치가 이 탐색의 1위를 이겼다. 그 배치를 referenceRunes 에 적어 두면
 *  다음 탐색이 후보로 물려받으므로 한 번 찾은 것은 안 잃는다.)
 *
 * 순위는 **완주율 먼저, 버팀 점수는 그다음**이다. 처음엔 버팀 점수만 봤는데 천둥 고개에서 "매번 6칸 끝에서 죽는 덱"이
 * "75% 완주하고 25% 는 2칸에서 죽는 덱"보다 위에 왔다 — 평균이 쌍봉을 숨긴다. 이 모드가 묻는 것은 "깨나"라서
 * 완주율이 앞이고, 버팀 점수는 완주율이 포화한 곳(사다리가 너무 쉬울 때)에서 순위를 가르는 보조다.
 *
 * 결과는 정렬된 배열이고, 각 항목에 `runes`(referenceRunes 에 그대로 붙일 모양)·`holdScore`·`clearRate` 가 있다.
 * 검사 시간 예산 밖이라 **테스트에서 부르지 않는다** — CLI `--search-runes` 로 돌려 콘텐츠에 적는다.
 */
export function searchRunes(exp, opts = {}) {
  const deck = (opts.deck || ['cheese', 'calico', 'black', 'siamese']).slice(0, DECK_SIZE)
  const runs = opts.runs || 2
  const seeds = opts.seeds || [7, 23, 11]
  const wanted = Math.max(8, opts.candidates || 40)
  const diff = opts.diff || 'normal'
  const policy = opts.policy || 'deck'
  const asRunes = (list) => Object.fromEntries(deck.map((id, i) => [id, list[i]]).filter(([, e]) => e))
  const key = (list) => list.map((e) => e || '-').join(',')
  const natural = deck.map((id) => (getTower(id) || {}).element)

  const seen = new Set()
  const cands = []
  const add = (label, list) => {
    const k = key(list)
    if (seen.has(k)) return
    seen.add(k); cands.push({ label, list })
  }
  add('룬 없음', deck.map(() => null))
  for (const e of ELEMENTS) add(`도배 ${e}`, deck.map(() => e))
  deck.forEach((id, i) => { for (const e of ELEMENTS) if (e !== natural[i]) add(`${id}→${e}`, deck.map((_, j) => (j === i ? e : null))) })
  for (const d of buildTestDecks(exp, deck).slice(0, 1)) add('공식/기준', deck.map((id) => d.runes[id] || null))
  if (exp.referenceRunes && exp.referenceRunes.runes) add('지금 referenceRunes', deck.map((id) => exp.referenceRunes.runes[id] || null))
  let rng = mulberry32(opts.seed === undefined ? 12345 : opts.seed)
  while (cands.length < wanted) add('무작위', deck.map(() => ELEMENTS[Math.floor(rng() * ELEMENTS.length)]))

  const cache = new Map()
  const score = (list) => {
    const k = key(list)
    if (cache.has(k)) return cache.get(k)
    const runes = asRunes(list)
    const rs = seeds.map((seed) => playExpeditionMany(exp.id, diff, runs, { deck, runes, specials: true, policy, seed }))
    const v = {
      holdScore: rs.reduce((a, r) => a + r.holdScore, 0) / rs.length,
      clearRate: rs.reduce((a, r) => a + r.clearRate, 0) / rs.length,
    }
    cache.set(k, v)
    return v
  }
  const order = (a, b) => b.clearRate - a.clearRate || b.holdScore - a.holdScore
  const scored = cands.map((c) => ({ ...c, ...score(c.list) }))
  scored.sort(order)

  // 상위 둘 주변을 한 번 다듬는다 — 한 마리씩 다른 속성으로
  for (const top of scored.slice(0, 2)) {
    deck.forEach((_, i) => {
      for (const e of ELEMENTS) {
        if (top.list[i] === e) continue
        const list = top.list.map((x, j) => (j === i ? e : x))
        if (seen.has(key(list))) continue
        seen.add(key(list))
        scored.push({ label: `상위 변형 ${deck[i]}→${e}`, list, ...score(list) })
      }
    })
  }
  scored.sort(order)
  return scored.map((c) => ({ ...c, runes: asRunes(c.list), evaluated: cache.size }))
}

// ---------------------------------------------------------- CLI

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(arg('runs', 5))
  const specials = has('specials')
  const onlyMap = arg('map', null)
  const onlyDiff = arg('difficulty', null)
  const policy = arg('policy', 'cheese')
  const seedArg = arg('seed', null)
  const seed = seedArg === null ? undefined : Number(seedArg)
  const growth = Number(arg('growth', 0))
  /* 건설 순서를 손으로 준다 — 새 고양이가 기존 봇보다 얼마나 나은지 재는 유일한 길이다.
   * MIXED_ORDER 에는 카드 고양이가 없어서, 그냥 두면 시뮬레이터가 새 고양이를 **한 번도 안 놓는다.** */
  const orderArg = arg('order', null)
  const order = orderArg ? orderArg.split(',') : null

  /* ── 원정 모드 — `--expedition <id>` 하나로 갈라진다 ────────────────────────
   * 덱은 `--deck a,b,c,d`, 룬은 `--runes 고양이:속성,…`. 둘 다 없으면 세 덱을 자동으로 돌려
   * "맞춘 덱 / 안 맞춘 덱 / 무작위 덱"을 나란히 보여 준다 — 이 모드에서 물어야 할 것이 그것뿐이라서다. */
  if (has('expedition')) {
    const expId = arg('expedition', (listExpeditions()[0] || {}).id)
    const exp = getExpedition(expId)
    if (!exp) { console.error(`모르는 원정: ${expId}`); process.exit(1) }
    const deckArg = arg('deck', null)
    const runesArg = arg('runes', null)
    const parseRunes = (t) => Object.fromEntries((t || '').split(',').filter(Boolean)
      .map((p) => p.split(':')).filter((kv) => kv.length === 2))
    const diff = onlyDiff || 'normal'
    /* `--search-runes` — 룬 배치를 실제 판으로 탐색해서 referenceRunes 에 붙일 모양으로 찍는다.
     * 비싸다(후보 40 + 다듬기 24, 시드 둘 × 2판이면 5분쯤). 검사에서 안 부르고 여기서만 돌린다. */
    if (has('search-runes')) {
      const deck = deckArg ? deckArg.split(',') : undefined
      const found = searchRunes(exp, { deck, runs, seed, candidates: Number(arg('candidates', 40)), policy: policy === 'cheese' ? 'deck' : policy })
      console.log(`원정 '${exp.name}' 룬 탐색 · ${found[0].evaluated}개 배치 · 각 ${runs}판 × 시드 셋 · ${policy === 'cheese' ? 'deck' : policy} 봇 · 완주율 먼저, 버팀 점수 다음\n`)
      console.log('순위  버팀 점수  완주율   배치                          출처')
      found.slice(0, 12).forEach((c, i) => {
        console.log(`  ${String(i + 1).padStart(2)}   ${c.holdScore.toFixed(2)}     ${String(Math.round(c.clearRate * 100)).padStart(4)}%   ${c.list.map((e) => e || '-').join('·').padEnd(28)} ${c.label}`)
      })
      const w = found[0]
      console.log(`\nreferenceRunes 로 붙일 모양 (칸 램프를 바꾸면 다시 돌린다):`)
      console.log(`  referenceRunes: { deck: ${JSON.stringify((deck || ['cheese', 'calico', 'black', 'siamese']))}, runes: ${JSON.stringify(w.runes)}, holdScore: ${w.holdScore.toFixed(2)}, note: '...' },`)
      process.exit(0)
    }
    const decks = deckArg
      ? [{ name: '지정', deck: deckArg.split(','), runes: parseRunes(runesArg) }]
      : buildTestDecks(exp)
    console.log(`원정 '${exp.name}' · ${exp.stages.length}칸 · ${runs}판씩 · 난이도 ${diff}`
      + `${specials ? ' · 필살기 사용' : ''}${seed === undefined ? '' : ` · 시드 ${seed}`}\n`)
    // 칸이 보스를 안 고르면(서릿길) 그 자리를 비운다 — 'boss undefined' 는 정보가 아니라 잡음이다
    const bossText = (st) => (st.boss ? ` · 보스 ${st.boss}[${(getEnemy(st.boss) || {}).element || '?'}]` : '')
    console.log(`칸 구성: ${exp.stages.map((st, i) => `${i + 1}.${st.mapId}(${st.element}/${st.waveLimit}w${bossText(st)})`).join(' → ')}\n`)
    console.log('덱                                     최약칸 배수합   완주율   깬 칸(최소~최대, 중앙)  도달 점수  버팀 점수')
    for (const d of decks) {
      const r = playExpeditionMany(exp.id, diff, runs, { deck: d.deck, runes: d.runes, specials, policy: policy === 'cheese' ? 'smart' : policy, seed })
      console.log(`  ${d.name.padEnd(36)} ${(d.min === undefined ? '  -  ' : d.min.toFixed(1)).padStart(9)}     ${String(Math.round(r.clearRate * 100)).padStart(4)}%`
        + `   ${String(r.minStages).padStart(2)}~${String(r.maxStages).padEnd(2)} 중앙 ${String(r.medianStages).padStart(2)}`
        + `        ${r.reachScore.toFixed(2)}      ${r.holdScore.toFixed(2)}`)
      if (has('verbose')) {
        for (const row of r.rows[0].rows) {
          console.log(`      ${row.stage}칸 ${row.mapId.padEnd(9)} ${row.element.padEnd(6)} ${row.win ? '깸' : '실패'} ${row.wave}/${row.total}웨이브 · 목숨 ${row.lives}`)
        }
      }
    }
    process.exit(0)
  }

  const maps = listMaps().filter((m) => !onlyMap || m.id === onlyMap)
  const diffs = Object.keys(DIFFICULTIES).filter((d) => !onlyDiff || d === onlyDiff)

  const started = Date.now()
  const rows = []
  for (const m of maps) for (const d of diffs) rows.push({ map: m, ...playMany(m.id, d, runs, { specials, policy, seed, growth, order }) })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (has('json')) {
    console.log(JSON.stringify({ runs, specials, growth, elapsed: Number(elapsed), rows: rows.map((r) => ({
      mapId: r.mapId, diffId: r.diffId, clearRate: r.clearRate,
      min: r.min, max: r.max, median: r.median, firstLoss: r.firstLoss, total: r.total,
      bossLossShare: r.bossLossShare, bleedWaves: r.bleedWaves, finalWaveLoss: r.finalWaveLoss, reachScore: r.reachScore,
    })) }, null, 2))
  } else {
    console.log(`맵마다 ${runs}판씩 · 정책 ${policy}${order ? ` · 순서 ${order.join(',')}` : ''}${specials ? ' · 필살기 사용' : ''}${seed === undefined ? '' : ` · 시드 ${seed}`}${growth > 0 ? ` · 훈련 ${growth}단계(공격 +${growth * 5}%)` : ''}\n`)
    console.log('맵              난이도    등급      클리어율   도달 웨이브 (최소~최대, 중앙)   첫 실점   보스 실점 비율  실점 잡몹웨이브  도달 점수')
    for (const r of rows) {
      console.log(`  ${r.map.name.padEnd(12)} ${r.diffId.padEnd(8)} ${('★'.repeat(r.map.tier)).padEnd(8)}`
        + ` ${String(Math.round(r.clearRate * 100)).padStart(4)}%`
        + `   ${String(r.min).padStart(3)}~${String(r.max).padEnd(3)} 중앙 ${String(r.median).padStart(2)} / ${r.total}`
        + `   ${String(r.firstLoss).padStart(4)}웨이브`
        + `   ${String(Math.round(r.bossLossShare * 100)).padStart(8)}%`
        + `   ${String(r.bleedWaves).padStart(10)}개`
        + `   ${r.reachScore.toFixed(1).padStart(6)}`)
    }
    console.log(`\n${rows.length * runs}판 ${elapsed}초`)
  }
}
