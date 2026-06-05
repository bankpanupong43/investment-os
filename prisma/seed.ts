import { PrismaClient } from "@prisma/client";
import type {
  ThesisKeyAssumption,
  ExpectedOutcome,
  ThesisRisk,
} from "../src/types/index";

const db = new PrismaClient();

const j = (v: unknown) => JSON.stringify(v);

// ─── NVDA Thesis Components ───────────────────────────────────────────────────

const nvdaAssumptions: ThesisKeyAssumption[] = [
  {
    id: "cuda-ecosystem-moat",
    text: "CUDA's 15-year head start in GPU computing creates a software ecosystem moat (cuDNN, NCCL, TensorRT) that cannot be replicated in <5 years — every ML engineer has been trained on it.",
    category: "competitive_moat",
    importance: "critical",
    measurable: false,
  },
  {
    id: "datacenter-permanent-capex",
    text: "AI infrastructure shifts from discretionary R&D to mandatory operating expense — every large company must spend on GPUs to remain competitive. This is not a cyclical upcycle.",
    category: "market_dynamics",
    importance: "critical",
    measurable: true,
    metric: "hyperscaler_ai_capex_usd_billions",
  },
  {
    id: "hyperscaler-demand-sustained",
    text: "Hyperscalers (AWS, Google, Meta, Microsoft) sustain elevated GPU procurement for the 3-7 year thesis horizon — not a 1-2 year demand spike.",
    category: "market_dynamics",
    importance: "critical",
    measurable: true,
    metric: "datacenter_revenue_yoy_growth_pct",
  },
  {
    id: "amd-cannot-dislodge",
    text: "AMD's MI300 series and future GPUs cannot achieve >25% share of hyperscaler training workloads due to CUDA ecosystem lock-in.",
    category: "competitive_moat",
    importance: "important",
    measurable: true,
    metric: "amd_hyperscaler_market_share_pct",
  },
  {
    id: "margins-sustainable",
    text: "NVIDIA maintains >70% gross margins on datacenter GPUs as demand consistently exceeds supply and there is no commoditization of H100/H200/Blackwell class hardware.",
    category: "financials",
    importance: "important",
    measurable: true,
    metric: "datacenter_gross_margin_pct",
  },
];

const nvdaOutcomes: ExpectedOutcome[] = [
  {
    id: "datacenter-revenue-dominance",
    description: "Datacenter segment becomes >80% of total NVIDIA revenue and sustains >40% annual growth for at least 3 years.",
    timeframe: "3 years",
    targetDate: "2026-01-31",
    measurable: true,
    metric: "datacenter_revenue_share_pct",
    target: ">80% share, >40% YoY growth for 3 consecutive years",
    importance: "primary",
  },
  {
    id: "blackwell-cycle",
    description: "Blackwell GPU architecture sustains the datacenter upgrade cycle through 2025-2026, extending the demand supercycle.",
    timeframe: "2-3 years",
    targetDate: "2026-06-30",
    measurable: true,
    metric: "blackwell_quarterly_revenue_usd_billions",
    target: ">$30B quarterly datacenter revenue at Blackwell peak",
    importance: "primary",
  },
  {
    id: "software-layer-growth",
    description: "NVIDIA software and services (NIMS, DGX Cloud, CUDA licensing) become a meaningful revenue line >$5B/year, reducing hardware cyclicality.",
    timeframe: "4-5 years",
    measurable: true,
    target: ">$5B annual software/services revenue",
    importance: "secondary",
  },
];

