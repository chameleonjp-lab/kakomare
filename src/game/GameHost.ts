import Phaser from 'phaser';
import { BattleScene, type BattleSceneOptions } from './scenes/BattleScene';
import type { BattleCallbacks, UpgradeCandidate } from '../types/game';
import type { StageId } from '../types/content';
import type { EffectsLevel } from './systems/EffectBudget';

export class GameHost {
  private game: Phaser.Game | null = null;
  private scene: BattleScene | null = null;

  public startBattle(mount: HTMLElement, options: {
    stageId: StageId;
    effectsLevel: EffectsLevel;
    reducedMotion: boolean;
    aimAssist: 'standard' | 'strong';
    testMode?: boolean;
    testOutcome?: 'victory' | 'defeat';
    testUpgrade?: boolean;
    callbacks: BattleCallbacks;
  }): void {
    this.stop();
    const sceneOptions: BattleSceneOptions = options;
    const scene = new BattleScene(sceneOptions);
    this.scene = scene;
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 720,
      height: 720,
      parent: mount,
      backgroundColor: '#07131f',
      render: { antialias: true, roundPixels: true, pixelArt: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 720, height: 720 },
      scene: [scene],
      banner: false,
    });
  }

  public chooseUpgrade(candidate: UpgradeCandidate): void { this.scene?.chooseUpgrade(candidate); }
  public rerollUpgrade(): void { this.scene?.rerollUpgrade(); }
  public banUpgrade(candidateId: string): void { this.scene?.banUpgrade(candidateId); }
  public pause(): void { this.scene?.pause(); }
  public resume(): void { this.scene?.resume(); }
  public retire(): void { this.scene?.retire(); }
  public isPaused(): boolean { return this.scene?.paused ?? false; }

  public stop(): void {
    this.scene?.shutdownBattle();
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }
}
