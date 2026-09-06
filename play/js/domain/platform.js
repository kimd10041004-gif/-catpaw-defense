/**
 * 실행 환경 판별 — DOM 없이 location 만 본다 (검사 가능).
 *
 * 안드로이드 앱은 WebViewAssetLoader 가 게임을 https://appassets.androidplatform.net/assets/ 로 서빙한다.
 * 그 안에서는 서비스 워커를 등록하지 않는다: 에셋이 이미 로컬이라 보태는 게 없고, 앱을 업데이트한 뒤
 * 옛 APK 의 파일을 서빙할 수 있는 유일한 것이 SW 캐시다. 웹(PWA)에서는 오프라인 구동을 위해 등록한다.
 */
export const ANDROID_ASSET_HOST = 'appassets.androidplatform.net'

export function isAndroidApp(loc) {
  return !!loc && loc.hostname === ANDROID_ASSET_HOST
}

/** http(s) 이고 안드로이드 앱이 아닐 때만. file:// 은 등록 자체가 불가능하다. */
export function shouldRegisterServiceWorker(loc) {
  if (!loc || typeof loc.protocol !== 'string') return false
  return loc.protocol.startsWith('http') && !isAndroidApp(loc)
}
