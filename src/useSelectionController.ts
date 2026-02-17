import { useEffect, useRef, useState } from "react";
import type { SelectionRect } from "./overlay";

interface UseSelectionControllerOptions {
  interactionElement: HTMLCanvasElement | null;
  selectionEnabled: boolean;
  onCurrentlySelectingChange: (value: boolean) => void;
  onSelectionComplete: (value: SelectionRect) => void;
}

interface SelectionControllerState {
  selectionRect: SelectionRect | null;
}

export function useSelectionController(
  options: UseSelectionControllerOptions,
): SelectionControllerState {
  const {
    interactionElement,
    selectionEnabled,
    onCurrentlySelectingChange,
    onSelectionComplete,
  } = options;

  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
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
      setSelectionRect({
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
      onCurrentlySelectingChange(false);
      setSelectionRect(null);
      pointerIdRef.current = null;

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      if (completedRect && completedRect.width >= 2 && completedRect.height >= 2) {
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
      onCurrentlySelectingChange(true);
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
    onCurrentlySelectingChange,
    onSelectionComplete,
    selectionEnabled,
  ]);

  return { selectionRect };
}
