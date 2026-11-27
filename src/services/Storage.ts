export const MAX_STAMINA = 5;
export const STAMINA_REGEN_MS = 10 * 60 * 1000; // 10 minutes per stamina bolt
export const STAMINA_REFILL_COST = 50;

export interface DdaModifiers {
  speedScale: number;
  spawnScale: number;
  dodgeBonus: number;
  powerUpBonus: number;
  statusLabel: 'Flow' | 'Spicy!' | 'Mercy';
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_swat', icon: '🦟', title: 'First Swat', desc: 'Blast your first mosquito' },
  { id: 'combo_8', icon: '🔥', title: 'Fever Hands', desc: 'Reach an 8x hit combo' },
  { id: 'singer_5', icon: '🎧', title: 'Mic Dropper', desc: 'Silence 5 DJ Singing mosquitoes' },
  { id: 'sharpshooter', icon: '🎯', title: 'Sniper Uncle', desc: 'Clear a night with 85%+ accuracy' },
  { id: 'king_slayer', icon: '👑', title: 'King Slayer', desc: 'Defeat a Giant King Mosquito' },
  { id: 'endless_25', icon: '🌙', title: 'Night Watchman', desc: 'Blast 25+ in Endless Night' },
];

export interface SaveData {
  highestUnlockedLevel: number;
  starsByLevel: Record<number, number>;
  failsByLevel: Record<number, number>;
  highScore: number;
  bestEndlessScore: number;
  totalSwatted: number;
  singersSilenced: number;
  bossesDefeated: number;
  coins: number;
  muted: boolean;
  stamina: number;
  lastStaminaUpdatedAt: number;
  winStreak: number;
  lastAccuracy: number;
  achievements: string[];
  theme: 'light' | 'dark';
}

const STORAGE_KEY = 'sleep_swatter_save_v2';

const DEFAULT_SAVE: SaveData = {
  highestUnlockedLevel: 1,
  starsByLevel: {},
  failsByLevel: {},
  highScore: 0,
  bestEndlessScore: 0,
  totalSwatted: 0,
  singersSilenced: 0,
  bossesDefeated: 0,
  coins: 40, // Starter coins so players experience the Booster Shop early
  muted: false,
  stamina: MAX_STAMINA,
  lastStaminaUpdatedAt: Date.now(),
  winStreak: 0,
  lastAccuracy: 70,
  achievements: [],
  theme: 'light',
};

class StorageService {
  private data: SaveData;

