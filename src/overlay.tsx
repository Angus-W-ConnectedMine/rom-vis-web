import { useEffect, useRef, useState } from "react";
import type { Point } from "./points";
import { RegionFormModal } from "./regionFormModal";
import { type PlanGrandTotal, type PlanItem, type PlanOutcomeItem } from "./OperationPlan";
import type { GeneratedPlanCandidate } from "./generatePlan";
import { RegionTab } from "./RegionTab";
import { PlanTab } from "./PlanTab";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RegionMeta {
  key: string;
  regionId: string;
  pointCount: number;
  minW: number;
  maxW: number;
  avgW: number;
  min: Point;
  max: Point;
}

interface OverlayProps {
  selectionRect: SelectionRect | null;
  editingRegion: RegionMeta | null;
  onSaveRegionEdit: (key: string, regionId: string) => void;
  onCancelRegionEdit: () => void;
  onRequestRegionEdit: (key: string) => void;
  status: string;
  regions: RegionMeta[];
  selectedRegionKeys: string[];
  onSelectRegion: (key: string) => void;
  onDeleteRegion: (key: string) => void;
  onClearSelections: () => void;
  plan: PlanItem[];
  outcomeByItemId: Record<string, PlanOutcomeItem>;
  grandTotal: PlanGrandTotal;
  onAddRegionToPlan: (region: RegionMeta) => void;
  onUpdatePlanAngle: (planItemId: string, angle: number) => void;
  onUpdatePlanQuantity: (planItemId: string, quantity: number) => void;
  onDeletePlanItem: (planItemId: string) => void;
  generationTargetPointCount: number;
  generationTargetAverageW: number;
  generationRunning: boolean;
  generationBestCandidate: GeneratedPlanCandidate | null;
  generationBestGeneration: number;
  onUpdateGenerationTargetPointCount: (value: number) => void;
  onUpdateGenerationTargetAverageW: (value: number) => void;
  onStartGeneration: () => void;
  onStopGeneration: () => void;
}

function getSummary(regions: RegionMeta[], selectedRegionKeys: string[]) {
  const selectedRegions = regions.filter((region) => selectedRegionKeys.includes(region.key));
  const totalPoints = selectedRegions.reduce((sum, region) => sum + region.pointCount, 0);
  const averageW =
    totalPoints > 0
      ? selectedRegions.reduce((sum, region) => sum + region.avgW * region.pointCount, 0) / totalPoints
      : 0;

  return { totalPoints, averageW };
}

export function Overlay(props: OverlayProps) {
  const {
    selectionRect,
    editingRegion,
    onSaveRegionEdit,
    onCancelRegionEdit,
    onRequestRegionEdit,
    status,
    regions,
    selectedRegionKeys,
    onSelectRegion,
    onDeleteRegion,
    onClearSelections,
    plan,
    outcomeByItemId,
    grandTotal,
    onAddRegionToPlan,
    onUpdatePlanAngle,
    onUpdatePlanQuantity,
    onDeletePlanItem,
    generationTargetPointCount,
    generationTargetAverageW,
    generationRunning,
    generationBestCandidate,
    generationBestGeneration,
    onUpdateGenerationTargetPointCount,
    onUpdateGenerationTargetAverageW,
    onStartGeneration,
    onStopGeneration,
  } = props;
  const regionItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousSelectedRegionKeysRef = useRef<string[]>([]);
  const [activeTab, setActiveTab] = useState<"regions" | "plan">("regions");

  useEffect(() => {
    const previousSelectedRegionKeys = previousSelectedRegionKeysRef.current;
    const newlySelectedKey = selectedRegionKeys.find(
      (key) => !previousSelectedRegionKeys.includes(key),
    );

    if (newlySelectedKey !== undefined) {
      const regionItem = regionItemRefs.current.get(newlySelectedKey);
      regionItem?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    previousSelectedRegionKeysRef.current = selectedRegionKeys;
  }, [selectedRegionKeys]);

  const selectedRegions = regions.filter((region) => selectedRegionKeys.includes(region.key));

  const summary = getSummary(regions, selectedRegionKeys);

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
        <div className="overlay-title">Overlay</div>
        <div className="overlay-tabs" role="tablist" aria-label="Overlay sections">
          <button
            id="overlay-tab-regions"
            type="button"
            role="tab"
            aria-selected={activeTab === "regions"}
            className={`overlay-tab-btn${activeTab === "regions" ? " is-active" : ""}`}
            onClick={() => setActiveTab("regions")}
          >
            Regions
          </button>
          <button
            id="overlay-tab-plan"
            type="button"
            role="tab"
            aria-selected={activeTab === "plan"}
            className={`overlay-tab-btn${activeTab === "plan" ? " is-active" : ""}`}
            onClick={() => setActiveTab("plan")}
          >
            Plan
          </button>
        </div>

        {activeTab === "regions" ? (
          <RegionTab
            status={status}
            regions={regions}
            selectedRegionKeys={selectedRegionKeys}
            summary={summary}
            regionItemRefs={regionItemRefs}
            onSelectRegion={onSelectRegion}
            onRequestRegionEdit={onRequestRegionEdit}
            onDeleteRegion={onDeleteRegion}
            onClearSelections={onClearSelections}
          />
        ) : (
          <PlanTab
            regions={regions}
            plan={plan}
            outcomeByItemId={outcomeByItemId}
            grandTotal={grandTotal}
            onAddRegionToPlan={onAddRegionToPlan}
            onUpdatePlanAngle={onUpdatePlanAngle}
            onUpdatePlanQuantity={onUpdatePlanQuantity}
            onDeletePlanItem={onDeletePlanItem}
            generationTargetPointCount={generationTargetPointCount}
            generationTargetAverageW={generationTargetAverageW}
            generationRunning={generationRunning}
            generationBestCandidate={generationBestCandidate}
            generationBestGeneration={generationBestGeneration}
            onUpdateGenerationTargetPointCount={onUpdateGenerationTargetPointCount}
            onUpdateGenerationTargetAverageW={onUpdateGenerationTargetAverageW}
            onStartGeneration={onStartGeneration}
            onStopGeneration={onStopGeneration}
          />
        )}
      </aside>

      {editingRegion ? (
        <RegionFormModal
          region={editingRegion}
          onSaveEdit={(regionId) => onSaveRegionEdit(editingRegion.key, regionId)}
          onCancelEdit={onCancelRegionEdit}
        />
      ) : null}
    </>
  );
}
