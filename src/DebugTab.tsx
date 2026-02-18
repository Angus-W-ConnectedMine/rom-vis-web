interface DebugTabProps {
  showInsideDebugPrisms: boolean;
  insideDebugPrismCount: number;
  edgeDebugSampleCount: number;
  onToggleInsideDebugPrisms: () => void;
}

export function DebugTab({
  showInsideDebugPrisms,
  insideDebugPrismCount,
  edgeDebugSampleCount,
  onToggleInsideDebugPrisms,
}: DebugTabProps) {
  return (
    <div className="overlay-tab-content" role="tabpanel" aria-labelledby="overlay-tab-debug">
      <div className="card">
        <h4>Debug</h4>
        <p>Inside Volume Preview</p>
        <button type="button" onClick={onToggleInsideDebugPrisms}>
          {showInsideDebugPrisms ? "Hide inside prisms" : "Draw inside prisms"}
        </button>
        <p className="overlay-status">Rendered prisms: {insideDebugPrismCount}</p>
        <p className="overlay-status">Edge samples: {edgeDebugSampleCount}</p>
      </div>
    </div>
  );
}
