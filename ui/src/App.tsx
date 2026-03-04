import { useEffect, useState, useCallback } from "react";
import { useEditorStore } from "@/store";
import { EditorLayout } from "@/components/layout/editor-layout";
import { CanvasSizePage } from "@/components/dialogs/canvas-size-dialog";

function App() {
  const initWasm = useEditorStore((s) => s.initWasm);
  const setDocumentSize = useEditorStore((s) => s.setDocumentSize);
  const setDocumentBackground = useEditorStore((s) => s.setDocumentBackground);
  const fitToDocument = useEditorStore((s) => s.fitToDocument);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    initWasm();
  }, [initWasm]);

  const handleCanvasApply = useCallback(
    (w: number, h: number, bg: string) => {
      setDocumentSize(w, h);
      setDocumentBackground(bg);
      setShowEditor(true);
      // Fit document to viewport after editor mounts
      requestAnimationFrame(() => {
        const container = document.querySelector("[data-slot='editor-canvas']");
        if (container) {
          const rect = container.getBoundingClientRect();
          fitToDocument(rect.width, rect.height);
        }
      });
    },
    [setDocumentSize, setDocumentBackground, fitToDocument],
  );

  if (!showEditor) {
    return <CanvasSizePage onApply={handleCanvasApply} />;
  }

  return <EditorLayout />;
}

export default App;
