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
  const barWidth = Math.max(36, enemy.hitRadius * 2.1);
  graphics.fillRect(x - barWidth / 2, y - enemy.hitRadius - 12, barWidth, 4);
  graphics.fillStyle(enemy.isBoss ? bossColor(enemy.type as BossId) : enemyColor(enemy.type as EnemyId), 1);
  graphics.fillRect(x - barWidth / 2, y - enemy.hitRadius - 12, barWidth * ratio, 4);
  if (enemy.shieldHits > 0) {
    graphics.lineStyle(2, 0xa78bfa, 0.95);
    graphics.strokeCircle(x, y, enemy.hitRadius + 4);
  }
}

function drawBoss(graphics: Phaser.GameObjects.Graphics, enemy: EnemySnapshot, x: number, y: number, alpha: number): void {
  const id = enemy.type as BossId;
  const color = bossColor(id);
  graphics.lineStyle(4, color, alpha);
  graphics.strokeCircle(x, y, enemy.hitRadius);
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
  const radius = enemy.hitRadius;
  if (id === 'runner') drawPolygon(graphics, polygonPoints(x, y, radius, 3, Math.atan2(enemy.y, enemy.x)), color, alpha, 0xfff1a8);
  else if (id === 'lattice') {
    graphics.fillStyle(color, alpha); graphics.fillCircle(x, y, radius * 0.77);
    graphics.lineStyle(3, 0xf2f0e8, alpha); graphics.strokeCircle(x, y, radius);
    graphics.lineBetween(x - radius * 0.64, y - radius * 0.64, x + radius * 0.64, y + radius * 0.64); graphics.lineBetween(x + radius * 0.64, y - radius * 0.64, x - radius * 0.64, y + radius * 0.64);
  } else if (id === 'shell') {
    graphics.fillStyle(color, alpha * 0.42); graphics.fillCircle(x, y, radius * 0.77);
    graphics.lineStyle(6, color, alpha); graphics.strokeCircle(x, y, radius);
    graphics.lineStyle(2, 0xfff1a8, alpha); graphics.strokeCircle(x, y, radius * 0.54);
  } else if (id === 'spore') {
    drawHex(graphics, x, y, radius, color, alpha, 0xf2f0e8);
    graphics.fillStyle(0x07131f, alpha); graphics.fillCircle(x - radius * 0.33, y - radius * 0.11, 3); graphics.fillCircle(x + radius * 0.33, y + radius * 0.17, 3);
  } else if (id === 'marker') {
    drawPolygon(graphics, polygonPoints(x, y, radius, 4, Math.PI / 4), color, alpha * 0.75, 0xfff1a8);
    graphics.lineStyle(2, 0xfff1a8, alpha); graphics.strokeCircle(x, y, radius * 0.42);
  } else if (id === 'dropper') {
    graphics.fillStyle(color, alpha * 0.75); graphics.fillRect(x - radius * 0.75, y - radius * 0.75, radius * 1.5, radius * 1.5);
    graphics.lineStyle(3, 0xfff1a8, alpha); graphics.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    graphics.lineBetween(x - radius * 0.5, y, x + radius * 0.5, y);
  } else if (id === 'phase') {
    graphics.lineStyle(3, color, alpha); graphics.strokeCircle(x, y, radius); graphics.strokeCircle(x, y, radius * 0.58);
    graphics.lineBetween(x - radius * 0.68, y + radius * 0.68, x + radius * 0.68, y - radius * 0.68);
  } else {
    drawHex(graphics, x, y, radius, color, alpha, 0xfff1a8);
    graphics.lineStyle(2, 0x07131f, alpha); graphics.lineBetween(x - radius * 0.6, y + radius * 0.6, x + radius * 0.6, y - radius * 0.6);
  }
  if (id === 'marker') {
    drawDashedCircle(graphics, x, y, 120, color, alpha * 0.78, 24);
  }
}

function drawDashedCircle(graphics: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha: number, segments: number): void {
  graphics.lineStyle(1, color, alpha);
  const step = Math.PI * 2 / segments;
  for (let index = 0; index < segments; index += 2) {
    const start = index * step;
    const end = start + step * 0.72;
    graphics.lineBetween(x + Math.cos(start) * radius, y + Math.sin(start) * radius, x + Math.cos(end) * radius, y + Math.sin(end) * radius);
  }
}

function enemyColor(id: EnemyId): number { return ENEMIES[id].color; }
function bossColor(id: BossId): number { return BOSSES[id].color; }
