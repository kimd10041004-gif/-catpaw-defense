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

/**
 * 헤어볼 폭발 — 적중 지점 주변에도 피해를 준다.
 * effect = { kind:'splash', radius: 타일, falloff: 0~1 (가장자리 피해 비율) }
 */
registerEffect('splash', {
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
 * 지휘 — 옆 고양이들을 강하게 만든다.
 * effect = { kind:'buff', radius: 타일, damageMul, fireRateMul, rangeAdd }
 *
 * **핸들러가 없는 것은 실수가 아니다.** 이건 발사와 무관한 성질이라
 * domain/mods.js 의 towerModsFor 가 이 파라미터를 직접 읽는다. 그래도 등록은 해야
 * 한다 — validateAll() 이 타워의 effects[].kind 가 등록된 것인지 검사하기 때문이다.
 * passive: true 가 "이건 쏘는 효과가 아니다"라는 표시다.
 */
registerEffect('buff', { passive: true })
