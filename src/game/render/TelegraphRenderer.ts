import Phaser from 'phaser';
import type { EnemySnapshot } from '../../types/game';

export function drawTelegraphs(graphics: Phaser.GameObjects.Graphics, enemies: EnemySnapshot[], centerX: number, centerY: number): void {
  for (const enemy of enemies) {
    if (!enemy.telegraph) continue;
    const angle = Math.atan2(enemy.y, enemy.x);
    graphics.lineStyle(enemy.isBoss ? 4 : 2, 0xfff1a8, 0.9);
    graphics.lineBetween(centerX + Math.cos(angle) * 235, centerY + Math.sin(angle) * 235, centerX + Math.cos(angle) * 315, centerY + Math.sin(angle) * 315);
    if (!enemy.isBoss) {
      graphics.strokeCircle(centerX + enemy.x, centerY + enemy.y, enemy.radius > 0 ? 22 : 12);
    }
  }
}
