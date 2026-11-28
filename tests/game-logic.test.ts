import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser-global polyfills so GameEngine & StorageService can run cleanly in Node
function installBrowserGlobals() {
  const store = new Map<string, string>();
  const mockLocalStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) ?? null) : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
  });

  const noop = () => {};
  if (typeof globalThis.window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      value: {
        addEventListener: noop,
        removeEventListener: noop,
        AudioContext: undefined,
      },
      configurable: true,
    });
  }
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: () => 1,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      value: noop,
      configurable: true,
    });
  }
  return mockLocalStorage;
}

const memStorage = installBrowserGlobals();

import {
  CLUTCH_SAVE_BONUS,
  computeCampaignCoins,
  computeComboMultiplier,
  computeDailyReward,
  computeStarRating,
  getDateKey,
  getYesterdayDateKey,
  isClutchSave,
  isFeverCombo,
  resolveDefaultTheme,
} from '../src/engine/GameRules';
import { getLevelConfig, TOTAL_CAMPAIGN_LEVELS } from '../src/config/levels';
import { MAX_STAMINA, STAMINA_REGEN_MS, StorageService } from '../src/services/Storage';
import { GameEngine } from '../src/engine/GameEngine';

function createMockCanvas() {
  const grad = { addColorStop: () => {} };
  const ctx: Record<string, unknown> = {
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    strokeText: () => {},
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'round',
    font: '12px sans-serif',
    textAlign: 'center',
    textBaseline: 'middle',
  };

  return {
    width: 480,
    height: 800,
    clientWidth: 480,
    clientHeight: 800,
    parentElement: { clientWidth: 480, clientHeight: 800 },
    getContext: () => ctx,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }),
  } as unknown as HTMLCanvasElement;
}

test('GameRules: combo multiplier, fever threshold, and clutch save detection', () => {
  assert.equal(computeComboMultiplier(0), 1);
  assert.equal(computeComboMultiplier(1), 1);
  assert.equal(computeComboMultiplier(3), 1);
  assert.equal(computeComboMultiplier(4), 2);
  assert.equal(computeComboMultiplier(7), 3);
  assert.equal(computeComboMultiplier(13), 5);
  assert.equal(computeComboMultiplier(40), 5);

  assert.equal(isFeverCombo(4), false);
  assert.equal(isFeverCombo(5), true);
  assert.equal(isFeverCombo(10), true);

  assert.equal(isClutchSave('flying', 210, 560, 210, 562), false);
  assert.equal(isClutchSave('stunned', 210, 560, 210, 562), false);
  assert.equal(isClutchSave('diving', 210, 300, 210, 562), false);
  assert.equal(isClutchSave('diving', 210, 480, 210, 562), true);
  assert.equal(CLUTCH_SAVE_BONUS, 50);
});

test('GameRules: stars, campaign coins, daily rewards, and date keys', () => {
  assert.equal(computeStarRating(4, 4), 3);
  assert.equal(computeStarRating(2, 4), 2);
  assert.equal(computeStarRating(1, 4), 1);
  assert.equal(computeCampaignCoins(10, 3), 45);

  assert.equal(computeDailyReward(1), 20);
  assert.equal(computeDailyReward(2), 25);
  assert.equal(computeDailyReward(3), 30);
  assert.equal(computeDailyReward(4), 40);
  assert.equal(computeDailyReward(5), 50);
  assert.equal(computeDailyReward(12), 50);

  assert.equal(getDateKey(new Date(2026, 2, 1)), '2026-03-01');
  assert.equal(getYesterdayDateKey(new Date(2026, 2, 1)), '2026-02-28');
  assert.equal(getYesterdayDateKey(new Date(2026, 0, 1)), '2025-12-31');

  assert.equal(resolveDefaultTheme({ isNative: true, viewportWidth: 1280 }), 'dark');
  assert.equal(resolveDefaultTheme({ isNative: false, viewportWidth: 412 }), 'dark');
  assert.equal(resolveDefaultTheme({ isNative: false, viewportWidth: 1280 }), 'light');
});

test('Levels: campaign pacing, boss cadence, and endless wave generation', () => {
  assert.equal(TOTAL_CAMPAIGN_LEVELS, 10);
  for (let i = 1; i <= TOTAL_CAMPAIGN_LEVELS; i++) {
    const cfg = getLevelConfig(i);
    assert.ok(cfg.targetKills > 0, `Night ${i} targetKills positive`);
    assert.ok(cfg.maxConcurrent >= 3, `Night ${i} maxConcurrent >= 3`);
    if (i % 5 === 0) {
      assert.equal(cfg.isBossLevel, true);
      assert.equal(cfg.role, 'boss');
    } else {
      assert.equal(cfg.isBossLevel, false);
    }
  }
  const endlessBoss = getLevelConfig(15);
  assert.equal(endlessBoss.isBossLevel, true);
  assert.ok(endlessBoss.targetKills > getLevelConfig(10).targetKills);
});

