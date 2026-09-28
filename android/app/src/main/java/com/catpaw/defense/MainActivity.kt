package com.catpaw.defense

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

/**
 * 게임을 담는 껍데기 액티비티.
 *
 * 왜 file:// 이 아니라 WebViewAssetLoader를 쓰는가:
 *   file:// 출처에서는 ES 모듈 import가 CORS로 막히고 localStorage와 서비스 워커도 불안정하다.
 *   AssetLoader가 assets를 https://appassets.androidplatform.net/ 로 서빙해 주면
 *   정상적인 보안 출처가 되어 모듈·저장·오프라인 캐시가 전부 그대로 동작한다.
 *
 * 웹과 주고받는 수명 신호는 window.CatpawApp 한 곳이다(web/js/main.js 의 _bindLifecycle):
 *   back()          뒤로가기의 뜻을 웹이 정한다 — 'handled' | 'exit'
 *   backgrounded()  홈 버튼·전화 — 전투를 세운다
 *   resumed()       돌아왔다 — 미처리 구매를 조용히 다시 읽는다
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var billing: BillingBridge

    /** 렌더러가 죽어 이 WebView 를 버렸다 — 상태 저장·파괴·JS 호출을 다시 하지 않는다 */
    private var webViewGone = false

    private val gameUrl = "https://appassets.androidplatform.net/assets/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // 서비스 워커 스크립트와 SW 안에서 나가는 fetch 는 WebViewClient.shouldInterceptRequest 를
        // 거치지 않는다. 같은 AssetLoader 를 여기에도 달아 줘야 sw.js 등록이 조용히 실패하거나
        // 빈 캐시로 설치돼 흰 화면이 되는 일이 없다. (main.js 는 이 호스트에서 SW 를 등록하지 않고
        // 남은 등록을 해제한다 — 이 배선은 그 해제 경로가 결정적으로 돌게 하고, 나중에 다시 켤 자리다.)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)
        ) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                object : ServiceWorkerClientCompat() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                        assetLoader.shouldInterceptRequest(request.url)
                },
            )
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#12161D"))
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            isLongClickable = false           // 캔버스에서 텍스트 선택 팝업이 뜨지 않게

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true      // localStorage — 진행도 저장에 필요
                // 로컬 에셋만 쓰므로 파일/콘텐츠 접근은 모두 닫아둔다
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            }

            // 결제 브리지 — 자바스크립트에서 window.CatpawBilling으로 보인다 (Play Billing Library 9).
            // Play 에 연결이 안 되거나 Play Console 에 상품이 없으면 실패를 그대로 돌려준다(성공한 척하지 않는다).
            billing = BillingBridge(this@MainActivity, this)
            addJavascriptInterface(billing, "CatpawBilling")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                /** 외부 링크는 앱 안에서 열지 않는다 (게임엔 외부 링크가 없지만 안전장치로 둔다) */
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = request.url.host != "appassets.androidplatform.net"

                /**
                 * 렌더러가 죽었다 — 메모리가 모자란 기기에서 시스템이 렌더러 프로세스를 거둬 가면 온다.
                 * 기본값(false)이면 **앱 프로세스까지 같이 죽는다**: 크래시로 집계되고(Android vitals) 사용자는
                 * 앱이 튕긴 것으로 본다. 죽은 WebView 는 다시 못 쓰므로 떼어 내 버리고 액티비티를 새로 만든다.
                 * 진행도는 localStorage 에 있어서 타이틀부터 그대로 다시 뜬다(돌던 판은 이어하기 기록이 있으면 이어진다).
                 */
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    if (view !== webView || webViewGone) return true
                    webViewGone = true
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                    recreate()
                    return true
                }
            }
        }

        setContentView(webView)
        billing.connect()   // Play 결제 서비스에 붙는다 — 상품 목록은 웹 쪽(shop.js)이 configure() 로 준다
        goImmersive()
        handleBackButton()

        // 저장된 상태가 없거나 복원이 실패하면(null) 처음부터 연다 — 안 그러면 빈 화면만 남는다.
        // 렌더러가 죽어 새로 만든 경우에는 WebView 상태를 저장하지 않았으므로 여기서 처음부터 연다.
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(gameUrl)
        }
    }

    /** 상태바·내비게이션 바를 감춰 전체화면으로 만든다 (쓸어내리면 잠깐 나타난다) */
    private fun goImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    /**
     * 뒤로가기의 뜻은 **웹이 정한다** — window.CatpawApp.back() 이 'handled' | 'exit' 를 돌려준다.
     *
     * 전에는 WebView 히스토리(canGoBack/goBack)에 맡겼고, 둘이 틀려 있었다(W):
     *  1. 더 돌아갈 곳이 없으면 콜백을 끄고(isEnabled = false) 시스템에 넘겼다. Android 12 부터 루트 액티비티의
     *     뒤로가기는 앱을 끝내지 않고 **뒤로 보낸다** — 다시 열면 같은 액티비티인데 콜백은 꺼진 채였다.
     *     그 뒤로는 전투 중 뒤로가기가 일시정지 대신 앱을 내렸다.
     *  2. 웹은 화면을 옮길 때마다 히스토리를 쌓는다. 타이틀에 돌아와도 canGoBack() 이 참이라
     *     쌓인 만큼 눌러야 앱이 내려갔다(눌러도 반응이 없는 뒤로가기).
     * 웹 쪽 함수가 없으면(로딩 전) 예전처럼 히스토리로 간다. 콜백은 늘 켜 둔다 — 끄는 순간 1번이 다시 생긴다.
     */
    private fun handleBackButton() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webViewGone) {
                    leave()
                    return
                }
                webView.evaluateJavascript(BACK_JS) { result ->
                    when (result) {
                        "\"handled\"" -> Unit
                        "\"exit\"" -> leave()
                        else -> if (webView.canGoBack()) webView.goBack() else leave()
                    }
                }
            }
        })
    }

    /**
     * 타이틀에서의 뒤로가기. Android 12+ 의 기본 동작과 같게 앱을 **뒤로 보낸다** — 프로세스가 남아
     * 다시 열면 바로 뜨고, 진행도는 어차피 매번 저장된다. finish() 로 끝내면 다음에 로딩부터 다시 한다.
     */
    private fun leave() {
        moveTaskToBack(true)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!webViewGone) webView.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    override fun onPause() {
        // 웹에 먼저 알린다(전투 일시정지) — 타이머를 멈추기 전에 보내야 한다. visibilitychange 로도 오지만
        // WebView 버전마다 그 시점이 달라 두 길로 보낸다. 웹 쪽은 두 번 불려도 한 번만 멈춘다.
        if (!webViewGone) webView.evaluateJavascript(BACKGROUNDED_JS, null)
        super.onPause()
        if (!webViewGone) {
            webView.onPause()
            webView.pauseTimers()   // 백그라운드에서 게임 루프와 배경음을 멈춘다
        }
    }

    override fun onResume() {
        super.onResume()
        if (!webViewGone) {
            webView.resumeTimers()
            webView.onResume()
            // 돌아왔다 — 대기 중이던 결제의 승인·Play 에서 쓴 프로모션 코드를 웹이 조용히 다시 읽는다
            webView.evaluateJavascript(RESUMED_JS, null)
        }
    }

    override fun onDestroy() {
        billing.destroy()
        if (!webViewGone) webView.destroy()
        super.onDestroy()
    }

    private companion object {
        /** 웹이 뜻을 정한다. 함수가 없거나 던지면 'history' — 예전처럼 WebView 히스토리로 간다 */
        const val BACK_JS =
            "(function(){try{var a=window.CatpawApp;return a&&typeof a.back==='function'?String(a.back()):'history'}catch(e){return 'history'}})()"
        const val BACKGROUNDED_JS =
            "(function(){try{var a=window.CatpawApp;if(a&&typeof a.backgrounded==='function')a.backgrounded()}catch(e){}})()"
        const val RESUMED_JS =
            "(function(){try{var a=window.CatpawApp;if(a&&typeof a.resumed==='function')a.resumed()}catch(e){}})()"
    }
}
