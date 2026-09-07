/**
 * Draw order for the canvas layers in the battle scene.
 *
 * Phaser draws a single Graphics object in command order, but that makes a
 * later refactor easy to get wrong.  The battle scene uses one Graphics object
 * per layer and these depths are the single source of truth for their order.
 * `hud` is reserved for DOM HUD elements, which are outside the canvas.
 */
export const RENDER_LAYERS = {
  background: 10,
  device: 20,
  friendly: 30,
  enemies: 40,
  telegraphs: 50,
  hostileProjectiles: 60,
  hud: 70,
} as const;

export type RenderLayer = keyof typeof RENDER_LAYERS;

export function isRenderLayerAbove(layer: RenderLayer, reference: RenderLayer): boolean {
  return RENDER_LAYERS[layer] > RENDER_LAYERS[reference];
}
