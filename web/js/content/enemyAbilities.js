/**
 * 적(보스) 능력 핸들러 — 고등급 보스가 단순히 체력만 많은 게 아니라 패턴을 갖게 하는 곳.
 *
 * ▶ 새 보스 패턴을 추가하려면: registerEnemyAbility('이름', {...})를 하나 더 쓰고,
 *   enemies.js의 abilities 배열에 { kind:'이름', ...파라미터 }를 넣으면 끝이다.
 *   game.js는 손대지 않는다.
 *
 * 훅 계약:
 *   onSpawn(ctx, ab, e)            등장 순간 (초기화)
 *   onTick(ctx, ab, e, dt)         매 시뮬레이션 스텝
 *   onDamaged(ctx, ab, e, dmg)     피해를 입기 직전. 숫자를 반환하면 그 값으로 대체된다(보호막)
 *   onDeath(ctx, ab, e)            사망 순간 (분열 등)
 *
 *   ctx = {
 *     now, enemies,
 *     spawnMinion(enemyId, opts),    // opts: { progress, hpMul }
 *     enemiesInRadius(x, y, r, opts),
 *     spawnParticle(x, y, opts), addFloater(x, y, text, color),
 *     playSfx(name), flash(color, strength), shake(amount),
 *   }
 *
 * 스탯 보정 규약: 능력은 매 스텝 초기화되는 e.auraArmor / e.auraSpeed 에만 쓴다.
 * (직접 def를 고치면 다음 판까지 오염되므로 절대 하지 않는다)
 */

import { registerEnemyAbility } from './registry.js'

/**
 * 재생 — 초당 최대 체력의 일정 비율을 회복한다. 화력이 모자라면 영영 못 잡는다.
 * { kind:'regen', percentPerSec: 0.02 }
 */
registerEnemyAbility('regen', {
  onTick(ctx, ab, e, dt) {
    if (e.hp <= 0 || e.hp >= e.maxHp) return
    const heal = e.maxHp * (ab.percentPerSec || 0.02) * dt
    e.hp = Math.min(e.maxHp, e.hp + heal)
    e.regenTick = (e.regenTick || 0) + heal
    if (e.regenTick >= e.maxHp * 0.05) {   // 5%씩 모아서 한 번만 표시 (숫자 도배 방지)
      ctx.addFloater(e.x, e.y - 0.35, `+${Math.round(e.regenTick)}`, '#7fe08a')
      ctx.spawnParticle(e.x, e.y, { kind: 'heal', color: '#7fe08a' })
      e.regenTick = 0
    }
  },
})

/**
 * 보호막 — 최대 체력의 일정 비율만큼 피해를 대신 받는다. 일정 시간 안 맞으면 다시 찬다.
 * { kind:'shield', amount: 0.35, rechargeAfter: 6 }
 */
registerEnemyAbility('shield', {
  onSpawn(ctx, ab, e) {
    e.shieldMax = e.maxHp * (ab.amount || 0.3)
    e.shield = e.shieldMax
    e.lastHitAt = -999
  },
  onTick(ctx, ab, e) {
    const after = ab.rechargeAfter || 6
    if (e.shield <= 0 && ctx.now - e.lastHitAt > after) {
      e.shield = e.shieldMax
      ctx.addFloater(e.x, e.y - 0.4, '보호막 재생', '#8fd4ff')
      ctx.spawnParticle(e.x, e.y, { kind: 'shieldup', color: '#8fd4ff', radius: e.def.size * 2 })
      ctx.playSfx('shield')
    }
  },
  onDamaged(ctx, ab, e, dmg) {
    e.lastHitAt = ctx.now
    if (e.shield <= 0) return dmg
    const absorbed = Math.min(e.shield, dmg)
    e.shield -= absorbed
    ctx.spawnParticle(e.x, e.y, { kind: 'shieldhit', color: '#8fd4ff', radius: e.def.size * 1.8 })
    if (e.shield <= 0) {
      ctx.addFloater(e.x, e.y - 0.4, '보호막 파괴!', '#ff7a7a')
      ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#8fd4ff', count: 14 })
      ctx.playSfx('shield_break')
    }
    return dmg - absorbed   // 남은 피해만 체력에 들어간다
  },
})

