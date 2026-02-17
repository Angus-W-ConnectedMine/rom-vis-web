import { useEffect, useRef } from "react";
import type { Point } from "./points";
import { RegionFormModal } from "./regionFormModal";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionMeta {
  key: number;
  regionId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
  min: Point;
  max: Point;
}

export interface PendingRegionSelection {
  suggestedId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
}

interface OverlayProps {
  interactionElement: HTMLCanvasElement | null;
  selectionRect: SelectionRect | null;
  selectionEnabled: boolean;
  onSelectionRectChange: (value: SelectionRect | null) => void;
  onSelectionActiveChange: (value: boolean) => void;
  onSelectionComplete: (value: SelectionRect) => void;
  pendingSelection: PendingRegionSelection | null;
  onConfirmSelection: (regionId: string) => void;
  onCancelSelection: () => void;
  status: string;
  regions: RegionMeta[];
  latestRegion: RegionMeta | null;
}

export function Overlay(props: OverlayProps) {
  const {
    interactionElement,
    selectionRect,
    selectionEnabled,
    onSelectionRectChange,
    onSelectionActiveChange,
    onSelectionComplete,
    pendingSelection,
    onConfirmSelection,
    onCancelSelection,
    status,
    regions,
    latestRegion,
  } = props;
  const pointerIdRef = useRef<number | null>(null);
  const selectionRectRef = useRef<SelectionRect | null>(null);

  useEffect(() => {
    selectionRectRef.current = selectionRect;
  }, [selectionRect]);

  useEffect(() => {
    const element = interactionElement;
    if (!element) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    const setRect = (): void => {
      const minX = Math.min(startX, currentX);
      const minY = Math.min(startY, currentY);
      const maxX = Math.max(startX, currentX);
      const maxY = Math.max(startY, currentY);
      onSelectionRectChange({
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    };

    const getCanvasPosition = (event: PointerEvent): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const finishSelection = (event: PointerEvent): void => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) {
        return;
      }

      const completedRect = selectionRectRef.current;
      onSelectionActiveChange(false);
      onSelectionRectChange(null);
      pointerIdRef.current = null;

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      if (
        completedRect &&
        completedRect.width >= 2 &&
        completedRect.height >= 2
      ) {
        onSelectionComplete(completedRect);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!selectionEnabled) {
        return;
      }

      if (!event.shiftKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const position = getCanvasPosition(event);

      startX = position.x;
      startY = position.y;
      currentX = position.x;
      currentY = position.y;
      onSelectionActiveChange(true);
      pointerIdRef.current = event.pointerId;
      setRect();
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (pointerIdRef.current === null || event.pointerId !== pointerIdRef.current) {
        return;
      }

      const position = getCanvasPosition(event);
      currentX = position.x;
      currentY = position.y;
      setRect();
    };

    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", finishSelection);
    element.addEventListener("pointercancel", finishSelection);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown, { capture: true });
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", finishSelection);
      element.removeEventListener("pointercancel", finishSelection);
    };
  }, [
    interactionElement,
    onSelectionActiveChange,
    onSelectionComplete,
    onSelectionRectChange,
    selectionEnabled,
  ]);

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
                key: latestRegion.key,
                regionId: latestRegion.regionId,
                pointCount: latestRegion.pointCount,
                minW: latestRegion.minW,
                maxW: latestRegion.maxW,
                avgW: latestRegion.avgW,
                min: latestRegion.min,
                max: latestRegion.max,
              },
              null,
              2,
            )
            : "No selections yet"}
        </pre>
      </aside>
      {pendingSelection ? (
        <RegionFormModal
          pendingSelection={pendingSelection}
          onConfirmSelection={onConfirmSelection}
          onCancelSelection={onCancelSelection}
        />
      ) : null}
    </>
  );
}
