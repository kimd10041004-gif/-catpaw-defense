/**
 * 플레이어 필살기 — 손가락으로 직접 터뜨리는 광역기.
 *
 * ── 속성을 왜 셋 중 둘에만 주나 (O) ────────────────────────────────────────
 *
 * 여섯 중 **피해를 주는 것은 셋뿐**이다 — 츄르 폭격 · 우유 홍수 · 헤어볼. 나머지 셋(자장가 둔화 ·
 * 황금 발바닥 버프 · 하악질 장갑 벗기기)에는 곱할 피해가 없다. 상성은 정의상 피해 배수이므로
 * 지속시간에는 안 곱한다.
 *
 * 그 셋 중 **둘에만** 속성을 줬다: 우유 홍수 = 얼음(미끄러뜨린다) · 헤어볼 = 어둠(뭉친 덩어리).
 * **츄르 폭격은 일부러 무속성으로 남겼다.** 넷을 드는 로드아웃에서 넷이 다 속성이면 고르는 일이
 * "이번 사다리 색 맞추기" 한 줄로 줄어든다. 하나를 무속성으로 두면 *맞춰서 크게* 와
 * *어느 색이든 안 흔들리게* 가 서로 다른 선택이 된다. 하늘에서 쏟아지는 음식에 맞는 원소가
 * 없다는 것도 같은 방향이다.
 *
 * 속성은 `registerSpecial` 의 **선택 필드**다. 엔진은 `useSpecial` 이 시전마다 세우는
 * `_specialElement` 를 `_specialCtx` 의 `applyDamage` 가 넘기는 것이 전부고, `run()` 은 속성을 모른다
 * (연계 배수·성장 배수와 같은 원칙 — 여기 여섯의 `run()` 은 그 셋 중 무엇도 안 읽는다).
 *
 * ▶ 새 필살기를 추가하려면: registerSpecial 블록 하나를 복사해 run()만 새로 쓰면 된다.
 *   HUD의 버튼과 쿨다운 링, 캣닢 즉시 충전 버튼이 전부 자동으로 따라온다.
 *
 *   ctx = {
 *     game, now, waveNo, enemies, towers, mapDef, path,
 *     applyDamage(enemy, amount), addSlow(enemy, factor, sec),
 *     buffTowers(fireRateMul, seconds), sunder(enemy, armorOff, sec),
 *     spawnParticle(x, y, opts), addFloater(x, y, text, color),
 *     flash(color, strength), shake(amount), hitStop(seconds), playSfx(name),
 *   }
 *
 * ▶ 로드아웃과 성장(L-4): 사람은 도감에서 넷을 골라 들고 들어간다(`domain/specialGrowth.js`, 기본은 order 앞 넷).
 *   세기 트리는 위 ctx 의 피해·지속시간 래퍼에, 쿨다운 트리는 `def.cooldown` 에 game.js 가 곱한다 —
 *   그래서 여기 숫자는 **단계 0 의 값**이고, 안내 줄(addFloater)에 적는 숫자도 단계 0 의 값이다(연계 배수와 같은 규칙).
 *   order 5·6 은 기본 로드아웃 밖이라 시뮬레이터·밸런스 검사의 봇은 안 쓴다.
 */

import { registerSpecial } from './registry.js'
import { tr } from '../i18n/index.js'

/** 웨이브가 올라갈수록 필살기 위력도 같이 오른다 (후반에 장식이 되지 않도록) */
const scale = (base, perWave, waveNo) => Math.round(base + perWave * waveNo)

registerSpecial({
  id: 'churu',
  name: '츄르 폭격', // i18n-key
  order: 1,
  icon: 'svg:churu',
  desc: '하늘에서 츄르가 쏟아진다. 화면의 모든 적에게 큰 피해.', // i18n-key
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
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('츄르 폭격  {dmg} 피해', { dmg: dmg }), '#ffd166')
    ctx.playSfx('churu')
    return { hits: targets.length, damage: dmg }
  },
})

registerSpecial({
  id: 'nap',
  name: '자장가', // i18n-key
  order: 2,
  icon: 'svg:sleep',
  desc: '고양이가 골골거리면 모든 적이 나른해진다. 강력한 둔화.', // i18n-key
  cooldown: 18,
  mana: 35,
  catnip: 15,
  run(ctx) {
    for (const e of ctx.enemies) {
      ctx.addSlow(e, 0.75, 5)
      ctx.spawnParticle(e.x, e.y, { kind: 'frost', color: '#8fd4ff' })
    }
    ctx.flash('#8fd4ff', 0.5)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('자장가  5초 둔화'), '#8fd4ff')
    ctx.playSfx('nap')
    return { hits: ctx.enemies.length }
  },
})

