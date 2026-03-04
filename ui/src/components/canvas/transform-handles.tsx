import { useMemo, useCallback, useRef } from "react";
import { useEditorStore } from "@/store";
import type { Viewport } from "@/store/types";

interface TransformHandlesProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layerId: string;
  viewport: Viewport;
}

const HANDLE_SIZE = 10;

const CORNER_CURSORS = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize"];
const MID_CURSORS = ["ns-resize", "ew-resize", "ns-resize", "ew-resize"];

// Sign multipliers for center-based resize
// Corners: TL, TR, BR, BL
const CORNER_SIGNS: [number, number][] = [
  [-1, -1], // TL
  [1, -1],  // TR
  [1, 1],   // BR
  [-1, 1],  // BL
];

// Midpoints: Top, Right, Bottom, Left
// [signX, signY, affectsX, affectsY]
const MID_SIGNS: [number, number, boolean, boolean][] = [
  [0, -1, false, true],  // Top
  [1, 0, true, false],   // Right
  [0, 1, false, true],   // Bottom
  [-1, 0, true, false],  // Left
];

interface DragState {
  handleType: "corner" | "mid";
  handleIndex: number;
  startScreenX: number;
  startScreenY: number;
  initialScaleX: number;
  initialScaleY: number;
  layerWidth: number;
  layerHeight: number;
  rotationRad: number;
  snapshotPushed: boolean;
}

export function TransformHandles({ canvasRef, layerId, viewport }: TransformHandlesProps) {
  const layer = useEditorStore((s) => s.layers.find((l) => l.id === layerId));
  const dragRef = useRef<DragState | null>(null);

  const corners = useMemo(() => {
    if (!layer || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2 + viewport.panX;
    const cy = rect.height / 2 + viewport.panY;

    const { x, y, scaleX, scaleY, rotation } = layer.transform;
    const hw = (layer.width * scaleX * viewport.zoom) / 2;
    const hh = (layer.height * scaleY * viewport.zoom) / 2;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const worldX = cx + x * viewport.zoom;
    const worldY = cy + y * viewport.zoom;

    const pts = [
      [-hw, -hh], // TL
      [hw, -hh],  // TR
      [hw, hh],   // BR
      [-hw, hh],  // BL
    ];

    return pts.map(([px, py]) => ({
      x: worldX + px * cos - py * sin,
      y: worldY + px * sin + py * cos,
    }));
  }, [layer, canvasRef, viewport]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handleType: "corner" | "mid", handleIndex: number) => {
      e.stopPropagation();
      e.preventDefault();

      if (!layer) return;

      const el = e.currentTarget as SVGGElement;
      el.setPointerCapture(e.pointerId);

      dragRef.current = {
        handleType,
        handleIndex,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        initialScaleX: layer.transform.scaleX,
        initialScaleY: layer.transform.scaleY,
        layerWidth: layer.width,
        layerHeight: layer.height,
        rotationRad: (layer.transform.rotation * Math.PI) / 180,
        snapshotPushed: false,
      };
    },
    [layer],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!drag.snapshotPushed) {
        useEditorStore.getState().pushSnapshot();
        drag.snapshotPushed = true;
      }

      // Screen delta -> world delta (divide by zoom)
      const sdx = e.clientX - drag.startScreenX;
      const sdy = e.clientY - drag.startScreenY;
      const wdx = sdx / viewport.zoom;
      const wdy = sdy / viewport.zoom;

      // Un-rotate to get local-axis-aligned delta
      const cos = Math.cos(-drag.rotationRad);
      const sin = Math.sin(-drag.rotationRad);
      const localDx = wdx * cos - wdy * sin;
      const localDy = wdx * sin + wdy * cos;

      const store = useEditorStore.getState();

      if (drag.handleType === "corner") {
        const [signX, signY] = CORNER_SIGNS[drag.handleIndex];
        const newScaleX = drag.initialScaleX + (signX * localDx) / (drag.layerWidth / 2);
        const newScaleY = drag.initialScaleY + (signY * localDy) / (drag.layerHeight / 2);
        store.setTransform(layerId, {
          scaleX: Math.max(0.01, newScaleX),
          scaleY: Math.max(0.01, newScaleY),
        });
      } else {
        const [signX, signY, affectsX, affectsY] = MID_SIGNS[drag.handleIndex];
        const updates: { scaleX?: number; scaleY?: number } = {};
        if (affectsX) {
          updates.scaleX = Math.max(0.01, drag.initialScaleX + (signX * localDx) / (drag.layerWidth / 2));
        }
        if (affectsY) {
          updates.scaleY = Math.max(0.01, drag.initialScaleY + (signY * localDy) / (drag.layerHeight / 2));
        }
        store.setTransform(layerId, updates);
      }
    },
    [layerId, viewport.zoom],
  );

  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as SVGGElement;
    el.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  if (!corners || !layer) return null;

  const midpoints = corners.map((c, i) => {
    const next = corners[(i + 1) % 4];
    return { x: (c.x + next.x) / 2, y: (c.y + next.y) / 2 };
  });

  const half = HANDLE_SIZE / 2;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {/* Bounding box */}
      <polygon
        points={corners.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
        strokeDasharray="4 2"
        opacity={0.8}
      />
      {/* Corner handles */}
      {corners.map((c, i) => (
        <g
          key={`corner-${i}`}
          className="pointer-events-auto"
          style={{ cursor: CORNER_CURSORS[i] }}
          onPointerDown={(e) => onHandlePointerDown(e, "corner", i)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <rect
            x={c.x - half}
            y={c.y - half}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={2}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5}
            className="transition-transform origin-center hover:scale-125"
          />
          {/* Larger invisible hit area for easier grabbing */}
          <rect
            x={c.x - half - 4}
            y={c.y - half - 4}
            width={HANDLE_SIZE + 8}
            height={HANDLE_SIZE + 8}
            fill="transparent"
          />
        </g>
      ))}
      {/* Midpoint handles */}
      {midpoints.map((m, i) => (
        <g
          key={`mid-${i}`}
          className="pointer-events-auto"
          style={{ cursor: MID_CURSORS[i] }}
          onPointerDown={(e) => onHandlePointerDown(e, "mid", i)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <rect
            x={m.x - half}
            y={m.y - half}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={2}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5}
            className="transition-transform origin-center hover:scale-125"
          />
          <rect
            x={m.x - half - 4}
            y={m.y - half - 4}
            width={HANDLE_SIZE + 8}
            height={HANDLE_SIZE + 8}
            fill="transparent"
          />
        </g>
      ))}
    </svg>
  );
}
