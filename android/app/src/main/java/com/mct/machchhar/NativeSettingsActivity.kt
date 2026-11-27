package com.mct.machchhar

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.view.WindowInsetsControllerCompat

class NativeSettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_settings)

        window.statusBarColor = 0xFF0A1022.toInt()
        window.navigationBarColor = 0xFF0A1022.toInt()
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val switchHaptics = findViewById<SwitchCompat>(R.id.switchHaptics)
        switchHaptics.isChecked = prefs.getBoolean(MainActivity.KEY_HAPTICS, true)
        switchHaptics.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean(MainActivity.KEY_HAPTICS, isChecked).apply()
        }

        val pkgInfo = runCatching { packageManager.getPackageInfo(packageName, 0) }.getOrNull()
        val versionName = pkgInfo?.versionName ?: "1.0.2"
        findViewById<TextView>(R.id.tvAppMeta).text =
            "Machchhar: Raat ka Daaku · v$versionName\nPackage: $packageName"

        findViewById<Button>(R.id.btnBackSettings).setOnClickListener { finish() }

        findViewById<Button>(R.id.btnShareApp).setOnClickListener {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, "Machchhar: Raat ka Daaku")
                putExtra(
                    Intent.EXTRA_TEXT,
                    "Play Machchhar: Raat ka Daaku — protect Uncle's sleep from singing & dodging mosquitoes! https://play.google.com/store/apps/details?id=$packageName"
                )
            }
            startActivity(Intent.createChooser(intent, "Share Machchhar: Raat ka Daaku"))
        }

        findViewById<Button>(R.id.btnEmailSupport).setOnClickListener {
            val mailIntent = Intent(Intent.ACTION_SENDTO).apply {
                data = Uri.parse("mailto:yuvasamrajyaofficial@gmail.com")
                putExtra(Intent.EXTRA_SUBJECT, "Support: Machchhar: Raat ka Daaku ($packageName)")
            }
            runCatching { startActivity(mailIntent) }
        }

        findViewById<Button>(R.id.btnOpenGuideFromSettings).setOnClickListener {
            startActivity(Intent(this, NativeGuideActivity::class.java))
        }
    }
}
