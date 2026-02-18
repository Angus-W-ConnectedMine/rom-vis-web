import { useEffect, useRef } from "react";
import type { RegionMeta } from "./overlay";

interface RegionFormModalProps {
  region: RegionMeta;
  onSaveEdit: (regionId: string) => void;
  onCancelEdit: () => void;
}

export function RegionFormModal(props: RegionFormModalProps) {
  const { region, onSaveEdit, onCancelEdit } = props;
  const selectionIDInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectionIDInputRef.current) {
      selectionIDInputRef.current.value = region.regionId;
      selectionIDInputRef.current.focus();
      selectionIDInputRef.current.select();
    }
  }, [region]);

  const onFormConfirmed = (): void => {
    const selectionID = selectionIDInputRef.current?.value?.trim() ?? "";
    onSaveEdit(selectionID.length > 0 ? selectionID : region.regionId);
  };

  return (
    <dialog
      className="modal"
      open
      onCancel={(event) => {
        event.preventDefault();
        onCancelEdit();
      }}
    >
      <div className="modal-scrim">
        <div className="modal-card">
          <div className="modal-title">Edit Region</div>
          <div className="modal-stats">
            <div>Points: <strong>{region.pointCount}</strong></div>
            <div>
              W min/max: <strong>{region.minW.toFixed(3)}</strong> /{" "}
              <strong>{region.maxW.toFixed(3)}</strong>
            </div>
            <div>W avg: <strong>{region.avgW.toFixed(3)}</strong></div>
          </div>
          <label className="label">
            Region ID
          </label>
          <input
            ref={selectionIDInputRef}
            type="text"
            defaultValue={region.regionId}
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
              Save
            </button>
            <button
              className="btn"
              type="button"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
