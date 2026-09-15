/**
 * 자유 맵 사다리 — 잘 두는 봇(`deck`)으로 '해 보고' 검사한다: 완주율의 뒤집힘·절벽, 포화 구간의 남은 목숨.
 *
 * `balance-sim.test.mjs` 에서 U-3 에 떼어 냈다 — 판 수는 그대로다(7맵 × 시드 셋 × 3판 = 63판).
 * node --test 는 파일 단위로 병렬이라, 세 묶음을 한 파일에 두면 105초짜리 파일 하나가 나머지가 다 끝난 뒤에도 혼자 돈다.
 * 검사 내용과 이름은 옮기기 전과 같다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listMaps } from '../../web/js/content/registry.js'
import { playMany } from '../../tools/balance-sim.mjs'

const RUNS = 3
/** 시드를 고정한다 — 같은 코드면 같은 결과. 운으로 초록이 됐다 빨개졌다 하지 않게. */
const SEED = 7

/* 같은 맵을 **잘 두는 봇**으로도 한 번 더 돈다. `balance-sim.test` 의 `results` 는 치즈냥만 쓰는 바닥 봇이라
 * 늦은 맵이 전부 똑같아 보인다 — 실제로 그 눈으로는 다락방(티어 6)과 유리 온실(티어 7)이
 * 도달 점수 19.0 대 19.0 으로 구별이 안 됐고, 그래서 티어가 뒤집힌 것을 몇 라운드 동안 못 잡았다. */
/* 시드를 셋 쓴다. 판 셋이면 완주율이 0/33/67/100 네 값으로만 움직이는데 아래 사다리 검사의
 * 기준은 25pp 다 — 재는 눈금이 기준보다 굵으면 그 검사는 운이다. 실제로 유리 온실을 고르는
 * 동안 같은 콘텐츠가 시드에 따라 0% 와 33% 로 갈렸다. */
const DECK_SEEDS = [SEED, 23, 11]
const deckResults = new Map()
for (const m of listMaps()) {
  const rs = DECK_SEEDS.map((seed) => playMany(m.id, 'normal', RUNS, { seed, specials: true, policy: 'deck' }))
  deckResults.set(m.id, {
    clearRate: rs.reduce((a, r) => a + r.clearRate, 0) / rs.length,
    /* 남은 목숨 비율도 같이 남긴다 — **같은 판을 이미 돌리고 있어 추가 비용이 0**이다.
     * 완주율이 100% 로 포화한 윗칸(티어 1~4)에서 사다리를 읽는 유일한 눈이다(맨 아래 검사). */
    lifeShare: rs.reduce((a, r) => a + r.lifeShare, 0) / rs.length,
  })
}

test('밸런스: 뒤 맵이 앞 맵보다 훨씬 쉽지 않다 (완주율로 본다)', () => {
  /* 위 '도달 점수가 ★ 순서로 내려간다' 와 **같은 것을 다른 눈으로** 본다. 그 검사가 못 잡은 이유가 둘이다:
   *   · 치즈냥 봇으로 돈다 — 그 봇에겐 늦은 맵이 전부 도달 19.0 으로 똑같다
   *   · 도달 점수를 본다 — **완주율 0% 대 100%** 가 19.0 대 21.0 으로 눌린다
   * 그래서 유리 온실(티어 7)이 다락방(티어 6)보다 쉬운데도 오차 1.5 안에 숨었다.
   *
   * 여기서는 **잘 두는 봇의 완주율**을 쓴다 — 0% 대 100% 를 누르지 않는 유일한 지표다.
   * 기준은 느슨하게 잡는다(25pp): 뒤 맵이 앞 맵보다 **눈에 띄게 쉬우면** 걸린다.
   * 티어가 한 칸 뒤인 맵이 조금 쉬운 것까지 막을 생각은 없다 — 사다리가 **뒤집히는 것**만 막는다. */
  const maps = listMaps()
  const rate = (id) => deckResults.get(id).clearRate * 100
  for (let i = 1; i < maps.length; i += 1) {
    const easier = maps[i - 1]
    const harder = maps[i]
    assert.ok(rate(harder.id) <= rate(easier.id) + 25,
      `${harder.name}(티어 ${harder.tier}) 완주 ${rate(harder.id).toFixed(0)}% > `
      + `${easier.name}(티어 ${easier.tier}) ${rate(easier.id).toFixed(0)}% + 25 — 뒤 맵이 앞 맵보다 쉽다`)
  }
})

test('밸런스: 이웃 티어 사이에 절벽이 없다 (완주율이 한 칸에 50pp 넘게 안 떨어진다)', () => {
  /* 위 검사는 **뒤집힘**만 막는다. 그래서 창고(티어 4) 100% → 지하실(티어 5) 0% 는 통과했다 —
   * 사다리가 계단이 아니라 벽이었다. 앞 맵 넷을 술술 깬 사람이 다섯째에서 갑자기 못 깨면
   * 그건 어려운 게 아니라 끊긴 것이다.
   *
   * 기준 50pp: 한 칸에 절반 넘게 떨어지지 않는다. 티어 1~3 이 100% 인 것은 그대로 두고(첫 맵들이
   * 막히면 안 된다), 4 → 7 이 85 → 60 → 35 → 10 쯤으로 내려가는 것이 L 의 목표다. */
  const maps = listMaps()
  const rate = (id) => deckResults.get(id).clearRate * 100
  for (let i = 1; i < maps.length; i += 1) {
    const easier = maps[i - 1]
    const harder = maps[i]
    assert.ok(rate(harder.id) >= rate(easier.id) - 50,
      `${easier.name}(티어 ${easier.tier}) ${rate(easier.id).toFixed(0)}% → `
      + `${harder.name}(티어 ${harder.tier}) ${rate(harder.id).toFixed(0)}% — 한 칸에 50pp 넘게 떨어진다, 사다리가 벽이다`)
  }
})

