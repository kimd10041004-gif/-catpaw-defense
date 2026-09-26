/**
 * `tools/check-permissions.mjs` — CI 가 병합 매니페스트의 권한을 허용 목록과 대조한다(W).
 * 여기서는 안드로이드 빌드 없이 로직만 본다: 뽑기 · 허용 · 거부 · 파일 찾기.
 * 진짜 병합 매니페스트에 대한 증거는 CI 의 안드로이드 잡 로그다(권한 목록을 찍는다).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { requestedPermissions, unexpected, findMergedManifests, ALLOWED } from '../../tools/check-permissions.mjs'

const merged = (perms) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.catpaw.defense">
${perms.map((p) => `    <uses-permission android:name="${p}" />`).join('\n')}
    <permission android:name="com.catpaw.defense.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
    <application android:label="캣포 디펜스" />
</manifest>`

test('권한 그물: 지금 쓰는 셋(진동 · Play 결제 · androidx 자기 전용)은 통과한다', () => {
  const perms = requestedPermissions(merged([
    'android.permission.VIBRATE', 'com.android.vending.BILLING',
    'com.catpaw.defense.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  ]))
  assert.equal(perms.length, 3)
  assert.deepEqual(unexpected(perms), [])
  // 디버그·사이드로드 빌드는 앱 id 에 접미사가 붙는다 — 그 자기 전용 권한도 같은 것이다
  assert.deepEqual(unexpected(['com.catpaw.defense.debug.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']), [])
})

test('권한 그물: 인터넷 · 광고 ID · 위치가 끼어들면 잡는다', () => {
  const perms = requestedPermissions(merged([
    'android.permission.VIBRATE', 'android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID',
  ]) + '\n<uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION"/>')
  assert.deepEqual(unexpected(perms).sort(), [
    'android.permission.ACCESS_FINE_LOCATION', 'android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID',
  ])
  // 남의 앱 id 로 된 자기 전용 권한은 허용이 아니다
  assert.deepEqual(unexpected(['com.other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']).length, 1)
})

test('권한 그물: 허용 항목마다 이유가 적혀 있다 — 이유를 못 적는 권한은 들이지 않는다', () => {
  for (const a of ALLOWED) assert.ok(a.why && a.why.length > 10, `${a.name} 에 이유가 없다`)
})

test('권한 그물: 빌드 디렉터리에서 릴리스 병합 매니페스트만 찾는다 (AGP 경로가 달라도)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'catpaw-perm-'))
  const put = (rel) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, merged([])); return p }
  const a = put('intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml')
  const b = put('intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml')
  put('intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml')    // 디버그는 안 본다
  put('intermediates/packaged_manifests/release/AndroidManifest.xml')                    // 병합 전 조각도 안 본다
  assert.deepEqual(findMergedManifests(dir).sort(), [a, b].sort())
  assert.deepEqual(findMergedManifests(join(dir, 'nope')), [], '없는 디렉터리는 빈 목록 — CLI 가 크게 실패한다')
})

test('우리 매니페스트 원본도 허용 목록 안이다 (라이브러리가 합쳐지기 전)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const src = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  const perms = requestedPermissions(src)
  assert.deepEqual(unexpected(perms), [], `원본 매니페스트에 목록 밖 권한: ${unexpected(perms)}`)
  assert.ok(perms.includes('android.permission.VIBRATE'), '진동 권한이 빠졌다 — 설정의 진동이 APK 에서 조용히 안 돈다')
  assert.ok(!perms.includes('android.permission.INTERNET'), '인터넷 권한은 들이지 않는다')
})
