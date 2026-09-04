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
    `화면 버전 ${APP_VERSION} ≠ package.json ${pkg.version} — 둘 다 올려야 한다`
    + ' (android/app/build.gradle.kts 의 versionName 도)')
})

test('버전은 x.y.z 꼴이다', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/)
})
