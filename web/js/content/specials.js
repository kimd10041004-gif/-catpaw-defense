/**
 * 플레이어 필살기 — 손가락으로 직접 터뜨리는 광역기.
 *
 * ▶ 새 필살기를 추가하려면: registerSpecial 블록 하나를 복사해 run()만 새로 쓰면 된다.
 *   HUD의 버튼과 쿨다운 링, 캣닢 즉시 충전 버튼이 전부 자동으로 따라온다.
 *
 *   ctx = {
 *     game, now, waveNo, enemies, towers, mapDef, path,
 *     applyDamage(enemy, amount), addSlow(enemy, factor, sec),
 *     buffTowers(fireRateMul, seconds),
 *     spawnParticle(x, y, opts), addFloater(x, y, text, color),
 *     flash(color, strength), shake(amount), hitStop(seconds), playSfx(name),
 *   }
 */

import { registerSpecial } from './registry.js'

/** 웨이브가 올라갈수록 필살기 위력도 같이 오른다 (후반에 장식이 되지 않도록) */
const scale = (base, perWave, waveNo) => Math.round(base + perWave * waveNo)

registerSpecial({
  id: 'churu',
  name: '츄르 폭격',
  order: 1,
  icon: 'svg:churu',
  desc: '하늘에서 츄르가 쏟아진다. 화면의 모든 적에게 큰 피해.',
  cooldown: 20,
  mana: 60,
  catnip: 20,
  run(ctx) {
    const dmg = scale(70, 24, ctx.waveNo)
    const targets = [...ctx.enemies]
    targets.forEach((e, i) => {
      // 살짝씩 시차를 두고 터지도록 파티클만 흩뿌리고 피해는 즉시 넣는다
      ctx.spawnParticle(e.x, e.y, { kind: 'strike', color: '#ffb35c', radius: 0.9, count: 6 })
      ctx.applyDamage(e, dmg)
      if (i < 12) ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#ffd166', count: 10 })
    })
    ctx.flash('#ffd166', 0.75)
    ctx.shake(0.9)
    ctx.hitStop(0.10)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, `츄르 폭격  ${dmg} 피해`, '#ffd166')
    ctx.playSfx('churu')
    return { hits: targets.length, damage: dmg }
  },
})

registerSpecial({
  id: 'nap',
  name: '자장가',
  order: 2,
  icon: 'svg:sleep',
  desc: '고양이가 골골거리면 모든 적이 나른해진다. 강력한 둔화.',
  cooldown: 18,
  mana: 35,
  catnip: 15,
  run(ctx) {
    for (const e of ctx.enemies) {
      ctx.addSlow(e, 0.75, 5)
      ctx.spawnParticle(e.x, e.y, { kind: 'frost', color: '#8fd4ff' })
    }
    ctx.flash('#8fd4ff', 0.5)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, '자장가  5초 둔화', '#8fd4ff')
    ctx.playSfx('nap')
    return { hits: ctx.enemies.length }
  },
})

registerSpecial({
  id: 'milk',
  name: '우유 홍수',
  order: 3,
  icon: 'svg:milk',
  desc: '길 전체가 우유로 잠긴다. 지상의 적을 쓸어버리고 미끄러뜨린다.',
  cooldown: 22,
  mana: 50,
  catnip: 20,
  run(ctx) {
    const dmg = scale(55, 20, ctx.waveNo)
    let hits = 0
    for (const e of ctx.enemies) {
      if (e.flying) continue          // 하늘에 있으면 우유가 닿지 않는다
      ctx.applyDamage(e, dmg)
      ctx.addSlow(e, 0.55, 3)
      ctx.spawnParticle(e.x, e.y, { kind: 'splash', color: '#eef4ff', radius: 0.8 })
      hits += 1
    }
    // 길을 따라 흐르는 연출
    for (let d = 0; d < ctx.path.lengthTiles; d += 0.8) {
      const p = ctx.pointAt(d)
      ctx.spawnParticle(p.x, p.y, { kind: 'wave', color: '#eef4ff', radius: 0.5 })
    }
    ctx.flash('#eef4ff', 0.55)
    ctx.shake(0.5)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, `우유 홍수  지상 ${hits}마리`, '#eef4ff')
    ctx.playSfx('milk')
    return { hits, damage: dmg }
  },
})

registerSpecial({
  id: 'goldenpaw',
  name: '황금 발바닥',
  order: 4,
  icon: 'svg:sparkle',
  desc: '모든 고양이가 각성한다. 10초 동안 공격 속도 2.2배.',
  cooldown: 25,
  mana: 45,
  catnip: 25,
  run(ctx) {
    ctx.buffTowers(2.2, 10)
    for (const t of ctx.towers) {
      ctx.spawnParticle(t.x, t.y, { kind: 'burst', color: '#ffd166', count: 12 })
    }
    ctx.flash('#ffd166', 0.6)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, '황금 발바닥  10초 각성', '#ffd166')
    ctx.playSfx('goldenpaw')
    return { towers: ctx.towers.length }
  },
})
