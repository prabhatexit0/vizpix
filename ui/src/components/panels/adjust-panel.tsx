import { useCallback, useRef, useState } from "react";
import { useEditorStore } from "@/store";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [blurRadius, setBlurRadius] = useState(5);
  const [blurType, setBlurType] = useState<"box" | "gaussian">("gaussian");
  const [sharpenAmount, setSharpenAmount] = useState(1.0);
  const [sharpenRadius, setSharpenRadius] = useState(2);
  const [sharpenThreshold, setSharpenThreshold] = useState(5);
  const [numColors, setNumColors] = useState(8);
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

  const handleApplyBlur = useCallback(async () => {
    if (!layer || !activeLayerId || processing) return;
    setProcessing(true);
    try {
      const { apply_blur } = await import("@/wasm/vizpix-core/vizpix_core");
      const result = apply_blur(layer.imageBytes, blurRadius, blurType);
      await applyWasmToLayer(activeLayerId, result);
      baseRef.current = null;
    } finally {
      setProcessing(false);
    }
  }, [layer, activeLayerId, blurRadius, blurType, processing, applyWasmToLayer, setProcessing]);

  const handleApplySharpen = useCallback(async () => {
    if (!layer || !activeLayerId || processing) return;
    setProcessing(true);
    try {
      const { apply_sharpen } = await import("@/wasm/vizpix-core/vizpix_core");
      const result = apply_sharpen(layer.imageBytes, sharpenAmount, sharpenRadius, sharpenThreshold);
      await applyWasmToLayer(activeLayerId, result);
      baseRef.current = null;
    } finally {
      setProcessing(false);
    }
  }, [layer, activeLayerId, sharpenAmount, sharpenRadius, sharpenThreshold, processing, applyWasmToLayer, setProcessing]);

  const handleApplyPosterize = useCallback(async () => {
    if (!layer || !activeLayerId || processing) return;
    setProcessing(true);
    try {
      const { quantize_colors } = await import("@/wasm/vizpix-core/vizpix_core");
      const result = quantize_colors(layer.imageBytes, numColors);
      await applyWasmToLayer(activeLayerId, result);
      baseRef.current = null;
    } finally {
      setProcessing(false);
    }
  }, [layer, activeLayerId, numColors, processing, applyWasmToLayer, setProcessing]);

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

      <div className="h-px bg-white/[.15]" />

      {/* Blur */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-500">blur radius</label>
          <span className="tabular-nums text-xs text-neutral-400">{blurRadius}</span>
        </div>
        <Slider
          value={[blurRadius]}
          min={0}
          max={50}
          step={1}
          onValueChange={([v]) => setBlurRadius(v)}
        />
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => setBlurType("box")}
          className={cn(
            "flex-1 rounded px-2 py-1 text-xs transition-colors",
            blurType === "box"
              ? "bg-blue-500/20 text-blue-400"
              : "bg-white/5 text-neutral-400 hover:bg-white/10",
          )}
        >
          Box
        </button>
        <button
          onClick={() => setBlurType("gaussian")}
          className={cn(
            "flex-1 rounded px-2 py-1 text-xs transition-colors",
            blurType === "gaussian"
              ? "bg-blue-500/20 text-blue-400"
              : "bg-white/5 text-neutral-400 hover:bg-white/10",
          )}
        >
          Gaussian
        </button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApplyBlur}
        disabled={processing || blurRadius === 0}
        className="text-xs"
      >
        {processing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
        Apply Blur
      </Button>

      <div className="h-px bg-white/[.15]" />

      {/* Sharpen */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-500">sharpen amount</label>
          <span className="tabular-nums text-xs text-neutral-400">{sharpenAmount.toFixed(1)}</span>
        </div>
        <Slider
          value={[sharpenAmount]}
          min={0}
          max={3}
          step={0.1}
          onValueChange={([v]) => setSharpenAmount(v)}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-500">sharpen radius</label>
          <span className="tabular-nums text-xs text-neutral-400">{sharpenRadius}</span>
        </div>
        <Slider
          value={[sharpenRadius]}
          min={1}
          max={10}
          step={1}
          onValueChange={([v]) => setSharpenRadius(v)}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-500">threshold</label>
          <span className="tabular-nums text-xs text-neutral-400">{sharpenThreshold}</span>
        </div>
        <Slider
          value={[sharpenThreshold]}
          min={0}
          max={50}
          step={1}
          onValueChange={([v]) => setSharpenThreshold(v)}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApplySharpen}
        disabled={processing || sharpenAmount === 0}
        className="text-xs"
      >
        {processing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
        Apply Sharpen
      </Button>

      <div className="h-px bg-white/[.15]" />

      {/* Posterize */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-500">posterize colors</label>
          <span className="tabular-nums text-xs text-neutral-400">{numColors}</span>
        </div>
        <Slider
          value={[numColors]}
          min={2}
          max={32}
          step={1}
          onValueChange={([v]) => setNumColors(v)}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApplyPosterize}
        disabled={processing}
        className="text-xs"
      >
        {processing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
        Apply Posterize
      </Button>
    </div>
  );
}
