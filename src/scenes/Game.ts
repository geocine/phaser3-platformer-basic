// @ts-nocheck
import Phaser from 'phaser';

export default class Demo extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init() {
    this.playerSpeed = 150;
    this.jumpSpeed = -600;
    this.jumpHoldBoost = 26;
    this.jumpHoldWindowMs = 110;

    // jumping
    this.maxJumps = 2;
    this.jumpsRemaining = this.maxJumps;

    // feel: allow jumping shortly after leaving a ledge ("coyote time") and
    // shortly before landing ("jump buffer")
    this.coyoteTimeMs = 120;
    this.jumpBufferMs = 120;
    this.coyoteTimerMs = 0;
    this.jumpBufferTimerMs = 0;
    this.jumpHoldTimerMs = 0;

    // mobile controls (touch only)
    this.mobile = {
      enabled: false,
      stick: { active: false, pointerId: null, centerX: 0, centerY: 0, radius: 46, x: 0, y: 0 },
      jumpQueued: false,
      jumpHeld: false,
      jumpPointerId: null
    };

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

    const isTouch = !!this.sys.game.device.input.touch;

    // extra keys (in addition to cursor keys)
    this.keys = this.input.keyboard.addKeys({
      restart: 'R',
      pause: 'P',
      left: 'A',
      right: 'D',
      jump: 'W'
    });

