import { useCallback, useEffect, useRef, useState } from "react";
import init, { invert_colors } from "./wasm/vizpix-core/vizpix_core";
import { Button } from "@/components/ui/button";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wasmReady, setWasmReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [inverted, setInverted] = useState(false);

  useEffect(() => {
    init().then(() => setWasmReady(true));
  }, []);

  const drawImageOnCanvas = useCallback((bytes: Uint8Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = new Blob([bytes as BlobPart]);
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      // Size canvas to image, respecting screen width for mobile
      const maxWidth = Math.min(img.width, window.innerWidth - 32);
      const scale = maxWidth / img.width;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        setOriginalBytes(bytes);
        setInverted(false);
        drawImageOnCanvas(bytes);
      };
      reader.readAsArrayBuffer(file);
    },
    [drawImageOnCanvas],
  );

  const handleInvert = useCallback(() => {
    if (!originalBytes || !wasmReady) return;

    setProcessing(true);

    // Use requestAnimationFrame to let the UI update before blocking
    requestAnimationFrame(() => {
      try {
        const sourceBytes = inverted ? originalBytes : originalBytes;
        const result = invert_colors(sourceBytes);
        drawImageOnCanvas(result);
        setInverted((prev) => !prev);
      } catch (err) {
        console.error("WASM invert_colors failed:", err);
      } finally {
        setProcessing(false);
      }
    });
  }, [originalBytes, wasmReady, inverted, drawImageOnCanvas]);

  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">vizpix</h1>

      {!wasmReady ? (
        <p className="text-muted-foreground">Loading WASM engine...</p>
      ) : (
        <div className="flex w-full max-w-lg flex-col items-center gap-4">
          <label className="w-full">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button variant="outline" className="w-full" asChild>
              <span>Choose a photo</span>
            </Button>
          </label>

          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-border"
            style={{ display: originalBytes ? "block" : "none" }}
          />

          {originalBytes && (
            <Button
              onClick={handleInvert}
              disabled={processing}
              className="w-full"
            >
              {processing
                ? "Processing..."
                : inverted
                  ? "Restore Original"
                  : "Invert Colors (WASM)"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
