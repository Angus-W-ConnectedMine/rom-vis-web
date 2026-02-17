import { useEffect, useRef } from "react";
import type { PendingRegionSelection } from "./overlay";

interface RegionFormModalProps {
  pendingSelection: PendingRegionSelection;
  onConfirmSelection: (regionId: string) => void;
  onCancelSelection: () => void;
}

export function RegionFormModal(props: RegionFormModalProps) {
  const { pendingSelection, onConfirmSelection, onCancelSelection } = props;
  const selectionIDInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectionIDInputRef.current) {
      selectionIDInputRef.current.value = pendingSelection.suggestedId;
      selectionIDInputRef.current.focus();
      selectionIDInputRef.current.select();
    }
  }, [pendingSelection]);

  const onFormConfirmed = (): void => {
    const selectionID = selectionIDInputRef.current?.value?.trim() ?? "";
    onConfirmSelection(
      selectionID.length > 0 ? selectionID : pendingSelection.suggestedId,
    );
  };

  return (
    <dialog
      className="modal"
      open
      onCancel={(event) => {
        event.preventDefault();
        onCancelSelection();
      }}
    >
      <div className="modal-scrim">
        <div className="modal-card">
          <div className="modal-title">Save Region</div>
          <div className="modal-stats">
            <div>Points: <strong>{pendingSelection.pointCount}</strong></div>
            <div>
              W min/max: <strong>{pendingSelection.minW.toFixed(3)}</strong> /{" "}
              <strong>{pendingSelection.maxW.toFixed(3)}</strong>
            </div>
            <div>W avg: <strong>{pendingSelection.avgW.toFixed(3)}</strong></div>
          </div>
          <label className="label">
            Region ID
          </label>
          <input
            className="input"
            ref={selectionIDInputRef}
            type="text"
            defaultValue={pendingSelection.suggestedId}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onFormConfirmed();
              }
            }}
          />
          <div className="actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={onFormConfirmed}
            >
              Ok
            </button>
            <button
              className="btn"
              type="button"
              onClick={onCancelSelection}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