registerSpecial({
  id: 'milk',
  name: '우유 홍수', // i18n-key
  order: 3,
  icon: 'svg:milk',
  desc: '길 전체가 우유로 잠긴다. 지상의 적을 쓸어버리고 미끄러뜨린다.', // i18n-key
  element: 'ice',     // 미끄러뜨린다 = 얼음 (머리말의 '속성을 왜 셋 중 둘에만 주나' 참고)
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
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('우유 홍수  지상 {hits}마리', { hits: hits }), '#eef4ff')
    ctx.playSfx('milk')
    return { hits, damage: dmg }
  },
})

registerSpecial({
  id: 'goldenpaw',
  name: '황금 발바닥', // i18n-key
  order: 4,
  icon: 'svg:sparkle',
  desc: '모든 고양이가 각성한다. 10초 동안 공격 속도 2.2배.', // i18n-key
  cooldown: 25,
  mana: 45,
  catnip: 25,
  run(ctx) {
    ctx.buffTowers(2.2, 10)
    for (const t of ctx.towers) {
      ctx.spawnParticle(t.x, t.y, { kind: 'burst', color: '#ffd166', count: 12 })
    }
    ctx.flash('#ffd166', 0.6)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('황금 발바닥  10초 각성'), '#ffd166')
    ctx.playSfx('goldenpaw')
    return { towers: ctx.towers.length }
  },
})

/* ── 기본 로드아웃 밖의 둘 (order 5·6) ─────────────────────────────────────────
 *
 * 위 넷은 전부 **광역**이고 장갑을 정면으로 맞는다. 그래서 중장갑 앞에서 약하고 보스에 쓸 것이 없다 —
 * 그 두 구멍에 하나씩 놓는다. 둘 다 화면 전체형(조준 없음) — 위치를 찍는 배관이 없어서다. */

/** 하악질: 화면의 모든 적 장갑 −4 (6초). 벗기기의 상한도 4 라 먼치킨의 3 위에 겹쳐도 4 다. */
const HISS_ARMOR = 4
const HISS_SEC = 6

registerSpecial({
  id: 'hiss',
  name: '하악질', // i18n-key
  order: 5,
  icon: 'svg:hiss',
  desc: '고양이들이 일제히 하악질한다. 화면의 모든 적 장갑 −4, 6초.', // i18n-key
  cooldown: 20,
  mana: 40,
  catnip: 15,
  run(ctx) {
    let hits = 0
    for (const e of ctx.enemies) {
      ctx.sunder(e, HISS_ARMOR, HISS_SEC)
      ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#c9a7ff', count: 6 })
      hits += 1
    }
    ctx.flash('#c9a7ff', 0.45)
    ctx.shake(0.35)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('하악질  장갑 −{n} · {sec}초', { n: HISS_ARMOR, sec: HISS_SEC }), '#c9a7ff')
    ctx.playSfx('nap')
    return { hits, armorOff: HISS_ARMOR }
  },
})

registerSpecial({
  id: 'hairball',
  name: '헤어볼', // i18n-key
  order: 6,
  icon: 'svg:hairball',
  desc: '체력이 가장 높은 적 하나에게 거대한 헤어볼을 뱉는다. 보스 잡는 한 방.', // i18n-key
  element: 'dark',    // 뭉친 덩어리. 고리에서 얼음과 두 칸 떨어져 우유와 다른 반쪽을 덮는다
  cooldown: 24,
  mana: 55,
  catnip: 20,
  run(ctx) {
    const dmg = scale(300, 60, ctx.waveNo)
    let target = null
    for (const e of ctx.enemies) if (!target || e.hp > target.hp) target = e
    if (!target) {
      // 빈 화면에 뱉으면 마나만 날린다 — 츄르 폭격이 빈 화면에 떨어질 때와 같은 규칙이다(적이 없는데 눌렀는지는 사람이 본다)
      ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('헤어볼  맞힐 적이 없다'), '#d9c7a6')
      return { hits: 0, damage: 0 }
    }
    ctx.spawnParticle(target.x, target.y, { kind: 'strike', color: '#d9c7a6', radius: 1.2, count: 10 })
    ctx.applyDamage(target, dmg)
    ctx.spawnParticle(target.x, target.y, { kind: 'burst', color: '#d9c7a6', count: 14 })
    ctx.flash('#d9c7a6', 0.5)
    ctx.shake(0.7)
    ctx.hitStop(0.08)
    ctx.addFloater(ctx.mapDef.cols / 2, 3, tr('헤어볼  {name} {dmg} 피해', { name: target.def.name, dmg: dmg }), '#d9c7a6')
    ctx.playSfx('churu')
    return { hits: 1, damage: dmg, target: target.def.id }
  },
})
