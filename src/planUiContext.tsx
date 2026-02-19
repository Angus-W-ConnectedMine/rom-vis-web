import { createContext, useContext, type ReactNode } from "react";
import type { PlanGrandTotal, PlanItem, PlanOutcomeItem } from "./OperationPlan";
import type { GeneratedPlanCandidate } from "./generatePlan";
import type { RegionMeta } from "./overlay";

export interface PlanUiContextValue {
  regions: RegionMeta[];
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

const PlanUiContext = createContext<PlanUiContextValue | null>(null);

interface PlanUiProviderProps {
  value: PlanUiContextValue;
  children: ReactNode;
}

export function PlanUiProvider({ value, children }: PlanUiProviderProps) {
  return <PlanUiContext.Provider value={value}>{children}</PlanUiContext.Provider>;
}

export function usePlanUiContext(): PlanUiContextValue {
  const context = useContext(PlanUiContext);
  if (!context) {
    throw new Error("usePlanUiContext must be used within a PlanUiProvider");
  }

  return context;
}
