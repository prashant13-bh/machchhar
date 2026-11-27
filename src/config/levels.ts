export type MosquitoKind = 'normal' | 'ninja' | 'tank' | 'singer' | 'boss';

export type PowerUpKind = 'racket' | 'coil' | 'pillow';

export type LevelPacingRole = 'onboarding' | 'spike' | 'relief' | 'boss';

export interface SpawnWeights {
  normal: number;
  ninja: number;
  tank: number;
  singer: number;
}

export interface LevelConfig {
  id: number;
  name: string;
  subtitle: string;
  role: LevelPacingRole;
  targetKills: number;
  spawnIntervalMs: number;
  maxConcurrent: number;
  speedMultiplier: number;
  dodgeChance: number;
  weights: SpawnWeights;
  /** Song indices (0..3 -> singer-1..4.mp3) sung by Singing Mosquitoes in this level */
  singerSongs: number[];
  isBossLevel: boolean;
  maxHearts: number;
  powerUpChance: number;
}

export const BOOSTER_COSTS: Record<PowerUpKind, number> = {
  racket: 30,
  coil: 25,
  pillow: 40,
};

export const POWER_UP_META: Record<
  PowerUpKind,
  { label: string; color: string; durationMs: number; description: string }
> = {
  racket: {
    label: 'ZAP AMMO',
    color: '#38bdf8',
    durationMs: 7000,
    description: 'Infinite rapid clip + electric chain blast!',
  },
  coil: {
    label: 'SLEEP COIL',
    color: '#a78bfa',
    durationMs: 7500,
    description: 'Slows all mosquitoes in the room!',
  },
  pillow: {
    label: 'DEEP SLEEP',
    color: '#fb7185',
    durationMs: 0,
    description: 'Starts or restores +1 Sleep Heart!',
  },
};

