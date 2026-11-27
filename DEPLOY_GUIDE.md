# Sleep Swatter — Web & Google Play Deployment Guide

This project uses **one TypeScript + HTML5 Canvas codebase** for both **Web** and **Android (Google Play Console)** via Capacitor + AdMob.

---

## 1. Local Play & Web Build

```bash
npm install
npm run dev        # Run locally at http://localhost:5173
npm run build      # Generates static production bundle in ./dist
```

Deploy `./dist` directly to **Cloudflare Pages**, **Netlify**, **Vercel**, or any static web host.

### Optional Web Ads (AdSense / H5 Games Ads)
1. Open `src/config/ads.ts`.
2. Fill in `AD_CONFIG.web.adsenseClientId` and `AD_CONFIG.web.bannerSlotId` (or load Google H5 Games Ads script in `index.html`).

---

## 2. Google Play Console (Android + AdMob)

### Step A: Add Your Real AdMob IDs
1. Create an App and 3 Ad Units (**Banner**, **Interstitial**, **Rewarded**) in [Google AdMob](https://admob.google.com).
2. In `src/config/ads.ts`:
   - Paste your real unit IDs into `AD_CONFIG.androidProdIds`.
   - Set `AD_CONFIG.useTestAds = false`.
3. In `capacitor.config.ts`, set `plugins.AdMob.initializeForTesting = false`.
4. In `android/app/src/main/AndroidManifest.xml`, replace the test `APPLICATION_ID` meta-data value (`ca-app-pub-3940256099942544~3347511713`) with your real **AdMob App ID**:
   ```xml
   <meta-data
       android:name="com.google.android.gms.ads.APPLICATION_ID"
       android:value="ca-app-pub-YOUR_REAL_APP_ID" />
   ```

### Step B: Sync & Build Signed App Bundle (`.aab`)
```bash
npm run cap:sync
npm run cap:open
```
Inside **Android Studio**:
1. Wait for Gradle sync to finish.
2. Go to **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
3. Create/select your upload keystore, choose **release**, and upload the resulting `.aab` file to **Google Play Console**.
