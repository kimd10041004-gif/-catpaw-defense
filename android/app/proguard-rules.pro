# 게임 로직은 전부 assets 안의 자바스크립트라 난독화 대상이 아니다.
# WebView 인터페이스를 추가하게 되면 여기에 keep 규칙을 넣는다.
-keepattributes JavascriptInterface
