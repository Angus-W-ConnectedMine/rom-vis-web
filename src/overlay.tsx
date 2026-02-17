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
  selectedRegionKey: number | null;
  onSelectRegion: (key: number) => void;
  onDeleteRegion: (key: number) => void;
  onClearRegions: () => void;
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
    selectedRegionKey,
    onSelectRegion,
    onDeleteRegion,
    onClearRegions,
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
          className="selection-rect"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      ) : null}
      <aside className="overlay-panel">
        <div className="overlay-title">Regions</div>
        <div className="overlay-status">{status}</div>
        <div className="overlay-count">
          Regions selected: <strong>{regions.length}</strong>
        </div>

        <div className="overlay-toolbar">
          <button
            className="btn"
            type="button"
            onClick={onClearRegions}
            disabled={regions.length === 0}
          >
            Clear All
          </button>
        </div>

        <div className="overlay-subtitle">Saved regions</div>
        {regions.length === 0 ? (
          <div className="overlay-empty">No saved regions yet.</div>
        ) : (
          <div className="overlay-region-list">
            {regions.map((region) => (
              <div
                key={region.key}
                className={`overlay-region-item${selectedRegionKey === region.key ? " is-selected" : ""}`}
                onClick={() => onSelectRegion(region.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRegion(region.key);
                  }
                }}
              >
                <div className="overlay-region-row">
                  <strong>{region.regionId}</strong>
                  <button
                    className="btn overlay-btn-delete"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteRegion(region.key);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="overlay-region-meta">
                  points: {region.pointCount} | W min/max/avg: {region.minW.toFixed(3)} / {region.maxW.toFixed(3)} / {region.avgW.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="overlay-subtitle">Latest region</div>
        <pre className="overlay-json">
          {latestRegion
            ? JSON.stringify(
                {
                  regionId: latestRegion.regionId,
                  pointCount: latestRegion.pointCount,
                  minW: latestRegion.minW,
                  maxW: latestRegion.maxW,
                  avgW: latestRegion.avgW,
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
