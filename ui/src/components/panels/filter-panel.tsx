import { useCallback } from "react";
import { useEditorStore } from "@/store";
import { Button } from "@/components/ui/button";
import { FILTERS } from "@/lib/constants";
import { Loader2, Sparkles } from "lucide-react";

export function FilterPanel() {
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const layer = useEditorStore((s) =>
    s.layers.find((l) => l.id === s.activeLayerId),
  );
  const applyWasmToLayer = useEditorStore((s) => s.applyWasmToLayer);
  const processing = useEditorStore((s) => s.processing);
  const setProcessing = useEditorStore((s) => s.setProcessing);

  const handleApply = useCallback(
    async (filterName: string) => {
      if (!layer || !activeLayerId) return;
      setProcessing(true);
      try {
        const { apply_filter } = await import("@/wasm/vizpix-core/vizpix_core");
        const result = apply_filter(layer.imageBytes, filterName);
        await applyWasmToLayer(activeLayerId, result);
      } finally {
        setProcessing(false);
      }
    },
    [activeLayerId, layer, applyWasmToLayer, setProcessing],
  );

  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-500">
        <Sparkles size={24} strokeWidth={1.5} />
        <span className="text-xs">Select a layer to apply filters</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {FILTERS.map((filter) => (
        <Button
          key={filter}
          variant="outline"
          size="sm"
          disabled={processing}
          onClick={() => handleApply(filter)}
          className="h-9 text-xs capitalize"
        >
          {processing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
          {filter}
        </Button>
      ))}
    </div>
  );
}
