/**
 * 화면에 보이는 버전. 로딩 화면과 타이틀 맨 아래에 v1.0.0 으로 뜬다.
 *
 * package.json · android/app/build.gradle.kts(val appVersion) · web/sw.js(CACHE_VERSION) 와
 * 같아야 한다 — tests/node/version.test.mjs 가 네 곳을 대조한다.
 * 손으로 올리지 말고 `node tools/bump-version.mjs patch|minor|major` 로 함께 올린다.
 */
export const APP_VERSION = '1.0.0'
