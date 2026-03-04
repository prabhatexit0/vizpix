import { useEditorStore } from "@/store";
import { LayerItem } from "./layer-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback } from "react";

export function LayersPanel() {
  const layers = useEditorStore((s) => s.layers);
  const addLayer = useEditorStore((s) => s.addLayer);

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

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b p-2">
        <span className="text-xs font-medium text-neutral-300">Layers</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleAddImage}>
          <Plus size={14} />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="flex flex-col-reverse gap-1">
          {layers.map((layer) => (
            <LayerItem key={layer.id} layerId={layer.id} />
          ))}
        </div>
        {layers.length === 0 && (
          <button
            onClick={handleAddImage}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/[.12] py-8 text-neutral-500 transition-colors hover:border-white/25 hover:text-neutral-400"
          >
            <ImagePlus size={28} strokeWidth={1.5} />
            <span className="text-xs">Add an image to get started</span>
          </button>
        )}
      </ScrollArea>
    </div>
  );
}