  constructor() {
    this.data = this.load();
    this.syncStaminaRegen();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('sleep_swatter_save_v1');
      if (!raw) return { ...DEFAULT_SAVE, starsByLevel: {}, failsByLevel: {}, achievements: [] };
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        ...DEFAULT_SAVE,
        ...parsed,
        starsByLevel: { ...(parsed.starsByLevel ?? {}) },
        failsByLevel: { ...(parsed.failsByLevel ?? {}) },
        achievements: Array.isArray(parsed.achievements) ? [...parsed.achievements] : [],
      };
    } catch {
      return { ...DEFAULT_SAVE, starsByLevel: {}, failsByLevel: {}, achievements: [] };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota errors
    }
  }

  /** Regenerates 1 stamina bolt every 10 minutes when below MAX_STAMINA */
  syncStaminaRegen(): void {
    if (this.data.stamina >= MAX_STAMINA) {
      this.data.stamina = MAX_STAMINA;
      this.data.lastStaminaUpdatedAt = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = now - this.data.lastStaminaUpdatedAt;
    if (elapsed >= STAMINA_REGEN_MS) {
      const gained = Math.floor(elapsed / STAMINA_REGEN_MS);
      this.data.stamina = Math.min(MAX_STAMINA, this.data.stamina + gained);
      if (this.data.stamina >= MAX_STAMINA) {
        this.data.lastStaminaUpdatedAt = now;
      } else {
        this.data.lastStaminaUpdatedAt += gained * STAMINA_REGEN_MS;
      }
      this.save();
    }
  }

  getData(): SaveData {
    this.syncStaminaRegen();
    return this.data;
  }

  getStaminaInfo(): { stamina: number; max: number; msUntilNext: number } {
    this.syncStaminaRegen();
    if (this.data.stamina >= MAX_STAMINA) {
      return { stamina: MAX_STAMINA, max: MAX_STAMINA, msUntilNext: 0 };
    }
    const elapsed = Date.now() - this.data.lastStaminaUpdatedAt;
    return {
      stamina: this.data.stamina,
      max: MAX_STAMINA,
      msUntilNext: Math.max(0, STAMINA_REGEN_MS - elapsed),
    };
  }

  consumeStaminaOnLoss(levelId: number, accuracy: number): void {
    this.syncStaminaRegen();
    if (this.data.stamina === MAX_STAMINA) {
      this.data.lastStaminaUpdatedAt = Date.now();
    }
    this.data.stamina = Math.max(0, this.data.stamina - 1);
    this.data.winStreak = 0;
    this.data.lastAccuracy = accuracy;
    this.data.failsByLevel[levelId] = (this.data.failsByLevel[levelId] ?? 0) + 1;
    this.save();
  }

  refillFullStamina(): void {
    this.data.stamina = MAX_STAMINA;
    this.data.lastStaminaUpdatedAt = Date.now();
    this.save();
  }

  spendCoins(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.save();
    return true;
  }

  isMuted(): boolean {
    return this.data.muted;
  }

  setMuted(muted: boolean): void {
    this.data.muted = muted;
    this.save();
  }

  recordLevelWin(levelId: number, score: number, stars: number, kills: number, accuracy: number): void {
    const prevStars = this.data.starsByLevel[levelId] ?? 0;
    this.data.starsByLevel[levelId] = Math.max(prevStars, stars);
    if (levelId >= this.data.highestUnlockedLevel) {
      this.data.highestUnlockedLevel = levelId + 1;
    }
    this.data.highScore = Math.max(this.data.highScore, score);
    this.data.totalSwatted += kills;
    this.data.coins += Math.max(8, Math.round(kills * 1.5) + stars * 10);
    this.data.winStreak += 1;
    this.data.lastAccuracy = accuracy;
    this.data.failsByLevel[levelId] = 0;
    this.save();
  }

  recordEndlessRun(score: number, kills: number, accuracy: number): void {
    this.data.bestEndlessScore = Math.max(this.data.bestEndlessScore, score);
    this.data.highScore = Math.max(this.data.highScore, score);
    this.data.totalSwatted += kills;
    this.data.coins += Math.max(4, Math.round(kills * 1.2));
    this.data.lastAccuracy = accuracy;
    this.save();
  }

  addCoins(amount: number): void {
    this.data.coins += amount;
    this.save();
  }

  recordSpecialKill(kind: 'singer' | 'boss'): void {
    if (kind === 'singer') this.data.singersSilenced += 1;
    if (kind === 'boss') this.data.bossesDefeated += 1;
    this.save();
  }

  unlockAchievement(id: string): AchievementDef | null {
    if (this.data.achievements.includes(id)) return null;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return null;
    this.data.achievements.push(id);
    this.data.coins += 10;
    this.save();
    return def;
  }

  getTotalStars(): number {
    return Object.values(this.data.starsByLevel).reduce((sum, s) => sum + s, 0);
  }

  getTheme(): 'light' | 'dark' {
    return this.data.theme === 'dark' ? 'dark' : 'light';
  }

  toggleTheme(): 'light' | 'dark' {
    this.data.theme = this.getTheme() === 'light' ? 'dark' : 'light';
    this.save();
    return this.data.theme;
  }

  /**
   * Candy Crush-style Dynamic Difficulty Adjustment (SkillDirector):
   * - If player is cruising (winStreak >= 3 or accuracy >= 82%), ramps up speed, spawn pressure & Ninja dodge!
   * - If player failed >= 2 times on this night, subtly eases pace & drops more power-ups to keep flow fun.
   */
  computeDdaModifiers(levelId: number): DdaModifiers {
    const fails = this.data.failsByLevel[levelId] ?? 0;
    if (fails >= 2) {
      return {
        speedScale: 0.9,
        spawnScale: 1.12,
        dodgeBonus: -0.08,
        powerUpBonus: 0.1,
        statusLabel: 'Mercy',
      };
    }

    if (this.data.winStreak >= 3 || (this.data.winStreak >= 2 && this.data.lastAccuracy >= 82)) {
      const pressure = Math.min(0.24, 0.1 + (this.data.winStreak - 2) * 0.04);
      return {
        speedScale: 1 + pressure,
        spawnScale: Math.max(0.8, 1 - pressure * 0.65),
        dodgeBonus: 0.14,
        powerUpBonus: -0.02,
        statusLabel: 'Spicy!',
      };
    }

    return {
      speedScale: 1,
      spawnScale: 1,
      dodgeBonus: 0,
      powerUpBonus: 0,
      statusLabel: 'Flow',
    };
  }
}

export const storage = new StorageService();
