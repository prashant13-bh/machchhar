package com.mct.machchhar

import android.app.Application
import com.google.android.gms.games.PlayGamesSdk

class MachchharApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        PlayGamesSdk.initialize(this)
    }
}
