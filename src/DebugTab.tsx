interface DebugTabProps {
  showInsideDebugPrisms: boolean;
  insideDebugPrismCount: number;
  onToggleInsideDebugPrisms: () => void;
}

export function DebugTab({
  showInsideDebugPrisms,
  insideDebugPrismCount,
  onToggleInsideDebugPrisms,
}: DebugTabProps) {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-debug">
      <div className="card">
        <h4>Debug</h4>
        <p>Contiguous Inside Sections</p>
        <button type="button" onClick={onToggleInsideDebugPrisms}>
          {showInsideDebugPrisms ? "Hide inside prisms" : "Draw inside prisms"}
        </button>
        <p className="overlay-status">Rendered section prisms: {insideDebugPrismCount}</p>
      </div>
    </div>
  );
}
