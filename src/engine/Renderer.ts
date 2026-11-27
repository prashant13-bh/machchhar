import { POWER_UP_META } from '../config/levels';
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BulletTracer,
  type FloatingPowerUp,
  type FloatingText,
  type ImpactEffect,
  type Mosquito,
  type Particle,
  type ShellCasing,
  type SleeperState,
  type ZzzBubble,
} from './Entities';

export interface RenderContextState {
  timeSec: number;
  sleeper: SleeperState;
  mosquitoes: Mosquito[];
  powerUps: FloatingPowerUp[];
  impacts: ImpactEffect[];
  tracers: BulletTracer[];
  casings: ShellCasing[];
  particles: Particle[];
  texts: FloatingText[];
  zzzs: ZzzBubble[];
  racketActive: boolean;
  coilActive: boolean;
  screenFlashMs: number;
  screenFlashColor: string;
}

export class CartoonRenderer {
  private stars: Array<{ x: number; y: number; r: number; twinkle: number }> = [];

  constructor() {
    for (let i = 0; i < 24; i++) {
      this.stars.push({
        x: 35 + ((i * 73) % 130),
        y: 65 + ((i * 41) % 145),
        r: (i % 3) * 0.7 + 0.8,
        twinkle: i * 0.9,
      });
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    state: RenderContextState
  ): { scale: number; offsetX: number; offsetY: number } {
    ctx.save();

    // Outer letterbox/pillarbox night gradient
    const outerGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    outerGrad.addColorStop(0, '#0a1022');
    outerGrad.addColorStop(1, '#151b33');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const scale = Math.min(canvasWidth / WORLD_WIDTH, canvasHeight / WORLD_HEIGHT);
    const offsetX = (canvasWidth - WORLD_WIDTH * scale) / 2;
    const offsetY = (canvasHeight - WORLD_HEIGHT * scale) / 2;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (state.sleeper.shakeTimerMs > 0) {
      const mag = (state.sleeper.shakeTimerMs / 320) * 7;
      ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
    }

    this.drawBedroom(ctx, state.timeSec, state.coilActive);
    this.drawDottedAimLine(ctx, state.sleeper, state.timeSec, state.racketActive);
    this.drawBedAndSleeper(ctx, state.sleeper, state.timeSec);
    this.drawZzzBubbles(ctx, state.zzzs);
    this.drawPowerUps(ctx, state.powerUps, state.timeSec);

    for (const m of state.mosquitoes) {
      this.drawMosquito(ctx, m, state.timeSec);
    }

    this.drawTracers(ctx, state.tracers);
    this.drawCasings(ctx, state.casings);
    this.drawParticles(ctx, state.particles);
    this.drawImpactEffects(ctx, state.impacts);
    this.drawSpeechBubble(ctx, state.sleeper);
    this.drawFloatingTexts(ctx, state.texts);

    if (state.racketActive) {
      this.drawElectricAura(ctx, state.timeSec);
    }

    if (state.screenFlashMs > 0) {
      ctx.fillStyle = state.screenFlashColor;
      ctx.globalAlpha = Math.min(0.35, state.screenFlashMs / 350);
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    return { scale, offsetX, offsetY };
  }

  private drawBedroom(ctx: CanvasRenderingContext2D, timeSec: number, coilActive: boolean): void {
    const wallGrad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    wallGrad.addColorStop(0, '#121a35');
    wallGrad.addColorStop(0.68, '#1d274b');
    wallGrad.addColorStop(1, '#261f3a');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = 20; x < WORLD_WIDTH; x += 44) {
      ctx.fillRect(x, 0, 14, 590);
    }

    ctx.fillStyle = '#1d162b';
    ctx.fillRect(0, 590, WORLD_WIDTH, WORLD_HEIGHT - 590);
    ctx.fillStyle = '#33294a';
    ctx.fillRect(0, 582, WORLD_WIDTH, 12);

    // Moonlit window
    const wx = 34;
    const wy = 62;
    const ww = 136;
    const wh = 160;
    ctx.fillStyle = '#091024';
    this.roundRect(ctx, wx, wy, ww, wh, 10);
    ctx.fill();

    for (const s of this.stars) {
      const alpha = 0.45 + 0.5 * Math.sin(timeSec * 2.5 + s.twinkle);
      ctx.fillStyle = `rgba(255, 248, 210, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffe58f';
    ctx.beginPath();
    ctx.arc(wx + 95, wy + 44, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#091024';
    ctx.beginPath();
    ctx.arc(wx + 104, wy + 39, 17, 0, Math.PI * 2);
    ctx.fill();

    const beamGrad = ctx.createLinearGradient(wx, wy, wx + 220, wy + 420);
    beamGrad.addColorStop(0, 'rgba(180, 210, 255, 0.11)');
    beamGrad.addColorStop(1, 'rgba(180, 210, 255, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(wx + 6, wy + wh);
    ctx.lineTo(wx + ww - 6, wy + wh);
    ctx.lineTo(wx + ww + 125, 620);
    ctx.lineTo(wx - 10, 620);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#3c4a75';
    ctx.lineWidth = 6;
    this.roundRect(ctx, wx, wy, ww, wh, 10);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2);
    ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.stroke();

    const sway = Math.sin(timeSec * 1.4) * 4;
    ctx.fillStyle = '#483b7a';
    ctx.beginPath();
    ctx.moveTo(wx - 10, wy - 6);
    ctx.lineTo(wx + 32, wy - 6);
    ctx.quadraticCurveTo(wx + 18 + sway, wy + 82, wx + 28 + sway, wy + wh + 14);
    ctx.lineTo(wx - 10, wy + wh + 14);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(wx + ww + 10, wy - 6);
    ctx.lineTo(wx + ww - 32, wy - 6);
    ctx.quadraticCurveTo(wx + ww - 18 - sway, wy + 82, wx + ww - 28 - sway, wy + wh + 14);
    ctx.lineTo(wx + ww + 10, wy + wh + 14);
    ctx.closePath();
    ctx.fill();

    // Wall picture frame
    ctx.fillStyle = '#2d375e';
    this.roundRect(ctx, 310, 88, 118, 86, 8);
    ctx.fill();
    ctx.strokeStyle = '#60527d';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#4f6299';
    ctx.fillRect(322, 100, 94, 62);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(386, 122, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#233159';
    ctx.beginPath();
    ctx.moveTo(322, 162);
    ctx.lineTo(354, 128);
    ctx.lineTo(384, 152);
    ctx.lineTo(400, 138);
    ctx.lineTo(416, 162);
    ctx.closePath();
    ctx.fill();

    // Nightstand + lamp + clock
    ctx.fillStyle = '#4f352f';
    this.roundRect(ctx, 376, 515, 86, 118, 8);
    ctx.fill();
    ctx.fillStyle = '#69463d';
    ctx.fillRect(372, 510, 94, 12);
    ctx.fillStyle = '#3c2824';
    ctx.fillRect(386, 534, 66, 26);
    ctx.fillStyle = '#e2b87b';
    ctx.beginPath();
    ctx.arc(419, 547, 4, 0, Math.PI * 2);
    ctx.fill();

    const lampGlow = ctx.createRadialGradient(418, 456, 8, 418, 456, 115);
    lampGlow.addColorStop(0, 'rgba(255, 214, 120, 0.34)');
    lampGlow.addColorStop(1, 'rgba(255, 214, 120, 0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(418, 456, 115, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d4a373';
    ctx.fillRect(414, 472, 8, 38);
    ctx.fillRect(402, 505, 32, 6);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(398, 434);
    ctx.lineTo(438, 434);
    ctx.lineTo(448, 474);
    ctx.lineTo(388, 474);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.arc(392, 496, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff9eb';
    ctx.beginPath();
    ctx.arc(392, 496, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(392, 496);
    ctx.lineTo(392, 490);
    ctx.moveTo(392, 496);
    ctx.lineTo(397, 498);
    ctx.stroke();

    if (coilActive) {
      const mistAlpha = 0.14 + 0.05 * Math.sin(timeSec * 4);
      ctx.fillStyle = `rgba(167, 139, 250, ${mistAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
  }

  /**
   * Draws the visible dotted aiming trajectory line from the sleeping uncle's gun muzzle
   * to the player's aim target, with a lock-on crosshair when hovering over a mosquito.
   */
  private drawDottedAimLine(
    ctx: CanvasRenderingContext2D,
    sleeper: SleeperState,
    timeSec: number,
    racketActive: boolean
  ): void {
    if (!sleeper.isAiming) return;

    const muzzleDist = 52;
    const startX = sleeper.gunPivotX + Math.cos(sleeper.gunAngle) * muzzleDist;
    const startY = sleeper.gunPivotY + Math.sin(sleeper.gunAngle) * muzzleDist;

    const endX = sleeper.rayEndX;
    const endY = sleeper.rayEndY;
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) return;

    const dotColor = sleeper.aimLockedOn
      ? '#4ade80'
      : racketActive
        ? '#38bdf8'
        : '#ffd166';

    ctx.save();
    // Animated marching dots from gun barrel all the way to locked mosquito / room boundary
    const step = 16;
    const marchOffset = (timeSec * 48) % step;
    for (let d = marchOffset; d <= dist; d += step) {
      const t = d / dist;
      const px = startX + dx * t;
      const py = startY + dy * t;
      const radius = sleeper.aimLockedOn ? 3.8 : 3.0;
      ctx.globalAlpha = 0.45 + 0.5 * (1 - t * 0.3);
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Target reticle circle at rayEnd (snaps onto locked mosquito when lined up!)
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = dotColor;
    ctx.lineWidth = sleeper.aimLockedOn ? 3.2 : 2.2;
    const retR = sleeper.aimLockedOn ? 22 + Math.sin(timeSec * 14) * 3 : 14;
    ctx.beginPath();
    ctx.arc(endX, endY, retR, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(endX - retR - 6, endY);
    ctx.lineTo(endX - retR + 4, endY);
    ctx.moveTo(endX + retR - 4, endY);
    ctx.lineTo(endX + retR + 6, endY);
    ctx.moveTo(endX, endY - retR - 6);
    ctx.lineTo(endX, endY - retR + 4);
    ctx.moveTo(endX, endY + retR - 4);
    ctx.lineTo(endX, endY + retR + 6);
    ctx.stroke();

    ctx.restore();
  }

  private drawBedAndSleeper(ctx: CanvasRenderingContext2D, sleeper: SleeperState, timeSec: number): void {
    const bedX = 48;
    const bedY = 536;
    const bedW = 326;
    const breath = Math.sin(sleeper.breathPhase) * 3.5;

    // Bed shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(bedX + bedW / 2, 716, 175, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Headboard
    ctx.fillStyle = '#5c3b32';
    this.roundRect(ctx, bedX + 10, bedY - 54, bedW - 20, 92, 16);
    ctx.fill();
    ctx.fillStyle = '#754b40';
    this.roundRect(ctx, bedX + 24, bedY - 40, bedW - 48, 66, 10);
    ctx.fill();

    // Mattress
    ctx.fillStyle = '#edf2f4';
    this.roundRect(ctx, bedX + 8, bedY + 26, bedW - 16, 118, 22);
    ctx.fill();

    // Pillow
    ctx.save();
    ctx.translate(sleeper.targetX, sleeper.targetY + 8);
    ctx.fillStyle = '#f8f9fa';
    this.roundRect(ctx, -78, -36, 156, 72, 26);
    ctx.fill();
    ctx.strokeStyle = '#d8e2dc';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Expressive Original Bearded Sleepy Uncle
    const hx = sleeper.targetX;
    const hy = sleeper.targetY + breath * 0.4;
    ctx.save();
    ctx.translate(hx, hy);

    // Ears
    ctx.fillStyle = '#eab38c';
    ctx.beginPath();
    ctx.arc(-44, 2, 11, 0, Math.PI * 2);
    ctx.arc(44, 2, 11, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = '#f5c29b';
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();

    // Iconic salt-and-pepper / silver swept hair
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(0, -14, 46, Math.PI - 0.15, Math.PI * 2 + 0.15);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.ellipse(-18, -36, 22, 12, -0.25, 0, Math.PI * 2);
    ctx.ellipse(16, -37, 20, 11, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Groomed snowy-white French beard + sideburns
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(-42, 4);
    ctx.quadraticCurveTo(-40, 48, 0, 50);
    ctx.quadraticCurveTo(40, 48, 42, 4);
    ctx.quadraticCurveTo(28, 16, 14, 15);
    ctx.quadraticCurveTo(0, 12, -14, 15);
    ctx.quadraticCurveTo(-28, 16, -42, 4);
    ctx.closePath();
    ctx.fill();

    // Thick silver eyebrows
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, -11);
    ctx.lineTo(-9, -9);
    ctx.moveTo(9, -9);
    ctx.lineTo(28, -11);
    ctx.stroke();

    // Round retro glasses sitting slightly down on nose
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-16, 4, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(16, 4, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.stroke();

    // Expressions by mood
    if (sleeper.mood === 'sleeping') {
      // One sleepy half-closed eye aiming, other closed peaceful!
      ctx.strokeStyle = '#3b2522';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-16, 5, 7, 0.2, Math.PI - 0.2);
      ctx.stroke();
      if (sleeper.isAiming) {
        // Focused squint eye while aiming gun!
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(16, 4, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(16, 5, 7, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }

      // Snoring mouth behind mustache
      const mouthR = 4 + Math.max(0, Math.sin(sleeper.breathPhase)) * 3;
      ctx.fillStyle = '#7f2f2f';
      ctx.beginPath();
      ctx.ellipse(0, 26, mouthR * 0.9, mouthR, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (sleeper.mood === 'annoyed' || sleeper.mood === 'bitten') {
      ctx.strokeStyle = '#3b2522';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-22, -1);
      ctx.lineTo(-11, 4);
      ctx.lineTo(-22, 9);
      ctx.moveTo(22, -1);
      ctx.lineTo(11, 4);
      ctx.lineTo(22, 9);
      ctx.stroke();

      if (sleeper.mood === 'bitten') {
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.arc(26, 15, 6.5 + Math.sin(timeSec * 20) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#7f2f2f';
      ctx.beginPath();
      ctx.ellipse(0, 27, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Awake grumpy eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-16, 4, 8, 0, Math.PI * 2);
      ctx.arc(16, 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(-15, 4, 4, 0, Math.PI * 2);
      ctx.arc(15, 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7f2f2f';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 32, 11, Math.PI + 0.3, -0.3);
      ctx.stroke();
    }

    // Thick snowy mustache
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-11, 18, 13, 5.5, -0.18, 0, Math.PI * 2);
    ctx.ellipse(11, 18, 13, 5.5, 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Cozy Blanket
    const blanketY = bedY + 74 - breath * 0.8;
    const blanketGrad = ctx.createLinearGradient(0, blanketY, 0, bedY + 170);
    blanketGrad.addColorStop(0, '#4f7cac');
    blanketGrad.addColorStop(1, '#365880');
    ctx.fillStyle = blanketGrad;
    this.roundRect(ctx, bedX + 4, blanketY, bedW - 8, 104 + breath * 0.8, 22);
    ctx.fill();

    ctx.fillStyle = '#90e0ef';
    this.roundRect(ctx, bedX + 4, blanketY, bedW - 8, 18, 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(bedX + 45 + i * 58, blanketY + 52 + (i % 2) * 18, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Footboard & legs
    ctx.fillStyle = '#5c3b32';
    this.roundRect(ctx, bedX + 6, bedY + 148, bedW - 12, 24, 8);
    ctx.fill();
    ctx.fillRect(bedX + 18, bedY + 168, 20, 24);
    ctx.fillRect(bedX + bedW - 38, bedY + 168, 20, 24);

    // Uncle's Arm & Cartoon Pistol sticking out from under the blanket!
    this.drawUncleGun(ctx, sleeper);
  }

  private drawUncleGun(ctx: CanvasRenderingContext2D, sleeper: SleeperState): void {
    const recoilOffset = sleeper.recoilTimerMs > 0 ? -(sleeper.recoilTimerMs / 130) * 10 : 0;

    ctx.save();
    ctx.translate(sleeper.gunPivotX, sleeper.gunPivotY);
    ctx.rotate(sleeper.gunAngle);
    ctx.translate(recoilOffset, 0);

    // Flip gun vertically if aiming leftward so it stays upright
    const pointingLeft = Math.cos(sleeper.gunAngle) < 0;
    if (pointingLeft) {
      ctx.scale(1, -1);
    }

    // Pajama sleeve + cartoon hand
    ctx.fillStyle = '#3b82f6';
    this.roundRect(ctx, -18, -10, 26, 20, 8);
    ctx.fill();

    ctx.fillStyle = '#f5c29b';
    ctx.beginPath();
    ctx.arc(10, 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Gun Grip
    ctx.fillStyle = '#78350f';
    this.roundRect(ctx, 4, 2, 14, 22, 4);
    ctx.fill();

    // Gun Barrel / Body (Chunky comical silver/gold pistol)
    ctx.fillStyle = '#334155';
    this.roundRect(ctx, 6, -12, 42, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    this.roundRect(ctx, 8, -10, 36, 7, 3);
    ctx.fill();

    // Glowing laser sight dot on barrel tip
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(46, -4, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Muzzle flash starburst on fire!
    if (sleeper.muzzleFlashMs > 0) {
      const fScale = sleeper.muzzleFlashMs / 100;
      ctx.save();
      ctx.translate(52, -5);
      ctx.scale(fScale + 0.4, fScale + 0.4);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 18 : 7;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawSpeechBubble(ctx: CanvasRenderingContext2D, sleeper: SleeperState): void {
    const bubble = sleeper.speechBubble;
    if (!bubble) return;

    const alpha = Math.min(1, bubble.lifeMs / 250);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '900 15px system-ui, sans-serif';
    const textW = ctx.measureText(bubble.text).width;
    const boxW = Math.max(110, textW + 28);
    const boxH = 34;
    const bx = Math.max(16, Math.min(WORLD_WIDTH - boxW - 16, sleeper.targetX - boxW / 2 + 24));
    const by = sleeper.targetY - 96;

    // Bubble tail
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx + boxW * 0.35, by + boxH - 2);
    ctx.lineTo(sleeper.targetX + 8, sleeper.targetY - 50);
    ctx.lineTo(bx + boxW * 0.55, by + boxH - 2);
    ctx.closePath();
    ctx.fill();

    // Bubble pill
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    this.roundRect(ctx, bx, by, boxW, boxH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#be123c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, bx + boxW / 2, by + boxH / 2 + 1);
    ctx.restore();
  }

  private drawMosquito(ctx: CanvasRenderingContext2D, m: Mosquito, timeSec: number): void {
    ctx.save();
    ctx.translate(m.x, m.y);

    if (m.state === 'diving') {
      const pulse = 0.75 + 0.25 * Math.sin(timeSec * 18);
      ctx.strokeStyle = `rgba(255, 77, 109, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, m.radius + 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (m.state === 'stunned') {
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 3; i++) {
        const a = timeSec * 8 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (m.radius + 8), -m.radius - 6 + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const scaleFactor = m.radius / 18;
    ctx.scale(scaleFactor, scaleFactor);
    if (m.vx < -4) ctx.scale(-1, 1);

    const wingAngle = Math.sin(m.wingPhase) * 0.55;
    ctx.fillStyle = 'rgba(215, 240, 255, 0.78)';
    ctx.strokeStyle = 'rgba(130, 180, 230, 0.85)';
    ctx.lineWidth = 1.4;

    ctx.save();
    ctx.translate(-3, -6);
    ctx.rotate(-0.55 + wingAngle);
    ctx.beginPath();
    ctx.ellipse(0, -12, 6, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(4, -6);
    ctx.rotate(0.45 - wingAngle);
    ctx.beginPath();
    ctx.ellipse(0, -11, 5.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#1b1f2b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(-11, 18);
    ctx.lineTo(-7, 24);
    ctx.moveTo(2, 7);
    ctx.lineTo(1, 20);
    ctx.lineTo(6, 25);
    ctx.stroke();

    let bodyColor = '#2e3448';
    let stripeColor = '#a3b1cc';
    let eyeColor = '#ff4d6d';

    if (m.kind === 'ninja') {
      bodyColor = '#1c1b29';
      stripeColor = '#38bdf8';
      eyeColor = '#facc15';
    } else if (m.kind === 'tank') {
      bodyColor = '#582f4e';
      stripeColor = '#fb923c';
      eyeColor = '#ff595e';
    } else if (m.kind === 'singer') {
      bodyColor = '#701a75';
      stripeColor = '#f472b6';
      eyeColor = '#22d3ee';
    } else if (m.kind === 'boss') {
      bodyColor = '#4a0e2e';
      stripeColor = '#ffd166';
      eyeColor = '#ff2a55';
    }

    if (m.flashTimer > 0) {
      bodyColor = '#ffffff';
      stripeColor = '#ffd166';
    }

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(-8, 3, 12, 7.5, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stripeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(-10, 8);
    ctx.moveTo(-6, -3);
    ctx.lineTo(-4, 9);
    ctx.stroke();

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(5, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(13, -1, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(29, 3);
    ctx.stroke();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(14, -3, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(15, -3, 1.3, 0, Math.PI * 2);
    ctx.fill();

    if (m.kind === 'boss') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(6, -8);
      ctx.lineTo(8, -16);
      ctx.lineTo(12, -11);
      ctx.lineTo(15, -18);
      ctx.lineTo(18, -11);
      ctx.lineTo(21, -15);
      ctx.lineTo(20, -8);
      ctx.closePath();
      ctx.fill();
    }

    if (m.kind === 'singer') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(12, -2, 8.5, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(8, -1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(11, -6, 9, 4.5);
    }

    ctx.restore();

    if (m.kind === 'singer') {
      const notes = ['♪', '♫'];
      for (let n = 0; n < 2; n++) {
        const phase = timeSec * 3.5 + n * 1.7 + m.id;
        const ny = m.y - m.radius - 10 - ((phase * 14) % 24);
        const nx = m.x + (n === 0 ? -12 : 12) + Math.sin(phase * 2) * 5;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillStyle = n === 0 ? '#f472b6' : '#38bdf8';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeText(notes[n], nx, ny);
        ctx.fillText(notes[n], nx, ny);
        ctx.restore();
      }
    }

    if (m.maxHp > 1 && m.hp < m.maxHp) {
      const barW = m.kind === 'boss' ? 54 : 32;
      const barH = 6;
      const bx = m.x - barW / 2;
      const by = m.y - m.radius - 16;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      this.roundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 4);
      ctx.fill();
      ctx.fillStyle = m.kind === 'boss' ? '#ff4d6d' : '#fb923c';
      this.roundRect(ctx, bx, by, (barW * m.hp) / m.maxHp, barH, 3);
      ctx.fill();
    }
  }

  private drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: FloatingPowerUp[], timeSec: number): void {
    for (const p of powerUps) {
      const meta = POWER_UP_META[p.kind];
      const bobY = Math.sin(timeSec * 4 + p.bobPhase) * 5;
      ctx.save();
      ctx.translate(p.x, p.y + bobY);

      ctx.fillStyle = meta.color;
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(timeSec * 6);
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#151f3b';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.fillStyle = meta.color;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = p.kind === 'racket' ? '⚡' : p.kind === 'coil' ? '🌀' : '💖';
      ctx.fillText(icon, 0, 1);

      ctx.restore();
    }
  }

  private drawTracers(ctx: CanvasRenderingContext2D, tracers: BulletTracer[]): void {
    for (const tr of tracers) {
      const alpha = Math.max(0, tr.lifeMs / tr.maxLifeMs);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = tr.isZap ? '#38bdf8' : '#fde047';
      ctx.lineWidth = tr.isZap ? 5 : 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCasings(ctx: CanvasRenderingContext2D, casings: ShellCasing[]): void {
    for (const c of casings) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = Math.min(1, c.lifeMs / 250);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
  }

  private drawImpactEffects(ctx: CanvasRenderingContext2D, impacts: ImpactEffect[]): void {
    for (const s of impacts) {
      const t = 1 - s.lifeMs / s.maxLifeMs;
      const alpha = Math.max(0, 1 - t);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = alpha;

      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.isZap ? 5 : 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius * (0.4 + t * 0.75), 0, Math.PI * 2);
      ctx.stroke();

      if (s.label) {
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#0f172a';
        ctx.strokeText(s.label, 0, -18 - t * 14);
        ctx.fillStyle = s.color;
        ctx.fillText(s.label, 0, -18 - t * 14);
      }

      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    for (const p of particles) {
      const alpha = Math.max(0, p.lifeMs / p.maxLifeMs);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
    for (const ft of texts) {
      const progress = 1 - ft.lifeMs / ft.maxLifeMs;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.translate(ft.x, ft.y - progress * 34);
      ctx.scale(ft.scale, ft.scale);
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }

  private drawZzzBubbles(ctx: CanvasRenderingContext2D, zzzs: ZzzBubble[]): void {
    ctx.save();
    ctx.textAlign = 'center';
    for (const z of zzzs) {
      ctx.globalAlpha = z.alpha;
      ctx.font = `900 ${Math.round(z.size)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1e293b';
      ctx.strokeText('Z', z.x, z.y);
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('Z', z.x, z.y);
    }
    ctx.restore();
  }

  private drawElectricAura(ctx: CanvasRenderingContext2D, timeSec: number): void {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(timeSec * 16);
    ctx.strokeRect(4, 4, WORLD_WIDTH - 8, WORLD_HEIGHT - 8);
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
