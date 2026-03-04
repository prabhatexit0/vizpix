const SIZE = 16;

export function createCheckerboardPattern(
  ctx: CanvasRenderingContext2D,
): CanvasPattern | null {
  const oc = new OffscreenCanvas(SIZE * 2, SIZE * 2);
  const octx = oc.getContext("2d");
  if (!octx) return null;

  octx.fillStyle = "#1a1a1a";
  octx.fillRect(0, 0, SIZE * 2, SIZE * 2);
  octx.fillStyle = "#2a2a2a";
  octx.fillRect(0, 0, SIZE, SIZE);
  octx.fillRect(SIZE, SIZE, SIZE, SIZE);

  return ctx.createPattern(oc, "repeat");
}
