/**
 * 타워 능력(effect) 핸들러.
 *
 * ▶ 새 능력을 추가하려면: 아래처럼 registerEffect('이름', { onHit / onFire })를 하나 더 쓰고,
 *   towers.js의 해당 레벨 effects 배열에 { kind: '이름', ...파라미터 }를 넣으면 끝이다.
 *   game.js는 손대지 않는다.
 *
 * 핸들러 계약:
 *   onFire(ctx, effect, target) → 발사 순간 호출. { consumed: true }를 반환하면 투사체를 만들지 않는다.
 *   onHit(ctx, effect, target)  → 투사체가 적중한 순간 호출.
 *
 *   ctx = {
 *     tower,                          // 발사한 타워 (타일 좌표, damage, range 포함)
 *     now,                            // 게임 내부 시각(초)
 *     damage,                         // 이번 발사의 기본 공격력
 *     enemies,                        // 살아 있는 적 배열
 *     applyDamage(enemy, amount),     // 방어력 적용 후 피해 (처치/골드 처리까지 포함)
 *     enemiesInRadius(x, y, r, opts), // 반경 내 적 (opts.exclude로 제외)
 *     addSlow(enemy, factor, sec),    // 적 저항을 반영한 슬로우
 *     spawnParticle(x, y, opts),      // 연출
 *     playSfx(name),                  // 효과음
 *   }
 */

import { registerEffect } from './registry.js'
import { tr } from '../i18n/index.js'

/** 0.35 → 35 */
const pct = (v) => Math.round(v * 100)

/**
 * 헤어볼 폭발 — 적중 지점 주변에도 피해를 준다.
 * effect = { kind:'splash', radius: 타일, falloff: 0~1 (가장자리 피해 비율) }
 */
registerEffect('splash', {
  name: '폭발 반경', // i18n-key
  describe: (fx) => tr('{v}칸 · 가장자리 {v2}%', { v: (fx.radius || 1).toFixed(1), v2: pct(fx.falloff === undefined ? 0.5 : fx.falloff) }),
  onHit(ctx, effect, target) {
    const radius = effect.radius || 1
    const falloff = effect.falloff === undefined ? 0.5 : effect.falloff
    const near = ctx.enemiesInRadius(target.x, target.y, radius, { exclude: target })
    for (const e of near) {
      const dx = e.x - target.x
      const dy = e.y - target.y
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius)
      // 중심은 100%, 가장자리는 falloff 비율까지 선형 감쇠
      ctx.applyDamage(e, ctx.damage * (1 - (1 - falloff) * t))
    }
    ctx.spawnParticle(target.x, target.y, { kind: 'splash', radius, color: '#ffb35c' })
  },
})

/**
 * 눈빛 — 적을 느리게 만든다. 적의 resist.slow만큼 효과가 깎인다.
 * effect = { kind:'slow', factor: 0~1, duration: 초 }
 */
registerEffect('slow', {
  name: '둔화', // i18n-key
  describe: (fx) => tr('{v}% / {duration}초', { v: pct(fx.factor), duration: fx.duration }),
  onHit(ctx, effect, target) {
    ctx.addSlow(target, effect.factor, effect.duration)
    ctx.spawnParticle(target.x, target.y, { kind: 'frost', color: '#8fd4ff' })
  },
})

/**
 * 몸통 박치기 — 투사체 없이 사거리 안 모든 적을 동시에 때린다.
 * 적이 뭉칠수록 강해지므로 코너 안쪽에 놓는 게 정석.
 * effect = { kind:'aura' }
 */
registerEffect('aura', {
  name: '범위 전체 타격', // i18n-key
  describe: () => tr('사거리 안 전부 동시에'),
  onFire(ctx) {
    const hits = ctx.enemiesInRadius(ctx.tower.x, ctx.tower.y, ctx.tower.range, {
      targets: ctx.tower.targets,
    })
    for (const e of hits) ctx.applyDamage(e, ctx.damage)
    ctx.spawnParticle(ctx.tower.x, ctx.tower.y, {
      kind: 'shockwave', radius: ctx.tower.range, color: '#ffd7a1',
    })
    if (hits.length > 0) ctx.playSfx('thump')
    // 투사체를 만들지 않는다 — 이 발사는 여기서 끝난다.
    return { consumed: true }
  },
})

