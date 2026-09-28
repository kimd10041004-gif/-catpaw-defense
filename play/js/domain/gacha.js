/**
 * 뽑기 — 고양이 카드와 속성 룬.
 *
 * **확률을 공개한다. 표는 하나뿐이다.**
 * 캣닢은 현금으로도 사므로(`shop.js` 의 `catnip_100`·`catnip_600`) 이 뽑기는 확률형 아이템이다 —
 * 한국 게임산업법이 확률 공개를 의무화한다(2024-03 시행). 그래서 화면에 띄우는 표와 실제로 굴리는 표를
 * **두 벌 만들지 않는다.** `GACHA_TABLE` 하나가 둘 다다. `gacha.test` 가 합이 1.0 인지,
 * 그리고 **화면 문구의 확률이 이 표의 값과 같은지**를 검사한다 — 법이 요구하는 게 정확히 그것이다.
 *
 * **뽑기가 진행을 막지 않는다.** 기존 고양이 9마리는 시나리오 보상으로 전부 무료로 얻는다.
 * 여기서 나오는 것은 그 위에 얹는 것(새 고양이 카드 · 속성 룬)뿐이다 — 맵을 깨고 나가는 길은
 * 뽑기 운에 안 걸린다(README 무료 범위 약속).
 *
 * **재현 가능하다.** 난수는 `rng.js` 의 `mulberry32` 를 받아 쓴다(주간 도전이 쓰는 그것).
 * 같은 시드 = 같은 결과라 검사가 분포를 실제로 잴 수 있고, 버그를 재현할 수 있다.
 */

import { ELEMENTS } from './elements.js'

/** 뽑기 한 번 값 — 티켓 1장 또는 캣닢 */
export const DRAW_COST_CATNIP = 60
/** 10연 값 — 한 장 값의 10배가 아니라 9배(한 장을 덤으로 준다) */
export const DRAW10_COST_CATNIP = DRAW_COST_CATNIP * 9
/** 10연에 상위 등급 하나를 보장한다. 이 약속도 표와 함께 공개한다. */
export const PITY_AT = 10

/**
 * 등급별 확률과 그 등급에서 나오는 것들.
 *
 * `weight` 는 **확률 그대로다**(합이 정확히 1). 가중치를 따로 두면 화면에 띄울 때 다시 계산해야 하고,
 * 그 계산이 표와 어긋나는 순간 공개한 확률이 거짓말이 된다. 그래서 확률을 직접 적는다.
 */
export const GACHA_TABLE = [
  {
    id: 'legend', name: '전설', weight: 0.02,
    desc: '새 고양이 — 가장 드물다',
    pool: { kind: 'cat', rarity: 'legend' },
    pity: true,          // 10연 보장 대상
  },
  {
    id: 'epic', name: '희귀', weight: 0.10,
    desc: '새 고양이',
    pool: { kind: 'cat', rarity: 'epic' },
    pity: true,
  },
  {
    id: 'rune', name: '속성 룬', weight: 0.38,
    desc: '고양이에게 끼우는 속성 — 여섯 중 하나가 고르게 나온다',
    pool: { kind: 'rune' },
  },
  {
    id: 'shard', name: '카드 조각', weight: 0.50,
    desc: '모아서 원하는 카드로 바꾼다',
    pool: { kind: 'shard', amount: 15 },
  },
]

/** 조각을 카드 한 장으로 바꾸는 값 — 운이 나빠도 결국 도달한다는 뜻이다 */
export const SHARDS_PER_CARD = 300
/** 중복 카드 한 장이 녹아서 되는 조각 */
export const SHARDS_PER_DUPLICATE = 40

/** 표의 확률 합. 1 이어야 한다 — 검사가 본다. */
export function totalWeight(table = GACHA_TABLE) {
  return table.reduce((a, r) => a + r.weight, 0)
}

/**
 * 화면에 띄우는 확률 문구. **이 함수가 표에서 직접 만든다** — 손으로 적은 문구를 따로 두면
 * 표를 고칠 때 한쪽만 고쳐지고, 공개한 확률이 실제와 달라진다. 검사가 이 함수의 결과와 표를 대조한다.
 */
export function disclosureRows(table = GACHA_TABLE) {
  return table.map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.desc,
    /** 소수점 둘째 자리까지 — 0.02 → '2.00%' */
    percent: `${(r.weight * 100).toFixed(2)}%`,
    weight: r.weight,
  }))
}

/** 굴림 하나 → 등급 행. rngFn 은 [0,1) 을 주는 함수(rng.js 의 mulberry32). */
export function rollTier(rngFn, table = GACHA_TABLE) {
  const x = rngFn()
  let acc = 0
  for (const row of table) {
    acc += row.weight
    if (x < acc) return row
  }
  // 부동소수 끝자락. 마지막 행으로 떨어뜨린다 — null 을 돌려주면 호출부가 조용히 깨진다.
  return table[table.length - 1]
}

/**
 * 카드 한 장을 뽑는다.
 * @param {() => number} rngFn
 * @param {{cats: {legend: string[], epic: string[]}}} pools 등급별 고양이 id 목록(content 에서 온다)
 * @returns {{tier: string, kind: 'cat'|'rune'|'shard', id?: string, amount?: number}}
 */
export function draw(rngFn, pools, table = GACHA_TABLE) {
  const row = rollTier(rngFn, table)
  return resolve(rngFn, row, pools)
}

function resolve(rngFn, row, pools) {
  const p = row.pool
  if (p.kind === 'rune') {
    return { tier: row.id, kind: 'rune', id: ELEMENTS[Math.floor(rngFn() * ELEMENTS.length)] }
  }
  if (p.kind === 'shard') {
    return { tier: row.id, kind: 'shard', amount: p.amount }
  }
  const list = (pools && pools.cats && pools.cats[p.rarity]) || []
  if (list.length === 0) {
    // 그 등급에 고양이가 하나도 없는 빌드(데모 등). 빈손으로 돌려주지 않고 조각으로 바꾼다 —
    // 판돈을 받고 아무것도 안 주는 것이 제일 나쁘다.
    return { tier: row.id, kind: 'shard', amount: SHARDS_PER_DUPLICATE }
  }
  return { tier: row.id, kind: 'cat', id: list[Math.floor(rngFn() * list.length)] }
}

/**
 * 10연 — 마지막 한 장은 **상위 등급(pity)이 보장된다.**
 * 앞의 아홉에서 이미 나왔으면 열째도 그냥 굴린다. 이 보장도 표와 함께 공개한다.
 */
export function drawTen(rngFn, pools, table = GACHA_TABLE) {
  const out = []
  const pityRows = table.filter((r) => r.pity)
  for (let i = 0; i < PITY_AT - 1; i += 1) out.push(draw(rngFn, pools, table))

  const gotPity = out.some((r) => pityRows.some((p) => p.id === r.tier))
  if (gotPity) {
    out.push(draw(rngFn, pools, table))
  } else {
    // 보장분은 pity 행들 안에서만 확률에 비례해 고른다
    const sum = pityRows.reduce((a, r) => a + r.weight, 0)
    const x = rngFn() * sum
    let acc = 0
    let picked = pityRows[pityRows.length - 1]
    for (const r of pityRows) { acc += r.weight; if (x < acc) { picked = r; break } }
    out.push(resolve(rngFn, picked, pools))
  }
  return out
}
