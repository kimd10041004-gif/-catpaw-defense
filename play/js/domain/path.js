/**
 * 적이 걷는 경로 계산 — 전부 "타일 좌표계"로만 다룬다.
 * 화면 크기·DPR·해상도를 전혀 모르기 때문에 순수 함수로 테스트할 수 있고,
 * 렌더러가 tileSize를 곱하기만 하면 어떤 화면에서도 같은 게임이 된다.
 *
 * 좌표 규약: 타일 (c, r)의 중심은 (c + 0.5, r + 0.5).
 * 웨이포인트는 격자 밖(예: [4, -1])을 가리켜도 된다 — 화면 밖 등장/퇴장 지점으로 쓴다.
 */

export class PathError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PathError'
  }
}

/** 타일 좌표를 Set 키로 만든다. */
export function tileKey(c, r) {
  return `${c},${r}`
}

/**
 * 맵 정의의 웨이포인트를 실제 경로로 전개한다.
 * 모든 구간은 축 정렬(수평 또는 수직)이어야 한다 — 대각선 경로는 타일 판정이 모호해지므로 금지.
 * @param {{cols:number, rows:number, waypoints:number[][]}} mapDef
 * @returns {{points:{x:number,y:number}[], cumulative:number[], tiles:{c:number,r:number}[],
 *            tileSet:Set<string>, lengthTiles:number}}
 */
export function buildPath(mapDef) {
  if (!mapDef || !Array.isArray(mapDef.waypoints)) {
    throw new PathError('맵 정의에 waypoints 배열이 없습니다')
  }
  const wps = mapDef.waypoints
  if (wps.length < 2) {
    throw new PathError(`waypoints는 2개 이상이어야 합니다: ${wps.length}개`)
  }

  const points = []
  for (const wp of wps) {
    if (!Array.isArray(wp) || wp.length !== 2 || !Number.isInteger(wp[0]) || !Number.isInteger(wp[1])) {
      throw new PathError(`웨이포인트는 [정수 col, 정수 row] 형식이어야 합니다: ${JSON.stringify(wp)}`)
    }
    points.push({ x: wp[0] + 0.5, y: wp[1] + 0.5 })
  }

  const cumulative = [0]
  const tiles = []
  const tileSet = new Set()

  /** 격자 안쪽 타일만 경로 타일로 등록한다 (화면 밖 진입 구간은 건설 판정과 무관). */
  const pushTile = (c, r) => {
    if (c < 0 || r < 0 || c >= mapDef.cols || r >= mapDef.rows) return
    const key = tileKey(c, r)
    if (tileSet.has(key)) return
    tileSet.add(key)
    tiles.push({ c, r })
  }

  for (let i = 0; i < wps.length - 1; i += 1) {
    const [c0, r0] = wps[i]
    const [c1, r1] = wps[i + 1]
    const dc = c1 - c0
    const dr = r1 - r0
    if (dc !== 0 && dr !== 0) {
      throw new PathError(
        `구간 ${i}이(가) 축 정렬이 아닙니다 (대각선 금지): [${c0},${r0}] → [${c1},${r1}]`,
      )
    }
    if (dc === 0 && dr === 0) {
      throw new PathError(`구간 ${i}의 웨이포인트가 서로 같습니다: [${c0},${r0}]`)
    }

    const steps = Math.abs(dc) + Math.abs(dr)
    const sc = Math.sign(dc)
    const sr = Math.sign(dr)
    for (let s = 0; s <= steps; s += 1) pushTile(c0 + sc * s, r0 + sr * s)

    cumulative.push(cumulative[i] + steps)
  }

  return { points, cumulative, tiles, tileSet, lengthTiles: cumulative[cumulative.length - 1] }
}

/**
 * 경로 시작점에서 dist(타일 단위)만큼 진행한 지점과 진행 방향.
 * 범위를 벗어나면 양 끝으로 고정한다.
 * @returns {{x:number, y:number, angle:number}} angle은 라디안 (스프라이트가 바라보는 방향)
 */
