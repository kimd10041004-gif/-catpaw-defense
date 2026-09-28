/**
 * `tools/check-permissions.mjs` — CI 가 병합 매니페스트의 권한을 허용 목록과 대조하고 출처까지 본다(W).
 * 여기서는 안드로이드 빌드 없이 로직만 본다: 뽑기 · 허용 · 거부 · 출처 읽기 · 파일 찾기.
 * 진짜 병합 매니페스트에 대한 증거는 CI 의 안드로이드 잡 로그다(권한마다 출처를 찍는다).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import {
  requestedPermissions, unexpected, findMergedManifests, findMergerReports, permissionSources, wrongSource, ALLOWED,
} from '../../tools/check-permissions.mjs'

const merged = (perms) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.catpaw.defense">
${perms.map((p) => `    <uses-permission android:name="${p}" />`).join('\n')}
    <permission android:name="com.catpaw.defense.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
    <application android:label="캣포 디펜스" />
</manifest>`

// AGP 병합 보고서(outputs/logs/manifest-merger-release-report.txt)의 꼴 — 요소 줄 · ADDED/MERGED 줄 · 탭 들여쓴 속성
const APP = '/w/catpaw/android/app/src/main/AndroidManifest.xml'
const CACHE = '/home/runner/.gradle/caches/8.14/transforms/0a1b/transformed'
const report = (extra = '') => `-- Merging decision tree log ---
manifest
ADDED from ${APP}:2:1-40:12
MERGED from [com.android.billingclient:billing:9.1.0] ${CACHE}/billing-9.1.0/AndroidManifest.xml:2:1-40:12
MERGED from [com.google.android.datatransport:transport-backend-cct:3.1.8] ${CACHE}/transport-backend-cct-3.1.8/AndroidManifest.xml:15:1-33:12
	package
		INJECTED from ${APP}
uses-permission#android.permission.VIBRATE
ADDED from ${APP}:13:5-66
	android:name
		ADDED from ${APP}:13:22-63
uses-permission#com.android.vending.BILLING
ADDED from [com.android.billingclient:billing:9.1.0] ${CACHE}/billing-9.1.0/AndroidManifest.xml:10:5-67
	android:name
		ADDED from [com.android.billingclient:billing:9.1.0] ${CACHE}/billing-9.1.0/AndroidManifest.xml:10:22-64
uses-permission#android.permission.ACCESS_NETWORK_STATE
ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] ${CACHE}/transport-backend-cct-3.1.8/AndroidManifest.xml:22:5-79
	android:name
		ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] ${CACHE}/transport-backend-cct-3.1.8/AndroidManifest.xml:22:22-76
uses-permission#android.permission.INTERNET
ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] ${CACHE}/transport-backend-cct-3.1.8/AndroidManifest.xml:23:5-67
MERGED from [com.android.billingclient:billing:9.1.0] ${CACHE}/billing-9.1.0/AndroidManifest.xml:11:5-67
	android:name
		ADDED from [com.google.android.datatransport:transport-backend-cct:3.1.8] ${CACHE}/transport-backend-cct-3.1.8/AndroidManifest.xml:23:22-64
${extra}application
ADDED from ${APP}:15:5-38:19
MERGED from [com.android.billingclient:billing:9.1.0] ${CACHE}/billing-9.1.0/AndroidManifest.xml:20:5-38:19
`

test('권한 그물: 지금 병합 매니페스트에 있는 다섯은 이름으로 통과한다', () => {
  const perms = requestedPermissions(merged([
    'android.permission.VIBRATE', 'com.android.vending.BILLING',
    'com.catpaw.defense.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    'android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET',
  ]))
  assert.equal(perms.length, 5)
  assert.deepEqual(unexpected(perms), [])
  // 디버그·사이드로드 빌드는 앱 id 에 접미사가 붙는다 — 그 자기 전용 권한도 같은 것이다
  assert.deepEqual(unexpected(['com.catpaw.defense.debug.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']), [])
})

test('권한 그물: 광고 ID · 위치 · 잠금 해제 같은 새 권한이 끼어들면 이름에서 잡는다', () => {
  const perms = requestedPermissions(merged([
    'android.permission.VIBRATE', 'com.google.android.gms.permission.AD_ID', 'android.permission.WAKE_LOCK',
  ]) + '\n<uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION"/>')
  assert.deepEqual(unexpected(perms).sort(), [
    'android.permission.ACCESS_FINE_LOCATION', 'android.permission.WAKE_LOCK', 'com.google.android.gms.permission.AD_ID',
  ])
  // 남의 앱 id 로 된 자기 전용 권한은 허용이 아니다
  assert.deepEqual(unexpected(['com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']).length, 1)
})

test('권한 그물: 병합 보고서에서 권한마다 출처를 읽는다 (라이브러리 좌표 · 우리 매니페스트 경로)', () => {
  const s = permissionSources(report())
  assert.deepEqual(s.get('android.permission.VIBRATE'), [APP], '위치(:13:5-66)는 떼고 경로만')
  assert.deepEqual(s.get('com.android.vending.BILLING'), ['com.android.billingclient:billing:9.1.0'])
  assert.deepEqual(s.get('android.permission.ACCESS_NETWORK_STATE'), ['com.google.android.datatransport:transport-backend-cct:3.1.8'])
  assert.deepEqual(s.get('android.permission.INTERNET').sort(), [
    'com.android.billingclient:billing:9.1.0', 'com.google.android.datatransport:transport-backend-cct:3.1.8',
  ], 'ADDED 와 MERGED 를 다 모으고 속성 줄의 중복은 합친다')
  assert.ok(!s.has('application') && !s.has('manifest'), '권한이 아닌 요소는 안 모은다')
  assert.equal([...s.keys()].length, 4)
})

test('권한 그물: INTERNET 은 Play 결제 라이브러리 쪽에서 올 때만 통과한다 — 게임 코드는 네트워크를 안 쓴다', () => {
  const perms = ['android.permission.VIBRATE', 'com.android.vending.BILLING', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET']
  assert.deepEqual(wrongSource(perms, permissionSources(report())), [], '지금 모습(datatransport · billing)은 통과')

  // 우리 매니페스트가 INTERNET 을 들이면 — 누가 원격 스크립트를 부르려고 넣은 것이다
  const ours = report(`uses-permission#android.permission.INTERNET\nADDED from ${APP}:14:5-67\n`)
  assert.deepEqual(wrongSource(perms, permissionSources(ours)).map((w) => w.perm), ['android.permission.INTERNET'])

  // 분석 SDK 같은 다른 라이브러리가 INTERNET 을 들여도 — 권한 이름은 같아도 뜻이 다르다
  const other = report(`uses-permission#android.permission.INTERNET\nMERGED from [com.google.firebase:firebase-analytics:22.1.0] ${CACHE}/x/AndroidManifest.xml:5:5-67\n`)
  const w = wrongSource(perms, permissionSources(other))
  assert.equal(w.length, 1)
  assert.ok(w[0].sources.includes('com.google.firebase:firebase-analytics:22.1.0'))

  // 보고서에서 출처를 못 읽으면(형식이 바뀌었거나 보고서가 없으면) 통과시키지 않는다
  assert.deepEqual(wrongSource(perms, new Map()).map((x) => x.perm).sort(), [
    'android.permission.ACCESS_NETWORK_STATE', 'android.permission.INTERNET',
  ])
  // 출처 규칙이 없는 권한(진동 · 결제)은 출처를 못 읽어도 이 검사와 무관하다
  assert.deepEqual(wrongSource(['android.permission.VIBRATE'], new Map()), [])
})

test('권한 그물: 허용 항목마다 이유가 적혀 있다 — 이유를 못 적는 권한은 들이지 않는다', () => {
  for (const a of ALLOWED) assert.ok(a.why && a.why.length > 10, `${a.name} 에 이유가 없다`)
  const net = ALLOWED.find((a) => a.name.test('android.permission.INTERNET'))
  assert.ok(net?.from, 'INTERNET 은 출처 규칙과 함께만 허용한다')
  assert.ok(net.from.test('com.google.android.datatransport:transport-backend-cct:3.1.8'))
  assert.ok(!net.from.test(APP) && !net.from.test('com.google.firebase:firebase-analytics:22.1.0'))
})

test('권한 그물: 빌드 디렉터리에서 릴리스 병합 매니페스트와 병합 보고서만 찾는다 (AGP 경로가 달라도)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'catpaw-perm-'))
  const put = (rel, text = merged([])) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p }
  const a = put('intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml')
  const b = put('intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml')
  put('intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml')    // 디버그는 안 본다
  put('intermediates/packaged_manifests/release/AndroidManifest.xml')                    // 병합 전 조각도 안 본다
  const r = put('outputs/logs/manifest-merger-release-report.txt', report())
  put('outputs/logs/manifest-merger-debug-report.txt', report())
  assert.deepEqual(findMergedManifests(dir).sort(), [a, b].sort())
  assert.deepEqual(findMergerReports(dir), [r])
  assert.deepEqual(findMergedManifests(join(dir, 'nope')), [], '없는 디렉터리는 빈 목록 — CLI 가 크게 실패한다')
  assert.deepEqual(findMergerReports(join(dir, 'nope')), [])
})

test('우리 매니페스트 원본도 허용 목록 안이고, 인터넷 권한은 원본에 없다 (라이브러리가 합쳐지기 전)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const src = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  const perms = requestedPermissions(src)
  assert.deepEqual(unexpected(perms), [], `원본 매니페스트에 목록 밖 권한: ${unexpected(perms)}`)
  assert.ok(perms.includes('android.permission.VIBRATE'), '진동 권한이 빠졌다 — 설정의 진동이 APK 에서 조용히 안 돈다')
  assert.ok(!perms.includes('android.permission.INTERNET'), '게임은 네트워크를 안 쓴다 — INTERNET 은 결제 라이브러리 몫이다')
  assert.ok(!perms.includes('android.permission.ACCESS_NETWORK_STATE'))
})
