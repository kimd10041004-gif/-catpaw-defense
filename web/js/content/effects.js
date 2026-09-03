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
