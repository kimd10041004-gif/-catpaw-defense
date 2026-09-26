/**
 * **병합된 매니페스트의 권한**을 허용 목록과 대조하고, **누가 넣었는지**까지 본다 — CI 의 안드로이드 잡이 릴리스 빌드 뒤에 돌린다.
 *
 *   node tools/check-permissions.mjs android/app/build     → 통과면 0, 목록 밖이거나 출처가 틀리면 1
 *
 * 왜 있나 (W): 사이트·개인정보처리방침·Play 데이터 안전 답은 앱의 권한과 앱이 기기 밖으로 보내는 것에 기댄다.
 * 그런데 권한은 우리 AndroidManifest.xml 만 정하는 게 아니다 — 라이브러리(androidx · Play 결제)의 매니페스트가
 * 빌드 때 합쳐진다. 그래서 **실제로 합쳐진 결과**를 본다.
 *
 * 이 그물이 처음 돈 날 한 번 걸렸다: 문서 전부가 "인터넷 권한 없음" 이라고 적고 있었는데, U-2 에서 Play 결제
 * 라이브러리를 넣은 뒤로 병합 매니페스트에는 INTERNET · ACCESS_NETWORK_STATE 가 있었다. 결제 라이브러리(6 이상)가
 * 딸고 오는 Google 로그 전송 부품(com.google.android.datatransport)이 넣는다 — 라이브러리의 작동 기록을 Google 에
 * 보내는 용도다. 그 둘은 허용하되 **출처가 그 부품일 때만** 허용한다(`from`). 게임 코드(web/)는 여전히 네트워크를
 * 안 쓰므로, 다른 라이브러리나 우리 매니페스트가 INTERNET 을 들이면 다시 빨개진다.
 *
 * 출처는 AGP 의 병합 보고서(outputs/logs/manifest-merger-release-report.txt)에서 읽는다.
 *
 * 목록을 넓혀야 하면(새 기능이 정말 권한을 요구하면) 여기 한 줄 더하고, 같은 커밋에서 개인정보처리방침 §4·§6 과
 * 제출팩의 데이터 안전 답을 고친다. 그게 이 검사가 강제하는 순서다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Play 결제 라이브러리와, 그것이 딸고 오는 Google 로그 전송 부품 */
const BILLING_STACK = /^(com\.android\.billingclient|com\.google\.android\.datatransport):/

/**
 * 허용하는 권한. 이유를 같이 적는다 — 이유를 못 적는 권한은 들이지 않는다.
 * `from` 이 있으면 병합 보고서의 출처가 전부 그 꼴이어야 한다(라이브러리 좌표 `group:artifact:version`).
 */
export const ALLOWED = [
  { name: /^android\.permission\.VIBRATE$/, why: '진동(햅틱) — WebView 의 navigator.vibrate() 가 요구한다. 일반 권한, 수집 무관' },
  { name: /^com\.android\.vending\.BILLING$/, why: 'Google Play 결제 라이브러리가 넣는다' },
  {
    name: /^com\.catpaw\.defense(\.[a-z]+)?\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION$/,
    why: 'androidx.core 가 넣는 자기 앱 전용(signature) 권한 — 동적 리시버를 밖에 안 여는 용도',
  },
  {
    name: /^android\.permission\.(INTERNET|ACCESS_NETWORK_STATE)$/,
    from: BILLING_STACK,
    why: 'Play 결제 라이브러리(6 이상)가 딸고 오는 Google 로그 전송 부품(datatransport)이 넣는다 — 라이브러리의 작동 기록'
      + '(API 성공·실패 · 연결 문제)을 Google 에 보낸다. 게임 코드는 네트워크를 안 쓴다 — 다른 출처면 빨개진다',
  },
]

/** 매니페스트 XML 에서 요청 권한 이름을 뽑는다 (uses-permission · uses-permission-sdk-23) */
export function requestedPermissions(xml) {
  const out = []
  for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*?android:name\s*=\s*"([^"]+)"/g)) out.push(m[1])
  return [...new Set(out)]
}

/** 허용 목록 밖의 권한 (이름만 본다 — 출처는 wrongSource) */
export function unexpected(perms, allowed = ALLOWED) {
  return perms.filter((p) => !allowed.some((a) => a.name.test(p)))
}

/**
 * AGP 병합 보고서에서 권한마다 출처를 뽑는다 → Map<권한, 출처[]>.
 * 출처는 라이브러리면 좌표(`com.google.android.datatransport:transport-backend-cct:3.1.8`),
 * 우리 쪽 매니페스트면 그 파일 경로다. 보고서는 이렇게 생겼다:
 *
 *   uses-permission#android.permission.INTERNET
 *   ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] /…/AndroidManifest.xml:23:5-67
 *   MERGED from [com.android.billingclient:billing:9.1.0] /…/AndroidManifest.xml:12:5-67
 *   	android:name
 *   		ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] /…/AndroidManifest.xml:23:22-64
 *   uses-permission#android.permission.VIBRATE
 *   ADDED from /…/app/src/main/AndroidManifest.xml:14:5-66
 */
