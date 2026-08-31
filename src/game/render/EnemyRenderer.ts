import Phaser from 'phaser';
import type { EnemySnapshot } from '../../types/game';
import { drawHex, drawPolygon, polygonPoints } from './ShapeFactory';

export function drawEnemy(graphics: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, centerX: number, centerY: number): void {
  const x = centerX + enemy.x;
  const y = centerY + enemy.y;
  const alpha = enemy.invulnerable ? 0.32 : 1;
  if (enemy.isBoss) {
    graphics.lineStyle(4, 0xffbe5c, alpha);
    graphics.strokeCircle(x, y, 40);
    for (let index = 0; index < 3; index += 1) {
      const angle = (enemy.shieldRotation ?? 0) + index * Math.PI * 2 / 3;
      graphics.lineStyle(7, 0xffbe5c, alpha * 0.9);
      graphics.lineBetween(x + Math.cos(angle) * 28, y + Math.sin(angle) * 28, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60);
    }
    graphics.fillStyle(0xff706a, alpha);
    graphics.fillCircle(x, y, 22);
  } else if (enemy.type === 'runner') {
    drawPolygon(graphics, polygonPoints(x, y, 15, 3, Math.atan2(enemy.y, enemy.x)), 0xffbe5c, alpha, 0xfff1a8);
  } else if (enemy.type === 'lattice') {
    graphics.fillStyle(0xa78bfa, alpha);
    graphics.fillCircle(x, y, 17);
    graphics.lineStyle(3, 0xf2f0e8, alpha);
    graphics.strokeCircle(x, y, 22);
    graphics.lineBetween(x - 14, y - 14, x + 14, y + 14);
    graphics.lineBetween(x + 14, y - 14, x - 14, y + 14);
  } else if (enemy.type === 'spore') {
    drawHex(graphics, x, y, 18, 0x76e6a7, alpha, 0xf2f0e8);
    graphics.fillStyle(0x07131f, alpha);
    graphics.fillCircle(x - 6, y - 2, 3);
    graphics.fillCircle(x + 6, y + 3, 3);
  } else {
    drawHex(graphics, x, y, 15, 0xff706a, alpha, 0xfff1a8);
    graphics.lineStyle(2, 0x07131f, alpha);
    graphics.lineBetween(x - 9, y + 9, x + 9, y - 9);
  }
  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  graphics.fillStyle(0x07131f, 0.85);
  graphics.fillRect(x - 20, y - 30, 40, 4);
  graphics.fillStyle(enemy.isBoss ? 0xffbe5c : 0xff706a, 1);
  graphics.fillRect(x - 20, y - 30, 40 * ratio, 4);
  if (enemy.shieldHits > 0) {
    graphics.lineStyle(2, 0xa78bfa, 0.95);
    graphics.strokeCircle(x, y, 25);
  }
}