    // lightweight HUD (camera-fixed)
    this.isPaused = false;
    this.hudText = this.add
      .text(8, 0, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setOrigin(0, 1);

    // HUD hint: bottom-left (desktop only). Add extra padding so it doesn't get clipped.
    this.hudText.setPosition(8, this.scale.height - 24);

    // show a quick controls hint on desktop only (mobile has on-screen controls)
    if (!isTouch) {
      // wrap so the right-hand legend never gets cut off on narrow screens
      this.hudText.setWordWrapWidth(this.scale.width - 16, true);
      this.hudText.setText('←/→ or A/D move   ↑/Space/W jump\nR restart   P pause');

      this.tweens.add({
        targets: this.hudText,
        alpha: 0,
        duration: 900,
        delay: 4500,
        ease: 'Sine.easeInOut'
      });
    } else {
      this.hudText.setVisible(false);
    }

    // mobile controls: virtual joystick + tap jump (touch devices only)
    this.mobile.enabled = isTouch;
    if (this.mobile.enabled) {
      // enable multi-touch so you can move (stick) and jump at the same time
      this.input.addPointer(2);
      const placeMobileUi = (w, h) => {
        const stickX = 88;
        const stickY = h - 92;
        const jumpX = w - 88;
        const jumpY = h - 120;

        this.mobileStickBase.setPosition(stickX, stickY);
        this.mobileStickKnob.setPosition(stickX + this.mobile.stick.x * this.mobile.stick.radius, stickY + this.mobile.stick.y * this.mobile.stick.radius);
        this.mobileJumpBtn.setPosition(jumpX, jumpY);
      };

      this.mobile.stick.radius = 56;

      this.mobileStickBase = this.add
        .circle(0, 0, this.mobile.stick.radius, 0x000000, 0.18)
        .setScrollFactor(0)
        .setDepth(1002)
        .setInteractive(new Phaser.Geom.Circle(0, 0, this.mobile.stick.radius + 24), Phaser.Geom.Circle.Contains);

      this.mobileStickKnob = this.add
        .circle(0, 0, 24, 0xffffff, 0.28)
        .setScrollFactor(0)
        .setDepth(1003);

      this.mobileJumpBtn = this.add
        .circle(0, 0, 34, 0x000000, 0.20)
        .setScrollFactor(0)
        .setDepth(1002)
        .setInteractive(new Phaser.Geom.Circle(0, 0, 34 + 22), Phaser.Geom.Circle.Contains);

      // (no label on mobile jump button)

      // feedback: pressed / released
      this.mobileJumpBtn.on('pointerdown', (pointer) => {
        this.mobile.jumpHeld = true;
        this.mobile.jumpPointerId = pointer.id;
        this.mobileJumpBtn.setFillStyle(0x66ccff, 0.28);
      });
      this.mobileJumpBtn.on('pointerup', (pointer) => {
        if (this.mobile.jumpPointerId === pointer.id) {
          this.mobile.jumpHeld = false;
          this.mobile.jumpPointerId = null;
        }
        this.mobileJumpBtn.setFillStyle(0x000000, 0.20);
      });
      this.mobileJumpBtn.on('pointerout', (pointer) => {
        if (this.mobile.jumpPointerId === pointer.id) {
          this.mobile.jumpHeld = false;
          this.mobile.jumpPointerId = null;
        }
        this.mobileJumpBtn.setFillStyle(0x000000, 0.20);
      });

      placeMobileUi(this.scale.width, this.scale.height);

      // keep mobile UI positioned correctly on resize
      this.scale.on('resize', (gameSize) => {
        placeMobileUi(gameSize.width, gameSize.height);
      });

      const setStickVectorFromPointer = (pointer) => {
        const dx = pointer.x - this.mobile.stick.centerX;
        const dy = pointer.y - this.mobile.stick.centerY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const clamped = Math.min(this.mobile.stick.radius, len);
        this.mobile.stick.x = (dx / len) * (clamped / this.mobile.stick.radius);
        this.mobile.stick.y = (dy / len) * (clamped / this.mobile.stick.radius);

        // visual knob follows the stick
        this.mobileStickKnob.setPosition(
          this.mobile.stick.centerX + this.mobile.stick.x * this.mobile.stick.radius,
          this.mobile.stick.centerY + this.mobile.stick.y * this.mobile.stick.radius
        );
      };

      const resetStick = () => {
        this.mobile.stick.active = false;
        this.mobile.stick.pointerId = null;
        this.mobile.stick.x = 0;
        this.mobile.stick.y = 0;
        this.mobileStickKnob.setPosition(this.mobileStickBase.x, this.mobileStickBase.y);
        this.mobileStickBase.setFillStyle(0x000000, 0.18);
      };

      // joystick interaction
      this.mobileStickBase.on('pointerdown', (pointer) => {
        this.mobileStickBase.setFillStyle(0x66ccff, 0.22);
        this.mobile.stick.active = true;
        this.mobile.stick.pointerId = pointer.id;
        this.mobile.stick.centerX = this.mobileStickBase.x;
        this.mobile.stick.centerY = this.mobileStickBase.y;
        setStickVectorFromPointer(pointer);
      });

      this.input.on('pointermove', (pointer) => {
        if (!this.mobile.stick.active) return;
        if (this.mobile.stick.pointerId !== pointer.id) return;
        setStickVectorFromPointer(pointer);
      });

      this.input.on('pointerup', (pointer) => {
        if (this.mobile.stick.pointerId === pointer.id) resetStick();
        if (this.mobile.jumpPointerId === pointer.id) {
          this.mobile.jumpHeld = false;
          this.mobile.jumpPointerId = null;
        }
      });

      // jump: tap once -> queue a buffered jump
      this.mobileJumpBtn.on('pointerdown', () => {
        this.mobile.jumpQueued = true;
        this.tweens.add({ targets: this.mobileJumpBtn, scale: 0.92, yoyo: true, duration: 80 });
      });
    }

    // pause handling (shared by keyboard + mobile button)
    this.togglePause = () => {
      this.isPaused = !this.isPaused;
      this.physics.world.isPaused = this.isPaused;
      this.time.timeScale = this.isPaused ? 0 : 1;
      this.pauseText.setVisible(this.isPaused);

      if (this.isPaused) this.anims.pauseAll();
      else this.anims.resumeAll();
    };

    this.pauseText = this.add
      .text(
        this.scale.width * 0.5,
        this.scale.height * 0.5,
        isTouch ? 'PAUSED\nTap ⏸ to resume' : 'PAUSED\nPress P to resume',
        {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          align: 'center'
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    // auto-pause when the tab/app loses focus so you don't die to offscreen hazards
    this.handleBlur = () => {
      if (!this.isPaused) this.togglePause();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur);
    });

    // mobile pause button (touch devices only)
    if (isTouch) {
      this.mobilePauseBtn = this.add
        .text(this.scale.width - 12, 10, '⏸', {
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(1004)
        .setInteractive({ useHandCursor: true });

      this.mobilePauseBtn.on('pointerdown', () => {
        this.togglePause();
      });
    }

    // keep UI elements positioned correctly on resize
    this.scale.on('resize', (gameSize) => {
      this.hudText.setPosition(8, gameSize.height - 24);
      this.hudText.setWordWrapWidth(gameSize.width - 16, true);
      this.pauseText.setPosition(gameSize.width * 0.5, gameSize.height * 0.5);

      if (this.mobilePauseBtn) {
        this.mobilePauseBtn.setPosition(gameSize.width - 12, 10);
      }
    });

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

    // camera: follow player across the level (world is larger than viewport)
    this.cameras.main.setBounds(
      0,
      0,
      this.physics.world.bounds.width,
      this.physics.world.bounds.height
    );
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

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

  performJump() {
    this.player.body.setVelocityY(this.jumpSpeed);
    this.jumpsRemaining -= 1;
    this.coyoteTimerMs = 0;
    this.jumpBufferTimerMs = 0;
    this.jumpHoldTimerMs = this.jumpHoldWindowMs;

    // stop the walking animation
    this.player.anims.stop('walking');

    // change frame
    this.player.setFrame(2);
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

  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
      this.scene.restart();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
      this.togglePause();
    }

    if (this.isPaused) return;

    // are we on the ground?
    const onGround =
      this.player.body.blocked.down || this.player.body.touching.down;

    // feel timers
    if (onGround) {
      this.coyoteTimerMs = this.coyoteTimeMs;
      this.jumpsRemaining = this.maxJumps;
      this.jumpHoldTimerMs = 0;
    } else {
      this.coyoteTimerMs = Math.max(0, this.coyoteTimerMs - delta);
    }
    const stickX = this.mobile.enabled ? this.mobile.stick.x : 0;
    const stickAxis = Math.abs(stickX) < 0.05 ? 0 : stickX;

    const mobileSpeed = this.mobile.enabled ? 1.5 : 1;

    const moveLeft = this.cursors.left.isDown || stickAxis < 0;
    const moveRight = this.cursors.right.isDown || stickAxis > 0;

    const moveLeftKey = !this.mobile.enabled && this.keys.left.isDown;
    const moveRightKey = !this.mobile.enabled && this.keys.right.isDown;

    // movement to the left
    if ((moveLeft || moveLeftKey) && !(moveRight || moveRightKey)) {
      this.player.body.setVelocityX(stickAxis !== 0 ? stickAxis * this.playerSpeed * mobileSpeed : -this.playerSpeed);

      this.player.flipX = false;

      // play animation if none is playing
      if (onGround && !this.player.anims.isPlaying)
        this.player.anims.play('walking');
    }

    // movement to the right
    else if ((moveRight || moveRightKey) && !(moveLeft || moveLeftKey)) {
      this.player.body.setVelocityX(stickAxis !== 0 ? stickAxis * this.playerSpeed * mobileSpeed : this.playerSpeed);

      this.player.flipX = true;

      // play animation if none is playing
      if (onGround && !this.player.anims.isPlaying)
        this.player.anims.play('walking');
    } else if (!(moveLeft || moveLeftKey) && !(moveRight || moveRightKey)) {
      // make the player stop
      this.player.body.setVelocityX(0);

      // stop walking animation
      this.player.anims.stop('walking');

      // set default frame
      if (onGround) this.player.setFrame(3);
    }

    const mobileJumpPressed = this.mobile.enabled && this.mobile.jumpQueued;
    if (mobileJumpPressed) this.mobile.jumpQueued = false;

    const jumpPressed =
      mobileJumpPressed ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      (!this.mobile.enabled && Phaser.Input.Keyboard.JustDown(this.keys.jump));
    const jumpHeld =
      (this.mobile.enabled && this.mobile.jumpHeld) ||
      this.cursors.space.isDown ||
      this.cursors.up.isDown ||
      (!this.mobile.enabled && this.keys.jump.isDown);

    if (jumpPressed) {
      this.jumpBufferTimerMs = this.jumpBufferMs;
    } else {
      this.jumpBufferTimerMs = Math.max(0, this.jumpBufferTimerMs - delta);
    }

    const canGroundJump = onGround || this.coyoteTimerMs > 0;

    // jump buffer + coyote time: if you pressed jump slightly early/late,
    // still allow the jump when conditions become valid.
    if (this.jumpBufferTimerMs > 0 && canGroundJump && this.jumpsRemaining > 0) {
      this.performJump();
    } else if (jumpPressed && !canGroundJump && this.jumpsRemaining > 0) {
      this.performJump();
    }

    if (this.jumpHoldTimerMs > 0) {
      if (!jumpHeld) {
        this.jumpHoldTimerMs = 0;
      } else if (!this.player.body.blocked.up && this.player.body.velocity.y < 0) {
        this.player.body.setVelocityY(
          this.player.body.velocity.y - this.jumpHoldBoost * (delta / (1000 / 60))
        );
        this.jumpHoldTimerMs = Math.max(0, this.jumpHoldTimerMs - delta);
      } else {
        this.jumpHoldTimerMs = 0;
      }
    }

    // HUD is a one-time controls hint (it fades out), so nothing to update here.
  }
}
