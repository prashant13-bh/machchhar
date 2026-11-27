package com.mct.machchhar

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        const val PREFS_NAME = "machchhar_native_prefs"
        const val KEY_HAPTICS = "haptics_enabled"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyImmersiveMode()

        // Tune Capacitor WebView for smooth 60fps canvas rendering & fast native JS bridge
        bridge?.webView?.let { webView ->
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
            webView.overScrollMode = View.OVER_SCROLL_NEVER
            webView.isVerticalScrollBarEnabled = false
            webView.isHorizontalScrollBarEnabled = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
            }
            webView.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                textZoom = 100
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            webView.addJavascriptInterface(MachchharNativeBridge(), "MachchharAndroid")
        }

        // Route Android hardware/gesture Back press cleanly through the game state machine
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView != null) {
                    webView.post {
                        webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('machchhar:back'));",
                            null
                        )
                    }
                } else {
                    finish()
                }
            }
        })
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applyImmersiveMode()
        }
    }

    private fun applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun triggerPulse(durationMs: Long, amplitude: Int) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_HAPTICS, true)) return

        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

        if (vibrator?.hasVibrator() != true) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }

    inner class MachchharNativeBridge {

        @JavascriptInterface
        fun triggerHaptic(kind: String) {
            when (kind) {
                "shot" -> triggerPulse(14L, 90)
                "hit" -> triggerPulse(22L, 145)
                "hurt" -> triggerPulse(55L, 220)
                "clear" -> triggerPulse(40L, 180)
                else -> triggerPulse(10L, 70)
            }
        }

        @JavascriptInterface
        fun isHapticsEnabled(): Boolean {
            return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_HAPTICS, true)
        }

        @JavascriptInterface
        fun openNativeGuide() {
            runOnUiThread {
                startActivity(Intent(this@MainActivity, NativeGuideActivity::class.java))
            }
        }

        @JavascriptInterface
        fun openNativeSettings() {
            runOnUiThread {
                startActivity(Intent(this@MainActivity, NativeSettingsActivity::class.java))
            }
        }

        @JavascriptInterface
        fun shareScore(score: Int, kills: Int) {
            runOnUiThread {
                val shareText =
                    "I blasted $kills mosquitoes and scored $score in Machchhar: Raat ka Daaku! Can you protect Uncle's sleep? https://play.google.com/store/apps/details?id=$packageName"
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, "Machchhar: Raat ka Daaku")
                    putExtra(Intent.EXTRA_TEXT, shareText)
                }
                startActivity(Intent.createChooser(intent, "Share your Night Score"))
            }
        }

        @JavascriptInterface
        fun exitApp() {
            runOnUiThread {
                finish()
            }
        }
    }
}