const HANDCRAFTED_LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: 'Night 1: First Buzz',
    subtitle: 'Aim with the dotted sight and blast mosquitoes!',
    role: 'onboarding',
    targetKills: 8,
    spawnIntervalMs: 1450,
    maxConcurrent: 3,
    speedMultiplier: 0.88,
    dodgeChance: 0,
    weights: { normal: 78, ninja: 0, tank: 0, singer: 22 },
    singerSongs: [0],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.16,
  },
  {
    id: 2,
    name: 'Night 2: Window Left Open',
    subtitle: 'Speedy Ninjas & Singing mosquitoes arrive!',
    role: 'onboarding',
    targetKills: 12,
    spawnIntervalMs: 1260,
    maxConcurrent: 4,
    speedMultiplier: 0.98,
    dodgeChance: 0.12,
    weights: { normal: 54, ninja: 23, tank: 0, singer: 23 },
    singerSongs: [1, 0],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.18,
  },
  {
    id: 3,
    name: 'Night 3: Heavy Buzzers',
    subtitle: 'HARD NIGHT! Armored 2-HP Tanks & dodging Ninjas!',
    role: 'spike',
    targetKills: 16,
    spawnIntervalMs: 1080,
    maxConcurrent: 5,
    speedMultiplier: 1.12,
    dodgeChance: 0.22,
    weights: { normal: 36, ninja: 24, tank: 22, singer: 18 },
    singerSongs: [2],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.18,
  },
  {
    id: 4,
    name: 'Night 4: Midnight Concert',
    subtitle: 'Groovy squeaking DJ mosquitoes throw a party!',
    role: 'relief',
    targetKills: 16,
    spawnIntervalMs: 1120,
    maxConcurrent: 4,
    speedMultiplier: 1.06,
    dodgeChance: 0.15,
    weights: { normal: 38, ninja: 20, tank: 12, singer: 30 },
    singerSongs: [3],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.22,
  },
  {
    id: 5,
    name: 'Night 5: King Mosquito',
    subtitle: 'BOSS NIGHT! Defeat the Giant King Mosquito!',
    role: 'boss',
    targetKills: 18,
    spawnIntervalMs: 1000,
    maxConcurrent: 5,
    speedMultiplier: 1.2,
    dodgeChance: 0.25,
    weights: { normal: 34, ninja: 26, tank: 20, singer: 20 },
    singerSongs: [2, 3, 0],
    isBossLevel: true,
    maxHearts: 4,
    powerUpChance: 0.24,
  },
  {
    id: 6,
    name: 'Night 6: Monsoon Swarm',
    subtitle: 'Humid night—singers and ninjas everywhere!',
    role: 'relief',
    targetKills: 20,
    spawnIntervalMs: 960,
    maxConcurrent: 6,
    speedMultiplier: 1.18,
    dodgeChance: 0.2,
    weights: { normal: 30, ninja: 30, tank: 14, singer: 26 },
    singerSongs: [1, 3],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.22,
  },
  {
    id: 7,
    name: 'Night 7: Armored Squadron',
    subtitle: 'HARD NIGHT! Heavy Tank squad—aim carefully!',
    role: 'spike',
    targetKills: 24,
    spawnIntervalMs: 860,
    maxConcurrent: 6,
    speedMultiplier: 1.3,
    dodgeChance: 0.3,
    weights: { normal: 22, ninja: 28, tank: 32, singer: 18 },
    singerSongs: [2, 3],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.2,
  },
  {
    id: 8,
    name: 'Night 8: Lights Out',
    subtitle: 'Fast waves—grab power-ups to hold the bed!',
    role: 'relief',
    targetKills: 26,
    spawnIntervalMs: 840,
    maxConcurrent: 6,
    speedMultiplier: 1.28,
    dodgeChance: 0.24,
    weights: { normal: 24, ninja: 30, tank: 22, singer: 24 },
    singerSongs: [0, 3],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.25,
  },
  {
    id: 9,
    name: 'Night 9: Sleepless City',
    subtitle: 'HARD NIGHT! Relentless dodging choir!',
    role: 'spike',
    targetKills: 30,
    spawnIntervalMs: 740,
    maxConcurrent: 7,
    speedMultiplier: 1.38,
    dodgeChance: 0.34,
    weights: { normal: 18, ninja: 36, tank: 24, singer: 22 },
    singerSongs: [1, 2, 3],
    isBossLevel: false,
    maxHearts: 4,
    powerUpChance: 0.24,
  },
  {
    id: 10,
    name: 'Night 10: Emperor Swarm',
    subtitle: 'FINAL BOSS! Every singing mosquito joins in!',
    role: 'boss',
    targetKills: 30,
    spawnIntervalMs: 720,
    maxConcurrent: 8,
    speedMultiplier: 1.45,
    dodgeChance: 0.35,
    weights: { normal: 20, ninja: 32, tank: 26, singer: 22 },
    singerSongs: [0, 1, 2, 3],
    isBossLevel: true,
    maxHearts: 5,
    powerUpChance: 0.28,
  },
];

export const TOTAL_CAMPAIGN_LEVELS = HANDCRAFTED_LEVELS.length;

export function getLevelConfig(levelId: number): LevelConfig {
  const existing = HANDCRAFTED_LEVELS[levelId - 1];
  if (existing) {
    return existing;
  }

  const extra = levelId - HANDCRAFTED_LEVELS.length;
  const isBoss = levelId % 5 === 0;
  const isSpike = !isBoss && levelId % 2 === 1;
  return {
    id: levelId,
    name: `Night ${levelId}: Endless Swarm`,
    subtitle: isBoss ? 'BOSS NIGHT! Giant Buzz Incoming!' : isSpike ? 'HARD NIGHT! Fast & Armored!' : 'Survive the night!',
    role: isBoss ? 'boss' : isSpike ? 'spike' : 'relief',
    targetKills: 30 + extra * 4,
    spawnIntervalMs: Math.max(460, 720 - extra * 25),
    maxConcurrent: Math.min(11, 8 + Math.floor(extra / 2)),
    speedMultiplier: Math.min(1.85, 1.45 + extra * 0.04),
    dodgeChance: Math.min(0.42, 0.32 + extra * 0.015),
    weights: { normal: 20, ninja: 34, tank: 24, singer: 22 },
    singerSongs: [(levelId - 1) % 4, levelId % 4, 3],
    isBossLevel: isBoss,
    maxHearts: isBoss ? 5 : 4,
    powerUpChance: 0.26,
  };
}
