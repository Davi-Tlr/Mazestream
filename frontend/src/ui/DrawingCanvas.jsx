import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Ellipse, Layer, Line, Rect, Stage } from "react-konva";

function useCanvasSize(ref) {
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) => {
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        return current.width === width && current.height === height ? current : { width, height };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function toPixels(points, width, height) {
  return (points || []).flatMap((point) => [point[0] * width, point[1] * height]);
}

const DrawingAction = memo(function DrawingAction({ action, width, height }) {
  const points = toPixels(action.points, width, height);
  if (points.length < 4) return null;

  const tool = action.tool || "pen";
  const stroke = action.color || "#111111";
  const baseWidth = Math.max(1, Number(action.width) || 4);
  const strokeWidth = tool === "marker" ? Math.max(10, baseWidth * 2.4) : baseWidth;
  const opacity = tool === "marker" ? (action.opacity ?? 0.32) : (action.opacity ?? 1);
  const composite = tool === "eraser" ? "destination-out" : "source-over";
  const common = {
    listening: false,
    stroke,
    strokeWidth,
    opacity,
    lineCap: "round",
    lineJoin: "round",
    perfectDrawEnabled: false,
    globalCompositeOperation: composite
  };

  if (tool === "line") {
    return <Line {...common} points={[points[0], points[1], points.at(-2), points.at(-1)]} />;
  }
  if (tool === "arrow") {
    return <Arrow {...common} points={[points[0], points[1], points.at(-2), points.at(-1)]}
      pointerLength={Math.max(9, strokeWidth * 2.5)} pointerWidth={Math.max(8, strokeWidth * 2.2)} fill={stroke} />;
  }
  if (tool === "rectangle") {
    const x1 = points[0], y1 = points[1], x2 = points.at(-2), y2 = points.at(-1);
    return <Rect {...common} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
      width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} />;
  }
  if (tool === "ellipse") {
    const x1 = points[0], y1 = points[1], x2 = points.at(-2), y2 = points.at(-1);
    return <Ellipse {...common} x={(x1 + x2) / 2} y={(y1 + y2) / 2}
      radiusX={Math.abs(x2 - x1) / 2} radiusY={Math.abs(y2 - y1) / 2} />;
  }

  // Eraser follows the selected brush size with only a small usability
  // cushion; the previous 2.2x multiplier made short strokes erase too much.
  return <Line {...common} points={points} tension={tool === "eraser" ? 0.18 : 0.35}
    stroke={tool === "eraser" ? "#000000" : stroke}
    strokeWidth={tool === "eraser" ? Math.max(6, baseWidth * 1.35) : strokeWidth} />;
});

function DrawingCanvas({ actions, liveAction, className = "" }) {
  const containerRef = useRef(null);
  const size = useCanvasSize(containerRef);
  const visibleActions = useMemo(() => {
    const list = Array.isArray(actions) ? actions : [];
    return liveAction ? list.concat({ ...liveAction, id: "__live__" }) : list;
  }, [actions, liveAction]);

  return (
    <div ref={containerRef} className={"drawing-canvas " + className} aria-hidden="true">
      <Stage width={size.width} height={size.height} listening={false}>
        <Layer listening={false} imageSmoothingEnabled>
          {visibleActions.map((action, index) => (
            <DrawingAction key={(action.id || "action") + ":" + index} action={action}
              width={size.width} height={size.height} />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export default memo(DrawingCanvas);
