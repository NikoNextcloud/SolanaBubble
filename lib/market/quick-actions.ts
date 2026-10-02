type QuickActionPositionInput = {
  nodeX: number;
  nodeY: number;
  nodeRadius: number;
  viewX: number;
  viewY: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  preferredWidth?: number;
  panelHeight?: number;
  padding?: number;
  gap?: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

/** Positions a fixed-size HTML action panel over a transformed SVG node. */
export function positionQuickActions({
  nodeX,
  nodeY,
  nodeRadius,
  viewX,
  viewY,
  scale,
  viewportWidth,
  viewportHeight,
  preferredWidth = 148,
  panelHeight = 42,
  padding = 8,
  gap = 10,
}: QuickActionPositionInput) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const availableWidth = Math.max(0, viewportWidth - padding * 2);
  const width = Math.min(preferredWidth, availableWidth);
  const centerX = viewX + nodeX * safeScale;
  const bubbleTop = viewY + (nodeY - nodeRadius) * safeScale;
  const bubbleBottom = viewY + (nodeY + nodeRadius) * safeScale;
  const below = bubbleBottom + gap;
  const above = bubbleTop - gap - panelHeight;
  const preferredTop = below + panelHeight <= viewportHeight - padding ? below : above;

  return {
    left: clamp(centerX - width / 2, padding, Math.max(padding, viewportWidth - width - padding)),
    top: clamp(preferredTop, padding, Math.max(padding, viewportHeight - panelHeight - padding)),
    width,
  };
}
