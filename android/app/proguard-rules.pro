# 게임 로직은 전부 assets 안의 자바스크립트라 난독화 대상이 아니다.

# 자바스크립트에서 부르는 브리지는 이름이 바뀌면 안 된다.
-keepattributes JavascriptInterface
-keepclassmembers class com.catpaw.defense.BillingBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# 릴리스는 R8 이 켜져 있다(build.gradle.kts). 브리지 클래스를 하나 더 만들어도 잊지 않게
# @JavascriptInterface 가 붙은 메서드는 클래스와 무관하게 전부 지킨다.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
