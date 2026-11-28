export const FEVER_COMBO_THRESHOLD = 5;
export const CLUTCH_SAVE_RADIUS = 125;
export const CLUTCH_SAVE_BONUS = 50;

/**
 * Escalates score multiplier every 3 consecutive hits up to x5.
 * Creates an exhilarating risk/reward flow state when chaining shots without missing.
 */
export function computeComboMultiplier(combo: number): number {
  if (combo <= 1) return 1;
  return Math.min(5, 1 + Math.floor((combo - 1) / 3));
}

/** True once the player reaches the Fever combo threshold (5+ hits). */
export function isFeverCombo(combo: number): boolean {
  return combo >= FEVER_COMBO_THRESHOLD;
}

/**
 * Detects a "Clutch Save" — blasting a diving mosquito moments before it wakes Uncle.
 * Near-miss saves trigger bonus dopamine & reward skilled reaction play.
 */
export function isClutchSave(
  state: 'flying' | 'diving' | 'stunned',
  mx: number,
  my: number,
  targetX: number,
  targetY: number
): boolean {
  if (state !== 'diving') return false;
  return Math.hypot(mx - targetX, my - targetY) <= CLUTCH_SAVE_RADIUS;
}

/** Calculates 1-3 star mastery rating from remaining sleep hearts. */
export function computeStarRating(heartsRemaining: number, maxHearts: number): number {
  if (heartsRemaining >= maxHearts) return 3;
  if (heartsRemaining >= 2) return 2;
  return 1;
}

/** Calculates coin payout for clearing a Campaign Night. */
export function computeCampaignCoins(kills: number, stars: number): number {
  return Math.max(8, Math.round(kills * 1.5) + stars * 10);
}

/** Scales daily login reward from 20 coins (Day 1) up to 50 coins (Day 5+). */
export function computeDailyReward(streakDay: number): number {
  const clamped = Math.max(1, streakDay);
  if (clamped === 1) return 20;
  if (clamped === 2) return 25;
  if (clamped === 3) return 30;
  if (clamped === 4) return 40;
  return 50;
}

/** Returns local calendar YYYY-MM-DD key for daily streak tracking. */
export function getDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns yesterday's local calendar YYYY-MM-DD key relative to the provided date. */
export function getYesterdayDateKey(date: Date = new Date()): string {
  const prev = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return getDateKey(prev);
}

/**
 * Platform-aware default theme:
 * - Desktop web (>= 900px, non-native) defaults to Light Arcade Studio theme.
 * - Mobile web & native Android default to Dark Night Mode matching the splash & bedroom.
 */
export function resolveDefaultTheme(opts?: {
  isNative?: boolean;
  viewportWidth?: number;
}): 'light' | 'dark' {
  if (opts?.isNative) return 'dark';
  if (typeof opts?.viewportWidth === 'number' && opts.viewportWidth >= 900) {
    return 'light';
  }
  return 'dark';
}
