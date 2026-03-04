import { useCallback, useRef, useState } from "react";
import { useEditorStore } from "@/store";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Loader2, SlidersHorizontal } from "lucide-react";

interface AdjustValues {
  brightness: number;
  contrast: number;
  saturation: number;
}

const DEFAULTS: AdjustValues = { brightness: 0, contrast: 0, saturation: 0 };

export function AdjustPanel() {
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const layer = useEditorStore((s) =>
    s.layers.find((l) => l.id === s.activeLayerId),
  );
  const applyWasmToLayer = useEditorStore((s) => s.applyWasmToLayer);
  const processing = useEditorStore((s) => s.processing);
  const setProcessing = useEditorStore((s) => s.setProcessing);

  const [values, setValues] = useState<AdjustValues>(DEFAULTS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const baseRef = useRef<Uint8Array | null>(null);

  // Cache the base bytes when user starts adjusting
  const getBase = useCallback(() => {
    if (!baseRef.current && layer) {
      baseRef.current = layer.imageBytes;
    }
    return baseRef.current;
  }, [layer]);

  const applyAdjust = useCallback(
    async (adj: AdjustValues) => {
      const base = getBase();
      if (!base || !activeLayerId) return;
      if (adj.brightness === 0 && adj.contrast === 0 && adj.saturation === 0) return;

      setProcessing(true);
      try {
        const { adjust_image } = await import("@/wasm/vizpix-core/vizpix_core");
        const result = adjust_image(base, adj.brightness, adj.contrast, adj.saturation);
        await applyWasmToLayer(activeLayerId, result);
      } finally {
        setProcessing(false);
      }
    },
    [activeLayerId, applyWasmToLayer, getBase, setProcessing],
  );

  const handleChange = useCallback(
    (key: keyof AdjustValues, val: number) => {
      const next = { ...values, [key]: val };
      setValues(next);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => applyAdjust(next), 300);
    },
    [values, applyAdjust],
  );

  const handleReset = useCallback(() => {
    setValues(DEFAULTS);
    baseRef.current = null;
  }, []);

  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-500">
        <SlidersHorizontal size={24} strokeWidth={1.5} />
        <span className="text-xs">Select a layer to adjust</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {(["brightness", "contrast", "saturation"] as const).map((key) => (
        <div key={key}>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs uppercase tracking-wide text-neutral-500">{key}</label>
            <span className="tabular-nums text-xs text-neutral-400">{values[key]}</span>
          </div>
          <Slider
            value={[values[key]]}
            min={-100}
            max={100}
            step={1}
            onValueChange={([v]) => handleChange(key, v)}
          />
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={handleReset}
        disabled={processing}
        className="text-xs"
      >
        {processing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
        {processing ? "Processing…" : "Reset"}
      </Button>
    </div>
  );
}
