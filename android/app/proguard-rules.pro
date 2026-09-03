# 게임 로직은 전부 assets 안의 자바스크립트라 난독화 대상이 아니다.

# 자바스크립트에서 부르는 브리지는 이름이 바뀌면 안 된다.
-keepattributes JavascriptInterface
-keepclassmembers class com.catpaw.defense.BillingBridge {
    @android.webkit.JavascriptInterface <methods>;
}
