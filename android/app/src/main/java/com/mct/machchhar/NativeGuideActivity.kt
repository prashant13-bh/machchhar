package com.mct.machchhar

import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat

class NativeGuideActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_guide)

        window.statusBarColor = 0xFF0A1022.toInt()
        window.navigationBarColor = 0xFF0A1022.toInt()
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        findViewById<Button>(R.id.btnBackGuide).setOnClickListener { finish() }
        findViewById<Button>(R.id.btnPlayNowGuide).setOnClickListener { finish() }
    }
}
