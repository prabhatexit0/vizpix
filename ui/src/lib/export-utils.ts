import type { Layer } from "@/store/types";
import { blendModeMap } from "@/lib/blend-modes";

export type ExportFormat = "png" | "jpeg";

export interface ExportOptions {
  format: ExportFormat;
  quality: number; // 1-100, only used for JPEG
  filename: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
}

export async function exportCanvas(options: ExportOptions): Promise<void> {
  const { format, quality, filename, width, height, background, layers } = options;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create offscreen canvas context");

  // fill background
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // translate origin to center (matching compositor coordinate system)
  ctx.translate(width / 2, height / 2);

  // composite layers
  for (const layer of layers) {
    if (!layer.visible || !layer.imageBitmap) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = blendModeMap[layer.blendMode];

    const { x, y, scaleX, scaleY, rotation } = layer.transform;
    ctx.translate(x, y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(layer.imageBitmap, -layer.width / 2, -layer.height / 2);

    ctx.restore();
  }

  // export to blob
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const blob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === "jpeg" ? quality / 100 : undefined,
  });

  // trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
