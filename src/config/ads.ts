export interface AdUnitSet {
  banner: string;
  interstitial: string;
  rewarded: string;
}

export const AD_CONFIG = {
  /**
   * IMPORTANT: Keep `useTestAds: true` during development & testing to avoid
   * Google AdMob policy violations. Set to `false` only after replacing
   * `androidProdIds` below with your real AdMob Unit IDs from admob.google.com.
   */
  useTestAds: true,

  /** Google's official AdMob test IDs */
  androidTestIds: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  } satisfies AdUnitSet,

  /** Replace these with your live AdMob Unit IDs before Play Store release */
  androidProdIds: {
    banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/1111111111',
    interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/2222222222',
    rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/3333333333',
  } satisfies AdUnitSet,

  /** Minimum milliseconds between interstitial ads so players are never spammed */
  interstitialCooldownMs: 60_000,

  /** Show interstitial between levels every N completed levels */
  interstitialLevelInterval: 2,

  /** Web AdSense / H5 Games Ads configuration (optional for web deployment) */
  web: {
    enabled: true,
    adsenseClientId: '', // e.g. 'ca-pub-XXXXXXXXXXXXXXXX'
    bannerSlotId: '', // e.g. '1234567890'
    simulateRewardedInDemo: true,
  },
} as const;

export function getActiveAndroidAdIds(): AdUnitSet {
  return AD_CONFIG.useTestAds ? AD_CONFIG.androidTestIds : AD_CONFIG.androidProdIds;
}
