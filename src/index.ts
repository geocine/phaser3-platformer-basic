import Phaser from 'phaser';
import config from './config';
import GameScene from './scenes/Game';

new Phaser.Game(
  Object.assign(config, {
    scene: [GameScene]
  })
);
// Keep the game canvas in sync with the browser size
window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

