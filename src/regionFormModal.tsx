import { useEffect, useRef } from "react";
import type { PendingRegionSelection } from "./overlay";

interface RegionFormModalProps {
  pendingSelection: PendingRegionSelection;
  onConfirmSelection: (regionId: string) => void;
  onCancelSelection: () => void;
}

export function RegionFormModal(props: RegionFormModalProps) {
  const { pendingSelection, onConfirmSelection, onCancelSelection } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = pendingSelection.suggestedId;
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [pendingSelection]);

  const submitPendingSelection = (): void => {
    const value = inputRef.current?.value?.trim() ?? "";
    onConfirmSelection(
      value.length > 0 ? value : pendingSelection.suggestedId,
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(2, 6, 23, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: "min(480px, 100%)",
          borderRadius: 10,
          border: "1px solid rgba(148, 163, 184, 0.4)",
          background: "rgba(15, 23, 42, 0.96)",
          color: "#e2e8f0",
          padding: 14,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Save Region</div>
        <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 10 }}>
          <div>Points: <strong>{pendingSelection.pointCount}</strong></div>
          <div>
            W min/max: <strong>{pendingSelection.minW.toFixed(3)}</strong> /{" "}
            <strong>{pendingSelection.maxW.toFixed(3)}</strong>
          </div>
          <div>W avg: <strong>{pendingSelection.avgW.toFixed(3)}</strong></div>
        </div>
        <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
          Region ID
        </label>
        <input
          ref={inputRef}
          type="text"
          defaultValue={pendingSelection.suggestedId}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitPendingSelection();
            }
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            borderRadius: 6,
            border: "1px solid rgba(148, 163, 184, 0.45)",
            background: "rgba(2, 6, 23, 0.9)",
            color: "#e2e8f0",
            padding: "8px 10px",
            marginBottom: 12,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onCancelSelection}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.45)",
              borderRadius: 6,
              background: "transparent",
              color: "#cbd5e1",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitPendingSelection}
            style={{
              border: "1px solid rgba(34, 197, 94, 0.5)",
              borderRadius: 6,
              background: "rgba(22, 163, 74, 0.25)",
              color: "#dcfce7",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Save Region
          </button>
        </div>
      </div>
    </div>
  );
}
