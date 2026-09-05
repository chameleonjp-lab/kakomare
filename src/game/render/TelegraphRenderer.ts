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
      graphics.strokeCircle(centerX + enemy.x, centerY + enemy.y, enemy.hitRadius + 8);
    }
    if (enemy.type === 'phase') {
      const phase = enemy.telegraphPhase ?? 0;
      const pulse = 0.25 + (Math.sin(phase * Math.PI * 24) + 1) * 0.3;
      graphics.lineStyle(2, 0x78a8ff, pulse);
      graphics.strokeCircle(centerX + enemy.x, centerY + enemy.y, enemy.hitRadius + 10 + pulse * 4);
    }
  }
}
