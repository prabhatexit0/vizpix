import { useEffect, useRef } from "react";
import type { HistogramData } from "@/lib/histogram-utils";

const WIDTH = 256;
const HEIGHT = 80;

function drawChannel(
  ctx: CanvasRenderingContext2D,
  data: Uint32Array,
  color: string,
  maxVal: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  for (let i = 0; i < 256; i++) {
    const h = maxVal > 0 ? (data[i] / maxVal) * HEIGHT : 0;
    ctx.lineTo(i, HEIGHT - h);
  }
  ctx.lineTo(255, HEIGHT);
  ctx.closePath();
  ctx.fill();
}

export function HistogramDisplay({ data }: { data: HistogramData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Find global max for normalization
    let maxVal = 0;
    for (let i = 0; i < 256; i++) {
      maxVal = Math.max(maxVal, data.r[i], data.g[i], data.b[i]);
    }

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = "lighter";
    drawChannel(ctx, data.r, "rgba(255,0,0,0.5)", maxVal);
    drawChannel(ctx, data.g, "rgba(0,255,0,0.5)", maxVal);
    drawChannel(ctx, data.b, "rgba(0,0,255,0.5)", maxVal);
    ctx.globalCompositeOperation = "source-over";
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      className="w-full rounded bg-black/30"
    />
  );
}
