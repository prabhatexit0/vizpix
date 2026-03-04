import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store";
import type { ToolMode } from "@/store/types";

export function useKeyboardShortcuts(setTempHand?: (active: boolean) => void) {
  const prevToolRef = useRef<ToolMode | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ignore if typing in input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const store = useEditorStore.getState();

      // Tool switching
      if (e.key === "v" || e.key === "V") {
        store.setActiveTool("pointer");
        return;
      }
      if (e.key === "h" || e.key === "H") {
        store.setActiveTool("hand");
        return;
      }
      if (e.key === "z" && !e.ctrlKey && !e.metaKey) {
        store.setActiveTool("zoom");
        return;
      }

      // Temp hand (space)
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        prevToolRef.current = store.activeTool;
        store.setActiveTool("hand");
        setTempHand?.(true);
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        store.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Z") {
        e.preventDefault();
        store.redo();
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
  }, [setTempHand]);
}
