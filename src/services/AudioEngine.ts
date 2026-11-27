import type { PowerUpKind } from '../config/levels';
import { storage } from './Storage';

export type MemeClipKey =
  | 'memeChalo'
  | 'memeAayein'
  | 'memeYehKyaHai'
  | 'memeKyaRe'
  | 'memeBaingan'
  | 'memeBaapRe'
  | 'memeBachaLo'
  | 'memeEkSecond'
  | 'memeYeLe';

type BufferKey =
  | 'buzz1'
  | 'buzz2'
  | 'gunshot'
  | 'scream'
  | 'miss'
  | 'singer1'
  | 'singer2'
  | 'singer3'
  | 'singer4'
  | MemeClipKey;

const MEME_CAPTIONS: Record<MemeClipKey, string> = {
  memeChalo: 'Chalo!',
  memeAayein: 'Aayein?!',
  memeYehKyaHai: 'Yeh kya hai?!',
  memeKyaRe: 'Kya re?!',
  memeBaingan: 'Baingan!',
  memeBaapRe: 'Baap re!',
  memeBachaLo: 'Amma! Bacha lo!',
  memeEkSecond: 'Lekin ek second...',
  memeYeLe: 'Ye le!',
};

/**
 * Audio Engine powered exclusively by the user's trimmed audio clips:
 * - Mosquito buzz loops: buzz-1.mp3, buzz-2.mp3
 * - Singing mosquitoes: singer-1.mp3 .. singer-4.mp3
 * - Combat & reactions: gunshot.mp3, scream.mp3, miss.mp3, and 9 meme-*.mp3 clips
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = storage.isMuted();

  private buffers: Partial<Record<BufferKey, AudioBuffer>> = {};
  private loadingStarted = false;

  private buzz1Gain: GainNode | null = null;
  private buzz2Gain: GainNode | null = null;
  private buzz1Source: AudioBufferSourceNode | null = null;
  private buzz2Source: AudioBufferSourceNode | null = null;

  private activeSongIndex: number | null = null;
  private singerSampleSource: AudioBufferSourceNode | null = null;
  private singerSampleGain: GainNode | null = null;

  private lastMemeAt = 0;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.setMuted(muted);
    if (muted) {
      this.silenceAllLoops();
      this.stopSinging();
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      void this.preloadClips();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private async preloadClips(): Promise<void> {
    if (!this.ctx || this.loadingStarted) return;
    this.loadingStarted = true;

    const entries: Array<[BufferKey, string]> = [
      ['buzz1', './audio/buzz-1.mp3'],
      ['buzz2', './audio/buzz-2.mp3'],
      ['gunshot', './audio/gunshot.mp3'],
      ['scream', './audio/scream.mp3'],
      ['miss', './audio/miss.mp3'],
      ['singer1', './audio/singer-1.mp3'],
      ['singer2', './audio/singer-2.mp3'],
      ['singer3', './audio/singer-3.mp3'],
      ['singer4', './audio/singer-4.mp3'],
      ['memeChalo', './audio/meme-chalo.mp3'],
      ['memeAayein', './audio/meme-aayein.mp3'],
      ['memeYehKyaHai', './audio/meme-yeh-kya-hai.mp3'],
      ['memeKyaRe', './audio/meme-kya-re.mp3'],
      ['memeBaingan', './audio/meme-baingan.mp3'],
      ['memeBaapRe', './audio/meme-baap-re.mp3'],
      ['memeBachaLo', './audio/meme-bacha-lo.mp3'],
      ['memeEkSecond', './audio/meme-ek-second.mp3'],
      ['memeYeLe', './audio/meme-ye-le.mp3'],
    ];

    await Promise.all(
      entries.map(async ([key, url]) => {
        if (!this.ctx) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          this.buffers[key] = await this.ctx.decodeAudioData(arr);
        } catch {
          // Ignore fetch failure gracefully
        }
      })
    );

    this.ensureBuzzLoopsStarted();
  }

  private ensureBuzzLoopsStarted(): void {
    if (!this.ctx) return;
    if (this.buffers.buzz1 && !this.buzz1Source) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.buzz1;
      src.loop = true;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start();
      this.buzz1Gain = gain;
      this.buzz1Source = src;
    }
    if (this.buffers.buzz2 && !this.buzz2Source) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.buzz2;
      src.loop = true;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start();
      this.buzz2Gain = gain;
      this.buzz2Source = src;
    }
  }

  /**
   * Plays one of the 9 user-provided meme clips (throttled so clips never clash)
   * and returns its caption for Uncle's speech bubble.
   */
  playMeme(key: MemeClipKey, force = false, minGapMs = 1150): string | null {
    const now = performance.now();
    if (!force && now - this.lastMemeAt < minGapMs) {
      return null;
    }
    this.lastMemeAt = now;

    if (!this.muted && this.ctx && this.buffers[key]) {
      this.playSample(this.buffers[key] as AudioBuffer, 0.86, 1);
    }
    return MEME_CAPTIONS[key];
  }

  /**
   * Plays the user's trimmed singing mosquito tracks (0..3 -> singer-1..4.mp3)
   * whenever at least one Singing Mosquito is flying.
   */
  updateSinging(activeSongIndices: number[]): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || activeSongIndices.length === 0) {
      this.stopSinging();
      return;
    }

    const desired = activeSongIndices[0] % 4;
    if (this.activeSongIndex === desired) return;

    const map: Array<'singer1' | 'singer2' | 'singer3' | 'singer4'> = [
      'singer1',
      'singer2',
      'singer3',
      'singer4',
    ];
    const buf = this.buffers[map[desired]];
    if (!buf) return;

    this.stopSinging();
    this.activeSongIndex = desired;
    this.startSingerSample(buf);
  }

  stopSinging(): void {
    this.activeSongIndex = null;
    if (this.singerSampleSource) {
      try {
        this.singerSampleSource.stop();
      } catch {
        // Ignore already stopped
      }
      this.singerSampleSource.disconnect();
      this.singerSampleSource = null;
    }
    if (this.singerSampleGain) {
      this.singerSampleGain.disconnect();
      this.singerSampleGain = null;
    }
  }

  private startSingerSample(buffer: AudioBuffer): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.48;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
    this.singerSampleSource = src;
    this.singerSampleGain = gain;
  }

  playSingerStopScratch(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1150, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.24);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  playReloadClick(finished = false): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(finished ? 960 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(finished ? 1280 : 280, t + 0.055);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.065);
  }

  private silenceAllLoops(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.buzz1Gain?.gain.setTargetAtTime(0, now, 0.04);
    this.buzz2Gain?.gain.setTargetAtTime(0, now, 0.04);
  }

  updateBuzz(activeCount: number, closestProximity: number, hasFastOrBoss: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.muted || activeCount <= 0 || this.ctx.state !== 'running') {
      this.silenceAllLoops();
      return;
    }

    const singerDuck = this.activeSongIndex !== null ? 0.55 : 1;

    if (this.buzz1Gain && this.buzz1Source) {
      const baseVol = Math.min(0.42, 0.1 + activeCount * 0.032 + closestProximity * 0.22) * singerDuck;
      this.buzz1Gain.gain.setTargetAtTime(baseVol, now, 0.07);
      this.buzz1Source.playbackRate.setTargetAtTime(0.95 + closestProximity * 0.24, now, 0.08);
    }

    if (this.buzz2Gain && this.buzz2Source) {
      const layerVol =
        (hasFastOrBoss || activeCount >= 3 ? Math.min(0.38, 0.12 + closestProximity * 0.24) : 0) * singerDuck;
      this.buzz2Gain.gain.setTargetAtTime(layerVol, now, 0.08);
      this.buzz2Source.playbackRate.setTargetAtTime(hasFastOrBoss ? 1.12 : 1.0, now, 0.08);
    }
  }

  stopBuzz(): void {
    this.silenceAllLoops();
    this.stopSinging();
  }

  maybePlaySnore(_nowMs: number): void {
    // Removed synthesized voice/snore so only user-provided audio clips & clean SFX play
  }

  playGunshot(isHit: boolean, combo: number, zapMode = false): void {
    if (this.muted || !this.ctx) return;

    if (this.buffers.gunshot) {
      this.playSample(this.buffers.gunshot, 0.65, zapMode ? 1.24 : 0.94 + Math.random() * 0.14);
    }

    const t = this.ctx.currentTime;
    if (isHit && combo >= 2) {
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      const note = 523.25 * Math.pow(1.06, Math.min(combo, 12));
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(note, t + 0.04);
      chime.frequency.exponentialRampToValueAtTime(note * 1.25, t + 0.17);
      chimeGain.gain.setValueAtTime(0.11, t + 0.04);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      chime.connect(chimeGain);
      chimeGain.connect(this.ctx.destination);
      chime.start(t + 0.04);
      chime.stop(t + 0.21);
    }
  }

  playArmorBonk(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(125, t + 0.11);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playSleeperOuch(): void {
    if (this.muted || !this.ctx || !this.buffers.scream) return;
    this.playSample(this.buffers.scream, 0.72, 0.96 + Math.random() * 0.08);
  }

  playMissVoice(allowBaingan: boolean): string {
    if (allowBaingan && Math.random() < 0.5 && this.buffers.memeBaingan) {
      this.playSample(this.buffers.memeBaingan, 0.85, 1);
      return 'Baingan!';
    }
    if (!this.muted && this.ctx && this.buffers.miss) {
      this.playSample(this.buffers.miss, 0.85, 0.97 + Math.random() * 0.06);
    }
    return 'Arre baap re!';
  }

  playPowerUp(kind: PowerUpKind): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes =
      kind === 'racket' ? [523, 659, 987] : kind === 'coil' ? [392, 494, 587] : [440, 554, 659];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.055);
      gain.gain.setValueAtTime(0.14, t + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.055 + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + idx * 0.055);
      osc.stop(t + idx * 0.055 + 0.17);
    });
  }

  playLevelClear(): void {
    if (this.muted || !this.ctx) return;
    this.stopBuzz();
    const t = this.ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.09);
      gain.gain.setValueAtTime(0.18, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.3);
    });
  }

  playGameOverAlarm(): void {
    if (this.muted || !this.ctx) return;
    this.stopBuzz();
    if (this.buffers.scream) {
      this.playSample(this.buffers.scream, 0.85, 0.9);
    }
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const start = t + i * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 740, start);
      gain.gain.setValueAtTime(0.11, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  playUiClick(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.045);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  private playSample(buffer: AudioBuffer, volume: number, playbackRate = 1): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
  }
}

export const audioEngine = new AudioEngine();
