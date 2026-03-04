import type { Layer } from "@/store/types";
import { decodeToBitmap } from "./canvas-utils";

let layerCounter = 0;

export async function createLayer(
  bytes: Uint8Array,
  name?: string,
): Promise<Layer> {
  const bitmap = await decodeToBitmap(bytes);
  layerCounter++;
  return {
    id: crypto.randomUUID(),
    name: name ?? `Layer ${layerCounter}`,
    imageBytes: bytes,
    imageBitmap: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    visible: true,
    opacity: 1,
    blendMode: "normal",
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    locked: false,
  };
}