test('밸런스: 완주율이 포화한 구간이 공짜로 끝나지 않는다 (윗칸은 목숨으로 본다)', () => {
  /* 위 검사 둘은 **완주율**로 본다. 그래서 티어 1~4 가 통째로 안 보인다 — 넷 다 100% 다.
   * 그 뒤를 남은 목숨으로 재 보니 사다리가 없는 정도가 아니라 **뒤집혀 있었다**
   * (`deck` 봇 · 보통 · 시드 셋 × 3판, 고치기 전):
   *
   *   골목길 0.80 · 부엌 0.40 · 지붕 **1.00** · 창고 **1.00**
   *
   * 지붕·창고는 아홉 판 전부 목숨을 하나도 안 잃고 끝났다 — 티어 3·4 가 공짜였다.
   * 원정에서 `holdScore` 가 고친 것과 같은 종류의 포화이고, 자유 맵 쪽 답이 이 검사다.
   *
   * ── 왜 '이웃 티어 비교'가 아니라 '마지막 한 칸'인가 ──────────────────────────
   * 처음엔 이웃끼리 비교하게 썼는데(뒤 맵이 앞 맵보다 0.15 넘게 여유로우면 빨강), 그러면
   * **지붕이 영원히 빨갛다.** 지붕은 반응이 경사가 아니라 절벽이라 1.00 과 0.20 사이에 값이
   * 없다(maps.js 지붕 주석에 쓸이표가 있다). 콘텐츠가 낼 수 없는 모양을 검사가 요구하면
   * 그 검사는 언젠가 꺼진다. 그래서 **정말 중요한 것 하나**만 못 박는다:
   * 잘 두는 봇이 매번 깨는 구간의 **마지막 맵**은 목숨을 최소한 15% 는 내놔야 한다.
   * 사다리 윗칸이 공짜로 끝나면 안 된다는 뜻이고, 지금은 창고(티어 4)가 그 자리다.
   *
   * **완주율이 100% 인 맵만 본다.** 못 깨는 맵은 목숨이 0 으로 눌려서 이 지표가 뜻을 잃는다 —
   * 거기서부터는 위의 완주율 검사 둘이 맡는다. */
  const maps = listMaps()
  const saturated = maps.filter((m) => deckResults.get(m.id).clearRate >= 1)
  assert.ok(saturated.length > 0, '완주율 100% 인 맵이 하나도 없다 — 사다리가 통째로 너무 어렵다')
  const last = saturated[saturated.length - 1]
  const life = deckResults.get(last.id).lifeShare
  assert.ok(life < 0.85,
    `${last.name}(티어 ${last.tier})은 잘 두는 봇이 매번 깨는 마지막 맵인데 남은 목숨이 ${life.toFixed(2)} 다`
    + ' — 목숨을 15% 도 안 내놓으면 그 맵은 공짜다. 완주율은 100% 라 이 검사만 볼 수 있다')
})

test('밸런스: 포화 구간 가운데가 솟지 않는다 (첫 맵보다 후한 맵은 없다)', () => {
  /* 바로 위 검사는 포화 구간의 **마지막 한 칸**만 본다. 그래서 가운데가 솟은 것을 못 잡았다 —
   * 창고를 1.15/440 으로 내린(M) 뒤 사다리가 이렇게 남았다:
   *
   *   골목길 0.80 · 부엌 0.40 · 지붕 **1.00** · 창고 0.33
   *
   * 마지막 칸(창고 0.33)이 조건을 지키니 위 검사는 초록인데, 티어 3 이 티어 1 보다 후하다.
   * 지붕은 아홉 판 전부 목숨을 하나도 안 잃고 끝났다 — 사다리 한가운데가 공짜다.
   *
   * ── 왜 '이웃 비교'가 아니라 '첫 맵 기준'인가 ────────────────────────────
   * 이웃끼리 단조를 요구하면 부엌(0.40)이 지붕보다 낮아서 **고친 뒤에도 빨갛다** — 부엌의
   * 0.40 은 30웨이브 보스 한 방이고 순서로는 문제가 아니다(창고 0.33 보다 후하니 2 → 4 는 옳다).
   * 콘텐츠가 낼 수 없는 모양을 요구하는 검사는 언젠가 꺼진다. 그래서 못 박는 것은 하나다:
   * **처음 배우는 맵보다 후한 맵은 뒤에 없다.** 어느 칸이 솟아도 이 하나에 걸린다.
   * (T 가 부엌의 그 한 방을 벌려 0.58 로 올렸다 — 이제 이웃 단조도 성립하지만 검사는 이대로 둔다. 원칙이 안 바뀌었다.)
   *
   * 위 검사와 짝이다 — 저쪽이 구간의 끝을, 이쪽이 구간의 가운데를 맡는다. */
  const maps = listMaps()
  const saturated = maps.filter((m) => deckResults.get(m.id).clearRate >= 1)
  assert.ok(saturated.length > 0, '완주율 100% 인 맵이 하나도 없다 — 사다리가 통째로 너무 어렵다')
  const first = saturated[0]
  const firstLife = deckResults.get(first.id).lifeShare
  for (const m of saturated.slice(1)) {
    const life = deckResults.get(m.id).lifeShare
    assert.ok(life <= firstLife + 0.05,
      `${m.name}(티어 ${m.tier})의 남은 목숨 ${life.toFixed(2)} > ${first.name}(티어 ${first.tier}) ${firstLife.toFixed(2)}`
      + ' — 뒤 맵이 처음 배우는 맵보다 후하다. 사다리 가운데가 솟았다')
  }
})
