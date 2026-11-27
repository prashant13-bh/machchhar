# Preserve WebView @JavascriptInterface bridge methods (MachchharNativeBridge)
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.mct.machchhar.MainActivity$MachchharNativeBridge {
    *;
}

# Preserve Capacitor plugin annotations & AdMob reflection entry points
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    *;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class com.getcapacitor.community.admob.** {
    *;
}

# Preserve line numbers for readable Play Console crash traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
