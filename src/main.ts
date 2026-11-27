import './style.css';
import { GameEngine } from './engine/GameEngine';
import { adManager } from './services/AdManager';
import { UIController } from './ui/Screens';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui-overlay');

  if (!canvas || !overlay) {
    throw new Error('Missing #game-canvas or #ui-overlay root elements');
  }

  await adManager.init();

  let ui: UIController;
  const engine = new GameEngine(canvas, {
    onPhaseChange: (phase, summary) => ui.handlePhaseChange(phase, summary),
    onHudUpdate: (hud) => ui.updateHud(hud),
  });

  ui = new UIController(overlay, engine);

  // Pause safely if user switches tabs / minimizes app
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.getPhase() === 'playing') {
      engine.pause();
    }
  });
}

void bootstrap();
