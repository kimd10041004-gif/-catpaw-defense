package com.catpaw.defense

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * 게임을 담는 껍데기 액티비티.
 *
 * 왜 file:// 이 아니라 WebViewAssetLoader를 쓰는가:
 *   file:// 출처에서는 ES 모듈 import가 CORS로 막히고 localStorage와 서비스 워커도 불안정하다.
 *   AssetLoader가 assets를 https://appassets.androidplatform.net/ 로 서빙해 주면
 *   정상적인 보안 출처가 되어 모듈·저장·오프라인 캐시가 전부 그대로 동작한다.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    private val gameUrl = "https://appassets.androidplatform.net/assets/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

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

            // 결제 브리지 — 자바스크립트에서 window.CatpawBilling으로 보인다.
            // 아직 미설정 상태라 결제를 시도하면 실패를 그대로 돌려준다(성공한 척하지 않는다).
            addJavascriptInterface(BillingBridge(), "CatpawBilling")

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
            }
        }

        setContentView(webView)
        goImmersive()
        handleBackButton()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
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
     * 뒤로가기는 먼저 웹 쪽 히스토리를 되돌린다.
     * 게임 화면에서는 웹의 popstate 처리기가 일시정지 메뉴를 띄우고,
     * 더 돌아갈 곳이 없을 때만 앱이 종료된다.
     */
    private fun handleBackButton() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        webView.pauseTimers()   // 백그라운드에서 게임 루프와 배경음을 멈춘다
    }

    override fun onResume() {
        super.onResume()
        webView.resumeTimers()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
