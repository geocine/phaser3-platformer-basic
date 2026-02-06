import Phaser from 'phaser';
import config from './config';
import GameScene from './scenes/Game';

const game = new Phaser.Game(
  Object.assign(config, {
    scene: [GameScene]
  })
);

// Resize behavior note:
// With FIT + CENTER_BOTH we keep the internal resolution fixed and only re-fit the canvas.
// Do NOT call game.scale.resize(...) here unless you intentionally switch to RESIZE mode.
window.addEventListener('resize', () => {
  game.scale.refresh();
});

