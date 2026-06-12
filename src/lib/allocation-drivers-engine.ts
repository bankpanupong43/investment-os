import { generateAllocationReview } from "./allocation-engine";
import type { AllocationDriver, BucketDriverSummary } from "./allocation-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { AllocationDriver, BucketDriverSummary };

export interface AllocationDriversResult {
  regime: string;
  scenario: string;
  regimeDrivers: AllocationDriver[];
  opportunityDrivers: AllocationDriver[];
  hedgeDrivers: AllocationDriver[];
  concentrationDrivers: AllocationDriver[];
  totalDrivers: BucketDriverSummary[];
  topDriver: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateAllocationDrivers(
  precomputedOpps?: { ticker: string; objectiveScore: number }[]
): Promise<AllocationDriversResult> {
  const review = await generateAllocationReview(precomputedOpps);
  const { regime, scenario, bucketDriverSummaries, topDriver } = review;

  const regimeDrivers:        AllocationDriver[] = [];
  const opportunityDrivers:   AllocationDriver[] = [];
  const hedgeDrivers:         AllocationDriver[] = [];
  const concentrationDrivers: AllocationDriver[] = [];

  for (const d of bucketDriverSummaries) {
    if (d.regimeAdjustment !== 0) {
      regimeDrivers.push({
        bucket: d.bucket, source: "REGIME",
        description: d.regimeDescription || `${scenario} regime`,
        adjustmentPct: d.regimeAdjustment,
        confidence: 85,
      });
    }
    if (d.opportunityAdjustment !== 0) {
      opportunityDrivers.push({
        bucket: d.bucket, source: "OPPORTUNITY",
        description: d.opportunityDescription || "Opportunity score",
        adjustmentPct: d.opportunityAdjustment,
        confidence: 75,
      });
    }
    if (d.hedgeAdjustment !== 0) {
      hedgeDrivers.push({
        bucket: d.bucket, source: "HEDGE",
        description: d.hedgeDescription || "Hedge audit",
        adjustmentPct: d.hedgeAdjustment,
        confidence: 80,
      });
    }
    if (d.concentrationAdjustment !== 0) {
      concentrationDrivers.push({
        bucket: d.bucket, source: "CONCENTRATION",
        description: d.concentrationDescription || "Concentration limit",
        adjustmentPct: d.concentrationAdjustment,
        confidence: 70,
      });
    }
  }

  return {
    regime, scenario,
    regimeDrivers, opportunityDrivers, hedgeDrivers, concentrationDrivers,
    totalDrivers: bucketDriverSummaries,
    topDriver,
  };
}
