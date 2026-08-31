import Phaser from 'phaser';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import type { BossId, EnemyId } from '../../types/content';
import type { EnemySnapshot } from '../../types/game';
import { drawHex, drawPolygon, polygonPoints } from './ShapeFactory';

export function drawEnemy(graphics: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, centerX: number, centerY: number): void {
  const x = centerX + enemy.x;
  const y = centerY + enemy.y;
  const alpha = enemy.invulnerable ? 0.32 : 1;
  if (enemy.isBoss) drawBoss(graphics, enemy, x, y, alpha);
  else drawNormalEnemy(graphics, enemy, x, y, alpha);
  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  graphics.fillStyle(0x07131f, 0.85);
  graphics.fillRect(x - 22, y - 31, 44, 4);
  graphics.fillStyle(enemy.isBoss ? bossColor(enemy.type as BossId) : enemyColor(enemy.type as EnemyId), 1);
  graphics.fillRect(x - 22, y - 31, 44 * ratio, 4);
  if (enemy.shieldHits > 0) {
    graphics.lineStyle(2, 0xa78bfa, 0.95);
    graphics.strokeCircle(x, y, 25);
  }
}

function drawBoss(graphics: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, x: number, y: number, alpha: number): void {
  const id = enemy.type as BossId;
  const color = bossColor(id);
  graphics.lineStyle(4, color, alpha);
  graphics.strokeCircle(x, y, id === 'echo' ? 48 : id === 'designer' ? 44 : 40);
  if (id === 'crown') {
    for (let index = 0; index < 3; index += 1) {
      const angle = (enemy.shieldRotation ?? 0) + index * Math.PI * 2 / 3;
      graphics.lineStyle(7, color, alpha * 0.9);
      graphics.lineBetween(x + Math.cos(angle) * 28, y + Math.sin(angle) * 28, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60);
    }
  } else if (id === 'designer') {
    drawPolygon(graphics, polygonPoints(x, y, 34, 6, enemy.shieldRotation ?? 0), color, alpha * 0.22, color);
    graphics.lineStyle(2, 0xfff1a8, alpha);
    graphics.lineBetween(x - 20, y, x + 20, y);
    graphics.lineBetween(x, y - 20, x, y + 20);
  } else {
    graphics.lineStyle(3, color, alpha);
    graphics.strokeCircle(x, y, 30);
    graphics.strokeCircle(x, y, 18);
    graphics.lineBetween(x - 28, y - 28, x + 28, y + 28);
    graphics.lineBetween(x + 28, y - 28, x - 28, y + 28);
  }
  graphics.fillStyle(color, alpha * 0.55);
  graphics.fillCircle(x, y, 22);
}

function drawNormalEnemy(graphics: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, x: number, y: number, alpha: number): void {
  const id = enemy.type as EnemyId;
  const color = enemyColor(id);
  if (id === 'runner') drawPolygon(graphics, polygonPoints(x, y, 15, 3, Math.atan2(enemy.y, enemy.x)), color, alpha, 0xfff1a8);
  else if (id === 'lattice') {
    graphics.fillStyle(color, alpha); graphics.fillCircle(x, y, 17);
    graphics.lineStyle(3, 0xf2f0e8, alpha); graphics.strokeCircle(x, y, 22);
    graphics.lineBetween(x - 14, y - 14, x + 14, y + 14); graphics.lineBetween(x + 14, y - 14, x - 14, y + 14);
  } else if (id === 'shell') {
    graphics.fillStyle(color, alpha * 0.42); graphics.fillCircle(x, y, 17);
    graphics.lineStyle(6, color, alpha); graphics.strokeCircle(x, y, 24);
    graphics.lineStyle(2, 0xfff1a8, alpha); graphics.strokeCircle(x, y, 13);
  } else if (id === 'spore') {
    drawHex(graphics, x, y, 18, color, alpha, 0xf2f0e8);
    graphics.fillStyle(0x07131f, alpha); graphics.fillCircle(x - 6, y - 2, 3); graphics.fillCircle(x + 6, y + 3, 3);
  } else if (id === 'marker') {
    drawPolygon(graphics, polygonPoints(x, y, 18, 4, Math.PI / 4), color, alpha * 0.75, 0xfff1a8);
    graphics.lineStyle(2, 0xfff1a8, alpha); graphics.strokeCircle(x, y, 8);
  } else if (id === 'dropper') {
    graphics.fillStyle(color, alpha * 0.75); graphics.fillRect(x - 15, y - 15, 30, 30);
    graphics.lineStyle(3, 0xfff1a8, alpha); graphics.strokeRect(x - 20, y - 20, 40, 40);
    graphics.lineBetween(x - 10, y, x + 10, y);
  } else if (id === 'phase') {
    graphics.lineStyle(3, color, alpha); graphics.strokeCircle(x, y, 19); graphics.strokeCircle(x, y, 11);
    graphics.lineBetween(x - 13, y + 13, x + 13, y - 13);
  } else {
    drawHex(graphics, x, y, 15, color, alpha, 0xfff1a8);
    graphics.lineStyle(2, 0x07131f, alpha); graphics.lineBetween(x - 9, y + 9, x + 9, y - 9);
  }
  if (id === 'marker') {
    graphics.lineStyle(1, color, alpha * 0.65); graphics.strokeCircle(x, y, 46); graphics.strokeCircle(x, y, 52);
  }
}

function enemyColor(id: EnemyId): number { return ENEMIES[id].color; }
function bossColor(id: BossId): number { return BOSSES[id].color; }
