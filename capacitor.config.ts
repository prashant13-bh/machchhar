import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sleepswatter.game',
  appName: 'Sleep Swatter',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    AdMob: {
      initializeForTesting: true,
    },
  },
};

export default config;
