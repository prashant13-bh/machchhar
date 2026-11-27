import type { PowerUpKind } from '../config/levels';
import { storage } from './Storage';

export type QuipCategory = 'hit' | 'boss' | 'singer' | 'bitten' | 'gameover';

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

const QUIPS: Record<QuipCategory, string[]> = {
  hit: ['Dhishoom!', 'Sone de bhai!', 'Bhaag machhar!', 'Ek aur gaya!', 'Headshot!'],
  boss: ['Khamosh!', 'King gaya kaam se!', 'Bada machhar saaf!'],
  singer: ['Gaana band kar!', 'Besura machhar!', 'DJ machhar out!', 'Mic drop!'],
  bitten: ['Arre baap re!', 'Kaat liya re!', 'Neend kharab kar di!'],
  gameover: ['Alarm baj gaya bhai!', 'Neend ki band baj gayi!'],
};

const SYNTH_SONGS: Array<{ stepMs: number; notes: number[] }> = [
  { stepMs: 145, notes: [784, 988, 1175, 988, 1047, 1175, 1319, 1175, 988, 880, 988, 784] },
  { stepMs: 130, notes: [880, 880, 1047, 1175, 1047, 880, 784, 880, 1175, 1319, 1175, 988] },
  { stepMs: 165, notes: [659, 784, 880, 988, 1175, 988, 880, 784, 880, 784, 659, 587] },
  { stepMs: 120, notes: [1047, 0, 1047, 1319, 1175, 988, 880, 988, 1047, 1175, 1319, 1568] },
];

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
  private synthSongTimer: number | null = null;
  private synthStep = 0;

  private fallbackOscA: OscillatorNode | null = null;
  private fallbackOscB: OscillatorNode | null = null;
  private fallbackLfo: OscillatorNode | null = null;
  private fallbackFilter: BiquadFilterNode | null = null;
  private fallbackGain: GainNode | null = null;

  private lastSnoreAt = 0;
  private lastVoiceAt = 0;
  private lastMemeAt = 0;
  private cachedVoice: SpeechSynthesisVoice | null = null;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.setMuted(muted);
    if (muted) {
      this.silenceAllLoops();
      this.stopSinging();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
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
      this.setupFallbackBuzzNodes();
      void this.preloadClips();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.pickPreferredVoice();
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
          // Ignore missing clip gracefully
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

  private pickPreferredVoice(): void {
    if (!('speechSynthesis' in window) || this.cachedVoice) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    this.cachedVoice =
      voices.find((v) => /en-IN|hi-IN/i.test(v.lang)) ??
      voices.find((v) => /male|ravi|prabhat|david|mark/i.test(v.name)) ??
      voices[0];
  }

  /**
   * Plays one of the 9 trimmed trending meme clips (throttled so they never clash)
   * and returns its caption for speech bubbles / floating popups.
   */
  playMeme(key: MemeClipKey, force = false, minGapMs = 1150): string | null {
    const now = performance.now();
    if (!force && now - this.lastMemeAt < minGapMs) {
      return null;
    }
    this.lastMemeAt = now;

    if (!this.muted && this.ctx && this.buffers[key]) {
      this.playSample(this.buffers[key] as AudioBuffer, 0.84, 1);
    }
    return MEME_CAPTIONS[key];
  }

  triggerComedyQuip(category: QuipCategory, force = false): string | null {
    const now = performance.now();
    if (!force && now - this.lastVoiceAt < 1850) {
      return null;
    }
    this.lastVoiceAt = now;

    const list = QUIPS[category];
    const line = list[Math.floor(Math.random() * list.length)];

    if (!this.muted && 'speechSynthesis' in window) {
      try {
        this.pickPreferredVoice();
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(line);
        if (this.cachedVoice) utter.voice = this.cachedVoice;
        utter.pitch = 0.68;
        utter.rate = 1.12;
        utter.volume = 0.88;
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speech errors
      }
    }

    return line;
  }

  updateSinging(activeSongIndices: number[]): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || activeSongIndices.length === 0) {
      this.stopSinging();
      return;
    }

    const desired = activeSongIndices[0];
    if (this.activeSongIndex === desired) return;

    this.stopSinging();
    this.activeSongIndex = desired;

    if (desired === 0 && this.buffers.singer1) {
      this.startSingerSample(this.buffers.singer1);
    } else if (desired === 1 && this.buffers.singer2) {
      this.startSingerSample(this.buffers.singer2);
    } else if (desired === 2 && this.buffers.singer3) {
      this.startSingerSample(this.buffers.singer3);
    } else if (desired === 3 && this.buffers.singer4) {
      this.startSingerSample(this.buffers.singer4);
    } else {
      const song = SYNTH_SONGS[Math.abs(desired - 4) % SYNTH_SONGS.length];
      this.startSynthSong(song.stepMs, song.notes);
    }
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
    if (this.synthSongTimer !== null) {
      clearInterval(this.synthSongTimer);
      this.synthSongTimer = null;
    }
  }

  private startSingerSample(buffer: AudioBuffer): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.44;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
    this.singerSampleSource = src;
    this.singerSampleGain = gain;
  }

  private startSynthSong(stepMs: number, notes: number[]): void {
    this.synthStep = 0;
    const playStep = () => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const freq = notes[this.synthStep % notes.length];
      const stepIdx = this.synthStep;
      this.synthStep += 1;

      const t = this.ctx.currentTime;
      if (stepIdx % 2 === 0) {
        const kick = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(140, t);
        kick.frequency.exponentialRampToValueAtTime(48, t + 0.08);
        kGain.gain.setValueAtTime(0.14, t);
        kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        kick.connect(kGain);
        kGain.connect(this.ctx.destination);
        kick.start(t);
        kick.stop(t + 0.1);
      }

      if (freq > 0) {
        const vox = this.ctx.createOscillator();
        const vibrato = this.ctx.createOscillator();
        const vibGain = this.ctx.createGain();
        const formant = this.ctx.createBiquadFilter();
        const vGain = this.ctx.createGain();

        vox.type = 'sawtooth';
        vox.frequency.setValueAtTime(freq, t);
        vibrato.frequency.value = 14;
        vibGain.gain.value = 24;
        vibrato.connect(vibGain);
        vibGain.connect(vox.frequency);

        formant.type = 'bandpass';
        formant.frequency.value = freq * 1.4;
        formant.Q.value = 2.6;

        const dur = (stepMs / 1000) * 0.9;
        vGain.gain.setValueAtTime(0.001, t);
        vGain.gain.linearRampToValueAtTime(0.15, t + 0.015);
        vGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        vox.connect(formant);
        formant.connect(vGain);
        vGain.connect(this.ctx.destination);

        vibrato.start(t);
        vox.start(t);
        vibrato.stop(t + dur + 0.01);
        vox.stop(t + dur + 0.01);
      }
    };

    playStep();
    this.synthSongTimer = window.setInterval(playStep, stepMs);
  }

  playSingerStopScratch(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1150, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.24);
    gain.gain.setValueAtTime(0.22, t);
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

  private setupFallbackBuzzNodes(): void {
    if (!this.ctx || this.fallbackGain) return;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const masterGain = this.ctx.createGain();

    oscA.type = 'sawtooth';
    oscA.frequency.value = 310;
    oscB.type = 'triangle';
    oscB.frequency.value = 624;
    lfo.type = 'sine';
    lfo.frequency.value = 18;
    lfoGain.gain.value = 26;
    filter.type = 'bandpass';
    filter.frequency.value = 780;
    filter.Q.value = 3.2;
    masterGain.gain.value = 0;

    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);
    lfoGain.connect(oscB.frequency);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(this.ctx.destination);

    oscA.start();
    oscB.start();
    lfo.start();

    this.fallbackOscA = oscA;
    this.fallbackOscB = oscB;
    this.fallbackLfo = lfo;
    this.fallbackFilter = filter;
    this.fallbackGain = masterGain;
  }

  private silenceAllLoops(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.buzz1Gain?.gain.setTargetAtTime(0, now, 0.04);
    this.buzz2Gain?.gain.setTargetAtTime(0, now, 0.04);
    this.fallbackGain?.gain.setTargetAtTime(0, now, 0.04);
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
      this.fallbackGain?.gain.setTargetAtTime(0, now, 0.04);
      const baseVol = Math.min(0.4, 0.1 + activeCount * 0.032 + closestProximity * 0.2) * singerDuck;
      this.buzz1Gain.gain.setTargetAtTime(baseVol, now, 0.07);
      this.buzz1Source.playbackRate.setTargetAtTime(0.95 + closestProximity * 0.24, now, 0.08);

      if (this.buzz2Gain && this.buzz2Source) {
        const layerVol =
          (hasFastOrBoss || activeCount >= 3 ? Math.min(0.36, 0.12 + closestProximity * 0.22) : 0) * singerDuck;
        this.buzz2Gain.gain.setTargetAtTime(layerVol, now, 0.08);
        this.buzz2Source.playbackRate.setTargetAtTime(hasFastOrBoss ? 1.12 : 1.0, now, 0.08);
      }
      return;
    }

    if (!this.fallbackGain || !this.fallbackOscA || !this.fallbackOscB || !this.fallbackFilter || !this.fallbackLfo) {
      return;
    }
    const volume = Math.min(0.1, 0.02 + activeCount * 0.009 + closestProximity * 0.06) * singerDuck;
    const baseFreq = (hasFastOrBoss ? 360 : 285) + closestProximity * 145;
    this.fallbackGain.gain.setTargetAtTime(volume, now, 0.06);
    this.fallbackOscA.frequency.setTargetAtTime(baseFreq, now, 0.07);
    this.fallbackOscB.frequency.setTargetAtTime(baseFreq * 2.02, now, 0.07);
    this.fallbackFilter.frequency.setTargetAtTime(650 + closestProximity * 750, now, 0.07);
    this.fallbackLfo.frequency.setTargetAtTime(16 + closestProximity * 14, now, 0.08);
  }

  stopBuzz(): void {
    this.silenceAllLoops();
    this.stopSinging();
  }

  maybePlaySnore(nowMs: number): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    if (nowMs - this.lastSnoreAt < 3400) return;
    this.lastSnoreAt = nowMs;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92, t);
    osc.frequency.linearRampToValueAtTime(118, t + 0.35);
    osc.frequency.linearRampToValueAtTime(80, t + 0.78);
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.042, t + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.85);
  }

  playGunshot(isHit: boolean, combo: number, zapMode = false): void {
    if (this.muted || !this.ctx) return;

    if (this.buffers.gunshot) {
      this.playSample(this.buffers.gunshot, 0.65, zapMode ? 1.24 : 0.94 + Math.random() * 0.14);
    } else {
      this.playNoiseBurst(0.09, zapMode ? 2400 : 1450, 0.32);
    }

    const t = this.ctx.currentTime;
    if (isHit) {
      const pop = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(480, t + 0.02);
      pop.frequency.exponentialRampToValueAtTime(105, t + 0.12);
      popGain.gain.setValueAtTime(0.22, t + 0.02);
      popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      pop.connect(popGain);
      popGain.connect(this.ctx.destination);
      pop.start(t + 0.02);
      pop.stop(t + 0.14);

      if (combo >= 2) {
        const chime = this.ctx.createOscillator();
        const chimeGain = this.ctx.createGain();
        const note = 523.25 * Math.pow(1.06, Math.min(combo, 12));
        chime.type = 'triangle';
        chime.frequency.setValueAtTime(note, t + 0.04);
        chime.frequency.exponentialRampToValueAtTime(note * 1.25, t + 0.17);
        chimeGain.gain.setValueAtTime(0.12, t + 0.04);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        chime.connect(chimeGain);
        chimeGain.connect(this.ctx.destination);
        chime.start(t + 0.04);
        chime.stop(t + 0.21);
      }
    }
  }

  playArmorBonk(): void {
    if (this.muted || !this.ctx) return;
    this.playNoiseBurst(0.05, 1100, 0.2);
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
    if (this.muted || !this.ctx) return;
    if (this.buffers.scream) {
      this.playSample(this.buffers.scream, 0.68, 0.96 + Math.random() * 0.08);
      return;
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(270, t);
    osc.frequency.exponentialRampToValueAtTime(115, t + 0.24);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.27);
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

  private playNoiseBurst(durationSec: number, centerHz: number, volume: number): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.8);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centerHz;
    filter.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
  }
}

export const audioEngine = new AudioEngine();
