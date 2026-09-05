/**
 * 첫 판 안내 — 튜토리얼 대신, 게임 상태를 보고 딱 한 번씩 띄우는 짧은 힌트.
 *
 * game.js 상태만 읽는다 (DOM 없음). 한 번 본 힌트는 progress.hintsSeen 에 남아
 * 다시 안 뜬다. 지도 위에 무언가를 얹지 않는다 — 토스트 자리(pointer-events:none)로만
 * 나간다 (main.js 의 규칙: 지도를 덮는 안내는 아래 칸의 탭을 막는다).
 *
 * 순서가 곧 우선순위다. 같은 순간 둘이 참이면 앞의 것이 먼저 나가고, 다음 것은
 * 다음 틱(0.25초)에 나간다.
 */
export const HINTS = [
  { id: 'place', text: '길 옆 빈칸을 눌러 고양이를 놓자',
    when: (g) => g.phase === 'prep' && g.towers.length === 0 && g.time > 1.5 },
  { id: 'wave', text: '웨이브 시작을 누르면 해충이 온다',
    when: (g) => g.phase === 'prep' && g.towers.length > 0 && g.waveNo === 0 },
  { id: 'panel', text: '고양이를 누르면 업그레이드·표적을 바꿀 수 있다',
    when: (g) => g.phase === 'prep' && g.waveNo >= 1 && g.towers.length > 0 },
  // 시작 마나로도 하나는 누를 수 있다 — 하지만 적이 없는 첫 준비 단계에 알려 주면
  // 헛되이 쓴다. 첫 웨이브가 시작된 뒤에 알려 준다.
  { id: 'special', text: '밀크 마나가 찼다 — 아래 필살기를 눌러 보자',
    when: (g) => g.waveNo >= 1 && g.specialStates().some((s) => s.ready) },
  { id: 'crystal', text: '떨어진 크리스탈을 탭하면 마나가 찬다',
    when: (g) => g.crystals.length > 0 },
  { id: 'boss', text: '다음은 보스다. 체력만 많은 게 아니다',
    when: (g) => !!(g.nextWave && g.nextWave.bossCount > 0) },
  { id: 'elite', text: '왕관 쓴 적은 단단하고 값지다',
    when: (g) => g.enemies.some((e) => e.elite) },
]

/**
 * 아직 안 본 것 중 지금 조건이 맞는 첫 힌트. 없으면 null.
 * @param {object} game
 * @param {string[]} seen 이미 본 힌트 id
 */
export function nextHint(game, seen = []) {
  if (!game) return null
  for (const h of HINTS) {
    if (seen.includes(h.id)) continue
    let on = false
    try { on = !!h.when(game) } catch { on = false }   // 상태가 아직 없어도 게임을 멈추지 않는다
    if (on) return h
  }
  return null
}
