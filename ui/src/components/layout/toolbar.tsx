import { useCallback, useState } from "react";
import {
  MousePointer2,
  Hand,
  ZoomIn,
  ImagePlus,
  Undo2,
  Redo2,
  Frame,
  Download,
} from "lucide-react";
import { useEditorStore } from "@/store";
import { useResponsive } from "@/hooks/use-responsive";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ToolMode } from "@/store/types";
import { CanvasSizeDialog } from "@/components/dialogs/canvas-size-dialog";
import { ExportDialog } from "@/components/dialogs/export-dialog";

const TOOLS: { mode: ToolMode; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { mode: "pointer", icon: MousePointer2, label: "Pointer", shortcut: "V" },
  { mode: "hand", icon: Hand, label: "Hand", shortcut: "H" },
  { mode: "zoom", icon: ZoomIn, label: "Zoom", shortcut: "Z" },
];

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const addLayer = useEditorStore((s) => s.addLayer);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const undoStack = useEditorStore((s) => s.undoStack);
  const redoStack = useEditorStore((s) => s.redoStack);
  const { isMobile } = useResponsive();
  const [canvasSizeOpen, setCanvasSizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const handleAddImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      addLayer(bytes, file.name.replace(/\.[^.]+$/, ""));
    };
    input.click();
  }, [addLayer]);

  const buttons = (
    <>
      {TOOLS.map(({ mode, icon: Icon, label, shortcut }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(mode)}
              className={cn(
                "flex items-center justify-center rounded-md p-2 transition-colors",
                activeTool === mode
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-neutral-400 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={isMobile ? "top" : "right"}>
            {label} ({shortcut})
          </TooltipContent>
        </Tooltip>
      ))}

      <div className={cn(isMobile ? "w-px h-5 bg-white/[.15]" : "mx-1 h-px w-full bg-white/[.15]")} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleAddImage}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ImagePlus size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? "top" : "right"}>Add Image</TooltipContent>
      </Tooltip>

      <div className={cn(isMobile ? "w-px h-5 bg-white/[.15]" : "mx-1 h-px w-full bg-white/[.15]")} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => undo()}
            disabled={undoStack.length === 0}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <Undo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? "top" : "right"}>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => redo()}
            disabled={redoStack.length === 0}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <Redo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? "top" : "right"}>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>

      <div className={cn(isMobile ? "w-px h-5 bg-white/[.15]" : "mx-1 h-px w-full bg-white/[.15]")} />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCanvasSizeOpen(true)}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Frame size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? "top" : "right"}>Canvas Size</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center justify-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={isMobile ? "top" : "right"}>Export</TooltipContent>
      </Tooltip>
    </>
  );

  const dialogs = (
    <>
      <CanvasSizeDialog open={canvasSizeOpen} onOpenChange={setCanvasSizeOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/[.15] bg-neutral-900/90 px-2 py-1.5 backdrop-blur-md">
          {buttons}
        </div>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex w-12 flex-col items-center gap-1 border-r border-white/[.15] bg-neutral-900 py-2">
        {buttons}
      </div>
      {dialogs}
    </>
  );
}