export function pointAtDistance(path, dist) {
  const { points, cumulative, lengthTiles } = path
  const d = Math.min(lengthTiles, Math.max(0, dist))

  let seg = 0
  while (seg < cumulative.length - 2 && cumulative[seg + 1] <= d) seg += 1

  const a = points[seg]
  const b = points[seg + 1]
  const segLen = cumulative[seg + 1] - cumulative[seg]
  const t = segLen === 0 ? 0 : (d - cumulative[seg]) / segLen

  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  }
}

/**
 * (c, r) 타일에 타워를 지을 수 있는지.
 * 격자 안이고, 경로 타일이 아니고, 맵이 막아둔 장식 타일도 아니어야 한다.
 */
export function isBuildable(mapDef, path, c, r) {
  if (!Number.isInteger(c) || !Number.isInteger(r)) return false
  if (c < 0 || r < 0 || c >= mapDef.cols || r >= mapDef.rows) return false
  if (path.tileSet.has(tileKey(c, r))) return false
  if (Array.isArray(mapDef.blocked)) {
    for (const b of mapDef.blocked) {
      if (b[0] === c && b[1] === r) return false
    }
  }
  return true
}

/** 격자 안에서 타워를 지을 수 있는 타일의 총 개수 (맵 난이도 감각을 잡을 때 쓴다). */
export function buildableCount(mapDef, path) {
  let n = 0
  for (let r = 0; r < mapDef.rows; r += 1) {
    for (let c = 0; c < mapDef.cols; c += 1) {
      if (isBuildable(mapDef, path, c, r)) n += 1
    }
  }
  return n
}

/**
 * (x, y) 실수 타일 좌표에서 가장 가까운 '지을 수 있는' 칸을 찾는다.
 *
 * 왜 필요한가: 폰에서 한 칸은 35px 남짓인데 손가락 접촉면은 그보다 넓다.
 * 정확히 누른 칸만 인정하면 조금만 빗나가도 "여기엔 지을 수 없습니다"가 뜨거나
 * 엉뚱한 칸에 지어진다. 빗나갔을 때 주변에서 대신 찾아주면 그 답답함이 사라진다.
 *
 * @param {object} mapDef
 * @param {object} path buildPath 결과
 * @param {number} x 실수 타일 좌표
 * @param {number} y 실수 타일 좌표
 * @param {{radius?:number, isFree?:(c:number, r:number)=>boolean}} [opts]
 *        radius — 이 거리(타일) 안에서만 찾는다. 너무 크면 엉뚱한 곳에 지어진다.
 *        isFree — 이미 타워가 있는 칸을 걸러내는 판정 (게임 쪽에서 주입한다)
 * @returns {{c:number, r:number, distance:number}|null} 없으면 null
 */
export function nearestBuildable(mapDef, path, x, y, opts = {}) {
  // 기본 반경은 손가락 오차(대략 0.3~0.5칸)만 덮을 만큼만 준다.
  // 더 키우면 경로 한가운데를 일부러 눌러도 옆 칸에 지어져 버린다 —
  // 떼는 순간 배치 + 미리보기가 있으므로 과한 보정은 오히려 해롭다.
  const radius = opts.radius === undefined ? 0.65 : opts.radius
  const isFree = opts.isFree || (() => true)

  const minC = Math.floor(x - radius)
  const maxC = Math.ceil(x + radius)
  const minR = Math.floor(y - radius)
  const maxR = Math.ceil(y + radius)

  let best = null
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (!isBuildable(mapDef, path, c, r)) continue
      if (!isFree(c, r)) continue
      // 칸 중심까지의 거리로 비교한다
      const dx = (c + 0.5) - x
      const dy = (r + 0.5) - y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > radius) continue
      if (best === null || distance < best.distance) best = { c, r, distance }
    }
  }
  return best
}
