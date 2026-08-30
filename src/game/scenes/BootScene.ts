import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: 'KakomareBootScene' });
  }

  public create(): void {
    this.scene.start('KakomareBattleScene');
  }
}
