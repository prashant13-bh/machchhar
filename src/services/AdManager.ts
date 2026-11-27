import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { AD_CONFIG, getActiveAndroidAdIds } from '../config/ads';

/**
 * Unified AdManager supporting Native Android (AdMob) & Web.
 * Protects Day-1 retention by skipping interstitials on Night 1.
 */
class AdManager {
  private initialized = false;
  private bannerVisible = false;
  private lastInterstitialAt = 0;
  private levelsSinceInterstitial = 0;
  private readonly isNative = Capacitor.isNativePlatform();

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (this.isNative) {
      try {
        await AdMob.initialize({
          initializeForTesting: AD_CONFIG.useTestAds,
        });
      } catch (err) {
        console.warn('[AdManager] Native AdMob init skipped:', err);
      }
    }
  }

  async showBanner(): Promise<void> {
    if (this.bannerVisible) return;
    this.bannerVisible = true;

    if (this.isNative) {
      try {
        const ids = getActiveAndroidAdIds();
        await AdMob.showBanner({
          adId: ids.banner,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: AD_CONFIG.useTestAds,
        });
      } catch (err) {
        console.warn('[AdManager] Native showBanner failed:', err);
      }
      return;
    }

    const slot = document.getElementById('web-banner-slot');
    if (slot && AD_CONFIG.web.enabled) {
      slot.classList.remove('hidden');
      if (!slot.dataset.rendered) {
        slot.dataset.rendered = '1';
        slot.innerHTML = AD_CONFIG.web.adsenseClientId
          ? `<ins class="adsbygoogle" style="display:inline-block;width:320px;height:50px" data-ad-client="${AD_CONFIG.web.adsenseClientId}" data-ad-slot="${AD_CONFIG.web.bannerSlotId}"></ins>`
          : `<div class="web-banner-placeholder"><span>AD SLOT</span><small>Ready for AdSense / AdMob Banner (${AD_CONFIG.useTestAds ? 'Test Mode' : 'Live'})</small></div>`;
      }
    }
  }

  async hideBanner(): Promise<void> {
    if (!this.bannerVisible) return;
    this.bannerVisible = false;

    if (this.isNative) {
      try {
        await AdMob.hideBanner();
      } catch {
        // Ignore if banner was not mounted
      }
      return;
    }

    const slot = document.getElementById('web-banner-slot');
    if (slot) {
      slot.classList.add('hidden');
    }
  }

  async maybeShowInterstitial(trigger: 'level_clear' | 'game_over', levelId = 2): Promise<void> {
    // Protect Day-1 retention: never interrupt Night 1 players with interstitials
    if (levelId <= 1) return;

    if (trigger === 'level_clear') {
      this.levelsSinceInterstitial += 1;
      if (this.levelsSinceInterstitial < AD_CONFIG.interstitialLevelInterval) {
        return;
      }
    }

    const now = Date.now();
    if (now - this.lastInterstitialAt < AD_CONFIG.interstitialCooldownMs) {
      return;
    }

    this.lastInterstitialAt = now;
    this.levelsSinceInterstitial = 0;

    if (this.isNative) {
      try {
        const ids = getActiveAndroidAdIds();
        await AdMob.prepareInterstitial({
          adId: ids.interstitial,
          isTesting: AD_CONFIG.useTestAds,
        });
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish);
          void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish);
          void AdMob.showInterstitial().catch(finish);
          setTimeout(finish, 8000);
        });
      } catch (err) {
        console.warn('[AdManager] Interstitial skipped:', err);
      }
      return;
    }

    const w = window as unknown as { adBreak?: (opts: Record<string, unknown>) => void };
    if (typeof w.adBreak === 'function') {
      await new Promise<void>((resolve) => {
        w.adBreak?.({
          type: 'next',
          name: trigger,
          adBreakDone: () => resolve(),
        });
        setTimeout(resolve, 4000);
      });
    }
  }

  async showRewardedAd(rewardLabel: string): Promise<boolean> {
    if (this.isNative) {
      try {
        const ids = getActiveAndroidAdIds();
        await AdMob.prepareRewardVideoAd({
          adId: ids.rewarded,
          isTesting: AD_CONFIG.useTestAds,
        });

        return await new Promise<boolean>((resolve) => {
          let earned = false;
          let settled = false;
          const finish = (ok: boolean) => {
            if (!settled) {
              settled = true;
              resolve(ok);
            }
          };

          void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            earned = true;
          });
          void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(earned));
          void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false));
          void AdMob.showRewardVideoAd().catch(() => finish(false));
        });
      } catch (err) {
        console.warn('[AdManager] Rewarded ad failed:', err);
        return false;
      }
    }

    const w = window as unknown as { adBreak?: (opts: Record<string, unknown>) => void };
    if (typeof w.adBreak === 'function') {
      return await new Promise<boolean>((resolve) => {
        let rewarded = false;
        w.adBreak?.({
          type: 'reward',
          name: rewardLabel,
          beforeReward: (showAdFn: () => void) => showAdFn(),
          adViewed: () => {
            rewarded = true;
          },
          adDismissed: () => resolve(false),
          adBreakDone: () => resolve(rewarded),
        });
      });
    }

    if (!AD_CONFIG.web.simulateRewardedInDemo) {
      return false;
    }

    return await this.runWebRewardedPreview(rewardLabel);
  }

  private runWebRewardedPreview(rewardLabel: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'ad-preview-backdrop';
      modal.innerHTML = `
        <div class="ad-preview-card">
          <div class="ad-preview-badge">REWARDED AD PREVIEW</div>
          <h3>Earning: ${rewardLabel}</h3>
          <p>In your live Android / H5 build, a real AdMob / AdSense video plays here.</p>
          <div class="ad-preview-timer">Reward unlocks in <strong id="ad-sec">3</strong>s...</div>
          <button id="ad-cancel-btn" class="btn-secondary">Cancel</button>
        </div>
      `;
      document.body.appendChild(modal);

      let seconds = 3;
      let done = false;
      const cleanup = (result: boolean) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        modal.remove();
        resolve(result);
      };

      const secEl = modal.querySelector('#ad-sec');
      const cancelBtn = modal.querySelector('#ad-cancel-btn');
      cancelBtn?.addEventListener('click', () => cleanup(false));

      const timer = setInterval(() => {
        seconds -= 1;
        if (secEl) secEl.textContent = String(Math.max(0, seconds));
        if (seconds <= 0) {
          cleanup(true);
        }
      }, 1000);
    });
  }
}

export const adManager = new AdManager();