/**
 * 할퀸 상처 — 시간이 지나며 계속 아프다. **장갑을 무시한다.**
 * effect = { kind:'dot', dps: 초당 피해, duration: 초, maxStacks: 겹칠 수 있는 수 }
 *
 * 장갑이 뺄셈(applyArmor)이라 저피해 속사는 중장갑 앞에서 무력해지는데, dot 은 그
 * 규칙 밖에 있다. 다만 한 마리당 효율은 낮게 잡았다 — 값은 여러 마리에 동시에
 * 걸어 두고 다음 표적으로 옮겨도 계속 타는 데 있다.
 */
registerEffect('dot', {
  name: '상처 (장갑 무시)', // i18n-key
  describe: (fx) => tr('초당 {v} · {v2}초 · 최대 {v3}겹', { v: fx.dps || 0, v2: fx.duration || 0, v3: fx.maxStacks || 3 }),
  onHit(ctx, effect, target) {
    ctx.addDot(target, effect.dps || 0, effect.duration || 0, effect.maxStacks || 3)
    ctx.spawnParticle(target.x, target.y, { kind: 'crit', color: '#8fe388', radius: 0.18 })
  },
})

/**
 * 정전기 — 맞은 적에서 가까운 적으로 튄다. 공중에도 닿는다.
 * effect = { kind:'chain', jumps: 튀는 횟수, radius: 타일, falloff: 0~1 (튈 때마다 곱) }
 *
 * 삼색냥의 splash 는 지상 전용이라 공중 물량에 답이 없었다. 이게 그 답이다.
 * 이미 맞은 적은 제외하므로 같은 적을 두 번 때리지 않는다.
 */
registerEffect('chain', {
  name: '정전기 연쇄', // i18n-key
  describe: (fx) => tr('최대 {v}마리 · 반경 {v2}', { v: Math.max(0, fx.jumps || 0) + 1, v2: (fx.radius || 1.5).toFixed(1) }),
  onHit(ctx, effect, target) {
    const jumps = Math.max(0, effect.jumps || 0)
    const radius = effect.radius || 1.5
    const falloff = effect.falloff === undefined ? 0.6 : effect.falloff
    const hit = new Set([target])
    let from = target
    let dmg = ctx.damage
    for (let i = 0; i < jumps; i += 1) {
      const near = ctx.enemiesInRadius(from.x, from.y, radius)
        .filter((e) => !hit.has(e))
      if (near.length === 0) break
      // 가장 가까운 적으로 튄다
      let next = near[0]
      let best = Infinity
      for (const e of near) {
        const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2
        if (d < best) { best = d; next = e }
      }
      dmg *= falloff
      ctx.applyDamage(next, dmg)
      ctx.spawnParticle(next.x, next.y, { kind: 'crit', color: '#9fd8ff', radius: 0.2 })
      hit.add(next)
      from = next
    }
  },
})

/**
 * 꼬리 창 — 타워에서 표적 방향으로 직선을 쏘아 그 선에 걸친 적을 전부 뚫는다.
 * effect = { kind:'pierce', width: 선의 반폭(타일), maxHits: 최대 관통 수 }
 *
 * aura 와 같은 형태(투사체 없이 즉시)지만 방향이 있다. 길이 곧게 뻗은 구간에
 * 놓으면 줄지어 선 적을 한 번에 꿰고, 굽은 자리에 놓으면 한 마리밖에 못 맞힌다 —
 * 맵마다 좋은 자리가 다르다.
 */
