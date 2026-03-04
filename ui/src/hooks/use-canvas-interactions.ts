import { useCallback, useRef } from "react";
import { useEditorStore } from "@/store";
import type { ToolMode } from "@/store/types";

interface PointerState {
  down: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  movedLayer: boolean;
}

function screenToWorld(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
): { wx: number; wy: number } {
  const rect = canvas.getBoundingClientRect();
  const cx = sx - rect.left;
  const cy = sy - rect.top;
  const w = rect.width;
  const h = rect.height;
  const { viewport } = useEditorStore.getState();
  const wx = (cx - w / 2 - viewport.panX) / viewport.zoom;
  const wy = (cy - h / 2 - viewport.panY) / viewport.zoom;
  return { wx, wy };
}

function hitTestLayers(wx: number, wy: number) {
  const { layers } = useEditorStore.getState();
  // top-down hit test
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible || layer.locked) continue;

    const { x, y, scaleX, scaleY, rotation } = layer.transform;
    // inverse transform
    const rad = (-rotation * Math.PI) / 180;
    const dx = wx - x;
    const dy = wy - y;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = (dx * cos - dy * sin) / scaleX;
    const ly = (dx * sin + dy * cos) / scaleY;

    if (
      Math.abs(lx) <= layer.width / 2 &&
      Math.abs(ly) <= layer.height / 2
    ) {
      return layer.id;
    }
  }
  return null;
}

export function useCanvasInteractions(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const ptrRef = useRef<PointerState>({
    down: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    movedLayer: false,
  });
  const tempHandRef = useRef(false);

  const getEffectiveTool = useCallback((): ToolMode => {
    if (tempHandRef.current) return "hand";
    return useEditorStore.getState().activeTool;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      const ptr = ptrRef.current;
      ptr.down = true;
      ptr.startX = e.clientX;
      ptr.startY = e.clientY;
      ptr.lastX = e.clientX;
      ptr.lastY = e.clientY;
      ptr.movedLayer = false;

      const tool = getEffectiveTool();

      if (tool === "pointer" || tool === "crop") {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY, canvas);
        const hitId = hitTestLayers(wx, wy);
        useEditorStore.getState().setActiveLayer(hitId);
      } else if (tool === "zoom") {
        const factor = e.altKey ? 0.8 : 1.25;
        const rect = canvas.getBoundingClientRect();
        useEditorStore
          .getState()
          .zoom(factor, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
      }
    },
    [canvasRef, getEffectiveTool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ptr = ptrRef.current;
      if (!ptr.down) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dx = e.clientX - ptr.lastX;
      const dy = e.clientY - ptr.lastY;
      ptr.lastX = e.clientX;
      ptr.lastY = e.clientY;

      const tool = getEffectiveTool();

      if (tool === "hand") {
        useEditorStore.getState().pan(dx, dy);
      } else if (tool === "pointer") {
        const { activeLayerId, layers, viewport } = useEditorStore.getState();
        if (!activeLayerId) return;
        const layer = layers.find((l) => l.id === activeLayerId);
        if (!layer || layer.locked) return;

        if (!ptr.movedLayer) {
          // push snapshot on first drag
          useEditorStore.getState().pushSnapshot();
          ptr.movedLayer = true;
        }

        useEditorStore.getState().setTransform(activeLayerId, {
          x: layer.transform.x + dx / viewport.zoom,
          y: layer.transform.y + dy / viewport.zoom,
        });
      }
    },
    [canvasRef, getEffectiveTool],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (canvas) canvas.releasePointerCapture(e.pointerId);
      ptrRef.current.down = false;
    },
    [canvasRef],
  );

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      useEditorStore
        .getState()
        .zoom(factor, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    },
    [canvasRef],
  );

  const setTempHand = useCallback((active: boolean) => {
    tempHandRef.current = active;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    setTempHand,
  };
}
