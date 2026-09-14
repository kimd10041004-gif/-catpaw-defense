package com.catpaw.defense

import android.app.Activity
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * 자바스크립트 ↔ Google Play 결제 사이의 다리 (Play Billing Library 9).
 *
 * 원칙은 그대로다 — **성공한 척하지 않는다.** Play 에 연결이 안 되면(사이드로드 · Play 없는 기기) `not_available`,
 * Play Console 에 상품이 없으면 `not_configured`, 사용자가 취소하면 `user_canceled` 를 그대로 돌려준다.
 * 웹 쪽(domain/billing.js)이 그 코드를 받아 화면에 그대로 적는다.
 *
 * ── 계약 (문자열 JSON — WebView 인터페이스는 원시 타입만 안전하다) ──
 *   configure(catalogJson)        [{"sku":"catnip_100","consumable":true}, …] — 상품 목록은 shop.js 가 단 하나의 출처다.
 *                                 여기 하드코딩하지 않는다(제출팩의 상품 ID 표가 코드와 어긋났던 일이 있다).
 *   describe()                    {"configured":bool,"label":"…","state":"connecting|ready|no_products|unavailable|error",
 *                                  "code":int,"message":"…","prices":{sku:"₩1,200"}}
 *   isReady()                     'true' | 'false'  (연결됐고 상품을 하나라도 받았다)
 *   purchaseAsync(requestId, sku) 결과는 window.CatpawBillingCallbacks.deliver(requestId, json) 으로 돌아온다:
 *                                  {"ok":true,"sku":…,"token":…,"orderId":…} 또는 {"ok":false,"code":…,"message":…}
 *   restoreAsync(requestId)       deliver(requestId, '[{"sku":…,"token":…}, …]')
 *   purchase(sku)                 옛 동기 계약 — 결제 UI 는 비동기라 여기서는 못 한다. use_async 를 돌려준다.
 *   그 밖의 콜백: onReady(describeJson) — 상품 정보가 도착했을 때 · onPurchase(json) — 요청 없이 도착한 구매
 *                (대기 중이던 결제가 승인됐을 때). 둘 다 window.CatpawBillingCallbacks 에 있으면 부른다.
 *
 * ── 스레드 ──
 *   @JavascriptInterface 메서드는 WebView 의 백그라운드 스레드에서 불린다. BillingClient 는 메인 스레드에서 쓴다
 *   (launchBillingFlow 는 액티비티가 필요하다). 그래서 전부 runOnUiThread 로 넘기고, 답은 webView.post 로 돌려준다.
 *
 * ── 소모와 승인 ──
 *   PURCHASED 가 되면 소모품(catalog 의 consumable)은 consumeAsync, 영구 상품은 acknowledgePurchase 를 부른다.
 *   3일 안에 승인하지 않으면 Play 가 환불한다. 영수증은 소모·승인을 기다리지 않고 바로 돌려준다 — 앱이 그 사이에
 *   죽어도 restoreAsync 가 미소모 구매를 다시 보고 소모하며, 웹 쪽은 토큰으로 중복 지급을 막는다(applyPurchase).
 *
 * ── 서버가 없다 ──
 *   영수증 검증은 Play 가 하고 앱은 purchaseToken 만 본다(docs/결제연동.md §4). 진행도가 기기 안에만 있는 구조라
 *   서버 검증은 없다 — 그 한계는 문서에 적혀 있다.
 *
 * 보안 메모: addJavascriptInterface 는 이 WebView 가 로드하는 출처에만 노출된다. 이 앱은 APK 안의 assets 만 로드하고
 * 외부 URL 은 WebViewClient 에서 차단하므로, 제3자 페이지가 이 인터페이스를 부를 수 있는 경로가 없다.
 */
class BillingBridge(private val activity: Activity, private val webView: WebView) : PurchasesUpdatedListener {

