import {
  getLevelConfig,
  POWER_UP_META,
  type LevelConfig,
  type MosquitoKind,
  type PowerUpKind,
} from '../config/levels';
import { audioEngine, type QuipCategory } from '../services/AudioEngine';
import { storage, type DdaModifiers } from '../services/Storage';
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BulletTracer,
  type FloatingPowerUp,
  type FloatingText,
  type HudSnapshot,
  type ImpactEffect,
  type Mosquito,
  type Particle,
  type ShellCasing,
  type SleeperState,
  type ZzzBubble,
} from './Entities';
import { CartoonRenderer } from './Renderer';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'level_clear' | 'game_over';

export interface StartRunOptions {
  scoreMultiplier?: number;
  starterPowerUp?: PowerUpKind;
  extraHeart?: boolean;
}

export interface RunSummary {
  mode: 'campaign' | 'endless';
  levelId: number;
  levelName: string;
  score: number;
  kills: number;
  remainingToWin: number;
  maxCombo: number;
  accuracy: number;
  stars: number;
  coinsEarned: number;
  revivedUsed: boolean;
}

export interface EngineCallbacks {
  onPhaseChange: (phase: GamePhase, summary?: RunSummary) => void;
  onHudUpdate: (hud: HudSnapshot) => void;
}

const CLIP_SIZE = 6;
const RELOAD_DURATION_MS = 850;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer = new CartoonRenderer();
  private callbacks: EngineCallbacks;

  private phase: GamePhase = 'menu';
  private mode: 'campaign' | 'endless' = 'campaign';
  private level: LevelConfig = getLevelConfig(1);
  private dda: DdaModifiers = storage.computeDdaModifiers(1);

  private rafId = 0;
  private lastFrameAt = 0;
  private elapsedSec = 0;
  private hudSyncTimer = 0;

  private viewScale = 1;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private pointerDownActive = false;

  // Run state
  private nextId = 1;
  private score = 0;
  private kills = 0;
  private combo = 0;
  private maxCombo = 0;
  private totalShots = 0;
  private hitShots = 0;
  private scoreMultiplier = 1;
  private revivedUsed = false;

  // 6-shot tactical ammo clip
  private ammo = CLIP_SIZE;
  private reloadMs = 0;

  private spawnTimerMs = 0;
  private bossSpawned = false;
  private zzzTimerMs = 0;

  private racketMs = 0;
  private coilMs = 0;
  private screenFlashMs = 0;
  private screenFlashColor = '#ff4d6d';

  private mosquitoes: Mosquito[] = [];
  private powerUps: FloatingPowerUp[] = [];
  private impacts: ImpactEffect[] = [];
  private tracers: BulletTracer[] = [];
  private casings: ShellCasing[] = [];
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private zzzs: ZzzBubble[] = [];

  private sleeper: SleeperState = {
    hearts: 4,
    maxHearts: 4,
    mood: 'sleeping',
    moodTimerMs: 0,
    shakeTimerMs: 0,
    breathPhase: 0,
    targetX: 210,
    targetY: 562,
    gunPivotX: 236,
    gunPivotY: 622,
    gunAngle: -Math.PI / 2.2,
    aimX: 240,
    aimY: 260,
    isAiming: false,
    aimLockedOn: false,
    recoilTimerMs: 0,
    muzzleFlashMs: 0,
    speechBubble: null,
  };

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D Canvas context unavailable');
    }
    this.ctx = context;
    this.callbacks = callbacks;

    this.bindEvents();
    this.resize();
    this.lastFrameAt = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    audioEngine.stopBuzz();
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  startCampaignLevel(levelId: number, options?: StartRunOptions): void {
    this.mode = 'campaign';
    this.level = getLevelConfig(levelId);
    this.dda = storage.computeDdaModifiers(levelId);
    this.resetRunState(options);
    this.phase = 'playing';

    audioEngine.playMeme('memeChalo', true);
    const prefix = this.level.isBossLevel
      ? '👑 BOSS: '
      : this.level.role === 'spike'
        ? '🔥 HARD: '
        : '🌙 ';
    this.addFloatingText(WORLD_WIDTH / 2, 200, `${prefix}${this.level.name.toUpperCase()}`, '#ffd166', 1.18);
    if (this.dda.statusLabel === 'Spicy!') {
      this.addFloatingText(WORLD_WIDTH / 2, 240, '🌶️ WIN STREAK! EXTRA CHALLENGE!', '#fb7185', 1.0);
    } else if (this.dda.statusLabel === 'Mercy') {
      this.addFloatingText(WORLD_WIDTH / 2, 240, '🍀 EXTRA POWER-UPS ACTIVE!', '#4ade80', 1.0);
    }

    this.callbacks.onPhaseChange('playing');
    this.emitHud();
  }

  startEndlessMode(options?: StartRunOptions): void {
    this.mode = 'endless';
    this.level = getLevelConfig(1);
    this.dda = { speedScale: 1, spawnScale: 1, dodgeBonus: 0.08, powerUpBonus: 0.04, statusLabel: 'Flow' };
    this.resetRunState(options);
    this.phase = 'playing';
    audioEngine.playMeme('memeChalo', true);
    this.addFloatingText(WORLD_WIDTH / 2, 210, '♾️ ENDLESS NIGHT LOOP!', '#38bdf8', 1.25);
    this.callbacks.onPhaseChange('playing');
    this.emitHud();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.pointerDownActive = false;
    audioEngine.stopBuzz();
    this.callbacks.onPhaseChange('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.lastFrameAt = performance.now();
    this.callbacks.onPhaseChange('playing');
  }

  returnToMenu(): void {
    this.phase = 'menu';
    this.pointerDownActive = false;
    this.mosquitoes = [];
    this.powerUps = [];
    this.impacts = [];
    this.tracers = [];
    this.casings = [];
    this.texts = [];
    this.sleeper.mood = 'sleeping';
    this.sleeper.isAiming = false;
    this.sleeper.speechBubble = null;
    audioEngine.stopBuzz();
    this.callbacks.onPhaseChange('menu');
  }

  revive(extraHearts = 2): void {
    if (this.phase !== 'game_over') return;
    this.revivedUsed = true;
    // Refund the stamina spent on this run when player watches the Revive Ad
    if (this.mode === 'campaign') {
      const info = storage.getStaminaInfo();
      if (info.stamina < info.max) {
        storage.getData().stamina = Math.min(info.max, info.stamina + 1);
      }
    }
    this.sleeper.hearts = Math.min(this.sleeper.maxHearts, extraHearts);
    this.sleeper.mood = 'sleeping';
    this.sleeper.moodTimerMs = 0;
    this.mosquitoes = [];
    this.ammo = CLIP_SIZE;
    this.reloadMs = 0;
    this.racketMs = 5000;
    this.phase = 'playing';
    this.lastFrameAt = performance.now();
    audioEngine.playPowerUp('pillow');
    audioEngine.playMeme('memeYeLe', true);
    this.addFloatingText(WORLD_WIDTH / 2, 420, 'SECOND WIND! +2 ❤️ & ZAP!', '#4ade80', 1.15);
    this.callbacks.onPhaseChange('playing');
    this.emitHud();
  }

  private resetRunState(options?: StartRunOptions): void {
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalShots = 0;
    this.hitShots = 0;
    this.scoreMultiplier = options?.scoreMultiplier ?? 1;
    this.revivedUsed = false;
    this.pointerDownActive = false;

    this.ammo = CLIP_SIZE;
    this.reloadMs = 0;
    this.spawnTimerMs = 450;
    this.bossSpawned = false;
    this.racketMs = options?.starterPowerUp === 'racket' ? POWER_UP_META.racket.durationMs : 0;
    this.coilMs = options?.starterPowerUp === 'coil' ? POWER_UP_META.coil.durationMs : 0;
    this.screenFlashMs = 0;

    this.mosquitoes = [];
    this.powerUps = [];
    this.impacts = [];
    this.tracers = [];
    this.casings = [];
    this.particles = [];
    this.texts = [];
    this.zzzs = [];

    const maxH = this.level.maxHearts + (options?.extraHeart ? 1 : 0);
    this.sleeper.maxHearts = maxH;
    this.sleeper.hearts = maxH;
    this.sleeper.mood = 'sleeping';
    this.sleeper.moodTimerMs = 0;
    this.sleeper.shakeTimerMs = 0;
    this.sleeper.isAiming = false;
    this.sleeper.aimLockedOn = false;
    this.sleeper.gunAngle = -Math.PI / 2.2;
    this.sleeper.recoilTimerMs = 0;
    this.sleeper.muzzleFlashMs = 0;
    this.sleeper.speechBubble = null;
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.pointerDownActive) {
        this.sleeper.isAiming = false;
      }
    });
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
  }

  private toWorldCoords(event: PointerEvent): { wx: number; wy: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const canvasX = (event.clientX - rect.left) * dpr;
    const canvasY = (event.clientY - rect.top) * dpr;

    const wx = (canvasX - this.viewOffsetX) / this.viewScale;
    const wy = (canvasY - this.viewOffsetY) / this.viewScale;
    if (wx < 0 || wx > WORLD_WIDTH || wy < 0 || wy > WORLD_HEIGHT) return null;
    return { wx, wy };
  }

  private updateAimTarget(wx: number, wy: number): void {
    const clampedY = Math.min(wy, this.sleeper.gunPivotY - 30);
    this.sleeper.aimX = wx;
    this.sleeper.aimY = clampedY;
    this.sleeper.isAiming = true;
    this.sleeper.gunAngle = Math.atan2(
      clampedY - this.sleeper.gunPivotY,
      wx - this.sleeper.gunPivotX
    );
    this.refreshAimLock();
  }

  private refreshAimLock(): void {
    if (!this.sleeper.isAiming) {
      this.sleeper.aimLockedOn = false;
      return;
    }
    const isZap = this.racketMs > 0;
    const bonus = (isZap ? 28 : 10) + (this.dda.statusLabel === 'Mercy' ? 6 : 0);
    this.sleeper.aimLockedOn =
      this.mosquitoes.some(
        (m) => Math.hypot(this.sleeper.aimX - m.x, this.sleeper.aimY - m.y) <= m.hitRadius + bonus
      ) ||
      this.powerUps.some(
        (p) => Math.hypot(this.sleeper.aimX - p.x, this.sleeper.aimY - p.y) <= p.radius + 16
      );
  }

  private handlePointerDown(event: PointerEvent): void {
    audioEngine.unlock();
    if (this.phase !== 'playing') return;

    const coords = this.toWorldCoords(event);
    if (!coords) return;

    this.pointerDownActive = true;
    this.updateAimTarget(coords.wx, coords.wy);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.phase !== 'playing') return;
    if (event.pointerType !== 'mouse' && !this.pointerDownActive) return;

    const coords = this.toWorldCoords(event);
    if (!coords) return;
    this.updateAimTarget(coords.wx, coords.wy);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.pointerDownActive) return;
    this.pointerDownActive = false;
    if (this.phase !== 'playing') return;

    const coords = this.toWorldCoords(event);
    if (coords) {
      this.updateAimTarget(coords.wx, coords.wy);
    }
    this.fireShot(this.sleeper.aimX, this.sleeper.aimY);

    if (event.pointerType !== 'mouse') {
      this.sleeper.isAiming = false;
    }
  }

  private fireShot(targetX: number, targetY: number): void {
    const isZap = this.racketMs > 0;

    // 6-shot reload gate (bypassed when Zap Ammo is active!)
    if (!isZap && this.reloadMs > 0) {
      audioEngine.playReloadClick(false);
      const memeText = audioEngine.playMeme('memeBaingan', false, 1500);
      this.addFloatingText(this.sleeper.gunPivotX, this.sleeper.gunPivotY - 30, memeText ?? 'RELOADING!', '#fb923c', 1.05);
      return;
    }

    if (!isZap) {
      this.ammo -= 1;
      if (this.ammo <= 0) {
        this.reloadMs = RELOAD_DURATION_MS;
        audioEngine.playReloadClick(false);
        this.addFloatingText(this.sleeper.gunPivotX, this.sleeper.gunPivotY - 26, '🔄 RELOADING...', '#38bdf8', 0.95);
      }
    }

    const muzzleDist = 52;
    const muzzleX = this.sleeper.gunPivotX + Math.cos(this.sleeper.gunAngle) * muzzleDist;
    const muzzleY = this.sleeper.gunPivotY + Math.sin(this.sleeper.gunAngle) * muzzleDist;

    this.sleeper.recoilTimerMs = 130;
    this.sleeper.muzzleFlashMs = 100;

    this.casings.push({
      x: this.sleeper.gunPivotX + Math.cos(this.sleeper.gunAngle) * 18,
      y: this.sleeper.gunPivotY + Math.sin(this.sleeper.gunAngle) * 18,
      vx: (Math.cos(this.sleeper.gunAngle) >= 0 ? -1 : 1) * (45 + Math.random() * 45),
      vy: -130 - Math.random() * 50,
      rot: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 18,
      lifeMs: 750,
    });

    // 1. Check floating power-ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      if (this.pointHitsCircle(p.x, p.y, p.radius + 16, muzzleX, muzzleY, targetX, targetY)) {
        this.tracers.push({
          x1: muzzleX,
          y1: muzzleY,
          x2: p.x,
          y2: p.y,
          lifeMs: 130,
          maxLifeMs: 130,
          isZap,
        });
        audioEngine.playGunshot(true, this.combo, isZap);
        this.collectPowerUp(i);
        return;
      }
    }

    this.totalShots += 1;

    // 2. Hit mosquitoes
    const mercyPad = this.dda.statusLabel === 'Mercy' ? 6 : 0;
    const hitIndices: number[] = [];
    for (let i = this.mosquitoes.length - 1; i >= 0; i--) {
      const m = this.mosquitoes[i];
      const hitAtReticle =
        Math.hypot(targetX - m.x, targetY - m.y) <= m.hitRadius + (isZap ? 32 : 10) + mercyPad;
      const hitAlongRay =
        this.distPointToSegment(m.x, m.y, muzzleX, muzzleY, targetX, targetY) <=
        m.hitRadius * 0.72 + (isZap ? 14 : 0) + mercyPad;

      if (hitAtReticle || hitAlongRay) {
        hitIndices.push(i);
        if (!isZap) break;
      }
    }

    if (hitIndices.length > 0) {
      this.hitShots += 1;
      const firstHit = this.mosquitoes[hitIndices[0]];
      const impactX = firstHit ? firstHit.x : targetX;
      const impactY = firstHit ? firstHit.y : targetY;

      this.tracers.push({
        x1: muzzleX,
        y1: muzzleY,
        x2: impactX,
        y2: impactY,
        lifeMs: 130,
        maxLifeMs: 130,
        isZap,
      });

      let killedAny = false;
      let killedBoss = false;
      let killedSinger = false;
      let survivedArmor = false;
      for (const idx of hitIndices) {
        const m = this.mosquitoes[idx];
        if (!m) continue;
        m.hp -= isZap ? 2 : 1;
        m.flashTimer = 110;
        if (m.hp <= 0) {
          killedAny = true;
          if (m.kind === 'boss') killedBoss = true;
          if (m.kind === 'singer') killedSinger = true;
          this.onMosquitoKilled(idx, isZap);
        } else {
          survivedArmor = true;
          m.state = 'stunned';
          m.stateTimer = 650;
          audioEngine.playArmorBonk();
          this.impacts.push({
            x: m.x,
            y: m.y,
            radius: 36,
            lifeMs: 260,
            maxLifeMs: 260,
            label: 'BONK!',
            color: '#fb923c',
            isZap,
          });
        }
      }

      if (survivedArmor && !killedAny && this.level.id >= 3) {
        const line = audioEngine.playMeme('memeEkSecond', false, 1400);
        if (line) this.sleeper.speechBubble = { text: line, lifeMs: 1200 };
      }

      if (killedAny) {
        audioEngine.playGunshot(true, this.combo, isZap);
        if (killedSinger) audioEngine.playSingerStopScratch();
        if (killedBoss || isZap || (this.combo >= 5 && this.combo % 5 === 0)) {
          const yeLe = audioEngine.playMeme('memeYeLe', killedBoss);
          if (yeLe) this.sleeper.speechBubble = { text: yeLe, lifeMs: 1100 };
        } else {
          const quipCat: QuipCategory = killedSinger ? 'singer' : 'hit';
          this.sayUncleQuip(quipCat, killedSinger);
        }
      }
      this.emitHud();
      this.checkLevelCompletion();
      return;
    }

    // 3. Missed shot
    this.combo = 0;
    this.tracers.push({
      x1: muzzleX,
      y1: muzzleY,
      x2: targetX,
      y2: targetY,
      lifeMs: 110,
      maxLifeMs: 110,
      isZap,
    });
    audioEngine.playGunshot(false, 0, isZap);
    const missBubble = audioEngine.playMissVoice(this.level.id >= 3);
    this.sleeper.speechBubble = { text: missBubble, lifeMs: 1050 };
    this.impacts.push({
      x: targetX,
      y: targetY,
      radius: isZap ? 48 : 24,
      lifeMs: 210,
      maxLifeMs: 210,
      label: 'MISS!',
      color: '#94a3b8',
      isZap,
    });
    this.emitHud();
  }

  private sayUncleQuip(category: QuipCategory, force = false): void {
    const line = audioEngine.triggerComedyQuip(category, force);
    if (line) {
      this.sleeper.speechBubble = { text: line, lifeMs: 1300 };
    }
  }

  private pointHitsCircle(
    cx: number,
    cy: number,
    r: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): boolean {
    return (
      Math.hypot(x2 - cx, y2 - cy) <= r ||
      this.distPointToSegment(cx, cy, x1, y1, x2, y2) <= r
    );
  }

  private distPointToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  private onMosquitoKilled(index: number, isZap: boolean): void {
    const m = this.mosquitoes[index];
    this.mosquitoes.splice(index, 1);

    this.kills += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const comboMult = Math.min(5, 1 + Math.floor((this.combo - 1) / 3));
    const earned = m.points * comboMult * this.scoreMultiplier;
    this.score += earned;

    const labels = ['BANG!', 'DHISHOOM!', 'HEADSHOT!', 'BOOM!'];
    const label = isZap ? 'ZAP!' : m.kind === 'singer' ? 'MIC DROP!' : labels[this.kills % labels.length];

    this.impacts.push({
      x: m.x,
      y: m.y,
      radius: isZap ? 56 : 38,
      lifeMs: 300,
      maxLifeMs: 300,
      label,
      color: isZap ? '#38bdf8' : m.kind === 'singer' ? '#f472b6' : '#ffd166',
      isZap,
    });

    this.spawnSplatParticles(
      m.x,
      m.y,
      m.kind === 'boss' ? '#ffd166' : m.kind === 'singer' ? '#f472b6' : '#f43f5e',
      m.kind === 'boss' ? 24 : m.kind === 'singer' ? 16 : 12
    );
    const comboSuffix = comboMult > 1 ? ` x${comboMult}` : '';
    this.addFloatingText(
      m.x,
      m.y - 10,
      `+${earned}${comboSuffix}`,
      '#fde047',
      comboMult > 1 ? 1.18 : 1
    );

    if (this.combo >= 5 && this.combo % 5 === 0) {
      storage.addCoins(5);
      this.addFloatingText(WORLD_WIDTH / 2, 140, `🔥 ${this.combo} STREAK! +5 🪙`, '#4ade80', 1.22);
    }

    const dropChance = Math.max(0.08, this.level.powerUpChance + this.dda.powerUpBonus);
    if (Math.random() < dropChance && this.powerUps.length < 2) {
      this.spawnPowerUp(m.x, Math.min(m.y, 410));
    }

    if (this.mode === 'endless' && this.kills % 10 === 0) {
      const waveLevel = Math.floor(this.kills / 10) + 1;
      this.level = getLevelConfig(waveLevel);
      this.addFloatingText(WORLD_WIDTH / 2, 240, `WAVE ${waveLevel}!`, '#38bdf8', 1.35);
    }
  }

  private collectPowerUp(index: number): void {
    const p = this.powerUps[index];
    this.powerUps.splice(index, 1);
    audioEngine.playPowerUp(p.kind);

    if (p.kind === 'racket') {
      this.racketMs = POWER_UP_META.racket.durationMs;
      this.ammo = CLIP_SIZE;
      this.reloadMs = 0;
      this.addFloatingText(p.x, p.y, '⚡ INFINITE ZAP AMMO!', '#38bdf8', 1.18);
    } else if (p.kind === 'coil') {
      this.coilMs = POWER_UP_META.coil.durationMs;
      this.addFloatingText(p.x, p.y, '🌀 SLEEP COIL!', '#a78bfa', 1.2);
    } else {
      this.sleeper.hearts = Math.min(this.sleeper.maxHearts, this.sleeper.hearts + 1);
      this.addFloatingText(p.x, p.y, '+1 HEART ❤️', '#fb7185', 1.2);
    }
    this.spawnSplatParticles(p.x, p.y, POWER_UP_META[p.kind].color, 12);
    this.emitHud();
  }

  private hurtSleeper(): void {
    this.sleeper.hearts = Math.max(0, this.sleeper.hearts - 1);
    this.sleeper.mood = 'bitten';
    this.sleeper.moodTimerMs = 1100;
    this.sleeper.shakeTimerMs = 320;
    this.screenFlashMs = 260;
    this.screenFlashColor = '#ff4d6d';
    this.combo = 0;

    if (this.sleeper.hearts <= 0) {
      this.triggerGameOver();
    } else if (this.sleeper.hearts === 1) {
      audioEngine.playSleeperOuch();
      const panic = audioEngine.playMeme('memeBachaLo', true);
      this.sleeper.speechBubble = { text: panic ?? 'Amma! Bacha lo!', lifeMs: 1800 };
      this.addFloatingText(this.sleeper.targetX, this.sleeper.targetY - 56, '⚠️ LAST HEART!', '#ff4d6d', 1.2);
    } else {
      audioEngine.playSleeperOuch();
      const shocked = audioEngine.playMeme('memeBaapRe', false, 1400);
      if (shocked) this.sleeper.speechBubble = { text: shocked, lifeMs: 1200 };
      this.addFloatingText(this.sleeper.targetX, this.sleeper.targetY - 56, 'BITTEN! -1 ❤️', '#ff4d6d', 1.1);
    }
  }

  private checkLevelCompletion(): void {
    if (this.mode !== 'campaign') return;
    const bossAlive = this.mosquitoes.some((m) => m.kind === 'boss');
    if (this.kills >= this.level.targetKills && (!this.level.isBossLevel || (this.bossSpawned && !bossAlive))) {
      this.triggerLevelClear();
    }
  }

  private triggerLevelClear(): void {
    this.phase = 'level_clear';
    this.pointerDownActive = false;
    this.sleeper.isAiming = false;
    this.mosquitoes = [];
    this.powerUps = [];
    audioEngine.playLevelClear();

    const accuracy = this.totalShots > 0 ? Math.round((this.hitShots / this.totalShots) * 100) : 100;
    const heartRatio = this.sleeper.hearts / this.sleeper.maxHearts;
    const stars = heartRatio >= 0.75 ? 3 : heartRatio >= 0.45 ? 2 : 1;
    const coinsEarned = Math.max(8, Math.round(this.kills * 1.5) + stars * 10);

    storage.recordLevelWin(this.level.id, this.score, stars, this.kills, accuracy);

    this.callbacks.onPhaseChange('level_clear', {
      mode: 'campaign',
      levelId: this.level.id,
      levelName: this.level.name,
      score: this.score,
      kills: this.kills,
      remainingToWin: 0,
      maxCombo: this.maxCombo,
      accuracy,
      stars,
      coinsEarned,
      revivedUsed: this.revivedUsed,
    });
  }

  private triggerGameOver(): void {
    this.phase = 'game_over';
    this.pointerDownActive = false;
    this.sleeper.isAiming = false;
    this.sleeper.mood = 'awake';
    audioEngine.playGameOverAlarm();
    this.sayUncleQuip('gameover', true);

    const accuracy = this.totalShots > 0 ? Math.round((this.hitShots / this.totalShots) * 100) : 0;
    const coinsEarned = Math.max(4, Math.round(this.kills * 1.2));
    const remaining =
      this.mode === 'campaign' ? Math.max(1, this.level.targetKills - this.kills) : 0;

    if (this.mode === 'endless') {
      storage.recordEndlessRun(this.score, this.kills, accuracy);
    } else {
      storage.consumeStaminaOnLoss(this.level.id, accuracy);
    }

    this.callbacks.onPhaseChange('game_over', {
      mode: this.mode,
      levelId: this.level.id,
      levelName: this.mode === 'endless' ? 'Endless Night' : this.level.name,
      score: this.score,
      kills: this.kills,
      remainingToWin: remaining,
      maxCombo: this.maxCombo,
      accuracy,
      stars: 0,
      coinsEarned,
      revivedUsed: this.revivedUsed,
    });
  }

  private loop = (now: number): void => {
    const dtMs = Math.min(50, Math.max(0, now - this.lastFrameAt));
    this.lastFrameAt = now;
    const dtSec = dtMs / 1000;
    this.elapsedSec += dtSec;

    this.updateSleeperAndAmbience(dtMs, dtSec, now);

    if (this.phase === 'playing') {
      this.updateGameplay(dtMs, dtSec);
      this.refreshAimLock();
    }

    const transform = this.renderer.render(this.ctx, this.canvas.width, this.canvas.height, {
      timeSec: this.elapsedSec,
      sleeper: this.sleeper,
      mosquitoes: this.mosquitoes,
      powerUps: this.powerUps,
      impacts: this.impacts,
      tracers: this.tracers,
      casings: this.casings,
      particles: this.particles,
      texts: this.texts,
      zzzs: this.zzzs,
      racketActive: this.racketMs > 0,
      coilActive: this.coilMs > 0,
      screenFlashMs: this.screenFlashMs,
      screenFlashColor: this.screenFlashColor,
    });

    this.viewScale = transform.scale;
    this.viewOffsetX = transform.offsetX;
    this.viewOffsetY = transform.offsetY;

    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateSleeperAndAmbience(dtMs: number, dtSec: number, nowMs: number): void {
    this.sleeper.breathPhase += dtSec * 2.1;
    if (this.sleeper.shakeTimerMs > 0) {
      this.sleeper.shakeTimerMs = Math.max(0, this.sleeper.shakeTimerMs - dtMs);
    }
    if (this.sleeper.recoilTimerMs > 0) {
      this.sleeper.recoilTimerMs = Math.max(0, this.sleeper.recoilTimerMs - dtMs);
    }
    if (this.sleeper.muzzleFlashMs > 0) {
      this.sleeper.muzzleFlashMs = Math.max(0, this.sleeper.muzzleFlashMs - dtMs);
    }
    if (this.sleeper.speechBubble) {
      this.sleeper.speechBubble.lifeMs -= dtMs;
      if (this.sleeper.speechBubble.lifeMs <= 0) {
        this.sleeper.speechBubble = null;
      }
    }
    if (this.screenFlashMs > 0) {
      this.screenFlashMs = Math.max(0, this.screenFlashMs - dtMs);
    }
    if (this.sleeper.mood !== 'sleeping' && this.sleeper.mood !== 'awake') {
      this.sleeper.moodTimerMs -= dtMs;
      if (this.sleeper.moodTimerMs <= 0) {
        this.sleeper.mood = 'sleeping';
      }
    }

    if (this.sleeper.mood === 'sleeping' && this.phase !== 'game_over') {
      this.zzzTimerMs -= dtMs;
      if (this.zzzTimerMs <= 0) {
        this.zzzTimerMs = 1150;
        this.zzzs.push({
          x: this.sleeper.targetX + 18,
          y: this.sleeper.targetY - 12,
          size: 15,
          alpha: 0.9,
          driftPhase: Math.random() * Math.PI * 2,
        });
      }
      if (this.phase === 'playing' && this.mosquitoes.length <= 2) {
        audioEngine.maybePlaySnore(nowMs);
      }
    }

    for (let i = this.zzzs.length - 1; i >= 0; i--) {
      const z = this.zzzs[i];
      z.y -= 28 * dtSec;
      z.x += Math.sin(this.elapsedSec * 2.4 + z.driftPhase) * 14 * dtSec;
      z.size += 5 * dtSec;
      z.alpha -= 0.34 * dtSec;
      if (z.alpha <= 0) this.zzzs.splice(i, 1);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].lifeMs -= dtMs;
      if (this.tracers[i].lifeMs <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.lifeMs -= dtMs;
      c.x += c.vx * dtSec;
      c.y += c.vy * dtSec;
      c.vy += 460 * dtSec;
      c.rot += c.vRot * dtSec;
      if (c.lifeMs <= 0) this.casings.splice(i, 1);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].lifeMs -= dtMs;
      if (this.impacts[i].lifeMs <= 0) this.impacts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifeMs -= dtMs;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += 180 * dtSec;
      if (p.lifeMs <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].lifeMs -= dtMs;
      if (this.texts[i].lifeMs <= 0) this.texts.splice(i, 1);
    }
  }

  private updateGameplay(dtMs: number, dtSec: number): void {
    if (this.racketMs > 0) this.racketMs = Math.max(0, this.racketMs - dtMs);
    if (this.coilMs > 0) this.coilMs = Math.max(0, this.coilMs - dtMs);

    if (this.reloadMs > 0) {
      this.reloadMs = Math.max(0, this.reloadMs - dtMs);
      if (this.reloadMs === 0) {
        this.ammo = CLIP_SIZE;
        audioEngine.playReloadClick(true);
      }
    }

    if (
      this.mode === 'campaign' &&
      this.level.isBossLevel &&
      !this.bossSpawned &&
      this.kills >= Math.floor(this.level.targetKills * 0.65)
    ) {
      this.bossSpawned = true;
      this.spawnMosquito('boss');
      audioEngine.playMeme('memeYehKyaHai', true);
      this.addFloatingText(WORLD_WIDTH / 2, 180, '👑 KING MOSQUITO!', '#ffd166', 1.35);
    }

    this.spawnTimerMs -= dtMs;
    const moreKillsNeeded =
      this.mode === 'endless' || this.kills + this.mosquitoes.length < this.level.targetKills + 2;
    if (this.spawnTimerMs <= 0 && this.mosquitoes.length < this.level.maxConcurrent && moreKillsNeeded) {
      this.spawnTimerMs =
        this.level.spawnIntervalMs * this.dda.spawnScale * (0.8 + Math.random() * 0.4);
      this.spawnMosquito(this.pickMosquitoKind());
    }

    const speedSlowFactor = this.coilMs > 0 ? 0.48 : 1;
    const effectiveDodge = Math.max(0, this.level.dodgeChance + this.dda.dodgeBonus);
    let closestProximity = 0;
    let hasFastOrBoss = false;

    for (let i = this.mosquitoes.length - 1; i >= 0; i--) {
      const m = this.mosquitoes[i];
      m.wingPhase += dtSec * (m.kind === 'ninja' ? 68 : 48);
      m.wobblePhase += dtSec * m.wobbleFreq;
      if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dtMs);
      if (m.dodgeCooldownMs && m.dodgeCooldownMs > 0) {
        m.dodgeCooldownMs = Math.max(0, m.dodgeCooldownMs - dtMs);
      }

      if (m.kind === 'ninja' || m.kind === 'boss') hasFastOrBoss = true;

      if (m.state === 'stunned') {
        m.stateTimer -= dtMs;
        if (m.stateTimer <= 0) m.state = 'flying';
        continue;
      }

      // Evasive Ninja juke when aimed at! (Candy Crush DDA skill test)
      if (
        m.kind === 'ninja' &&
        m.state === 'flying' &&
        this.sleeper.isAiming &&
        (!m.dodgeCooldownMs || m.dodgeCooldownMs <= 0) &&
        Math.hypot(this.sleeper.aimX - m.x, this.sleeper.aimY - m.y) < 42 &&
        Math.random() < effectiveDodge
      ) {
        m.dodgeCooldownMs = 1900;
        m.targetX = 55 + Math.random() * (WORLD_WIDTH - 110);
        m.targetY = 100 + Math.random() * 250;
        m.x += (Math.random() < 0.5 ? -1 : 1) * 44;
        m.x = Math.max(36, Math.min(WORLD_WIDTH - 36, m.x));
        const aayein = audioEngine.playMeme('memeAayein', false, 1800);
        if (aayein) this.addFloatingText(m.x, m.y - 18, aayein, '#38bdf8', 0.95);
      }

      if (m.state === 'flying') {
        m.stateTimer -= dtMs;
        const dx = m.targetX - m.x;
        const dy = m.targetY - m.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 28 || m.stateTimer <= 0) {
          if (Math.random() < (m.kind === 'boss' ? 0.35 : 0.45)) {
            m.state = 'diving';
            m.targetX = this.sleeper.targetX + (Math.random() - 0.5) * 44;
            m.targetY = this.sleeper.targetY + (Math.random() - 0.5) * 26;
            if (this.level.id >= 2 && Math.random() < 0.45) {
              const kyaRe = audioEngine.playMeme('memeKyaRe', false, 2400);
              if (kyaRe) this.addFloatingText(m.x, m.y - 16, kyaRe, '#fb7185', 0.9);
            }
          } else {
            m.targetX = 48 + Math.random() * (WORLD_WIDTH - 96);
            m.targetY = 120 + Math.random() * 340;
            m.stateTimer = 1400 + Math.random() * 1400;
          }
        } else {
          const wobX = Math.cos(m.wobblePhase) * 32;
          const wobY = Math.sin(m.wobblePhase * 1.3) * 28;
          m.vx = ((dx / dist) * m.speed + wobX) * speedSlowFactor;
          m.vy = ((dy / dist) * m.speed + wobY) * speedSlowFactor;
          m.x += m.vx * dtSec;
          m.y += m.vy * dtSec;
        }
      } else if (m.state === 'diving') {
        const dx = m.targetX - m.x;
        const dy = m.targetY - m.y;
        const dist = Math.hypot(dx, dy);
        const diveSpeed = m.speed * 1.18 * speedSlowFactor;

        if (dist <= 22) {
          this.hurtSleeper();
          if (m.kind === 'boss') {
            m.state = 'flying';
            m.targetX = WORLD_WIDTH / 2;
            m.targetY = 200;
            m.stateTimer = 2200;
          } else {
            this.mosquitoes.splice(i, 1);
          }
          continue;
        }

        m.vx = (dx / dist) * diveSpeed;
        m.vy = (dy / dist) * diveSpeed;
        m.x += m.vx * dtSec;
        m.y += m.vy * dtSec;
      }

      const distToSleeper = Math.hypot(m.x - this.sleeper.targetX, m.y - this.sleeper.targetY);
      const prox = Math.max(0, 1 - distToSleeper / 480);
      closestProximity = Math.max(closestProximity, prox);
    }

    audioEngine.updateBuzz(this.mosquitoes.length, closestProximity, hasFastOrBoss);
    const activeSongs = this.mosquitoes
      .filter((m) => m.kind === 'singer' && m.songIndex !== undefined)
      .map((m) => m.songIndex as number);
    audioEngine.updateSinging(activeSongs);

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.lifeMs -= dtMs;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      if (p.x < 40 || p.x > WORLD_WIDTH - 40) p.vx *= -1;
      if (p.lifeMs <= 0) this.powerUps.splice(i, 1);
    }

    this.hudSyncTimer += dtMs;
    if (this.hudSyncTimer >= 100) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private pickMosquitoKind(): MosquitoKind {
    const w = this.level.weights;
    const total = w.normal + w.ninja + w.tank + w.singer;
    const roll = Math.random() * total;
    if (roll < w.normal) return 'normal';
    if (roll < w.normal + w.ninja) return 'ninja';
    if (roll < w.normal + w.ninja + w.tank) return 'tank';
    return 'singer';
  }

  private spawnMosquito(kind: MosquitoKind): void {
    const edge = Math.random();
    let x = 0;
    let y = 0;
    if (edge < 0.4) {
      x = -24;
      y = 90 + Math.random() * 320;
    } else if (edge < 0.8) {
      x = WORLD_WIDTH + 24;
      y = 90 + Math.random() * 320;
    } else {
      x = 40 + Math.random() * (WORLD_WIDTH - 80);
      y = 55;
    }

    const sm = this.level.speedMultiplier * this.dda.speedScale;
    const specs: Record<
      MosquitoKind,
      { radius: number; hitRadius: number; hp: number; speed: number; points: number; wobbleFreq: number }
    > = {
      normal: { radius: 18, hitRadius: 34, hp: 1, speed: 120 * sm, points: 100, wobbleFreq: 5.5 },
      ninja: { radius: 14, hitRadius: 31, hp: 1, speed: 185 * sm, points: 150, wobbleFreq: 9.5 },
      tank: { radius: 24, hitRadius: 38, hp: 2, speed: 92 * sm, points: 250, wobbleFreq: 3.5 },
      singer: { radius: 20, hitRadius: 36, hp: 1, speed: 112 * sm, points: 300, wobbleFreq: 6.5 },
      boss: { radius: 36, hitRadius: 48, hp: 6, speed: 108 * sm, points: 1000, wobbleFreq: 4.5 },
    };

    if (kind === 'tank' && this.level.id >= 3) {
      audioEngine.playMeme('memeYehKyaHai', false, 2800);
    }

    const s = specs[kind];
    const songPool = this.level.singerSongs;
    const songIndex =
      kind === 'singer' ? songPool[Math.floor(Math.random() * songPool.length)] : undefined;
    this.mosquitoes.push({
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: s.radius,
      hitRadius: s.hitRadius,
      hp: s.hp,
      maxHp: s.hp,
      speed: s.speed,
      wingPhase: Math.random() * Math.PI * 2,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleFreq: s.wobbleFreq,
      state: 'flying',
      stateTimer: 1600 + Math.random() * 1400,
      flashTimer: 0,
      points: s.points,
      targetX: 70 + Math.random() * (WORLD_WIDTH - 140),
      targetY: 140 + Math.random() * 260,
      songIndex,
      dodgeCooldownMs: 600,
    });
  }

  private spawnPowerUp(x: number, y: number): void {
    const kinds: PowerUpKind[] =
      this.sleeper.hearts < this.sleeper.maxHearts ? ['racket', 'coil', 'pillow'] : ['racket', 'coil'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.powerUps.push({
      id: this.nextId++,
      kind,
      x: Math.max(48, Math.min(WORLD_WIDTH - 48, x)),
      y: Math.max(120, Math.min(390, y)),
      vx: (Math.random() < 0.5 ? -1 : 1) * 42,
      vy: (Math.random() - 0.5) * 20,
      bobPhase: Math.random() * Math.PI * 2,
      radius: 24,
      lifeMs: 7500,
    });
  }

  private spawnSplatParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 170;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 40,
        size: 3 + Math.random() * 4,
        color,
        lifeMs: 420 + Math.random() * 200,
        maxLifeMs: 620,
      });
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string, scale = 1): void {
    this.texts.push({
      x: Math.max(60, Math.min(WORLD_WIDTH - 60, x)),
      y,
      text,
      color,
      scale,
      lifeMs: 900,
      maxLifeMs: 900,
    });
  }

  private emitHud(): void {
    const boss = this.mosquitoes.find((m) => m.kind === 'boss');
    this.callbacks.onHudUpdate({
      mode: this.mode,
      levelId: this.level.id,
      levelName: this.mode === 'endless' ? 'Endless Night' : this.level.name,
      score: this.score,
      combo: this.combo,
      hearts: this.sleeper.hearts,
      maxHearts: this.sleeper.maxHearts,
      kills: this.kills,
      targetKills: this.level.targetKills,
      ammo: this.ammo,
      maxAmmo: CLIP_SIZE,
      reloadMs: this.reloadMs,
      bossActive: Boolean(boss),
      bossHpRatio: boss ? boss.hp / boss.maxHp : 0,
      racketMs: this.racketMs,
      coilMs: this.coilMs,
      scoreMultiplier: this.scoreMultiplier,
    });
  }
}
