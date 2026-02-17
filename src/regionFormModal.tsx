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
    <dialog
      className="region-dialog"
      open
      onCancel={(event) => {
        event.preventDefault();
        onCancelSelection();
      }}
    >
      <div className="region-dialog-scrim">
        <div className="region-dialog-card">
        <div className="region-dialog-title">Save Region</div>
        <div className="region-dialog-stats">
          <div>Points: <strong>{pendingSelection.pointCount}</strong></div>
          <div>
            W min/max: <strong>{pendingSelection.minW.toFixed(3)}</strong> /{" "}
            <strong>{pendingSelection.maxW.toFixed(3)}</strong>
          </div>
          <div>W avg: <strong>{pendingSelection.avgW.toFixed(3)}</strong></div>
        </div>
        <label className="region-dialog-label">
          Region ID
        </label>
        <input
          className="region-dialog-input"
          ref={inputRef}
          type="text"
          defaultValue={pendingSelection.suggestedId}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitPendingSelection();
            }
          }}
        />
        <div className="region-dialog-actions">
          <button
            className="region-dialog-btn"
            type="button"
            onClick={onCancelSelection}
          >
            Cancel
          </button>
          <button
            className="region-dialog-btn-primary"
            type="button"
            onClick={submitPendingSelection}
          >
            Save Region
          </button>
        </div>
        </div>
      </div>
    </dialog>
  );
}