    private val client: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    /** 마지막 onBillingSetupFinished 의 응답 코드. null 이면 아직 답이 없다 */
    @Volatile private var setupCode: Int? = null
    @Volatile private var setupMessage: String = ""
    /** 마지막 상품 조회의 응답 코드 (null = 아직 안 물었다) */
    @Volatile private var queryCode: Int? = null
    @Volatile private var queryMessage: String = ""

    /** shop.js 가 configure() 로 준 목록 */
    @Volatile private var catalogSkus: List<String> = emptyList()
    private val consumableSkus: MutableSet<String> = ConcurrentHashMap.newKeySet()
    /** Play 가 실제로 돌려준 상품 정보 (sku → ProductDetails) */
    private val products = ConcurrentHashMap<String, ProductDetails>()
    /** 진행 중인 구매 — sku → 요청 id. onPurchasesUpdated 가 sku 로 찾아 답한다 */
    private val inflight = ConcurrentHashMap<String, Int>()

    // ── 수명 ──────────────────────────────────────────────────────────

    /** MainActivity 가 WebView 를 만든 뒤 한 번 부른다 */
    fun connect() {
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                setupCode = result.responseCode
                setupMessage = result.debugMessage ?: ""
                if (result.responseCode == BillingClient.BillingResponseCode.OK && catalogSkus.isNotEmpty()) {
                    queryProducts()
                }
            }

