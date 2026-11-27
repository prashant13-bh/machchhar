import type { MosquitoKind, PowerUpKind } from '../config/levels';

export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 800;

export interface Mosquito {
  id: number;
  kind: MosquitoKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hitRadius: number;
  hp: number;
  maxHp: number;
  speed: number;
  wingPhase: number;
  wobblePhase: number;
  wobbleFreq: number;
  state: 'flying' | 'diving' | 'stunned';
  stateTimer: number;
  flashTimer: number;
  points: number;
  targetX: number;
  targetY: number;
  songIndex?: number;
  dodgeCooldownMs?: number;
}

export interface FloatingPowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bobPhase: number;
  radius: number;
  lifeMs: number;
}

export interface ImpactEffect {
  x: number;
  y: number;
  radius: number;
  lifeMs: number;
  maxLifeMs: number;
  label: string;
  color: string;
  isZap: boolean;
}

export interface BulletTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lifeMs: number;
  maxLifeMs: number;
  isZap: boolean;
}

export interface ShellCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  lifeMs: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  scale: number;
  lifeMs: number;
  maxLifeMs: number;
}

export interface ZzzBubble {
  x: number;
  y: number;
  size: number;
  alpha: number;
  driftPhase: number;
}

export interface SleeperState {
  hearts: number;
  maxHearts: number;
  mood: 'sleeping' | 'annoyed' | 'bitten' | 'awake';
  moodTimerMs: number;
  shakeTimerMs: number;
  breathPhase: number;
  targetX: number;
  targetY: number;
  gunPivotX: number;
  gunPivotY: number;
  gunAngle: number;
  aimX: number;
  aimY: number;
  isAiming: boolean;
  aimLockedOn: boolean;
  recoilTimerMs: number;
  muzzleFlashMs: number;
  speechBubble: { text: string; lifeMs: number } | null;
}

export interface HudSnapshot {
  mode: 'campaign' | 'endless';
  levelId: number;
  levelName: string;
  score: number;
  combo: number;
  hearts: number;
  maxHearts: number;
  kills: number;
  targetKills: number;
  ammo: number;
  maxAmmo: number;
  reloadMs: number;
  bossActive: boolean;
  bossHpRatio: number;
  racketMs: number;
  coilMs: number;
  scoreMultiplier: number;
}
