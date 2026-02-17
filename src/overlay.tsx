import type { Point } from "./points";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionMeta {
  id: number;
  pointCount: number;
  min: Point;
  max: Point;
}

interface OverlayProps {
  selectionRect: SelectionRect | null;
  status: string;
  regions: RegionMeta[];
  latestRegion: RegionMeta | null;
}

export function Overlay(props: OverlayProps) {
  const { selectionRect, status, regions, latestRegion } = props;

  return (
    <>
      {selectionRect ? (
        <div
          style={{
            position: "absolute",
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            pointerEvents: "none",
            border: "1px solid #22d3ee",
            background: "rgba(34, 211, 238, 0.2)",
          }}
        />
      ) : null}
      <aside
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          width: 320,
          padding: 12,
          borderRadius: 8,
          background: "rgba(15, 23, 42, 0.82)",
          border: "1px solid rgba(148, 163, 184, 0.3)",
          color: "#e2e8f0",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Overlay Placeholder</div>
        <div style={{ opacity: 0.9, marginBottom: 10 }}>{status}</div>
        <div style={{ marginBottom: 8 }}>
          Regions selected: <strong>{regions.length}</strong>
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Latest region (placeholder)</div>
        <pre
          style={{
            margin: 0,
            padding: 8,
            borderRadius: 6,
            background: "rgba(2, 6, 23, 0.7)",
            overflowX: "auto",
          }}
        >
          {latestRegion
            ? JSON.stringify(
                {
                  id: latestRegion.id,
                  pointCount: latestRegion.pointCount,
                  min: latestRegion.min,
                  max: latestRegion.max,
                },
                null,
                2,
              )
            : "No selections yet"}
        </pre>
      </aside>
    </>
  );
}
