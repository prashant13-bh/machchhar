import {
  BOOSTER_COSTS,
  getLevelConfig,
  TOTAL_CAMPAIGN_LEVELS,
  type PowerUpKind,
} from '../config/levels';
import type { HudSnapshot } from '../engine/Entities';
import type { GameEngine, GamePhase, RunSummary, StartRunOptions } from '../engine/GameEngine';
import { adManager } from '../services/AdManager';
import { audioEngine } from '../services/AudioEngine';
import { nativeBridge } from '../services/NativeBridge';
import { ACHIEVEMENTS, STAMINA_REFILL_COST, storage, type AchievementDef } from '../services/Storage';

type ScreenName =
  | 'menu'
  | 'levels'
  | 'badges'
  | 'guide'
  | 'legal'
  | 'no_stamina'
  | 'hud'
  | 'paused'
  | 'level_clear'
  | 'game_over';

const SVG = {
  book: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  soundOn: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  soundOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  pause: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
};

export class UIController {
  private root: HTMLElement;
  private engine: GameEngine;
  private currentScreen: ScreenName = 'menu';
  private lastSummary?: RunSummary;
  private loadout: StartRunOptions = {};
  private staminaTimerId: number | null = null;
  private toastTimerId: number | null = null;

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.applyTheme();
    this.bindGlobalControls();
    this.renderMenu();
    void adManager.showBanner();
  }

  private applyTheme(): void {
    const theme = storage.getTheme();
    document.documentElement.dataset.theme = theme;
    const themeBtn = document.getElementById('desktop-theme-btn');
    if (themeBtn) {
      themeBtn.textContent = theme === 'light' ? 'Dark' : 'Light';
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#f6f3ea' : '#0b1020');
    }
  }

  private bindGlobalControls(): void {
    document.getElementById('desktop-fullscreen-btn')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    document.getElementById('desktop-theme-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      storage.toggleTheme();
      this.applyTheme();
      if (this.currentScreen === 'menu') {
        this.renderMenu();
      }
    });

    document.getElementById('top-nights-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      if (this.currentScreen === 'hud') this.engine.pause();
      this.renderLevelSelect();
    });

    document.getElementById('top-endless-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      const opts = { ...this.loadout };
      this.loadout = {};
      this.engine.startEndlessMode(opts);
    });

    document.getElementById('top-guide-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      if (this.currentScreen === 'hud') this.engine.pause();
      this.renderGuideModal();
    });

    document.getElementById('top-badges-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      if (this.currentScreen === 'hud') this.engine.pause();
      this.renderBadgesModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.currentScreen === 'hud') {
          e.preventDefault();
          this.engine.pause();
        } else if (this.currentScreen === 'paused') {
          e.preventDefault();
          this.engine.resume();
        } else if (
          this.currentScreen === 'levels' ||
          this.currentScreen === 'badges' ||
          this.currentScreen === 'guide' ||
          this.currentScreen === 'legal' ||
          this.currentScreen === 'no_stamina'
        ) {
          e.preventDefault();
          this.renderMenu();
        }
      } else if (e.code === 'KeyM' && !e.repeat) {
        audioEngine.unlock();
        audioEngine.toggleMute();
        if (this.currentScreen === 'hud') {
          const btn = this.root.querySelector('#hud-mute-btn');
          if (btn) btn.innerHTML = audioEngine.isMuted() ? SVG.soundOff : SVG.soundOn;
        } else if (this.currentScreen === 'menu') {
          this.renderMenu();
        } else if (this.currentScreen === 'paused') {
          this.renderPauseModal();
        }
      } else if (e.code === 'KeyF' && !e.repeat && !nativeBridge.isNative) {
        this.toggleFullscreen();
      }
    });

    window.addEventListener('machchhar:back', () => {
      if (this.currentScreen === 'hud') {
        this.engine.pause();
      } else if (this.currentScreen === 'paused') {
        this.engine.resume();
      } else if (this.currentScreen !== 'menu') {
        this.engine.returnToMenu();
      } else {
        nativeBridge.exitApp();
      }
    });
  }

  private toggleFullscreen(): void {
    const target = document.getElementById('stage-frame') ?? document.documentElement;
    if (!document.fullscreenElement) {
      void target.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }

  showAchievementToast(badge: AchievementDef): void {
    const toast = document.getElementById('achievement-toast');
    if (!toast) return;
    if (this.toastTimerId !== null) {
      clearTimeout(this.toastTimerId);
    }
    toast.textContent = `Trophy Unlocked: ${badge.title} (+10 Coins)`;
    toast.classList.remove('hidden');
    this.updateTopBar();
    this.toastTimerId = window.setTimeout(() => {
      toast.classList.add('hidden');
      this.toastTimerId = null;
    }, 2800);
  }

  private updateTopBar(): void {
    const save = storage.getData();
    const coinsEl = document.getElementById('top-coins-pill');
    const bestEl = document.getElementById('top-best-pill');
    if (coinsEl) coinsEl.textContent = `${save.coins} Coins`;
    if (bestEl) bestEl.textContent = `Best ${save.highScore.toLocaleString()}`;
  }

  handlePhaseChange(phase: GamePhase, summary?: RunSummary): void {
    this.stopStaminaTicker();
    this.lastSummary = summary;
    if (phase === 'playing') {
      this.currentScreen = 'hud';
      void adManager.hideBanner();
      this.renderHudShell();
    } else if (phase === 'paused') {
      this.currentScreen = 'paused';
      void adManager.showBanner();
      this.renderPauseModal();
    } else if (phase === 'level_clear') {
      this.currentScreen = 'level_clear';
      void adManager.showBanner();
      this.renderLevelClearModal();
    } else if (phase === 'game_over') {
      this.currentScreen = 'game_over';
      void adManager.showBanner();
      this.renderGameOverModal();
    } else {
      this.currentScreen = 'menu';
      void adManager.showBanner();
      this.renderMenu();
    }
    this.updateTopBar();
  }

  updateHud(hud: HudSnapshot): void {
    if (this.currentScreen !== 'hud') return;

    const heartsEl = this.root.querySelector('#hud-hearts');
    const scoreEl = this.root.querySelector('#hud-score');
    const goalEl = this.root.querySelector('#hud-goal');
    const ammoEl = this.root.querySelector('#hud-ammo');
    const comboEl = this.root.querySelector('#hud-combo');
    const bossWrap = this.root.querySelector('#hud-boss-wrap');
    const bossFill = this.root.querySelector('#hud-boss-fill') as HTMLElement | null;
    const tagsEl = this.root.querySelector('#hud-tags');

    if (heartsEl) {
      heartsEl.textContent = '❤️'.repeat(hud.hearts) + '🖤'.repeat(Math.max(0, hud.maxHearts - hud.hearts));
    }
    if (scoreEl) {
      scoreEl.textContent = `${hud.score.toLocaleString()} pts`;
    }
    if (goalEl) {
      goalEl.textContent =
        hud.mode === 'endless'
          ? `${hud.kills} Blasted`
          : `Night ${hud.levelId} · ${Math.min(hud.kills, hud.targetKills)}/${hud.targetKills}`;
    }
    if (ammoEl) {
      if (hud.racketMs > 0) {
        ammoEl.innerHTML = `<span style="color:var(--accent-sky)">INFINITE ZAP</span>`;
      } else if (hud.reloadMs > 0) {
        ammoEl.innerHTML = `<span style="color:var(--accent-orange)">RELOADING...</span>`;
      } else {
        const bullets = '🔸'.repeat(hud.ammo) + '▫️'.repeat(Math.max(0, hud.maxAmmo - hud.ammo));
        ammoEl.textContent = hud.ammo < hud.maxAmmo ? `${bullets} ↻` : bullets;
      }
    }
    if (comboEl) {
      if (hud.combo >= 2) {
        const fever = hud.combo >= 5;
        comboEl.textContent = fever ? `🔥 x${hud.combo} FEVER` : `x${hud.combo} COMBO`;
        comboEl.classList.toggle('combo-fever', fever);
        comboEl.classList.remove('hidden');
      } else {
        comboEl.classList.remove('combo-fever');
        comboEl.classList.add('hidden');
      }
    }
    if (bossWrap && bossFill) {
      if (hud.bossActive) {
        bossWrap.classList.remove('hidden');
        bossFill.style.width = `${Math.max(0, Math.round(hud.bossHpRatio * 100))}%`;
      } else {
        bossWrap.classList.add('hidden');
      }
    }
    if (tagsEl) {
      const tags: string[] = [];
      if (hud.racketMs > 0) {
        tags.push(`<span class="powerup-tag" style="color:var(--accent-sky)">ZAP ${(hud.racketMs / 1000).toFixed(1)}s</span>`);
      }
      if (hud.coilMs > 0) {
        tags.push(`<span class="powerup-tag" style="color:#7c3aed">COIL ${(hud.coilMs / 1000).toFixed(1)}s</span>`);
      }
      if (hud.scoreMultiplier > 1) {
        tags.push(`<span class="powerup-tag" style="color:var(--accent-gold-ink)">${hud.scoreMultiplier}X SCORE</span>`);
      }
      tagsEl.innerHTML = tags.join('');
    }
  }

  private stopStaminaTicker(): void {
    if (this.staminaTimerId !== null) {
      clearInterval(this.staminaTimerId);
      this.staminaTimerId = null;
    }
  }

  private formatStaminaCountdown(ms: number): string {
    const sec = Math.ceil(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  private tryLaunchCampaign(levelId: number): void {
    const stam = storage.getStaminaInfo();
    if (stam.stamina <= 0) {
      this.renderNoStaminaModal(levelId);
      return;
    }
    const opts = { ...this.loadout };
    this.loadout = {};
    this.engine.startCampaignLevel(levelId, opts);
  }

  private renderMenu(): void {
    this.stopStaminaTicker();
    this.currentScreen = 'menu';
    this.updateTopBar();
    const save = storage.getData();
    const stam = storage.getStaminaInfo();
    const nextLevel = Math.min(save.highestUnlockedLevel, TOTAL_CAMPAIGN_LEVELS);
    const nextCfg = getLevelConfig(nextLevel);
    const dda = storage.computeDdaModifiers(nextLevel);
    const dailyBonus = storage.getDailyBonusStatus();
    const goalHint = storage.getNextGoalHint();
    const soundIcon = audioEngine.isMuted() ? SVG.soundOff : SVG.soundOn;
    const themeIcon = storage.getTheme() === 'light' ? SVG.moon : SVG.sun;

    const stamRegenStr =
      stam.stamina < stam.max ? ` (${this.formatStaminaCountdown(stam.msUntilNext)})` : '';

    this.root.innerHTML = `
      <div class="hud-bar">
        <div class="hud-group" style="flex-direction:row;align-items:center">
          <div id="menu-stamina-pill" class="hud-pill">⚡ ${stam.stamina}/${stam.max}${stamRegenStr}</div>
          <div class="hud-pill">🪙 ${save.coins}</div>
        </div>
        <div class="hud-actions">
          ${save.winStreak >= 2 ? `<div class="hud-pill" style="color:var(--accent-pink)">🔥 ${save.winStreak}</div>` : ''}
          <button id="menu-theme-btn" class="icon-btn" title="Switch Light / Dark">${themeIcon}</button>
          <button id="menu-guide-btn" class="icon-btn" title="Field Guide">${SVG.book}</button>
          <button id="menu-mute-btn" class="icon-btn" title="Toggle Sound (M)">${soundIcon}</button>
        </div>
      </div>

      <div class="screen-backdrop menu-dock">
        <div class="card">
          <div class="game-badge">
            ${nextCfg.role === 'spike' ? 'HARD NIGHT AHEAD' : nextCfg.role === 'boss' ? 'BOSS NIGHT' : 'RAAT KA DAAKU'}
          </div>
          <h1 class="title-main">Machchhar</h1>
          <p class="subtitle">
            Guard Uncle's midnight sleep — aim &amp; silence the singing swarm!
            ${dda.statusLabel === 'Spicy!' ? '<br><strong style="color:var(--accent-pink)">Win Streak Active: Speed Boosted!</strong>' : ''}
          </p>

          ${
            dailyBonus.available
              ? `<button id="claim-daily-btn" class="daily-bonus-btn">🌙 Claim Night Bonus · Day ${dailyBonus.nextStreak} <strong>(+${dailyBonus.rewardCoins} 🪙)</strong></button>`
              : `<div class="goal-pill">🎯 ${goalHint}</div>`
          }

          <div class="stats-row">
            <div class="stat-box"><strong>${save.highScore.toLocaleString()}</strong><span>Best Score</span></div>
            <div class="stat-box"><strong>${save.totalSwatted}</strong><span>Blasted</span></div>
            <div class="stat-box"><strong>${save.achievements.length}/${ACHIEVEMENTS.length}</strong><span>Trophies</span></div>
          </div>

          <div class="booster-bar">
            <button id="buy-racket-btn" class="booster-chip ${this.loadout.starterPowerUp === 'racket' ? 'active' : ''}">
              <span>⚡ Zap</span>
              <small>${this.loadout.starterPowerUp === 'racket' ? 'READY' : `${BOOSTER_COSTS.racket} 🪙`}</small>
            </button>
            <button id="buy-coil-btn" class="booster-chip ${this.loadout.starterPowerUp === 'coil' ? 'active' : ''}">
              <span>🌀 Coil</span>
              <small>${this.loadout.starterPowerUp === 'coil' ? 'READY' : `${BOOSTER_COSTS.coil} 🪙`}</small>
            </button>
            <button id="buy-heart-btn" class="booster-chip ${this.loadout.extraHeart ? 'active' : ''}">
              <span>💖 +1 ❤️</span>
              <small>${this.loadout.extraHeart ? 'READY' : `${BOOSTER_COSTS.pillow} 🪙`}</small>
            </button>
          </div>

          <div class="btn-stack">
            <button id="play-btn" class="btn-primary">▶ PLAY NIGHT ${nextLevel}</button>
            <div class="btn-row">
              <button id="levels-btn" class="btn-secondary">NIGHTS</button>
              <button id="endless-btn" class="btn-secondary">ENDLESS</button>
            </div>
            <button id="boost-ad-btn" class="btn-reward">
              ${
                this.loadout.scoreMultiplier === 2 && this.loadout.starterPowerUp === 'racket'
                  ? 'ZAP + 2X SCORE ARMED!'
                  : 'FREE ZAP + 2X SCORE (WATCH AD)'
              }
            </button>
          </div>
          <div class="legal-footer">
            <button id="menu-badges-btn" class="link-btn">Trophies</button>
            <span>·</span>
            <button id="legal-privacy-btn" class="link-btn">Privacy</button>
            <span>·</span>
            <button id="legal-terms-btn" class="link-btn">Terms</button>
            <span>·</span>
            <button id="legal-support-btn" class="link-btn">${nativeBridge.hasAndroidBridge() ? 'Settings' : 'Support'}</button>
          </div>
        </div>
      </div>
    `;

    if (stam.stamina < stam.max) {
      this.staminaTimerId = window.setInterval(() => {
        const s = storage.getStaminaInfo();
        const el = this.root.querySelector('#menu-stamina-pill');
        if (el) {
          el.textContent =
            s.stamina < s.max
              ? `⚡ ${s.stamina}/${s.max} (${this.formatStaminaCountdown(s.msUntilNext)})`
              : `⚡ ${s.stamina}/${s.max}`;
        }
      }, 1000);
    }

    this.root.querySelector('#claim-daily-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      const res = storage.claimDailyBonus();
      if (res.claimed) {
        audioEngine.playPowerUp('pillow');
        nativeBridge.haptic('clear');
        this.renderMenu();
      }
    });

    this.root.querySelector('#menu-mute-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      nativeBridge.haptic('ui');
      audioEngine.toggleMute();
      this.renderMenu();
    });

    this.root.querySelector('#menu-theme-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      storage.toggleTheme();
      this.applyTheme();
      this.renderMenu();
    });

    this.root.querySelector('#menu-guide-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      if (!nativeBridge.openNativeGuide()) {
        this.renderGuideModal();
      }
    });

    this.root.querySelector('#menu-badges-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      this.renderBadgesModal();
    });

    this.bindBoosterPurchase('#buy-racket-btn', 'racket');
    this.bindBoosterPurchase('#buy-coil-btn', 'coil');
    this.bindBoosterPurchase('#buy-heart-btn', 'pillow');

    this.root.querySelector('#play-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      this.tryLaunchCampaign(nextLevel);
    });

    this.root.querySelector('#levels-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      this.stopStaminaTicker();
      this.renderLevelSelect();
    });

    this.root.querySelector('#endless-btn')?.addEventListener('click', () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      nativeBridge.haptic('ui');
      const opts = { ...this.loadout };
      this.loadout = {};
      this.engine.startEndlessMode(opts);
    });

    this.root.querySelector('#boost-ad-btn')?.addEventListener('click', async () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      if (this.loadout.scoreMultiplier === 2 && this.loadout.starterPowerUp === 'racket') return;
      const rewarded = await adManager.showRewardedAd('Zap Ammo + 2x Score Boost');
      if (rewarded) {
        this.loadout.starterPowerUp = 'racket';
        this.loadout.scoreMultiplier = 2;
        audioEngine.playPowerUp('racket');
        this.renderMenu();
      }
    });

    this.root.querySelector('#legal-privacy-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderLegalModal('privacy');
    });
    this.root.querySelector('#legal-terms-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderLegalModal('terms');
    });
    this.root.querySelector('#legal-support-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      if (!nativeBridge.openNativeSettings()) {
        this.renderLegalModal('support');
      }
    });
  }

  private renderGuideModal(): void {
    this.stopStaminaTicker();
    this.currentScreen = 'guide';
    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">FIELD GUIDE</div>
          <h2>Mosquito Squad &amp; Gear</h2>
          <p class="subtitle">Spot enemy traits &amp; power-ups before they wake Uncle.</p>
          <div class="guide-modal-list">
            <div class="guide-row"><span>🦟</span><div><strong>Buzzer (100 pts)</strong><small>1 HP standard pest diving toward bed.</small></div></div>
            <div class="guide-row"><span>🎧</span><div><strong>DJ Singer (300 pts)</strong><small>Sings loud beats — blast mid-song for MIC DROP!</small></div></div>
            <div class="guide-row"><span>🥷</span><div><strong>Shadow Ninja (150 pts)</strong><small>Fast flyer that dodges laser locks.</small></div></div>
            <div class="guide-row"><span>🛡️</span><div><strong>Armored Tank (250 pts)</strong><small>2 HP — first hit stuns with a BONK.</small></div></div>
            <div class="guide-row"><span>👑</span><div><strong>King Boss (1,000 pts)</strong><small>6 HP giant boss on Boss Nights.</small></div></div>
            <div class="guide-row"><span>⚡</span><div><strong>Zap / Coil / Heart</strong><small>Infinite rapid fire, 52% room slow, or +1 heart.</small></div></div>
          </div>
          <div class="btn-stack">
            <a class="btn-secondary" style="text-decoration:none;display:block" href="./guide.html" target="_blank" rel="noopener noreferrer">OPEN FULL MANUAL</a>
            <button id="guide-back-btn" class="btn-primary">← BACK TO GAME</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#guide-back-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderMenu();
    });
  }

  private renderBadgesModal(): void {
    this.stopStaminaTicker();
    this.currentScreen = 'badges';
    const save = storage.getData();

    const cards = ACHIEVEMENTS.map((a) => {
      const unlocked = save.achievements.includes(a.id);
      return `
        <div class="badge-tile ${unlocked ? '' : 'locked'}">
          <div class="badge-tile-icon">${unlocked ? a.icon : '🔒'}</div>
          <div>
            <strong>${a.title}</strong>
            <small>${a.desc}</small>
          </div>
        </div>
      `;
    }).join('');

    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">CAREER TROPHIES</div>
          <h2>Night Watch Badges</h2>
          <p class="subtitle">${save.achievements.length}/${ACHIEVEMENTS.length} unlocked · +10 🪙 per badge!</p>
          <div class="badge-grid">${cards}</div>
          <button id="badges-back-btn" class="btn-primary">← BACK TO MENU</button>
        </div>
      </div>
    `;

    this.root.querySelector('#badges-back-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderMenu();
    });
  }

  private renderLegalModal(tab: 'privacy' | 'terms' | 'support'): void {
    this.stopStaminaTicker();
    this.currentScreen = 'legal';
    const contentMap: Record<'privacy' | 'terms' | 'support', { title: string; body: string; link: string }> = {
      privacy: {
        title: 'Privacy Policy',
        link: './privacy.html',
        body: `
          <p><strong>Machchhar: Raat ka Daaku</strong> stores your levels, scores, coins, and stamina locally on your device only—no account or login is required.</p>
          <p>Free gameplay is supported by <strong>Google AdMob / AdSense</strong>, which may process your device Advertising ID, IP region, and ad diagnostics to deliver and measure ads.</p>
          <p>You can reset or opt out of personalized ads anytime in your device's Google Ads settings, or clear local progress via device App Storage.</p>
        `,
      },
      terms: {
        title: 'Terms of Service',
        link: './terms.html',
        body: `
          <p>Machchhar: Raat ka Daaku is provided for personal entertainment. In-game coins, stamina, and boosters have no cash value and cannot be exchanged for real money.</p>
          <p>Third-party advertisements displayed in the app are governed by their respective ad network terms.</p>
        `,
      },
      support: {
        title: 'Support & Data Deletion',
        link: './support.html',
        body: `
          <p><strong>Contact:</strong> <a href="mailto:yuvasamrajyaofficial@gmail.com" style="color:var(--accent-sky)">yuvasamrajyaofficial@gmail.com</a></p>
          <p><strong>Package:</strong> <code>com.mct.machchhar</code></p>
          <p><strong>Clear Data:</strong> Android Settings → Apps → Machchhar: Raat ka Daaku → Storage → Clear Data (or uninstall).</p>
        `,
      },
    };

    const current = contentMap[tab];
    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">LEGAL &amp; SUPPORT</div>
          <h2>${current.title}</h2>
          <div class="legal-tabs">
            <button data-tab="privacy" class="booster-chip ${tab === 'privacy' ? 'active' : ''}">Privacy</button>
            <button data-tab="terms" class="booster-chip ${tab === 'terms' ? 'active' : ''}">Terms</button>
            <button data-tab="support" class="booster-chip ${tab === 'support' ? 'active' : ''}">Support</button>
          </div>
          <div class="legal-body">${current.body}</div>
          <div class="btn-stack">
            <a class="btn-secondary" style="text-decoration:none;display:block" href="${current.link}" target="_blank" rel="noopener noreferrer">OPEN FULL PAGE</a>
            <button id="legal-back-btn" class="btn-primary">← BACK TO MENU</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelectorAll('.legal-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        audioEngine.playUiClick();
        const nextTab = (btn as HTMLElement).dataset.tab as 'privacy' | 'terms' | 'support';
        this.renderLegalModal(nextTab);
      });
    });

    this.root.querySelector('#legal-back-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderMenu();
    });
  }

  private bindBoosterPurchase(selector: string, kind: PowerUpKind): void {
    this.root.querySelector(selector)?.addEventListener('click', async () => {
      audioEngine.unlock();
      audioEngine.playUiClick();
      if (kind === 'pillow' && this.loadout.extraHeart) return;
      if (kind !== 'pillow' && this.loadout.starterPowerUp === kind) return;

      const cost = BOOSTER_COSTS[kind];
      if (storage.spendCoins(cost)) {
        audioEngine.playPowerUp(kind);
        if (kind === 'pillow') this.loadout.extraHeart = true;
        else this.loadout.starterPowerUp = kind;
        this.renderMenu();
      } else {
        const rewarded = await adManager.showRewardedAd('Free Booster + 25 Coins');
        if (rewarded) {
          storage.addCoins(25);
          audioEngine.playPowerUp(kind);
          if (kind === 'pillow') this.loadout.extraHeart = true;
          else this.loadout.starterPowerUp = kind;
          this.renderMenu();
        }
      }
    });
  }

  private renderNoStaminaModal(targetLevelId: number): void {
    this.currentScreen = 'no_stamina';
    const save = storage.getData();
    const stam = storage.getStaminaInfo();

    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge badge-danger">SLEEPY HANDS</div>
          <h2>Out of Sleep Stamina</h2>
          <p class="subtitle">
            Next bolt regenerates in <strong>${this.formatStaminaCountdown(stam.msUntilNext)}</strong>.<br>
            Refill instantly to tackle <strong>Night ${targetLevelId}</strong>!
          </p>
          <div class="btn-stack">
            <button id="refill-ad-btn" class="btn-reward">REFILL 5/5 STAMINA (WATCH AD)</button>
            <button id="refill-coins-btn" class="btn-primary" ${save.coins < STAMINA_REFILL_COST ? 'disabled' : ''}>
              REFILL WITH ${STAMINA_REFILL_COST} COINS (You: ${save.coins})
            </button>
            <button id="nostam-endless-btn" class="btn-secondary">PLAY ENDLESS (FREE)</button>
            <button id="nostam-back-btn" class="btn-secondary">← BACK</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#refill-ad-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      const ok = await adManager.showRewardedAd('Full 5/5 Sleep Stamina Refill');
      if (ok) {
        storage.refillFullStamina();
        audioEngine.playPowerUp('pillow');
        this.tryLaunchCampaign(targetLevelId);
      }
    });

    this.root.querySelector('#refill-coins-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      if (storage.spendCoins(STAMINA_REFILL_COST)) {
        storage.refillFullStamina();
        audioEngine.playPowerUp('pillow');
        this.tryLaunchCampaign(targetLevelId);
      }
    });

    this.root.querySelector('#nostam-endless-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      const opts = { ...this.loadout };
      this.loadout = {};
      this.engine.startEndlessMode(opts);
    });

    this.root.querySelector('#nostam-back-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderMenu();
    });
  }

  private renderLevelSelect(): void {
    this.currentScreen = 'levels';
    const save = storage.getData();
    const maxDisplay = Math.max(TOTAL_CAMPAIGN_LEVELS, save.highestUnlockedLevel);

    const tiles = Array.from({ length: maxDisplay }, (_, idx) => {
      const id = idx + 1;
      const cfg = getLevelConfig(id);
      const unlocked = id <= save.highestUnlockedLevel;
      const stars = save.starsByLevel[id] ?? 0;
      const starsHtml = unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒 Locked';
      const badge = cfg.isBossLevel ? '👑' : cfg.role === 'spike' ? '🔥' : '';

      return `
        <button class="level-tile ${unlocked ? '' : 'locked'}" data-level="${id}" ${unlocked ? '' : 'disabled'}>
          <div class="level-tile-head">
            <span>Night ${id} ${badge}</span>
            <span>${cfg.targetKills} 🦟</span>
          </div>
          <div class="level-tile-sub">${cfg.name.replace(/^Night \d+:\s*/, '')}</div>
          <div class="level-tile-stars">${starsHtml}</div>
        </button>
      `;
    }).join('');

    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">SELECT NIGHT</div>
          <h2>Choose Your Battle</h2>
          <p class="subtitle">👑 Boss Nights · 🔥 Hard Nights · Earn 3 stars!</p>
          <div class="level-grid">${tiles}</div>
          <button id="back-menu-btn" class="btn-secondary">← BACK TO MENU</button>
        </div>
      </div>
    `;

    this.root.querySelectorAll('.level-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lvl = Number((btn as HTMLElement).dataset.level);
        if (!lvl) return;
        audioEngine.unlock();
        audioEngine.playUiClick();
        this.tryLaunchCampaign(lvl);
      });
    });

    this.root.querySelector('#back-menu-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.renderMenu();
    });
  }

  private renderHudShell(): void {
    const soundIcon = audioEngine.isMuted() ? SVG.soundOff : SVG.soundOn;
    this.root.innerHTML = `
      <div class="hud-bar">
        <div class="hud-group">
          <div id="hud-hearts" class="hud-pill">❤️❤️❤️❤️</div>
          <div id="hud-goal" class="hud-pill">Night 1 · 0/8</div>
          <button id="hud-ammo" class="hud-pill hud-ammo-btn" type="button" title="Tap or press R to reload">🔸🔸🔸🔸🔸🔸</button>
        </div>
        <div class="hud-group" style="align-items:flex-end">
          <div class="hud-actions">
            <div id="hud-score" class="hud-pill">0 pts</div>
            <button id="hud-mute-btn" class="icon-btn" title="Sound (M)">${soundIcon}</button>
            <button id="hud-pause-btn" class="icon-btn" title="Pause (P)">${SVG.pause}</button>
          </div>
          <div id="hud-combo" class="hud-pill hidden" style="color:var(--accent-gold-ink)">x2 COMBO</div>
        </div>
      </div>
      <div class="hud-center-info">
        <div id="hud-boss-wrap" class="boss-bar-wrap hidden">
          <div id="hud-boss-fill" class="boss-bar-fill" style="width:100%"></div>
        </div>
        <div id="hud-tags" class="powerup-tags"></div>
      </div>
    `;

    this.root.querySelector('#hud-ammo')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.manualReload();
    });

    this.root.querySelector('#hud-mute-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      audioEngine.unlock();
      const muted = audioEngine.toggleMute();
      const btn = this.root.querySelector('#hud-mute-btn');
      if (btn) btn.innerHTML = muted ? SVG.soundOff : SVG.soundOn;
    });

    this.root.querySelector('#hud-pause-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      audioEngine.playUiClick();
      this.engine.pause();
    });
  }

  private renderPauseModal(): void {
    const muteText = audioEngine.isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">PAUSED</div>
          <h2>Shhh... Don't Wake Him</h2>
          <p class="subtitle">Take a breather before the mosquitoes return.</p>
          <div class="btn-stack">
            <button id="resume-btn" class="btn-primary">▶ RESUME</button>
            <button id="pause-mute-btn" class="btn-secondary">${muteText}</button>
            ${
              nativeBridge.hasAndroidBridge()
                ? `<button id="pause-settings-btn" class="btn-secondary">ANDROID SETTINGS</button>`
                : ''
            }
            <button id="pause-menu-btn" class="btn-danger">MAIN MENU</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#resume-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.engine.resume();
    });
    this.root.querySelector('#pause-mute-btn')?.addEventListener('click', () => {
      audioEngine.toggleMute();
      this.renderPauseModal();
    });
    this.root.querySelector('#pause-settings-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.openNativeSettings();
    });
    this.root.querySelector('#pause-menu-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.engine.returnToMenu();
    });
  }

  private renderLevelClearModal(): void {
    const s = this.lastSummary;
    if (!s) return;
    const starsHtml = '⭐'.repeat(s.stars) + '☆'.repeat(3 - s.stars);
    const nextCfg = getLevelConfig(s.levelId + 1);

    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge">SWEET DREAMS</div>
          <h2>${s.levelName} Cleared!</h2>
          <div class="stars-display">${starsHtml}</div>
          <div class="goal-pill">Up Next: ${nextCfg.name}</div>
          <div class="stats-row">
            <div class="stat-box"><strong>${s.score.toLocaleString()}</strong><span>Score</span></div>
            <div class="stat-box"><strong>${s.accuracy}%</strong><span>Accuracy</span></div>
            <div class="stat-box"><strong>+${s.coinsEarned} 🪙</strong><span>Coins</span></div>
          </div>
          <div class="btn-stack">
            <button id="next-level-btn" class="btn-primary">▶ NEXT NIGHT (${s.levelId + 1})</button>
            <button id="double-coins-btn" class="btn-reward">DOUBLE COINS (+${s.coinsEarned}) — WATCH AD</button>
            <div class="btn-row">
              <button id="replay-level-btn" class="btn-secondary">REPLAY</button>
              <button id="clear-share-btn" class="btn-secondary">SHARE</button>
            </div>
            <button id="clear-menu-btn" class="btn-secondary">MAIN MENU</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#next-level-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      await adManager.maybeShowInterstitial('level_clear', s.levelId);
      this.tryLaunchCampaign(s.levelId + 1);
    });

    this.root.querySelector('#replay-level-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.tryLaunchCampaign(s.levelId);
    });

    this.root.querySelector('#clear-share-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.shareScore(s.score, s.kills);
    });

    this.root.querySelector('#double-coins-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      const btn = this.root.querySelector('#double-coins-btn') as HTMLButtonElement | null;
      const rewarded = await adManager.showRewardedAd(`+${s.coinsEarned} Bonus Coins`);
      if (rewarded) {
        storage.addCoins(s.coinsEarned);
        audioEngine.playPowerUp('pillow');
        this.updateTopBar();
        if (btn) {
          btn.disabled = true;
          btn.textContent = `+${s.coinsEarned} BONUS COINS ADDED!`;
        }
      }
    });

    this.root.querySelector('#clear-menu-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      this.engine.returnToMenu();
    });
  }

  private renderGameOverModal(): void {
    const s = this.lastSummary;
    if (!s) return;
    const isNearMiss = s.mode === 'campaign' && s.remainingToWin > 0 && s.remainingToWin <= 4;

    this.root.innerHTML = `
      <div class="screen-backdrop">
        <div class="card">
          <div class="game-badge badge-danger">
            ${isNearMiss ? `SO CLOSE! ONLY ${s.remainingToWin} LEFT` : 'ALARM RINGING'}
          </div>
          <h2>He Woke Up Grumpy!</h2>
          <p class="subtitle">
            ${
              isNearMiss
                ? `You only needed <strong>${s.remainingToWin} more</strong> mosquito${s.remainingToWin > 1 ? 'es' : ''}! Finish it now!`
                : 'Too many mosquito bites disturbed his sleep.'
            }
          </p>
          <div class="stats-row">
            <div class="stat-box"><strong>${s.score.toLocaleString()}</strong><span>Score</span></div>
            <div class="stat-box"><strong>${s.kills}</strong><span>Blasted</span></div>
            <div class="stat-box"><strong>x${s.maxCombo}</strong><span>Max Combo</span></div>
          </div>
          <div class="btn-stack">
            ${
              !s.revivedUsed
                ? `<button id="revive-ad-btn" class="btn-reward">REVIVE +2 HEARTS &amp; ZAP (WATCH AD)</button>`
                : ''
            }
            <button id="retry-btn" class="btn-primary">TRY AGAIN</button>
            <div class="btn-row">
              <button id="gameover-share-btn" class="btn-secondary">SHARE</button>
              <button id="gameover-menu-btn" class="btn-secondary">MENU</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#revive-ad-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      const ok = await adManager.showRewardedAd('Second Wind (+2 Hearts & Zap)');
      if (ok) {
        this.engine.revive(2);
      }
    });

    this.root.querySelector('#retry-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      await adManager.maybeShowInterstitial('game_over', s.levelId);
      if (s.mode === 'endless') {
        this.engine.startEndlessMode();
      } else {
        this.tryLaunchCampaign(s.levelId);
      }
    });

    this.root.querySelector('#gameover-share-btn')?.addEventListener('click', () => {
      audioEngine.playUiClick();
      nativeBridge.shareScore(s.score, s.kills);
    });

    this.root.querySelector('#gameover-menu-btn')?.addEventListener('click', async () => {
      audioEngine.playUiClick();
      await adManager.maybeShowInterstitial('game_over', s.levelId);
      this.engine.returnToMenu();
    });
  }
}
