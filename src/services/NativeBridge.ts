import { Capacitor } from '@capacitor/core';

export type HapticKind = 'shot' | 'hit' | 'hurt' | 'clear' | 'ui';

interface MachchharAndroidInterface {
  triggerHaptic?: (kind: string) => void;
  openNativeGuide?: () => void;
  openNativeSettings?: () => void;
  shareScore?: (score: number, kills: number) => void;
  exitApp?: () => void;
  isHapticsEnabled?: () => boolean;
}

declare global {
  interface Window {
    MachchharAndroid?: MachchharAndroidInterface;
  }
}

class NativeBridgeService {
  readonly isNative = Capacitor.isNativePlatform();

  hasAndroidBridge(): boolean {
    return typeof window !== 'undefined' && Boolean(window.MachchharAndroid);
  }

  haptic(kind: HapticKind): void {
    const bridge = window.MachchharAndroid;
    if (bridge?.triggerHaptic) {
      try {
        bridge.triggerHaptic(kind);
      } catch {
        // Ignore bridge invocation errors
      }
      return;
    }

    if (this.isNative && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const durations: Record<HapticKind, number> = {
        ui: 10,
        shot: 14,
        hit: 22,
        hurt: 45,
        clear: 35,
      };
      navigator.vibrate(durations[kind]);
    }
  }

  openNativeGuide(): boolean {
    const bridge = window.MachchharAndroid;
    if (bridge?.openNativeGuide) {
      bridge.openNativeGuide();
      return true;
    }
    return false;
  }

  openNativeSettings(): boolean {
    const bridge = window.MachchharAndroid;
    if (bridge?.openNativeSettings) {
      bridge.openNativeSettings();
      return true;
    }
    return false;
  }

  shareScore(score: number, kills: number): boolean {
    const bridge = window.MachchharAndroid;
    if (bridge?.shareScore) {
      bridge.shareScore(score, kills);
      return true;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({
        title: 'Machchhar: Raat ka Daaku',
        text: `I blasted ${kills} mosquitoes and scored ${score.toLocaleString()} in Machchhar: Raat ka Daaku! Can you beat my night streak?`,
        url: window.location.origin,
      });
      return true;
    }
    return false;
  }

  exitApp(): void {
    window.MachchharAndroid?.exitApp?.();
  }
}

export const nativeBridge = new NativeBridgeService();
