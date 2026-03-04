import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store";
import type { Layer, ToolMode } from "@/store/types";

// Clipboard buffer shared across the hook lifecycle
let clipboardLayer: Layer | null = null;

export function useKeyboardShortcuts(
  setTempHand?: (active: boolean) => void,
  canvasRef?: React.RefObject<HTMLCanvasElement | null>,
) {
  const prevToolRef = useRef<ToolMode | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ignore if typing in input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const store = useEditorStore.getState();

      // Tool switching
      if (e.key === "v" || e.key === "V") {
        if (!e.ctrlKey && !e.metaKey) {
          store.setActiveTool("pointer");
          return;
        }
      }
      if (e.key === "h" || e.key === "H") {
        store.setActiveTool("hand");
        return;
      }
      if (e.key === "z" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        store.setActiveTool("zoom");
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (!e.ctrlKey && !e.metaKey) {
          store.setActiveTool("crop");
          return;
        }
      }

      // Escape: exit crop tool
      if (e.key === "Escape") {
        if (store.activeTool === "crop") {
          store.setActiveTool("pointer");
          return;
        }
      }

      // Temp hand (space)
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        prevToolRef.current = store.activeTool;
        store.setActiveTool("hand");
        setTempHand?.(true);
        return;
      }

      // ---- Clipboard ----

      // Copy: Ctrl+C / Cmd+C
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && !e.shiftKey) {
        e.preventDefault();
        const layer = store.layers.find((l) => l.id === store.activeLayerId);
        if (layer) {
          clipboardLayer = layer;
        }
        return;
      }

      // Paste: Ctrl+V / Cmd+V — preserves all transforms
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V") && !e.shiftKey) {
        e.preventDefault();
        if (clipboardLayer) {
          const src = clipboardLayer;
          const clone: Layer = {
            ...src,
            id: crypto.randomUUID(),
            name: `${src.name} copy`,
            transform: { ...src.transform, x: src.transform.x + 20, y: src.transform.y + 20 },
          };
          store.pushSnapshot();
          useEditorStore.setState((s) => ({
            layers: [...s.layers, clone],
            activeLayerId: clone.id,
          }));
        }
        return;
      }

      // Cut: Ctrl+X / Cmd+X
      if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X") && !e.shiftKey) {
        e.preventDefault();
        const layer = store.layers.find((l) => l.id === store.activeLayerId);
        if (layer) {
          clipboardLayer = layer;
          store.removeLayer(layer.id);
        }
        return;
      }

      // ---- Undo / Redo ----

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && e.shiftKey) {
        e.preventDefault();
        store.redo();
        return;
      }

      // ---- Layer management ----

      // Duplicate layer: Ctrl+J / Cmd+J
      if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        if (store.activeLayerId) {
          store.duplicateLayer(store.activeLayerId);
        }
        return;
      }

      // Move layer up: ]
      if (e.key === "]" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (store.activeLayerId) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId);
          if (idx < store.layers.length - 1) {
            store.reorderLayers(idx, idx + 1);
          }
        }
        return;
      }

      // Move layer down: [
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (store.activeLayerId) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId);
          if (idx > 0) {
            store.reorderLayers(idx, idx - 1);
          }
        }
        return;
      }

      // Select next layer: Alt+]
      if (e.key === "]" && e.altKey) {
        e.preventDefault();
        if (store.layers.length > 0) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId);
          const next = Math.min(idx + 1, store.layers.length - 1);
          store.setActiveLayer(store.layers[next].id);
        }
        return;
      }

      // Select previous layer: Alt+[
      if (e.key === "[" && e.altKey) {
        e.preventDefault();
        if (store.layers.length > 0) {
          const idx = store.layers.findIndex((l) => l.id === store.activeLayerId);
          const prev = Math.max(idx - 1, 0);
          store.setActiveLayer(store.layers[prev].id);
        }
        return;
      }

      // Delete layer
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.activeLayerId) {
          store.removeLayer(store.activeLayerId);
        }
        return;
      }

      // Deselect: Ctrl+D / Cmd+D
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        store.setActiveLayer(null);
        return;
      }

      // ---- Zoom shortcuts ----

      // Zoom in: Ctrl+= / Ctrl++
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+") && !e.shiftKey) {
        e.preventDefault();
        store.zoom(1.25);
        return;
      }

      // Zoom out: Ctrl+-
      if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        store.zoom(0.8);
        return;
      }

      // Reset zoom: Ctrl+0
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        store.setZoom(1);
        return;
      }

      // Fit to viewport: Ctrl+Shift+F
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        const canvas = canvasRef?.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          store.fitToDocument(rect.width, rect.height);
        }
        return;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") {
        const prev = prevToolRef.current;
        if (prev) {
          useEditorStore.getState().setActiveTool(prev);
          prevToolRef.current = null;
        }
        setTempHand?.(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setTempHand, canvasRef]);
}
