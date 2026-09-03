package com.catpaw.defense

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

/**
 * 자바스크립트 ↔ Google Play 결제 사이의 다리.
 *
 * 지금은 **연결되지 않은 상태**다. 실제 청구가 일어나지 않고, 결제를 시도하면
 * 성공한 척하지 않고 not_configured를 그대로 돌려준다.
 * 웹 쪽(domain/billing.js)이 이 값을 받아 "미설정"이라고 화면에 표시한다.
 *
 * 실제 결제를 켜는 방법은 docs/결제연동.md 참고.
 *
 * 보안 메모: addJavascriptInterface는 이 WebView가 로드하는 출처에만 노출된다.
 * 이 앱은 APK 안의 assets만 로드하고 외부 URL은 WebViewClient에서 차단하므로,
 * 제3자 페이지가 이 인터페이스를 부를 수 있는 경로가 없다.
 */
class BillingBridge {

    /** Play Billing 라이브러리와 상품이 실제로 연결됐는지 */
    private val configured = false

    @JavascriptInterface
    fun isReady(): String = configured.toString()

    @JavascriptInterface
    fun describe(): String = JSONObject()
        .put("configured", configured)
        .put("label", if (configured) "Google Play 결제" else "Google Play 결제")
        .toString()

    /**
     * 상품 하나를 구매한다.
     * @param sku Play Console에 등록한 상품 ID (shop.js의 IAP_PRODUCTS.sku와 같아야 한다)
     */
    @JavascriptInterface
    fun purchase(sku: String): String {
        if (!configured) {
            return JSONObject()
                .put("ok", false)
                .put("code", "not_configured")
                .put("message", "결제가 아직 연결되지 않았습니다 (docs/결제연동.md 참고)")
                .toString()
        }

        // ── 실제 연동 시 이 자리에 Play Billing 흐름을 넣는다 ──────────────
        // 1. BillingClient.queryProductDetails(sku)
        // 2. launchBillingFlow(activity, params)  ← 액티비티가 필요하므로 생성자로 받는다
        // 3. onPurchasesUpdated 콜백에서 purchase.purchaseToken을 서버로 보내 검증
        // 4. consumeAsync(소모품) 또는 acknowledgePurchase(영구 상품)
        // 5. 아래 형태로 반환:  {"ok":true,"token":"<purchaseToken>"}
        return JSONObject()
            .put("ok", false)
            .put("code", "not_implemented")
            .put("message", "결제 흐름이 아직 구현되지 않았습니다")
            .toString()
    }

    /**
     * 기기를 바꿨거나 앱을 다시 깔았을 때 이전 구매를 되살린다.
     * 실제 연동 시 queryPurchasesAsync 결과를 [{"sku":..., "token":...}] 형태로 돌려준다.
     */
    @JavascriptInterface
    fun restore(): String = JSONArray().toString()
}
