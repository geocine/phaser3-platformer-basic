// @ts-nocheck
import Phaser from 'phaser';

export default class Demo extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init() {
    this.playerSpeed = 150;
    this.jumpSpeed = -600;
    this.maxJumps = 2;
    this.jumpsRemaining = this.maxJumps;

    // guard against multiple overlap callbacks triggering multiple restarts
    this.isRestarting = false;
  }

  preload() {
    this.load.image('ground', 'assets/images/ground.png');
    this.load.image('platform', 'assets/images/platform.png');
    this.load.image('block', 'assets/images/block.png');
    this.load.image('goal', 'assets/images/gorilla3.png');
    this.load.image('barrel', 'assets/images/barrel.png');
    this.load.spritesheet('player', 'assets/images/player_spritesheet.png', {
      frameWidth: 28,
      frameHeight: 30,
      margin: 1,
      spacing: 1
    });
    this.load.spritesheet('fire', 'assets/images/fire_spritesheet.png', {
      frameWidth: 20,
      frameHeight: 21,
      margin: 1,
      spacing: 1
    });
    this.load.json('levelData', 'assets/json/levelData.json');
  }

  create() {
    this.levelData = this.cache.json.get('levelData');
    this.cursors = this.input.keyboard.createCursorKeys();

    // world bounds
    this.physics.world.bounds.width = this.levelData.world.width;
    this.physics.world.bounds.height = this.levelData.world.height;

    // or use a different scene
    if (!this.anims.get('walking')) {
      // walking animation
      this.anims.create({
        key: 'walking',
        frames: this.anims.generateFrameNames('player', {
          frames: [0, 1, 2]
        }),
        frameRate: 12,
        yoyo: true,
        repeat: -1
      });
    }

    if (!this.anims.get('burning')) {
      // fire animation
      this.anims.create({
        key: 'burning',
        frames: this.anims.generateFrameNames('fire', {
          frames: [0, 1]
        }),
        frameRate: 4,
        repeat: -1
      });
    }

    this.setupLevel();

    this.setupSpawner();

    this.player = this.add.sprite(180, 400, 'player', 3);
    this.physics.add.existing(this.player);

    // constrain player to the game bounds
    this.player.body.setCollideWorldBounds(true);

    // goal
    this.goal = this.add.sprite(
      this.levelData.goal.x,
      this.levelData.goal.y,
      'goal'
    );
    this.physics.add.existing(this.goal);

    // collision detection
    this.physics.add.collider(
      [this.player, this.goal, this.barrels],
      this.platforms
    );

    // overlap checks
    this.physics.add.overlap(
      this.player,
      [this.fires, this.goal, this.barrels],
      this.restartGame,
      null,
      this
    );
  }

  restartGame(sourceSprite, targetSprite) {
    if (this.isRestarting) return;
    this.isRestarting = true;

    // fade out
    this.cameras.main.fade(500);

    // when fade out completes, restart scene
    this.cameras.main.once(
      'camerafadeoutcomplete',
      function (camera, effect) {
        // restart the scene
        this.scene.restart();
      },
      this
    );
  }

  setupLevel() {
    this.platforms = this.add.group();

    // create all the platforms
    for (let i = 0; i < this.levelData.platforms.length; i++) {
      let curr = this.levelData.platforms[i];

      let newObj;

      // create object
      if (curr.numTiles == 1) {
        // create sprite
        newObj = this.add.sprite(curr.x, curr.y, curr.key).setOrigin(0);
      } else {
        // create tilesprite
        let width = this.textures.get(curr.key).get(0).width;
        let height = this.textures.get(curr.key).get(0).height;
        newObj = this.add
          .tileSprite(curr.x, curr.y, curr.numTiles * width, height, curr.key)
          .setOrigin(0);
      }

      // enable physics
      this.physics.add.existing(newObj, true);

      // add to the group
      this.platforms.add(newObj);
    }

    this.fires = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    for (let i = 0; i < this.levelData.fires.length; i++) {
      let curr = this.levelData.fires[i];

      let newObj = this.add.sprite(curr.x, curr.y, 'fire', 0).setOrigin(0);

      newObj.anims.play('burning');
      // add to the group
      this.fires.add(newObj);
    }
  }

  // generation of barrels
  setupSpawner() {
    // barrel group
    this.barrels = this.physics.add.group({
      bounceY: 0.1,
      bounceX: 1,
      collideWorldBounds: true
    });

    const createBarrels = () => {
      // create a barrel
      let barrel = this.barrels.get(this.goal.x, this.goal.y, 'barrel');

      // reactivate
      barrel.setActive(true);
      barrel.setVisible(true);
      barrel.body.enable = true;

      // set properties
      barrel.setVelocityX(this.levelData.spawner.speed);

      // lifespan
      this.time.addEvent({
        delay: this.levelData.spawner.lifespan,
        repeat: 0,
        callbackScope: this,
        callback: function () {
          this.barrels.killAndHide(barrel);
          barrel.body.enable = false;
        }
      });

      spawnEvent.reset({
        delay: Phaser.Math.Between(100, 5000),
        repeat: 1,
        callback: createBarrels
      });
    };

    // spawn barrels
    const spawnEvent = this.time.addEvent({
      delay: Phaser.Math.Between(100, 5000),
      callback: createBarrels
    });
  }

  update() {
    // are we on the ground?
    let onGround =
      this.player.body.blocked.down || this.player.body.touching.down;

    // movement to the left
    if (this.cursors.left.isDown && !this.cursors.right.isDown) {
      this.player.body.setVelocityX(-this.playerSpeed);

      this.player.flipX = false;

      // play animation if none is playing
      if (onGround && !this.player.anims.isPlaying)
        this.player.anims.play('walking');
    }

    // movement to the right
    else if (this.cursors.right.isDown && !this.cursors.left.isDown) {
      this.player.body.setVelocityX(this.playerSpeed);

      this.player.flipX = true;

      // play animation if none is playing
      if (onGround && !this.player.anims.isPlaying)
        this.player.anims.play('walking');
    } else if (!this.cursors.left.isDown && !this.cursors.right.isDown) {
      // make the player stop
      this.player.body.setVelocityX(0);

      // stop walking animation
      this.player.anims.stop('walking');

      // set default frame
      if (onGround) this.player.setFrame(3);
    }
    // handle jumping (feature: double-jump)
    if (onGround) {
      this.jumpsRemaining = this.maxJumps;
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up);

    if (jumpPressed && this.jumpsRemaining > 0) {
      this.player.body.setVelocityY(this.jumpSpeed);
      this.jumpsRemaining -= 1;

      // stop the walking animation
      this.player.anims.stop('walking');

      // change frame
      this.player.setFrame(2);
    }
  }
}
