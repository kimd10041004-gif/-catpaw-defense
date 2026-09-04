/**
 * 화면에 보이는 버전. 로딩 화면과 타이틀 맨 아래에 v1.0.0 으로 뜬다.
 *
 * package.json 의 version 과 같아야 한다 — tests/node/version.test.mjs 가 대조한다.
 * android/app/build.gradle.kts 의 versionName 도 같아야 하지만 CI 가 없어 검사에
 * 못 넣는다. 올릴 때 세 곳을 같이 올린다.
 */
export const APP_VERSION = '1.0.0'