registerEffect('pierce', {
  name: '관통', // i18n-key
  describe: (fx) => tr('한 발에 최대 {v}마리', { v: Math.max(1, fx.maxHits || 3) }),
  onFire(ctx, effect, target) {
    const w = effect.width || 0.5
    const maxHits = Math.max(1, effect.maxHits || 3)
    const ox = ctx.tower.x
    const oy = ctx.tower.y
    const dx = target.x - ox
    const dy = target.y - oy
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const reach = ctx.tower.range

    // 선 위 거리(t)와 선에서 벗어난 거리(off)로 걸러 앞쪽부터 순서대로 때린다
    const online = []
    for (const e of ctx.enemies) {
      if (!e.alive) continue
      if (ctx.tower.targets === 'ground' && e.flying) continue
      if (ctx.tower.targets === 'air' && !e.flying) continue
      const px = e.x - ox
      const py = e.y - oy
      const t = px * ux + py * uy
      if (t < 0 || t > reach) continue
      const off = Math.abs(px * uy - py * ux)
      if (off > w + (e.def.size || 0.3)) continue
      online.push({ e, t })
    }
    online.sort((a, b) => a.t - b.t)
    for (const { e } of online.slice(0, maxHits)) ctx.applyDamage(e, ctx.damage)

    ctx.spawnParticle(ox + ux * reach * 0.5, oy + uy * reach * 0.5,
      { kind: 'crit', color: '#e8e2d4', radius: 0.25, count: 4 })
    if (online.length > 0) ctx.playSfx('dart')
    // 투사체를 만들지 않는다 — 이 발사는 여기서 끝난다.
    return { consumed: true }
  },
})

/**
 * 갈라진 틈 — 맞을수록 **장갑이 벗겨진다.** 시간이 지나면 도로 붙는다.
 * effect = { kind:'sunder', amount: 한 번에 깎는 장갑, max: 최대, duration: 유지 초 }
 *
 * 장갑은 뺄셈이라(`applyArmor`) 저피해 속사가 중장갑 앞에서 0 이 되는 게 이 게임의 오래된 구조다.
 * dot 과 truestrike 는 그걸 **혼자** 피해 가는데, 이건 **옆의 모두를** 위해 벗긴다 —
 * 자기 화력이 아니라 판 전체의 화력을 올리는 자리다.
 */
registerEffect('sunder', {
  name: '장갑 벗기기', // i18n-key
  describe: (fx) => tr('맞을 때마다 장갑 -{v} · 최대 -{v2} · {v3}초', {
    v: fx.amount || 1, v2: fx.max || 3, v3: fx.duration || 3,
  }),
  onHit(ctx, effect, target) {
    ctx.sunder(target, effect.amount || 1, effect.max || 3, effect.duration || 3)
    ctx.spawnParticle(target.x, target.y, { kind: 'crit', color: '#c9a227', radius: 0.16, count: 2 })
  },
})

/**
 * 표식 — 찍힌 적은 **모두에게** 더 아프다. 겹치지 않고, 다시 찍으면 시간만 늘어난다.
 * effect = { kind:'mark', mul: 받는 피해 배수, duration: 초 }
 *
 * 자기 피해를 올리는 buff 와 방향이 반대다: buff 는 **옆 고양이**를 세게 하고, 이건 **적**을 약하게 한다.
 * 그래서 뒤에 선 고양이가 몇 마리든 전부 이득을 본다 — 화력이 모인 판일수록 값이 커진다.
 */
registerEffect('mark', {
  name: '표식', // i18n-key
  describe: (fx) => tr('찍힌 적이 받는 피해 ×{v} · {v2}초', { v: fx.mul || 1.25, v2: fx.duration || 4 }),
  onHit(ctx, effect, target) {
    ctx.mark(target, effect.mul || 1.25, effect.duration || 4)
    ctx.spawnParticle(target.x, target.y, { kind: 'crit', color: '#ff7a59', radius: 0.22, count: 3 })
  },
})

/**
 * 몸통 박치기 — 맞은 적을 **길 뒤로 밀어낸다.**
 * effect = { kind:'knockback', tiles: 밀어내는 타일, bossMul: 보스에게 곱하는 비율 }
 *
 * 경로 진행이 스칼라 하나(`e.progress`)라서 이게 딱 한 줄로 성립한다 — 그 모델의 유일한 선물이다.
 * 피해가 아니라 **시간**을 버는 자리다. 보스는 덜 밀린다(안 그러면 보스가 영영 못 온다).
 */
registerEffect('knockback', {
  name: '밀어내기', // i18n-key
  describe: (fx) => tr('뒤로 {v}칸 · 보스는 {v2}칸', {
    v: (fx.tiles || 0.6).toFixed(1), v2: ((fx.tiles || 0.6) * (fx.bossMul || 0.35)).toFixed(1),
  }),
  onHit(ctx, effect, target) {
    ctx.knockback(target, effect.tiles || 0.6, effect.bossMul || 0.35)
    ctx.spawnParticle(target.x, target.y, { kind: 'shockwave', radius: 0.5, color: '#a78bfa' })
  },
})

