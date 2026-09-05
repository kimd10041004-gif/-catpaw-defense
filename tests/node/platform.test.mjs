import test from 'node:test'
import assert from 'node:assert/strict'
import { isAndroidApp, shouldRegisterServiceWorker, ANDROID_ASSET_HOST } from '../../web/js/domain/platform.js'

test('서비스 워커: 웹(http/https)에서는 등록하고, 안드로이드 앱과 file:// 에서는 안 한다', () => {
  assert.equal(shouldRegisterServiceWorker({ protocol: 'https:', hostname: 'example.github.io' }), true)
  assert.equal(shouldRegisterServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' }), true)
  assert.equal(shouldRegisterServiceWorker({ protocol: 'https:', hostname: ANDROID_ASSET_HOST }), false)
  assert.equal(shouldRegisterServiceWorker({ protocol: 'file:', hostname: '' }), false)
  assert.equal(shouldRegisterServiceWorker(null), false)
  assert.equal(shouldRegisterServiceWorker({}), false)
})

test('isAndroidApp: AssetLoader 호스트만 앱으로 본다', () => {
  assert.equal(isAndroidApp({ hostname: 'appassets.androidplatform.net' }), true)
  assert.equal(isAndroidApp({ hostname: 'appassets.androidplatform.net.evil.com' }), false)
  assert.equal(isAndroidApp(undefined), false)
})
