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

import { registerEnemyAbility, getEnemy } from './registry.js'
import { tr } from '../i18n/index.js'

/** 0.022 → 2.2 */
const pct = (v) => Math.round(v * 1000) / 10
const nameOf = (id) => (getEnemy(id) || { name: id }).name

/**
 * 재생 — 초당 최대 체력의 일정 비율을 회복한다. 화력이 모자라면 영영 못 잡는다.
 * { kind:'regen', percentPerSec: 0.02 }
 */
registerEnemyAbility('regen', {
  name: '재생', // i18n-key
  describe: (ab) => tr('초당 최대 체력의 {v}% 회복', { v: pct(ab.percentPerSec || 0.02) }),
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
  name: '보호막', // i18n-key
  describe: (ab) => tr('최대 체력의 {v}%를 대신 받는다 · {v2}초 동안 안 맞으면 재생', { v: pct(ab.amount || 0.3), v2: ab.rechargeAfter || 6 }),
  onSpawn(ctx, ab, e) {
    e.shieldMax = e.maxHp * (ab.amount || 0.3)
    e.shield = e.shieldMax
    e.lastHitAt = -999
  },
  onTick(ctx, ab, e) {
    const after = ab.rechargeAfter || 6
    if (e.shield <= 0 && ctx.now - e.lastHitAt > after) {
      e.shield = e.shieldMax
      ctx.addFloater(e.x, e.y - 0.4, tr('보호막 재생'), '#8fd4ff')
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
      ctx.addFloater(e.x, e.y - 0.4, tr('보호막 파괴!'), '#ff7a7a')
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
  name: '소환', // i18n-key
  describe: (ab) => tr('{v}초마다 {v2} {v3}마리', { v: ab.every || 5, v2: nameOf(ab.enemyId || 'mouse'), v3: ab.count || 3 }),
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
    ctx.addFloater(e.x, e.y - 0.5, tr('소환!'), '#ff9ecb')
    ctx.spawnParticle(e.x, e.y, { kind: 'summon', color: '#ff9ecb', radius: 1.2 })
    ctx.playSfx('summon')
  },
})

/**
 * 광폭화 — 체력이 임계 밑으로 떨어지면 빨라지고 단단해진다. 막판이 진짜 승부다.
 * { kind:'enrage', below: 0.4, speedMul: 1.8, armorAdd: 4 }
 */
registerEnemyAbility('enrage', {
  name: '광폭화', // i18n-key
  describe: (ab) => tr('체력 {v}% 아래에서 속도 ×{v2} · 방어 +{v3}', { v: pct(ab.below || 0.4), v2: ab.speedMul || 1.7, v3: ab.armorAdd || 3 }),
  onTick(ctx, ab, e) {
    const ratio = e.hp / e.maxHp
    const on = ratio <= (ab.below || 0.4)
    if (on) {
      e.auraSpeed *= (ab.speedMul || 1.7)
      e.auraArmor += (ab.armorAdd || 3)
      if (!e.enraged) {
        e.enraged = true
        ctx.addFloater(e.x, e.y - 0.5, tr('광폭화!'), '#ff5c5c')
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
  name: '분열', // i18n-key
  describe: (ab) => tr('죽으면 {v} {v2}마리로', { v: nameOf(ab.enemyId || 'roach'), v2: ab.count || 4 }),
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
    ctx.addFloater(e.x, e.y, tr('분열!'), '#ffb35c')
    ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#ffb35c', count: 20 })
    ctx.playSfx('split')
  },
})

/**
 * 전투 함성 — 주변 아군 적에게 방어력과 속도를 나눠준다. 보스를 먼저 잡아야 하는 이유.
 * { kind:'warcry', radius: 3, armorAdd: 3, speedMul: 1.2 }
 */
registerEnemyAbility('warcry', {
  name: '전투 함성', // i18n-key
  describe: (ab) => tr('주변 {v}칸 아군 방어 +{v2} · 속도 ×{v3}', { v: ab.radius || 3, v2: ab.armorAdd || 3, v3: ab.speedMul || 1.15 }),
  onTick(ctx, ab, e) {
    const r = ab.radius || 3
    for (const other of ctx.enemiesInRadius(e.x, e.y, r, { exclude: e })) {
      other.auraArmor += (ab.armorAdd || 3)
      other.auraSpeed *= (ab.speedMul || 1.15)
      other.buffedBy = e
    }
  },
})

/**
 * 보살핌 — 주변 아군 적을 조금씩 회복시킨다. **자기 자신은 안 고친다.**
 * { kind:'mend', radius: 2.2, heal: 6, every: 1.5, bossFactor: 0.5 }
 *
 * regen 과 다른 점이 둘이다.
 *
 * 1) 회복량이 **대상의 최대 체력이 아니라 고정값**이다. 비율로 주면 마왕 쥐(체력 9000)를
 *    무한정 살려 아예 못 잡는 적이 된다.
 * 2) 그래도 보스에게는 절반만 걸린다. 잡몹 여럿을 살리는 건 성가신 정도로 끝나지만
 *    보스 하나를 살리는 건 판을 뒤집는다.
 *
 * 이 능력의 값은 "지원부터 잡아라"라는 새 판단을 만드는 데 있다. 게임에 이미 타워별
 * 조준 모드가 있으므로 그걸 쓰라는 압력이 된다.
 */
registerEnemyAbility('mend', {
  name: '보살핌', // i18n-key
  describe: (ab) => tr('{v}초마다 주변 {v2}칸 아군 +{v3} (보스는 절반)', { v: ab.every || 1.5, v2: ab.radius || 2.2, v3: ab.heal || 6 }),
  onTick(ctx, ab, e, dt) {
    if (e.hp <= 0) return
    const every = ab.every || 1.5
    e.mendAt = (e.mendAt || 0) + dt
    if (e.mendAt < every) return
    e.mendAt = 0

    const base = ab.heal || 6
    const bossFactor = ab.bossFactor === undefined ? 0.5 : ab.bossFactor
    let healed = 0
    for (const other of ctx.enemiesInRadius(e.x, e.y, ab.radius || 2.2, { exclude: e })) {
      if (other.hp >= other.maxHp) continue
      const amount = base * (other.def.boss ? bossFactor : 1)
      other.hp = Math.min(other.maxHp, other.hp + amount)
      ctx.spawnParticle(other.x, other.y, { kind: 'heal', color: '#7fe08a' })
      healed += 1
    }
    if (healed > 0) ctx.spawnParticle(e.x, e.y, { kind: 'shieldup', color: '#7fe08a', radius: ab.radius || 2.2 })
  },
})

/* ── J-5: 빈 세 속성(번개·얼음·빛)의 보스가 들고 나오는 능력 ────────────────────
 *
 * 왜 새로 만드나: 보스 다섯을 재 보니 흙 2 · 어둠 2 · 불 1 이었다. 번개·얼음·빛 보스가
 * 하나도 없어서, 고양이 열다섯 중 여덟(흙·번개·어둠)이 **강하게 나갈 보스가 없었다.**
 * 속성으로 덱을 고르는 자리가 보스전인데 그 자리가 비어 있었다.
 *
 * 기존 일곱(regen·shield·summon·enrage·split·warcry·mend)을 다시 섞지 않는다 —
 * 카드 고양이 때와 같은 규칙이다. 셋 다 **새 축**이고, 그 답이 카드 고양이여야 한다.
 */

/**
 * 순간이동 — 주기적으로 길을 앞으로 건너뛴다.
 *
 * 새 축: **입구 한 곳에 화력을 쌓는 전략을 깬다.** 지금까지 모든 적은 길을 순서대로
 * 지났으므로 좁은 목 하나만 두껍게 만들면 됐다. 이 보스는 그 목을 넘어가 버리므로
 * 화력을 길 전체에 퍼뜨려야 한다.
 *
 * 엔진 수정이 필요 없다: 경로 진행이 스칼라 하나라서 game.knockback 의 부호만 반대다.
 * 끝을 넘으면 game 이 알아서 _leak 으로 처리한다(progress >= len).
 *
 * { kind:'blink', every: 4, tiles: 1.6, below: 1 }
 *   below — 체력이 이 비율 아래일 때만 (1 이면 언제나)
 */
registerEnemyAbility('blink', {
  name: '순간이동', // i18n-key
  describe: (ab) => tr('{v}초마다 길을 {v2}칸 건너뛴다', { v: ab.every || 4, v2: ab.tiles || 1.6 }),
  onTick(ctx, ab, e, dt) {
    const below = ab.below === undefined ? 1 : ab.below
    if (e.hp / e.maxHp > below) return
    const every = ab.every || 4
    e.blinkAt = (e.blinkAt || 0) + dt
    if (e.blinkAt < every) return
    e.blinkAt = 0
    e.progress += (ab.tiles || 1.6)
    ctx.spawnParticle(e.x, e.y, { kind: 'burst', color: '#8fd4ff', count: 16 })
    ctx.playSfx('zap')
  },
})

/**
 * 굳기 — 맞을수록 장갑이 오른다. 시간이 지나면 도로 풀린다.
 *
 * 새 축: **먼치킨냥 sunder 의 정확한 거울이다.** 장갑이 뺄셈이라 잔펀치는 두꺼운 적 앞에서
 * 0 이 되는 것이 이 게임의 구조인데, 이 보스는 잔펀치를 맞을수록 그 벽을 스스로 올린다.
 * 답은 **한 방**이다 — 앙고라냥(truestrike, 장갑 통과)과 메인쿤냥(한 방 185).
 *
 * 스탯 보정 규약을 지킨다: 쌓은 값은 제 필드(hardenStack)에 두고, auraArmor 에는
 * 매 틱 더하기만 한다. auraArmor 는 스텝마다 0 으로 초기화되므로 직접 쌓으면 사라진다.
 *
 * { kind:'harden', perHit: 1.5, max: 12, decay: 2.5 }
 *   decay — 마지막으로 맞은 뒤 이 시간이 지나면 전부 풀린다
 */
registerEnemyAbility('harden', {
  name: '굳기', // i18n-key
  describe: (ab) => tr('맞을 때마다 방어 +{v} (최대 {v2} · {v3}초 뒤 풀림)', {
    v: ab.perHit || 1.5, v2: ab.max || 12, v3: ab.decay || 2.5,
  }),
  onTick(ctx, ab, e) {
    if (!e.hardenStack) return
    // 마지막 피격에서 decay 가 지나면 전부 푼다 — 조금씩 깎지 않는다.
    // 조금씩 깎으면 "쉬었다 때리기"가 최적이 되어 판이 지루해진다.
    if (ctx.now > (e.hardenUntil || 0)) { e.hardenStack = 0; return }
    e.auraArmor += e.hardenStack
  },
  onDamaged(ctx, ab, e) {
    const cur = ctx.now > (e.hardenUntil || 0) ? 0 : (e.hardenStack || 0)
    e.hardenStack = Math.min(ab.max || 12, cur + (ab.perHit || 1.5))
    e.hardenUntil = ctx.now + (ab.decay || 2.5)
    // 숫자를 반환하지 않는다 — 이 훅은 피해를 바꾸지 않고 세기만 한다(보호막과 다르다)
  },
})

/**
 * 눈부심 — 가까운 타워의 사거리를 잠깐 줄인다.
 *
 * 새 축: **처음으로 플레이어 쪽 판을 건드리는 능력이다.** 지금까지 적 능력은 전부
 * 적 자신이나 아군 적만 만졌다. 답은 노르웨이숲냥(sightaura, 옆 고양이 사거리 +)이다.
 *
 * 불공평해지지 않게 못을 박았다:
 *   · 보스 전용 (일반 해충에는 안 붙인다)
 *   · 사거리 하한 — 원래의 DAZZLE_FLOOR(60%) 밑으로 절대 안 내려간다
 *   · 짧게 걸리고 저절로 풀린다 (지속 시간이 지나면 game.rangeOf 가 원래 값을 돌려준다)
 *   · 화면에 보인다 — 사거리 고리 색이 바뀐다
 *
 * 이것만 엔진을 건드린다: ctx 에 towersInRadius 가 없어서 game.js 에 더했다.
 * 타워의 mods 에는 쓰지 않는다 — mods 는 배치·판매 때만 다시 계산되므로 일시 효과를
 * 넣으면 다음 재계산까지 남거나 지워진다. 적 쪽 markUntil 과 같은 결로 따로 필드를 둔다.
 *
 * { kind:'dazzle', radius: 3.2, mul: 0.7, duration: 2.5, every: 5 }
 */
registerEnemyAbility('dazzle', {
  name: '눈부심', // i18n-key
  describe: (ab) => tr('{v}초마다 주변 {v2}칸 고양이 사거리 ×{v3} ({v4}초)', {
    v: ab.every || 5, v2: ab.radius || 3.2, v3: ab.mul || 0.7, v4: ab.duration || 2.5,
  }),
  onTick(ctx, ab, e, dt) {
    if (!ctx.towersInRadius) return          // 오래된 엔진에서도 조용히 넘어간다
    const every = ab.every || 5
    e.dazzleAt = (e.dazzleAt || 0) + dt
    if (e.dazzleAt < every) return
    e.dazzleAt = 0

    const hit = ctx.towersInRadius(e.x, e.y, ab.radius || 3.2)
    if (hit.length === 0) return
    for (const t of hit) ctx.dazzle(t, ab.mul || 0.7, ab.duration || 2.5)
    ctx.spawnParticle(e.x, e.y, { kind: 'shieldup', color: '#ffe08a', radius: ab.radius || 3.2 })
    ctx.playSfx('zap')
  },
})