test('StorageService: defaults to dark theme, persists toggle, daily streak, and DDA', () => {
  memStorage.clear();
  const s = new StorageService();
  assert.equal(s.getTheme(), 'dark');
  assert.equal(s.toggleTheme(), 'light');

  const reloaded = new StorageService();
  assert.equal(reloaded.getTheme(), 'light');
  assert.equal(reloaded.toggleTheme(), 'dark');

  // Daily bonus progression & idempotency
  const day1 = new Date(2026, 10, 28, 9, 0);
  const day2 = new Date(2026, 10, 29, 9, 0);
  const day4 = new Date(2026, 11, 1, 9, 0);

  const claim1 = reloaded.claimDailyBonus(day1);
  assert.deepEqual(claim1, { claimed: true, streak: 1, coins: 20 });
  const dup = reloaded.claimDailyBonus(day1);
  assert.equal(dup.claimed, false);

  const claim2 = reloaded.claimDailyBonus(day2);
  assert.deepEqual(claim2, { claimed: true, streak: 2, coins: 25 });

  // Skipping day 3 resets streak back to Day 1
  const claim4 = reloaded.claimDailyBonus(day4);
  assert.deepEqual(claim4, { claimed: true, streak: 1, coins: 20 });

  // DDA Mercy & Spicy modes
  assert.equal(reloaded.computeDdaModifiers(2).statusLabel, 'Flow');
  reloaded.consumeStaminaOnLoss(2, 50);
  reloaded.consumeStaminaOnLoss(2, 55);
  assert.equal(reloaded.computeDdaModifiers(2).statusLabel, 'Mercy');
  assert.equal(reloaded.getStaminaInfo().stamina, MAX_STAMINA - 2);

  // Stamina regeneration
  reloaded.getData().lastStaminaUpdatedAt = Date.now() - STAMINA_REGEN_MS * 2 - 500;
  assert.equal(reloaded.getStaminaInfo().stamina, MAX_STAMINA);

  // Win streak ramps to Spicy!
  reloaded.recordLevelWin(1, 2500, 3, 8, 92);
  reloaded.recordLevelWin(2, 4100, 3, 12, 90);
  reloaded.recordLevelWin(3, 6200, 3, 16, 88);
  assert.equal(reloaded.computeDdaModifiers(4).statusLabel, 'Spicy!');

  // Goal-gradient hint & achievement coins
  assert.match(reloaded.getNextGoalHint(), /Next Trophy/);
  const badge = reloaded.unlockAchievement('first_swat');
  assert.ok(badge);
  assert.equal(reloaded.unlockAchievement('first_swat'), null);
});

test('GameEngine: clip reload, Zap infinite fire, and pause/resume lifecycle', () => {
  memStorage.clear();
  let lastPhase = 'menu';
  let lastHud: { ammo: number; reloadMs: number; racketMs: number } | null = null;

  const canvas = createMockCanvas();
  const engine = new GameEngine(canvas, {
    onPhaseChange: (phase) => {
      lastPhase = phase;
    },
    onHudUpdate: (hud) => {
      lastHud = { ammo: hud.ammo, reloadMs: hud.reloadMs, racketMs: hud.racketMs };
    },
  });

  engine.startCampaignLevel(1);
  assert.equal(engine.getPhase(), 'playing');
  assert.equal(lastPhase, 'playing');
  assert.equal(lastHud?.ammo, 6);

  // Access internal shot firing through canvas pointerdown mouse event
  const fire = () => {
    (engine as unknown as { handlePointerDown: (e: unknown) => void }).handlePointerDown({
      pointerType: 'mouse',
      button: 0,
      clientX: 240,
      clientY: 240,
    });
  };

  for (let i = 0; i < 6; i++) fire();
  assert.equal(lastHud?.ammo, 0);
  assert.ok((lastHud?.reloadMs ?? 0) > 0, '6th shot triggers reload timer');

  engine.pause();
  assert.equal(engine.getPhase(), 'paused');
  engine.resume();
  assert.equal(engine.getPhase(), 'playing');

  // Starter Zap Ammo allows shooting without reload gating
  engine.startCampaignLevel(2, { starterPowerUp: 'racket' });
  assert.ok((lastHud?.racketMs ?? 0) > 0);
  for (let i = 0; i < 8; i++) fire();
  assert.equal(lastHud?.reloadMs, 0);

  engine.returnToMenu();
  assert.equal(engine.getPhase(), 'menu');
  engine.destroy();
});
