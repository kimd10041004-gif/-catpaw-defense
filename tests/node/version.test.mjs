import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_VERSION } from '../../web/js/version.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('화면에 보이는 버전이 package.json 과 같다', () => {
  // 실제 게임들이 늘 어긋나는 자리다. 한쪽만 올리면 여기서 빨개진다.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(APP_VERSION, pkg.version,
    `화면 버전 ${APP_VERSION} ≠ package.json ${pkg.version} — node tools/bump-version.mjs 로 함께 올린다`)
})

test('gradle 의 appVersion 이 화면 버전과 같다 (versionCode 는 여기서 계산된다)', () => {
  const kts = readFileSync(join(root, 'android/app/build.gradle.kts'), 'utf8')
  const m = /val appVersion = "(\d+\.\d+\.\d+)"/.exec(kts)
  assert.ok(m, 'build.gradle.kts 에 val appVersion = "x.y.z" 줄이 없다 — bump-version 이 이 줄을 고친다')
  assert.equal(m[1], APP_VERSION, `gradle ${m[1]} ≠ 화면 ${APP_VERSION}`)
  assert.match(kts, /versionName = appVersion/)
  assert.match(kts, /versionCodeOf\(appVersion\)/)
})

test('서비스 워커 캐시 이름이 앱 버전을 따른다 (배포마다 patch 를 올리면 캐시가 돈다)', () => {
  const sw = readFileSync(join(root, 'web/sw.js'), 'utf8')
  const m = /const CACHE_VERSION = '([^']+)'/.exec(sw)
  assert.ok(m, 'sw.js 에 CACHE_VERSION 줄이 없다')
  assert.equal(m[1], `catpaw-v${APP_VERSION}`, `sw.js 캐시 ${m[1]} ≠ catpaw-v${APP_VERSION}`)
})


test('버전은 x.y.z 꼴이다', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)
})