/**
 * 넓은 시야 — 옆 고양이들의 **사거리**를 늘린다. `buff` 와 같은 자리에서 읽힌다(mods.js `buffOf`).
 * effect = { kind:'sightaura', radius: 타일, rangeAdd: 늘려 주는 사거리 }
 *
 * 턱시도냥의 buff 가 피해·연사를 올린다면 이쪽은 **닿는 범위**를 올린다. 사거리가 짧은 고양이
 * (먼치킨냥 1.6 · 뚱냥 1.9)와 같이 두면 놓을 자리가 통째로 달라진다 — 그게 이 효과의 값이다.
 * `buff` 와 kind 를 나눈 이유: 알약 문구와 도감이 "무엇을 올려 주는지"를 다르게 읽어야 한다.
 *
 * **핸들러가 없는 것은 실수가 아니다** — buff 와 같이 `towerModsFor` 가 직접 읽는다.
 */
registerEffect('sightaura', {
  name: '넓은 시야', // i18n-key
  passive: true,
  describe: (fx) => tr('반경 {v} 안 사거리 +{v2}', { v: (fx.radius || 0).toFixed(1), v2: (fx.rangeAdd || 0).toFixed(1) }),
})

/**
 * 꿰뚫는 손톱 — **장갑을 통째로 무시한다.** 발사 하나가 여기서 끝난다(투사체 없음).
 *
 * 장갑은 뺄셈이라(`applyArmor`) 두꺼운 놈 앞에서는 한 방의 크기가 아니라 **장갑을 넘느냐**가
 * 전부다. 마왕 쥐 14 · 두더지 대장 12 · 두더지 8 앞에서 22짜리 한 방은 8·10·14 로 깎이는데,
 * 이 효과는 22 그대로 들어간다. 그래서 이 고양이는 잡몹에겐 평범하고 보스에겐 두 배가 넘는다 —
 * "비싸지만 어떤 적에게만 세다"가 이 자리의 설계다.
 *
 * `dot` 도 장갑을 무시하지만 그건 시간이 걸리는 지속 피해다. 이건 즉발이다.
 * effect = { kind: 'truestrike' } — 파라미터가 없다. 세기는 levels[].damage 가 정한다.
 */
registerEffect('truestrike', {
  name: '장갑 무시', // i18n-key
  describe: () => tr('한 방이 장갑을 그대로 통과한다'),
  onFire(ctx, effect, target) {
    ctx.applyTrueDamage(target, ctx.damage)
    ctx.spawnParticle(target.x, target.y, { kind: 'crit', color: '#fff3b0', radius: 0.3, count: 5 })
    ctx.playSfx('dart')
    // 투사체를 만들지 않는다 — 이 발사는 여기서 끝난다(aura·pierce 와 같은 규칙).
    return { consumed: true }
  },
})

/**
 * 지휘 — 옆 고양이들을 강하게 만든다.
 * effect = { kind:'buff', radius: 타일, damageMul, fireRateMul, rangeAdd }
 *
 * **핸들러가 없는 것은 실수가 아니다.** 이건 발사와 무관한 성질이라
 * domain/mods.js 의 towerModsFor 가 이 파라미터를 직접 읽는다. 그래도 등록은 해야
 * 한다 — validateAll() 이 타워의 effects[].kind 가 등록된 것인지 검사하기 때문이다.
 * passive: true 가 "이건 쏘는 효과가 아니다"라는 표시다.
 */
registerEffect('buff', {
  passive: true,
  name: '옆 고양이 강화', // i18n-key
  describe: (fx) => {
    const parts = []
    if (fx.damageMul && fx.damageMul !== 1) parts.push(tr('공격 +{v}%', { v: pct(fx.damageMul - 1) }))
    if (fx.fireRateMul && fx.fireRateMul !== 1) parts.push(tr('연사 +{v}%', { v: pct(fx.fireRateMul - 1) }))
    if (fx.rangeAdd) parts.push(tr('사거리 +{rangeAdd}', { rangeAdd: fx.rangeAdd }))
    return tr('{v} (반경 {v2})', { v: parts.join(' · ') || tr('효과 없음'), v2: fx.radius || 1 })
  },
})
