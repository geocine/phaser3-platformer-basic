import Phaser from 'phaser';

export default {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#33A5E7',
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 }
      // debug: true
    }
  },
  scale: {
    // IMPORTANT (read before changing):
    // This repo is a *horizontal* platformer. We want a consistent internal resolution
    // and predictable camera/world coordinates across devices.
    //
    // Therefore we use FIT + CENTER_BOTH (letterbox when needed).
    // Avoid Phaser.Scale.RESIZE here: RESIZE changes the *actual game size* to match the
    // browser/container and can cause left/top anchoring, UI drift, and world/camera
    // cropping unless every scene recalculates bounds on each resize.
    // Match the designed level viewport. Our levelData world width is 360px,
    // so using a wider internal width will clamp the camera at x=0 and make
    // the level look "stuck" on the left with empty space to the right.
    width: 360,
    height: 640,
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
