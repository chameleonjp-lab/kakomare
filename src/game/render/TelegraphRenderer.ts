import Phaser from 'phaser';
import type { EnemySnapshot } from '../../types/game';

export function drawTelegraphs(graphics: Phaser.GameObjects.Graphics, enemies: EnemySnapshot[], centerX: number, centerY: number): void {
  for (const enemy of enemies) {
    if (!enemy.telegraph) continue;
    const angle = Math.atan2(enemy.y, enemy.x);
    const length = enemy.type === 'dropper' ? 370 : enemy.isBoss ? 420 : 315;
    graphics.lineStyle(enemy.isBoss ? 4 : 2, 0xfff1a8, 0.9);
    graphics.lineBetween(centerX + Math.cos(angle) * 185, centerY + Math.sin(angle) * 185, centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
    if (!enemy.isBoss) {
      graphics.strokeCircle(centerX + enemy.x, centerY + enemy.y, enemy.radius > 0 ? 22 : 12);
    }
    if (enemy.type === 'phase') {
      graphics.lineStyle(2, 0x78a8ff, 0.8);
      graphics.strokeCircle(centerX + enemy.x, centerY + enemy.y, 28);
    }
  }
}
