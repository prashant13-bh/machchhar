import './style.css';
import { GameEngine } from './engine/GameEngine';
import { adManager } from './services/AdManager';
import { audioEngine } from './services/AudioEngine';
import { nativeBridge } from './services/NativeBridge';
import { UIController } from './ui/Screens';

const BOOT_TIPS = [
  'Tip: Blast DJ Singers mid-song for an instant +300 MIC DROP!',
  'Tip: Shoot diving mosquitoes right before Uncle wakes for +50 CLUTCH SAVE!',
  'Tip: Chain 5 hits in a row to ignite FEVER MODE and earn bonus coins!',
  'Tip: Evasive Ninjas dodge red dots—lead your shot slightly ahead!',
];

async function runBootLoader(work: (setProgress: (pct: number, label: string) => void) => Promise<void>): Promise<void> {
  const loader = document.getElementById('app-loader');
  const fill = document.getElementById('loader-bar-fill');
  const pctEl = document.getElementById('loader-percent');
  const statusEl = document.getElementById('loader-status');
  const tipEl = document.getElementById('loader-tip');

  if (tipEl) {
    tipEl.textContent = BOOT_TIPS[Math.floor(Math.random() * BOOT_TIPS.length)];
  }

  const setProgress = (pct: number, label: string): void => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = `${clamped}%`;
    if (pctEl) pctEl.textContent = `${clamped}%`;
    if (statusEl) statusEl.textContent = label;
  };

  const startedAt = performance.now();
  setProgress(12, 'Preparing midnight room...');
  await work(setProgress);
  setProgress(100, 'Ready to guard Uncle!');

  // Ensure a crisp, intentional minimum display so launch feels cohesive without sluggishness
  const elapsed = performance.now() - startedAt;
  const minDisplayMs = 450;
  if (elapsed < minDisplayMs) {
    await new Promise((r) => setTimeout(r, minDisplayMs - elapsed));
  }

  if (loader) {
    loader.classList.add('is-hidden');
    window.setTimeout(() => loader.remove(), 340);
  }
}

async function bootstrap(): Promise<void> {
  if (nativeBridge.isNative) {
    document.body.classList.add('is-native');
  }

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui-overlay');

  if (!canvas || !overlay) {
    throw new Error('Missing #game-canvas or #ui-overlay root elements');
  }

  let ui!: UIController;
  let engine!: GameEngine;

  await runBootLoader(async (setProgress) => {
    await audioEngine.preloadAssets((ratio) => {
      setProgress(15 + ratio * 65, ratio < 1 ? 'Loading soundboard & buzzers...' : 'Initializing AdMob...');
    });
    await adManager.init();
    setProgress(92, 'Setting up bedroom stage...');

    engine = new GameEngine(canvas, {
      onPhaseChange: (phase, summary) => ui.handlePhaseChange(phase, summary),
      onHudUpdate: (hud) => ui.updateHud(hud),
      onAchievementUnlock: (badge) => ui.showAchievementToast(badge),
    });

    ui = new UIController(overlay, engine);
  });

  // Pause safely if user switches tabs / minimizes app
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.getPhase() === 'playing') {
      engine.pause();
    }
  });
}

void bootstrap();