export function permissionSources(report) {
  const map = new Map()
  let cur = null
  for (const line of report.split(/\r?\n/)) {
    // 경로 뒤의 위치(:14:5-66 · 여러 줄이면 :2:1-33:12)는 떼어 낸다
    const src = line.match(/^\s*(?:ADDED|MERGED|IMPLIED) from (?:\[([^\]]+)\]|(\S+?)(?::[\d:-]+)?(?=\s|$))/)
    if (src) {
      if (cur) map.get(cur).add(src[1] ?? src[2])
      continue
    }
    if (/^\S/.test(line)) {
      // 들여쓰기 없는 줄은 새 요소다(uses-permission#… · activity#… · application …)
      const key = line.match(/^uses-permission(?:-sdk-23)?#(\S+)/)
      cur = key ? key[1] : null
      if (cur && !map.has(cur)) map.set(cur, new Set())
    }
  }
  return new Map([...map].map(([k, v]) => [k, [...v]]))
}

/**
 * `from` 규칙을 어긴 권한 → [{ perm, sources }]. 출처를 못 읽은 것(보고서에 없음)도 어긴 것으로 친다 —
 * 못 읽었는데 통과시키면 이 검사는 조용히 아무것도 안 보는 검사가 된다.
 */
export function wrongSource(perms, sources, allowed = ALLOWED) {
  const out = []
  for (const perm of perms) {
    const rule = allowed.find((a) => a.name.test(perm))
    if (!rule?.from) continue
    const s = sources.get(perm) ?? []
    if (!s.length || !s.every((x) => rule.from.test(x))) out.push({ perm, sources: s })
  }
  return out
}

/** 빌드 디렉터리를 훑어 조건에 맞는 파일 경로를 모은다 */
function walkFiles(buildDir, keep) {
  const found = []
  const walk = (dir, depth) => {
    if (depth > 8) return
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      const p = join(dir, name)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) walk(p, depth + 1)
      else if (keep(name, p)) found.push(p)
    }
  }
  walk(buildDir, 0)
  return found
}

/**
 * 빌드 디렉터리에서 **릴리스 병합 매니페스트**를 찾는다. AGP 버전마다 경로가 조금씩 달라
 * (merged_manifest/release/… · merged_manifests/release/processReleaseManifest/…) 이름으로 찾는다.
 */
export function findMergedManifests(buildDir) {
  return walkFiles(buildDir, (name, p) =>
    name === 'AndroidManifest.xml' && /merged_manifests?[\\/]/.test(p) && /[\\/]release[\\/]/i.test(p))
}

/** 릴리스 병합 보고서 (보통 outputs/logs/manifest-merger-release-report.txt) */
export function findMergerReports(buildDir) {
  return walkFiles(buildDir, (name) => name === 'manifest-merger-release-report.txt')
}

/** 출처를 사람이 읽게 줄인다 — 좌표는 그대로, 경로는 저장소 기준 상대 경로 */
const shortSource = (s) => (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s) ? relative(process.cwd(), s) : s)

if (import.meta.url === `file://${process.argv[1]}`) {
  const buildDir = process.argv[2] || 'android/app/build'
  const files = findMergedManifests(buildDir)
  if (!files.length) {
    // 못 찾았는데 통과시키면 이 검사는 조용히 아무것도 안 보는 검사가 된다 — 크게 실패한다
    console.error(`✗ ${buildDir} 에서 릴리스 병합 매니페스트를 못 찾았다 — 릴리스 빌드(bundleRelease/assembleRelease) 뒤에 돌린다`)
    process.exit(1)
  }
  const reports = findMergerReports(buildDir)
  const reportText = reports.map((f) => readFileSync(f, 'utf8')).join('\n')
  const sources = permissionSources(reportText)
  if (!reports.length) console.error(`✗ ${buildDir} 에서 병합 보고서(manifest-merger-release-report.txt)를 못 찾았다 — 출처를 확인할 수 없다`)

  let bad = reports.length ? 0 : 1
  for (const f of files) {
    const perms = requestedPermissions(readFileSync(f, 'utf8'))
    console.log(`${relative(process.cwd(), f)} — 권한 ${perms.length}개`)
    for (const p of perms) console.log(`  · ${p}  ←  ${(sources.get(p) ?? ['(출처 못 읽음)']).map(shortSource).join(' · ')}`)
    const extra = unexpected(perms)
    if (extra.length) {
      bad += extra.length
      console.error(`  ✗ 허용 목록 밖: ${extra.join(' · ')}`)
    }
    for (const w of wrongSource(perms, sources)) {
      bad += 1
      console.error(`  ✗ ${w.perm} 의 출처가 허용된 곳(Play 결제 라이브러리 · 그 로그 전송 부품)이 아니다: ${w.sources.map(shortSource).join(' · ') || '보고서에 없음'}`)
      // 보고서 형식이 바뀌어 못 읽은 것이면 원문을 봐야 고칠 수 있다
      const at = reportText.indexOf(`uses-permission#${w.perm}`)
      if (at >= 0) console.error(reportText.slice(at, at + 600).split('\n').slice(0, 6).map((l) => `      | ${l}`).join('\n'))
    }
  }
  if (bad) {
    console.error('\n권한이 허용 목록 밖이거나 엉뚱한 곳에서 왔다. 정말 필요하면 tools/check-permissions.mjs 의 ALLOWED 에 이유와 함께 더하고,')
    console.error('같은 커밋에서 docs/개인정보처리방침.md §4·§6 · docs/플레이콘솔-제출팩.md 의 데이터 안전 답 · site/index.html 을 고친다.')
    process.exit(1)
  }
  console.log('\n✓ 권한이 허용 목록 안이고, INTERNET 은 Play 결제 라이브러리 쪽에서만 온다 — 게임 코드는 네트워크를 안 쓴다')
}
