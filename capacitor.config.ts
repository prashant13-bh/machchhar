import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sleepswatter.game',
  appName: 'Machchhar: Raat ka Daaku',
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
