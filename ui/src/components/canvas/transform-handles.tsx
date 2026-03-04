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
  initialX: number;
  initialY: number;
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

  // Store viewport.zoom in a ref so document-level listeners always see the latest value
  const zoomRef = useRef(viewport.zoom);
  zoomRef.current = viewport.zoom;

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handleType: "corner" | "mid", handleIndex: number) => {
      e.stopPropagation();
      e.preventDefault();

      if (!layer) return;

      dragRef.current = {
        handleType,
        handleIndex,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        initialScaleX: layer.transform.scaleX,
        initialScaleY: layer.transform.scaleY,
        initialX: layer.transform.x,
        initialY: layer.transform.y,
        layerWidth: layer.width,
        layerHeight: layer.height,
        rotationRad: (layer.transform.rotation * Math.PI) / 180,
        snapshotPushed: false,
      };

      const onDocPointerMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        if (!drag.snapshotPushed) {
          useEditorStore.getState().pushSnapshot();
          drag.snapshotPushed = true;
        }

        const zoom = zoomRef.current;

        // Screen delta -> world delta (divide by zoom)
        const sdx = ev.clientX - drag.startScreenX;
        const sdy = ev.clientY - drag.startScreenY;
        const wdx = sdx / zoom;
        const wdy = sdy / zoom;

        // Un-rotate to get local-axis-aligned delta
        const cos = Math.cos(-drag.rotationRad);
        const sin = Math.sin(-drag.rotationRad);
        const localDx = wdx * cos - wdy * sin;
        const localDy = wdx * sin + wdy * cos;

        const store = useEditorStore.getState();

        // Rotation values for converting local offset back to world coords
        const rotCos = Math.cos(drag.rotationRad);
        const rotSin = Math.sin(drag.rotationRad);

        if (drag.handleType === "corner") {
          const [signX, signY] = CORNER_SIGNS[drag.handleIndex];
          const newScaleX = Math.max(0.01, drag.initialScaleX + (signX * localDx) / drag.layerWidth);
          const newScaleY = Math.max(0.01, drag.initialScaleY + (signY * localDy) / drag.layerHeight);

          // Offset position so the opposite corner stays anchored
          const dsx = newScaleX - drag.initialScaleX;
          const dsy = newScaleY - drag.initialScaleY;
          const localOffX = (signX * drag.layerWidth * dsx) / 2;
          const localOffY = (signY * drag.layerHeight * dsy) / 2;

          store.setTransform(layerId, {
            scaleX: newScaleX,
            scaleY: newScaleY,
            x: drag.initialX + localOffX * rotCos - localOffY * rotSin,
            y: drag.initialY + localOffX * rotSin + localOffY * rotCos,
          });
        } else {
          const [signX, signY, affectsX, affectsY] = MID_SIGNS[drag.handleIndex];
          const updates: { scaleX?: number; scaleY?: number; x?: number; y?: number } = {};

          let localOffX = 0;
          let localOffY = 0;

          if (affectsX) {
            const newScaleX = Math.max(0.01, drag.initialScaleX + (signX * localDx) / drag.layerWidth);
            updates.scaleX = newScaleX;
            localOffX = (signX * drag.layerWidth * (newScaleX - drag.initialScaleX)) / 2;
          }
          if (affectsY) {
            const newScaleY = Math.max(0.01, drag.initialScaleY + (signY * localDy) / drag.layerHeight);
            updates.scaleY = newScaleY;
            localOffY = (signY * drag.layerHeight * (newScaleY - drag.initialScaleY)) / 2;
          }

          updates.x = drag.initialX + localOffX * rotCos - localOffY * rotSin;
          updates.y = drag.initialY + localOffX * rotSin + localOffY * rotCos;

          store.setTransform(layerId, updates);
        }
      };

      const onDocPointerUp = () => {
        dragRef.current = null;
        document.removeEventListener("pointermove", onDocPointerMove);
        document.removeEventListener("pointerup", onDocPointerUp);
      };

      document.addEventListener("pointermove", onDocPointerMove);
      document.addEventListener("pointerup", onDocPointerUp);
    },
    [layer, layerId],
  );

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