const nvdaRisks: ThesisRisk[] = [
  {
    id: "hyperscaler-capex-reduction",
    description: "Hyperscalers sharply reduce AI GPU procurement due to ROI questions, economic slowdown, or custom silicon maturation.",
    category: "market_dynamics",
    severity: "critical",
    probability: "medium",
    mitigation: "AI ROI is increasingly demonstrable (ad targeting, code generation). Even if growth slows, absolute levels are high. Kill condition: datacenter growth <30% for 2 quarters.",
    monitoredBy: "hyperscaler earnings calls, capex guidance",
  },
  {
    id: "amd-breakthrough",
    description: "AMD achieves CUDA compatibility breakthrough or ROCm ecosystem matures sufficiently to make MI-series a credible alternative for >25% of hyperscaler training.",
    category: "competitive",
    severity: "high",
    probability: "low",
    mitigation: "ROCm has been 'almost ready' for 5 years. CUDA ecosystem depth increases with every model trained on it. 15-year moat doesn't disappear in 2-3 years.",
    monitoredBy: "AMD hyperscaler win announcements, ROCm benchmark results vs CUDA",
  },
  {
    id: "custom-silicon-acceleration",
    description: "Hyperscaler custom TPU/ASIC development (Google TPU v5, Amazon Trainium, Meta MTIA) captures >30% of their own training workloads, reducing NVIDIA GPU purchases.",
    category: "technological",
    severity: "high",
    probability: "medium",
    mitigation: "Custom silicon is optimized for specific workloads and cannot match NVIDIA for general training. Used primarily for inference of deployed models, not frontier model training.",
    monitoredBy: "Announcements of hyperscaler custom chip deployments, % of workloads disclosed",
  },
  {
    id: "export-controls",
    description: "US export controls on advanced GPUs expand further, reducing accessible market for NVIDIA's highest-margin products.",
    category: "regulatory",
    severity: "medium",
    probability: "high",
    mitigation: "NVIDIA has created compliant versions (H20 for China). US hyperscalers are the primary demand driver and are unaffected by export controls.",
    monitoredBy: "BIS export control rule changes, NVIDIA China revenue as % of total",
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────
// Real portfolio data — sourced from Dime app + หุ้น.xlsx (audited)
// Snapshot date: 2026-06-05  |  Exchange rate: 32.65 THB/USD
// shares / avgCost / entryDate intentionally null — per-share data not in source

async function main() {
  console.log("Seeding database with real portfolio data...");
  console.log("Source:        Dime app + หุ้น.xlsx (audited)");
  console.log("Snapshot date: 2026-06-05");
  console.log("Exchange rate: 32.65 THB/USD");
  console.log("");

  const SNAPSHOT_DATE = new Date("2026-06-05");
  const DATA_SOURCE   = "Dime app + หุ้น.xlsx";

  // ── GLDM ───────────────────────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "GLDM",
      name: "SPDR Gold MiniShares Trust",
      sector: "Commodities",
      industry: "Gold ETF",
      assetClass: "equity",
      status: "active",
      notes: "Gold inflation hedge — portfolio ballast",
      currentValueUsd:     3784.43,
      currentValueThb:    123561.58,
      allocationPct:         8.56,
      unrealizedReturnPct:  -4.25,
      costBasisUsd:       3951.96,   // 3784.43 / 0.9575
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── ITA ────────────────────────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "ITA",
      name: "iShares U.S. Aerospace & Defense ETF",
      sector: "Industrials",
      industry: "Aerospace & Defense ETF",
      assetClass: "equity",
      status: "active",
      notes: "Defense sector ETF — geopolitical tailwind play",
      currentValueUsd:     4115.46,
      currentValueThb:   134369.70,
      allocationPct:         9.31,
      unrealizedReturnPct:   9.43,
      costBasisUsd:       3760.93,   // 4115.46 / 1.0943
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── AAPL ───────────────────────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "AAPL",
      name: "Apple Inc.",
      sector: "Technology",
      industry: "Consumer Electronics",
      assetClass: "equity",
      status: "active",
      notes: "Consumer tech hardware + services ecosystem",
      currentValueUsd:     2597.26,
      currentValueThb:    84800.64,
      allocationPct:         5.88,
      unrealizedReturnPct:  30.52,
      costBasisUsd:       1990.14,   // 2597.26 / 1.3052
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── AMZN ───────────────────────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "AMZN",
      name: "Amazon.com, Inc.",
      sector: "Consumer Discretionary",
      industry: "E-Commerce & Cloud Computing",
      assetClass: "equity",
      status: "active",
      notes: "AWS hyperscaler + Amazon Ads two-engine compounder",
      currentValueUsd:     2372.27,
      currentValueThb:    77454.61,
      allocationPct:         5.37,
      unrealizedReturnPct:  22.32,
      costBasisUsd:       1939.62,   // 2372.27 / 1.2232
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── NVDA (with full thesis) ────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Technology",
      industry: "Semiconductors — AI Infrastructure",
      assetClass: "equity",
      status: "active",
      notes: "AI infrastructure picks-and-shovels — CUDA moat is the thesis",
      currentValueUsd:     2418.93,
      currentValueThb:    78977.92,
      allocationPct:         5.47,
      unrealizedReturnPct:  49.82,
      costBasisUsd:       1614.58,   // 2418.93 / 1.4982
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
      thesis: {
        create: {
          originalThesis:
            "NVIDIA is the indispensable infrastructure layer for the AI buildout cycle. The CUDA ecosystem is a 15-year moat — not just hardware, but an entire software ecosystem (cuDNN, cuBLAS, TensorRT, NCCL) that every AI researcher and engineer has trained on. The H100 datacenter GPU cycle is the largest product cycle in semiconductors since the smartphone era. This is not a cyclical chip upcycle — this is a new permanent capex line item. AI infrastructure is now mandatory operating expense.",
          currentAssessment:
            "Thesis intact and accelerating. H100/H200 demand still exceeding supply. Blackwell ramp extending the datacenter cycle. +49.82% unrealized gain as of 2026-06-05.",
          keyAssumptions: j(nvdaAssumptions),
          expectedOutcomes: j(nvdaOutcomes),
          risks: j(nvdaRisks),
          holdingPeriod: "3-7 years",
          holdingPeriodMonths: 60,
          entryConfidence: 9,
          healthStatus: "intact",
          healthScore: 9,
          lastReviewedAt: new Date("2024-11-20"),
        },
      },
      killConditions: {
        create: [
          {
            conditionType: "quantitative",
            description: "Datacenter revenue growth drops below 30% for two consecutive quarters",
            metric: "datacenter_revenue_growth_yoy",
            operator: "lt",
            threshold: 30.0,
            status: "active",
          },
          {
            conditionType: "quantitative",
            description: "AMD captures >25% of hyperscaler training GPU procurement",
            metric: "amd_hyperscaler_share",
            operator: "gt",
            threshold: 25.0,
            status: "active",
          },
          {
            conditionType: "quantitative",
            description: "Datacenter gross margin falls below 65% for two consecutive quarters",
            metric: "datacenter_gross_margin",
            operator: "lt",
            threshold: 65.0,
            status: "active",
          },
        ],
      },
      journalEntries: {
        create: [
          {
            entryType: "buy_rationale",
            content:
              "Opened position. Consensus treats this as cyclical gaming GPU upcycle. I believe it's structural datacenter transformation — every company is now a mandatory GPU buyer. CUDA moat is the core thesis.",
          },
        ],
      },
    },
  });

  // ── GOOG ───────────────────────────────────────────────────────────────────
  await db.position.create({
    data: {
      ticker: "GOOG",
      name: "Alphabet Inc. (Class A)",
      sector: "Technology",
      industry: "Internet Services & Search",
      assetClass: "equity",
      status: "active",
      notes: "Search + YouTube + GCP AI compounder",
      currentValueUsd:     2332.58,
      currentValueThb:    76158.80,
      allocationPct:         5.28,
      unrealizedReturnPct:  68.68,
      costBasisUsd:       1382.97,   // 2332.58 / 1.6868
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── CASH (Dime! USD + Dime! Save + FCD-USD consolidated) ──────────────────
  // Dime! USD:  $13,993.31  (฿456,881.57)
  // Dime! Save: $10,382.98  (฿339,001.37 ÷ 32.65)
  // FCD-USD:    $ 2,201.55  (฿ 71,880.61)
  // ─────────────────────────────────────────────────────
  // Total:      $26,577.84  (฿867,763.55)
  await db.position.create({
    data: {
      ticker: "CASH",
      name: "Cash & Savings",
      sector: "Cash",
      assetClass: "cash",
      status: "active",
      notes:
        "Consolidated: Dime! USD ($13,993.31) + Dime! Save (฿339,001.37 = $10,382.98 @ 32.65) + FCD-USD ($2,201.55)",
      currentValueUsd:    26577.84,
      currentValueThb:   867763.55,
      allocationPct:        60.13,
      unrealizedReturnPct:   0,
      costBasisUsd:       26577.84,  // cash: cost = current value
      dataSource:  DATA_SOURCE,
      confidence:  "high",
      snapshotDate: SNAPSHOT_DATE,
    },
  });

  // ── Watchlist ──────────────────────────────────────────────────────────────
  await db.watchlist.createMany({
    data: [
      {
        ticker: "MSFT",
        name: "Microsoft Corporation",
        interestReason:
          "Growth bucket flagship — Azure AI infrastructure + M365 Copilot distribution + OpenAI partnership. Primary target for growth allocation.",
        draftThesis:
          "Azure's 20-year enterprise trust relationships create a switching-cost moat. The $13B OpenAI investment gives exclusive enterprise AI access. Office 365's 300M+ commercial seats monetise AI at scale through Copilot at $30/seat/month.",
        targetEntryPrice: null,
      },
      {
        ticker: "META",
        name: "Meta Platforms, Inc.",
        interestReason:
          "Defensive bucket candidate — 3.5B+ DAP distribution moat; monitoring ATT recovery and Reels monetisation for entry.",
        draftThesis:
          "3.5B+ daily active people across Facebook, Instagram, WhatsApp is the largest distribution network in history. Advantage+ AI ad system recovering from ATT headwind. WhatsApp Business is an untapped monetisation vector. Year of Efficiency signals durable capital discipline.",
        targetEntryPrice: null,
      },
      {
        ticker: "IJH",
        name: "iShares Core S&P Mid-Cap ETF",
        interestReason:
          "Mid-cap index exposure — diversification into undervalued U.S. mid-cap companies historically outperforming large-caps.",
        draftThesis:
          "Mid-cap companies historically outperform large-caps over long cycles with better growth rates and reasonable valuations. IJH provides low-cost diversified exposure to S&P 400 mid-cap index.",
        targetEntryPrice: null,
      },
      {
        ticker: "VTWO",
        name: "Vanguard Russell 2000 ETF",
        interestReason:
          "Small-cap index exposure — rate-sensitive; attractive when Fed pivots to a cutting cycle.",
        draftThesis:
          "Small-cap historically outperforms in rate-cutting environments and early economic expansions. VTWO provides low-cost Russell 2000 index exposure at 0.10% expense ratio.",
        targetEntryPrice: null,
      },
    ],
  });

  // ── Validation Report ──────────────────────────────────────────────────────

  const positions = await db.position.findMany({
    where: { status: "active" },
    include: { thesis: true },
    orderBy: { allocationPct: "desc" },
  });
  const watchlist = await db.watchlist.findMany({ orderBy: { addedAt: "asc" } });
  const thesisCount = await db.thesis.count();

  let totalCost  = 0;
  let totalValue = 0;

  console.log("══════════════════════════════════════════════════════════");
  console.log("  IMPORT VALIDATION REPORT");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Active positions : ${positions.length}`);
  console.log(`  Watchlist items  : ${watchlist.length}`);
  console.log(`  Theses seeded    : ${thesisCount}`);
  console.log("");
  console.log("  POSITIONS (sorted by allocation %):");
  console.log("  ──────────────────────────────────────────────────────");
  console.log("  Ticker   Cost ($)   Value ($)   P&L ($)   Alloc   Thesis");

  for (const p of positions) {
    const cost  = p.costBasisUsd        ?? 0;
    const value = p.currentValueUsd     ?? 0;
    const gain  = value - cost;
    const alloc = (p.allocationPct      ?? 0).toFixed(1);
    const th    = p.thesis ? `${p.thesis.healthStatus} (${p.thesis.healthScore}/10)` : "—";
    const src   = p.dataSource ? ` [${p.dataSource}]` : "";
    console.log(
      `  ${p.ticker.padEnd(6)}  ${cost.toFixed(0).padStart(8)}   ${value.toFixed(0).padStart(9)}  ${gain >= 0 ? "+" : ""}${gain.toFixed(0).padStart(8)}  ${alloc.padStart(5)}%  ${th}${src}`
    );
    totalCost  += cost;
    totalValue += value;
  }

  const totalGain    = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  console.log("  ──────────────────────────────────────────────────────");
  console.log(
    `  TOTAL    ${totalCost.toFixed(0).padStart(8)}   ${totalValue.toFixed(0).padStart(9)}  +${totalGain.toFixed(0).padStart(8)}  100.0%  (${totalGainPct.toFixed(2)}% gain)`
  );
  console.log("");
  console.log("  WATCHLIST:");
  for (const w of watchlist) {
    console.log(`    [${w.ticker}]  ${w.name ?? ""}`);
  }
  console.log("");
  console.log("  DATA PROVENANCE:");
  console.log("    Source        : Dime app + หุ้น.xlsx");
  console.log("    Snapshot date : 2026-06-05");
  console.log("    Exchange rate : 32.65 THB/USD");
  console.log("    Confidence    : high (audited)");
  console.log("    shares/avgCost/entryDate : null (per-share data not in source)");
  console.log("══════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
