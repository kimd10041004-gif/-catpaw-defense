/**
 * 밀크 마나 — 필살기를 쓰는 데 드는 전투 자원.
 *
 * 왜 넣었나: 필살기가 쿨다운만 있으면 "차면 그냥 쓰는" 버튼이 된다.
 * 비용이 붙어야 "지금 쓸까, 보스까지 아낄까"라는 선택이 생긴다.
 * 마나는 적을 잡고 웨이브를 넘기고 지도에 떨어지는 크리스탈을 주우면 찬다 —
 * 전부 플레이로만 얻으므로 결제 없이도 계속 쓸 수 있다.
 *
 * DOM도 게임 객체도 모르는 순수 함수만 둔다 (node --test 대상).
 */

/** 들고 다닐 수 있는 최대치 */
export const MANA_MAX = 100
/** 판을 시작할 때 주는 양 — 1웨이브부터 한 번은 써볼 수 있게 */
export const MANA_START = 40

/**
 * 일반 적 한 마리.
 * 1로 뒀더니 중반 웨이브(적 20마리) 수입이 28밖에 안 돼 가장 싼 필살기(35)조차
 * 못 채웠다. 테스트가 잡아냈고 2로 올렸다 — 이제 중반에 웨이브당 하나는 나온다.
 */
export const MANA_PER_KILL = 2
/** 보스 한 마리 (등급 배수가 곱해진다) */
export const MANA_PER_BOSS = 8
/** 웨이브를 끝까지 막았을 때 */
export const MANA_PER_WAVE_CLEAR = 8
/** 지도에 떨어진 밀크 크리스탈 하나 */
export const MANA_PER_CRYSTAL = 25

export class ManaError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ManaError'
  }
}

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ManaError(`${label}은(는) 유한한 숫자여야 합니다: ${String(value)}`)
  }
}

/** 0 ~ MANA_MAX 로 자른다. 소수점은 버린다(HUD 숫자가 흔들리지 않게). */
export function clampMana(value) {
  requireFinite(value, 'value')
  return Math.max(0, Math.min(MANA_MAX, Math.floor(value)))
}

/**
 * 마나를 더한다. 최대치를 넘으면 버려진다.
 * @returns {{mana:number, gained:number, overflow:number}} gained = 실제로 찬 양
 */
export function gainMana(current, amount) {
  const cur = clampMana(current)
  requireFinite(amount, 'amount')
  if (amount < 0) throw new ManaError(`amount는 0 이상이어야 합니다: ${amount}`)
  const next = clampMana(cur + amount)
  return { mana: next, gained: next - cur, overflow: Math.floor(amount) - (next - cur) }
}

/**
 * 마나를 쓴다. 모자라면 아무것도 깎지 않고 실패를 알린다.
 * @returns {{ok:boolean, mana:number, short?:number}} short = 모자란 양
 */
export function spendMana(current, cost) {
  const cur = clampMana(current)
  requireFinite(cost, 'cost')
  if (cost < 0) throw new ManaError(`cost는 0 이상이어야 합니다: ${cost}`)
  const need = Math.ceil(cost)
  if (cur < need) return { ok: false, mana: cur, short: need - cur }
  return { ok: true, mana: cur - need }
}

/** 쓸 수 있는지만 본다 (버튼 비활성화 판정) */
export function canCast(current, cost) {
  return spendMana(current, cost).ok
}

/**
 * 적 한 마리를 잡았을 때 차는 마나.
 * 보스는 등급이 높을수록 많이 준다 — 큰 놈을 잡으면 다음 필살기가 바로 나온다.
 * @param {{boss?:boolean, tier?:number}} enemyDef
 */
export function manaForKill(enemyDef) {
  if (!enemyDef || !enemyDef.boss) return MANA_PER_KILL
  const tier = Math.max(1, Math.floor(enemyDef.tier || 1))
  return MANA_PER_BOSS * tier
}