/**
 * 소환 — 일정 주기로 부하를 자기 뒤에 뱉는다. 방치하면 숫자에 밀린다.
 * { kind:'summon', enemyId:'mouse', count: 3, every: 5, hpMul: 0.8 }
 */
registerEnemyAbility('summon', {
  onSpawn(ctx, ab, e) { e.nextSummonAt = ctx.now + (ab.every || 5) },
  onTick(ctx, ab, e) {
    if (ctx.now < e.nextSummonAt) return
    e.nextSummonAt = ctx.now + (ab.every || 5)
    const count = ab.count || 3
    for (let i = 0; i < count; i += 1) {
      ctx.spawnMinion(ab.enemyId || 'mouse', {
        progress: Math.max(0, e.progress - 0.4 - i * 0.25),
        hpMul: ab.hpMul || 0.8,
      })
    }
    ctx.addFloater(e.x, e.y - 0.5, '소환!', '#ff9ecb')
    ctx.spawnParticle(e.x, e.y, { kind: 'summon', color: '#ff9ecb', radius: 1.2 })
    ctx.playSfx('summon')
  },
})

/**
 * 광폭화 — 체력이 임계 밑으로 떨어지면 빨라지고 단단해진다. 막판이 진짜 승부다.
 * { kind:'enrage', below: 0.4, speedMul: 1.8, armorAdd: 4 }
 */
registerEnemyAbility('enrage', {
  onTick(ctx, ab, e) {
    const ratio = e.hp / e.maxHp
    const on = ratio <= (ab.below || 0.4)
    if (on) {
      e.auraSpeed *= (ab.speedMul || 1.7)
      e.auraArmor += (ab.armorAdd || 3)
      if (!e.enraged) {
        e.enraged = true
        ctx.addFloater(e.x, e.y - 0.5, '광폭화!', '#ff5c5c')
        ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#ff5c5c', count: 18 })
        ctx.flash('#ff5c5c', 0.35)
        ctx.shake(0.5)
        ctx.playSfx('enrage')
      }
    }
  },
})

/**
 * 분열 — 죽을 때 작은 개체로 쪼개진다. 광역기가 없으면 뒷감당이 안 된다.
 * { kind:'split', enemyId:'roach', count: 6, hpMul: 0.5 }
 *
 * 분열은 한 세대에서 멈춘다. 쪼개져 나온 개체에는 noSplit 표시를 달고, 그 표시가
 * 있으면 여기서 바로 돌아간다. 이 표시가 없으면 enemyId 를 자기 자신으로 적는 순간
 * count 의 거듭제곱으로 늘어나 게임이 멈춘다 — 분열체가 분열 능력을 그대로 물려받기
 * 때문이다. 바퀴 여왕은 분열 없는 바퀴로 쪼개져서 지금까지 드러나지 않았을 뿐이다.
 */
registerEnemyAbility('split', {
  onDeath(ctx, ab, e) {
    if (e.noSplit) return
    const count = ab.count || 4
    for (let i = 0; i < count; i += 1) {
      ctx.spawnMinion(ab.enemyId || 'roach', {
        progress: Math.max(0, e.progress - 0.15 + (i - count / 2) * 0.12),
        hpMul: ab.hpMul || 0.5,
        noSplit: true,
      })
    }
    ctx.addFloater(e.x, e.y, '분열!', '#ffb35c')
    ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#ffb35c', count: 20 })
    ctx.playSfx('split')
  },
})

/**
 * 전투 함성 — 주변 아군 적에게 방어력과 속도를 나눠준다. 보스를 먼저 잡아야 하는 이유.
 * { kind:'warcry', radius: 3, armorAdd: 3, speedMul: 1.2 }
 */
registerEnemyAbility('warcry', {
  onTick(ctx, ab, e) {
    const r = ab.radius || 3
    for (const other of ctx.enemiesInRadius(e.x, e.y, r, { exclude: e })) {
      other.auraArmor += (ab.armorAdd || 3)
      other.auraSpeed *= (ab.speedMul || 1.15)
      other.buffedBy = e
    }
  },
})
