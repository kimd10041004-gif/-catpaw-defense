/**
 * **병합된 매니페스트의 권한**을 허용 목록과 대조한다 — CI 의 안드로이드 잡이 릴리스 빌드 뒤에 돌린다.
 *
 *   node tools/check-permissions.mjs android/app/build     → 통과면 0, 목록 밖 권한이 있으면 1
 *
 * 왜 있나 (W): 사이트·개인정보처리방침·Play 데이터 안전 답이 전부 **"인터넷 권한이 없다 · 아무것도 수집하지 않는다"**
 * 에 기대고 있다. 그런데 권한은 우리 AndroidManifest.xml 만 정하는 게 아니다 — 라이브러리(androidx · Play 결제)의
 * 매니페스트가 빌드 때 합쳐진다. 의존성 하나를 올렸더니 INTERNET 이나 광고 ID(AD_ID)가 끼어들어도 아무도 모르고,
 * 그 순간 위의 문장들과 Play 에 낸 답이 거짓이 된다. 그래서 **실제로 합쳐진 결과**를 본다.
 *
 * 목록을 넓혀야 하면(새 기능이 정말 권한을 요구하면) 여기 한 줄 더하고, 같은 커밋에서 개인정보처리방침 §6 과
 * 제출팩의 데이터 안전 답을 고친다. 그게 이 검사가 강제하는 순서다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 허용하는 권한. 이유를 같이 적는다 — 이유를 못 적는 권한은 들이지 않는다 */
export const ALLOWED = [
  { name: /^android\.permission\.VIBRATE$/, why: '진동(햅틱) — WebView 의 navigator.vibrate() 가 요구한다. 일반 권한, 수집 무관' },
  { name: /^com\.android\.vending\.BILLING$/, why: 'Google Play 결제 라이브러리가 넣는다' },
  {
    name: /^com\.catpaw\.defense(\.[a-z]+)?\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION$/,
    why: 'androidx.core 가 넣는 자기 앱 전용(signature) 권한 — 동적 리시버를 밖에 안 여는 용도',
  },
]

/** 매니페스트 XML 에서 요청 권한 이름을 뽑는다 (uses-permission · uses-permission-sdk-23) */
export function requestedPermissions(xml) {
  const out = []
  for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*?android:name\s*=\s*"([^"]+)"/g)) out.push(m[1])
  return [...new Set(out)]
}

/** 허용 목록 밖의 권한 */
export function unexpected(perms, allowed = ALLOWED) {
  return perms.filter((p) => !allowed.some((a) => a.name.test(p)))
}

/**
 * 빌드 디렉터리에서 **릴리스 병합 매니페스트**를 찾는다. AGP 버전마다 경로가 조금씩 달라
 * (merged_manifest/release/… · merged_manifests/release/processReleaseManifest/…) 이름으로 찾는다.
 */
export function findMergedManifests(buildDir) {
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
      else if (name === 'AndroidManifest.xml' && /merged_manifests?[\\/]/.test(p) && /[\\/]release[\\/]/i.test(p)) found.push(p)
    }
  }
  walk(buildDir, 0)
  return found
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const buildDir = process.argv[2] || 'android/app/build'
  const files = findMergedManifests(buildDir)
  if (!files.length) {
    // 못 찾았는데 통과시키면 이 검사는 조용히 아무것도 안 보는 검사가 된다 — 크게 실패한다
    console.error(`✗ ${buildDir} 에서 릴리스 병합 매니페스트를 못 찾았다 — 릴리스 빌드(bundleRelease/assembleRelease) 뒤에 돌린다`)
    process.exit(1)
  }
  let bad = 0
  for (const f of files) {
    const perms = requestedPermissions(readFileSync(f, 'utf8'))
    const extra = unexpected(perms)
    console.log(`${relative(process.cwd(), f)}\n  권한 ${perms.length}개: ${perms.join(' · ') || '없음'}`)
    if (extra.length) {
      bad += extra.length
      console.error(`  ✗ 허용 목록 밖: ${extra.join(' · ')}`)
    }
  }
  if (bad) {
    console.error('\n허용 목록 밖의 권한이 합쳐졌다. 정말 필요하면 tools/check-permissions.mjs 의 ALLOWED 에 이유와 함께 더하고,')
    console.error('같은 커밋에서 docs/개인정보처리방침.md §6 · docs/플레이콘솔-제출팩.md 의 데이터 안전 답 · site/index.html 을 고친다.')
    process.exit(1)
  }
  console.log('\n✓ 권한이 허용 목록 안이다 — "인터넷 권한 없음 · 수집 없음" 이 여전히 사실이다')
}
