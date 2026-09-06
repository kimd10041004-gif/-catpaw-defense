/**
 * 빌드 종류 — 이 파일 하나가 "전체판인가 데모인가"를 가른다.
 *
 * 기본은 전체판(`DEMO = false`). `tools/demo-build.mjs` 가 데모를 구울 때 이 파일을
 * **통째로 덮어쓴다** — 소스를 잘라 고치지 않는다(한 줄이라도 어긋나면 조용히 틀린 빌드가 나온다).
 *
 * 데모에서 달라지는 것은 둘뿐이다:
 *   1. 유료 콘텐츠가 아예 없다 — content/index.js 의 `// demo:strip` 줄과 그 파일들을 빼고 굽는다
 *   2. 결제가 없다 — domain/billing.js 가 DisabledBillingProvider 를 고른다(데모 결제로도 못 연다)
 *
 * 왜 데모가 필요한가: 아이폰에는 앱이 없어서 웹앱(PWA)이 유일한 길인데, 지금 웹 빌드를 그대로
 * 올리면 '데모 결제'가 3막·스킨을 공짜로 열어 준다. 파는 물건을 나눠 주는 셈이라 그럴 수 없다.
 * 자세한 것은 docs/아이폰.md.
 */

export const DEMO = false

/** 데모에서 "전체판은 여기" 라고 가리킬 곳 */
export const FULL_APP_URL = 'https://kimd10041004-gif.github.io/-catpaw-defense/'
