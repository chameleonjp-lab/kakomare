import Phaser from 'phaser';
import { BattleScene, type BattleSceneOptions } from './scenes/BattleScene';
import type { BattleCallbacks, UpgradeCandidate } from '../types/game';
import type { StageId } from '../types/content';
import type { EffectsLevel } from './systems/EffectBudget';
import type { ResearchEffects } from '../data/research';

const DEFAULT_RESEARCH_EFFECTS: ResearchEffects = {
  maxCore: 100,
  partMultiplier: 1,
  powerMultiplier: 1,
  projectileSpeedMultiplier: 1,
  rerolls: 0,
  bans: 0,
  candidateDetails: false,
  enemyRecords: false,
  weaponRecords: false,
  sectorRecords: false,
};

// Keep the logical canvas bounded on high-DPI phones and wide desktop displays.
const GAME_RESOLUTION = 720;

export class GameHost {
  private game: Phaser.Game | null = null;
  private scene: BattleScene | null = null;

  public startBattle(mount: HTMLElement, options: {
    stageId: StageId;
    effectsLevel: EffectsLevel;
    reducedMotion: boolean;
    screenShake: boolean;
    aimAssist: 'standard' | 'strong';
    researchEffects?: ResearchEffects;
    testMode?: boolean;
    testOutcome?: 'victory' | 'defeat';
    testUpgrade?: boolean;
    seed?: number;
    callbacks: BattleCallbacks;
  }): void {
    this.stop();
    const sceneOptions: BattleSceneOptions = { ...options, researchEffects: options.researchEffects ?? DEFAULT_RESEARCH_EFFECTS };
    const scene = new BattleScene(sceneOptions);
    this.scene = scene;
    this.game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: GAME_RESOLUTION,
      height: GAME_RESOLUTION,
      parent: mount,
      backgroundColor: '#07131f',
      render: { antialias: true, roundPixels: true, pixelArt: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_RESOLUTION, height: GAME_RESOLUTION },
      scene: [scene],
      banner: false,
    });
  }

  public chooseUpgrade(candidate: UpgradeCandidate, selectionId: number): void { this.scene?.chooseUpgrade(candidate, selectionId); }
  public rerollUpgrade(selectionId: number): void { this.scene?.rerollUpgrade(selectionId); }
  public banUpgrade(candidateId: string, selectionId: number): void { this.scene?.banUpgrade(candidateId, selectionId); }
  public continueUpgrade(selectionId: number): void { this.scene?.continueUpgrade(selectionId); }
  public deferUpgrade(selectionId: number): void { this.scene?.deferUpgrade(selectionId); }
  public pause(): void { this.scene?.pause(); }
  public resume(): void { this.scene?.resume(); }
  public retire(): void { this.scene?.retire(); }
  public isPaused(): boolean { return this.scene?.paused ?? false; }
  public isUpgrading(): boolean { return this.scene?.upgrading ?? false; }

  public stop(): void {
    this.scene?.shutdownBattle();
    this.game?.destroy(true);
    this.game = null;
    this.scene = null;
  }
}
