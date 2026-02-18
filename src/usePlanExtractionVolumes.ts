import { useEffect } from "react";
import * as THREE from "three";
import { restorePrism, type PrismSnapshot } from "./geometry";
import type { PlanItem } from "./OperationPlan";
import type { Point } from "./points";
import { createExtractionSnapshot } from "./planStats";

const PLAN_EXTRACTION_COLOR = 0xff4d00;
const PLAN_EXTRACTION_INVALID_COLOR = 0xec4899;
const PLAN_EXTRACTION_OPACITY = 0.3;

interface RegionPrismForExtraction {
  key: string;
  snapshot: PrismSnapshot;
}

interface UsePlanExtractionVolumesArgs {
  sceneRef: React.RefObject<THREE.Scene | null>;
  regionPrismsRef: React.RefObject<RegionPrismForExtraction[]>;
  planExtractionVolumesRef: React.RefObject<Map<string, THREE.Group>>;
  plan: PlanItem[];
  extractedPointsByItemId: Record<string, Point[]>;
  invalidPlanItemIds: Set<string>;
}

export function usePlanExtractionVolumes({
  sceneRef,
  regionPrismsRef,
  planExtractionVolumesRef,
  plan,
  extractedPointsByItemId,
  invalidPlanItemIds,
}: UsePlanExtractionVolumesArgs): void {
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const prismByKey = new Map(regionPrismsRef.current.map((regionPrism) => [regionPrism.key, regionPrism]));

    for (const volume of planExtractionVolumesRef.current.values()) {
      scene.remove(volume);
    }
    planExtractionVolumesRef.current.clear();

    for (const item of plan) {
      const extractedPoints = extractedPointsByItemId[item.id] ?? [];
      if (extractedPoints.length === 0) {
        continue;
      }

      const regionPrism = prismByKey.get(item.regionKey);
      if (!regionPrism) {
        continue;
      }

      const extractionSnapshot = createExtractionSnapshot(
        regionPrism.snapshot,
        item.angle,
        extractedPoints,
      );
      if (!extractionSnapshot) {
        continue;
      }

      const extractionVolume = restorePrism(scene, extractionSnapshot);
      if (!extractionVolume) {
        continue;
      }

      const isInvalid = invalidPlanItemIds.has(item.id);
      const extractionColor = isInvalid ? PLAN_EXTRACTION_INVALID_COLOR : PLAN_EXTRACTION_COLOR;

      extractionVolume.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
          node.material.color.setHex(extractionColor);
          node.material.opacity = PLAN_EXTRACTION_OPACITY;
          node.material.needsUpdate = true;
        }
        if (node instanceof THREE.LineSegments && node.material instanceof THREE.LineBasicMaterial) {
          node.material.color.setHex(extractionColor);
          node.material.opacity = 0.9;
          node.material.needsUpdate = true;
        }
      });

      planExtractionVolumesRef.current.set(item.id, extractionVolume);
    }
  }, [sceneRef, regionPrismsRef, planExtractionVolumesRef, plan, extractedPointsByItemId, invalidPlanItemIds]);
}