            override fun onBillingServiceDisconnected() {
                // enableAutoServiceReconnection 이 다시 붙인다. 그동안 isReady 는 false 다.
                setupCode = BillingClient.BillingResponseCode.SERVICE_DISCONNECTED
            }
        })
    }

    /** MainActivity.onDestroy 에서 부른다 */
    fun destroy() {
        try { client.endConnection() } catch (e: Exception) { /* 이미 닫혔으면 그만 */ }
    }

    private fun connected(): Boolean =
        setupCode == BillingClient.BillingResponseCode.OK && client.isReady

    // ── 자바스크립트가 부르는 것 ──────────────────────────────────────

    @JavascriptInterface
    fun configure(catalogJson: String) {
        val skus = ArrayList<String>()
        try {
            val arr = JSONArray(catalogJson)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val sku = o.getString("sku")
                skus.add(sku)
                if (o.optBoolean("consumable", false)) consumableSkus.add(sku) else consumableSkus.remove(sku)
            }
        } catch (e: Exception) {
            queryCode = BillingClient.BillingResponseCode.DEVELOPER_ERROR
            queryMessage = "catalog JSON 을 못 읽었다: ${e.message}"
            return
        }
        catalogSkus = skus
        activity.runOnUiThread { if (connected()) queryProducts() }
    }

    @JavascriptInterface
    fun isReady(): String = (connected() && products.isNotEmpty()).toString()

    @JavascriptInterface
    fun describe(): String = describeJson().toString()

    /** 옛 동기 계약. 결제 UI 는 비동기라 여기서는 못 연다 — 새 웹 코드는 purchaseAsync 를 쓴다. */
    @JavascriptInterface
    fun purchase(sku: String): String = JSONObject()
        .put("ok", false)
        .put("code", "use_async")
        .put("message", "이 브리지는 purchaseAsync(requestId, sku) 로 부른다")
        .toString()

    @JavascriptInterface
    fun purchaseAsync(requestId: Int, sku: String) {
        activity.runOnUiThread {
            if (!connected()) {
                deliver(requestId, fail("not_available", "Google Play 결제를 쓸 수 없다 (${codeName(setupCode)}${if (setupMessage.isEmpty()) "" else " · $setupMessage"})"))
                return@runOnUiThread
            }
            val details = products[sku]
            if (details == null) {
                deliver(requestId, fail("not_configured", "Play Console 에 상품 '$sku' 가 없다 (${codeName(queryCode)}${if (queryMessage.isEmpty()) "" else " · $queryMessage"})"))
                return@runOnUiThread
            }
            if (inflight.containsKey(sku)) {
                deliver(requestId, fail("busy", "같은 상품의 결제가 이미 진행 중이다"))
                return@runOnUiThread
            }
            val item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
            // 일회성 상품도 오퍼 토큰이 있으면 준다 (PBL 8 부터 일회성 상품에 구매 옵션·오퍼가 생겼다)
            val offers = details.oneTimePurchaseOfferDetailsList
            val token = offers?.firstOrNull()?.offerToken ?: details.oneTimePurchaseOfferDetails?.offerToken
            if (!token.isNullOrEmpty()) item.setOfferToken(token)
            val params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(item.build()))
                .build()
            inflight[sku] = requestId
            val launched = client.launchBillingFlow(activity, params)
            if (launched.responseCode != BillingClient.BillingResponseCode.OK) {
                inflight.remove(sku)
                deliver(requestId, failFor(launched))
            }
            // OK 면 결제 화면이 떴다 — 답은 onPurchasesUpdated 로 온다
        }
    }

    @JavascriptInterface
    fun restoreAsync(requestId: Int) {
        activity.runOnUiThread {
            if (!connected()) {
                deliver(requestId, JSONArray().toString())
                return@runOnUiThread
            }
            val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
            client.queryPurchasesAsync(params) { result, purchases ->
                val out = JSONArray()
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    for (p in purchases) {
                        if (p.purchaseState != Purchase.PurchaseState.PURCHASED) continue
                        settle(p)          // 미소모 소모품은 소모하고, 미승인 영구 상품은 승인한다
                        for (sku in p.products) out.put(receipt(sku, p))
                    }
                }
                deliver(requestId, out.toString())
            }
        }
    }

    // ── Play 가 부르는 것 ──────────────────────────────────────────────

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        if (result.responseCode != BillingClient.BillingResponseCode.OK || purchases == null) {
            // 취소·오류: 진행 중이던 요청 전부에 같은 답을 준다 (한 번에 하나만 열리므로 보통 하나다)
            val waiting = HashMap(inflight)
            inflight.clear()
            for ((_, id) in waiting) deliver(id, failFor(result))
            return
        }
        for (p in purchases) {
            for (sku in p.products) {
                val id = inflight.remove(sku)
                when (p.purchaseState) {
                    Purchase.PurchaseState.PURCHASED -> {
                        settle(p)
                        val json = receipt(sku, p).put("ok", true).toString()
                        if (id != null) deliver(id, json) else callback("onPurchase", JSONObject.quote(json))
                    }
                    Purchase.PurchaseState.PENDING -> {
                        // 편의점 결제 등 — 돈이 아직 안 들어왔다. 지급하지 않는다. 승인되면 다시 onPurchasesUpdated 가 온다.
                        if (id != null) deliver(id, fail("pending", "결제가 승인 대기 중이다 — 승인되면 지급된다"))
                    }
                    else -> {
                        if (id != null) deliver(id, fail("unspecified", "구매 상태를 알 수 없다"))
                    }
                }
            }
        }
    }

    // ── 안쪽 ──────────────────────────────────────────────────────────

    private fun queryProducts() {
        val list = catalogSkus.map {
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(it)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        }
        if (list.isEmpty()) return
        val params = QueryProductDetailsParams.newBuilder().setProductList(list).build()
        client.queryProductDetailsAsync(params) { result, detailsResult ->
            queryCode = result.responseCode
            queryMessage = result.debugMessage ?: ""
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                products.clear()
                for (d in detailsResult.productDetailsList) products[d.productId] = d
                val missing = detailsResult.unfetchedProductList.map { it.productId }
                if (missing.isNotEmpty()) queryMessage = "Play Console 에 없는 상품: ${missing.joinToString(", ")}"
            }
            callback("onReady", JSONObject.quote(describeJson().toString()))
        }
    }

    /** 소모품은 소모, 영구 상품은 승인 — 둘 다 이미 됐으면 아무것도 안 한다 */
    private fun settle(p: Purchase) {
        val consumable = p.products.any { consumableSkus.contains(it) }
        if (consumable) {
            client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) { _, _ -> }
        } else if (!p.isAcknowledged) {
            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) { }
        }
    }

    private fun receipt(sku: String, p: Purchase): JSONObject = JSONObject()
        .put("sku", sku)
        .put("token", p.purchaseToken)
        .put("orderId", p.orderId ?: "")
        .put("acknowledged", p.isAcknowledged)

    private fun describeJson(): JSONObject {
        val state = when {
            setupCode == null -> "connecting"
            setupCode != BillingClient.BillingResponseCode.OK -> "unavailable"
            queryCode == null -> "connecting"
            products.isEmpty() -> "no_products"
            else -> "ready"
        }
        val prices = JSONObject()
        for ((sku, d) in products) {
            val offer = d.oneTimePurchaseOfferDetailsList?.firstOrNull() ?: d.oneTimePurchaseOfferDetails
            if (offer != null) prices.put(sku, offer.formattedPrice)
        }
        return JSONObject()
            .put("configured", state == "ready")
            .put("label", "Google Play 결제")
            .put("state", state)
            .put("code", (if (state == "unavailable") setupCode else queryCode) ?: -100)
            .put("message", if (state == "unavailable") setupMessage else queryMessage)
            .put("prices", prices)
    }

    private fun fail(code: String, message: String): String = JSONObject()
        .put("ok", false).put("code", code).put("message", message).toString()

    private fun failFor(result: BillingResult): String {
        val code = when (result.responseCode) {
            BillingClient.BillingResponseCode.USER_CANCELED -> "user_canceled"
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "already_owned"
            BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "not_configured"
            BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> "not_available"
            BillingClient.BillingResponseCode.NETWORK_ERROR -> "network"
            BillingClient.BillingResponseCode.SERVICE_DISCONNECTED,
            BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
            BillingClient.BillingResponseCode.SERVICE_TIMEOUT -> "service"
            else -> "error"
        }
        return fail(code, "${codeName(result.responseCode)}${if (result.debugMessage.isNullOrEmpty()) "" else " · ${result.debugMessage}"}")
    }

    private fun codeName(code: Int?): String = when (code) {
        null -> "NOT_STARTED"
        BillingClient.BillingResponseCode.OK -> "OK"
        BillingClient.BillingResponseCode.USER_CANCELED -> "USER_CANCELED"
        BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE -> "SERVICE_UNAVAILABLE"
        BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> "BILLING_UNAVAILABLE"
        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE -> "ITEM_UNAVAILABLE"
        BillingClient.BillingResponseCode.DEVELOPER_ERROR -> "DEVELOPER_ERROR"
        BillingClient.BillingResponseCode.ERROR -> "ERROR"
        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "ITEM_ALREADY_OWNED"
        BillingClient.BillingResponseCode.ITEM_NOT_OWNED -> "ITEM_NOT_OWNED"
        BillingClient.BillingResponseCode.NETWORK_ERROR -> "NETWORK_ERROR"
        BillingClient.BillingResponseCode.SERVICE_DISCONNECTED -> "SERVICE_DISCONNECTED"
        BillingClient.BillingResponseCode.SERVICE_TIMEOUT -> "SERVICE_TIMEOUT"
        BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED -> "FEATURE_NOT_SUPPORTED"
        else -> "CODE_$code"
    }

    /** 요청 하나에 답한다 */
    private fun deliver(requestId: Int, json: String) {
        callback("deliver", "$requestId, ${JSONObject.quote(json)}")
    }

    /** window.CatpawBillingCallbacks.<name>(args) — 없으면 조용히 넘어간다 (옛 웹 코드) */
    private fun callback(name: String, args: String) {
        webView.post {
            webView.evaluateJavascript(
                "(function(){var c=window.CatpawBillingCallbacks;if(c&&typeof c.$name==='function'){c.$name($args)}})()",
                null,
            )
        }
    }
}
