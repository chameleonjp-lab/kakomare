import Phaser from 'phaser';

export function polygonPoints(cx: number, cy: number, radius: number, sides: number, rotation = -Math.PI / 2): Phaser.Geom.Point[] {
  return Array.from({ length: sides }, (_, index) => new Phaser.Geom.Point(
    cx + Math.cos(rotation + index * Math.PI * 2 / sides) * radius,
    cy + Math.sin(rotation + index * Math.PI * 2 / sides) * radius,
  ));
}

export function drawPolygon(graphics: Phaser.GameObjects.Graphics, points: Phaser.Geom.Point[], fill: number, alpha = 1, line = 0x163246): void {
  graphics.fillStyle(fill, alpha);
  graphics.lineStyle(2, line, Math.min(1, alpha + 0.1));
  graphics.beginPath();
  graphics.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

export function drawHex(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, fill: number, alpha = 1, line = 0x63d7e6): void {
  drawPolygon(graphics, polygonPoints(cx, cy, radius, 6), fill, alpha, line);
}
