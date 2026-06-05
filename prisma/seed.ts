import { PrismaClient } from "@prisma/client";
import type {
  ThesisKeyAssumption,
  ExpectedOutcome,
  ThesisRisk,
} from "../src/types/index";

const db = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const j = (v: unknown) => JSON.stringify(v);

// ─── MSFT Thesis Components ───────────────────────────────────────────────────

const msftAssumptions: ThesisKeyAssumption[] = [
  {
    id: "azure-ai-moat",
    text: "Azure's combination of enterprise trust, compliance certifications, and existing customer relationships creates a switching-cost moat that is 10+ years deep — no hyperscaler can replicate it in <5 years.",
    category: "competitive_moat",
    importance: "critical",
    measurable: true,
    metric: "azure_yoy_growth_pct",
  },
  {
    id: "copilot-arpu-expansion",
    text: "Copilot at $30/seat/month will expand M365 commercial ARPU by 25-40% as enterprises pay for AI capabilities layered onto their existing subscription.",
    category: "financials",
    importance: "critical",
    measurable: true,
    metric: "m365_commercial_arpu_usd",
  },
  {
    id: "openai-partnership-durable",
    text: "The $13B OpenAI investment and exclusive enterprise deployment rights remain intact for the thesis horizon, giving Microsoft first-mover advantage in enterprise AI models.",
    category: "competitive_moat",
    importance: "critical",
    measurable: false,
  },
  {
    id: "enterprise-ai-mandatory",
    text: "Enterprise AI adoption becomes mandatory rather than discretionary — Fortune 500 companies treat Copilot/AI licensing as a cost of doing business, similar to Office itself.",
    category: "market_dynamics",
    importance: "important",
    measurable: true,
    metric: "copilot_commercial_seat_count",
  },
  {
    id: "satya-execution",
    text: "Satya Nadella and the current management team maintain discipline in capital allocation — AI capex investments generate >15% ROIC over the thesis horizon.",
    category: "management",
    importance: "supporting",
    measurable: true,
    metric: "roic_pct",
  },
];

const msftOutcomes: ExpectedOutcome[] = [
  {
    id: "azure-market-position",
    description: "Azure maintains or grows its position as #2 cloud by revenue, with AI-driven workloads as the primary growth driver.",
    timeframe: "3 years",
    targetDate: "2027-01-01",
    measurable: true,
    metric: "azure_cloud_market_share_pct",
    target: ">22% hyperscaler market share; Azure growth consistently above AWS growth rate",
    importance: "primary",
  },
  {
    id: "copilot-adoption",
    description: "Copilot reaches 30%+ penetration of M365 commercial seats, demonstrating durable enterprise AI monetization.",
    timeframe: "3-4 years",
    targetDate: "2027-06-01",
    measurable: true,
    metric: "copilot_penetration_pct",
    target: ">30% of ~380M M365 commercial seats = ~115M Copilot seats",
    importance: "primary",
  },
  {
    id: "revenue-trajectory",
    description: "Total revenue exceeds $300B/year with AI products contributing >20% of incremental growth.",
    timeframe: "4-5 years",
    targetDate: "2028-06-30",
    measurable: true,
    metric: "annual_revenue_usd_billions",
    target: ">$300B with 20%+ operating margin expansion vs today",
    importance: "primary",
  },
  {
    id: "ai-ecosystem-lock-in",
    description: "The MSFT AI ecosystem (Azure OpenAI, Copilot, GitHub Copilot, Power Platform) becomes the default enterprise AI stack — harder to replace than Office was.",
    timeframe: "5 years",
    measurable: false,
    importance: "secondary",
  },
];

const msftRisks: ThesisRisk[] = [
  {
    id: "azure-growth-deceleration",
    description: "Azure revenue growth decelerates significantly (<15%) due to market saturation, economic slowdown, or competitive loss to AWS/GCP.",
    category: "competitive",
    severity: "high",
    probability: "medium",
    mitigation: "Azure's enterprise relationships are contractual and multi-year; significant churn is structurally difficult. Kill condition defined for <15% growth.",
    monitoredBy: "azure_yoy_growth_pct in quarterly earnings",
  },
  {
    id: "openai-relationship-breakdown",
    description: "OpenAI ends the exclusive arrangement, pivots to a different model partnership, or develops competing products that undermine the MSFT AI stack.",
    category: "competitive",
    severity: "critical",
    probability: "low",
    mitigation: "Microsoft has $13B invested and board observer rights. OpenAI GPTs are deeply integrated into MSFT products. Switching has massive switching costs for OpenAI itself.",
    monitoredBy: "news coverage of OpenAI-Microsoft relationship, any OpenAI announcements about alternative partnerships",
  },
  {
    id: "copilot-adoption-failure",
    description: "Enterprises reject Copilot at scale — either due to price sensitivity ($30/seat is 50% premium on E3 license) or underwhelming ROI.",
    category: "execution",
    severity: "high",
    probability: "medium",
    mitigation: "Early enterprise feedback positive. Microsoft is offering ROI calculators and 90-day trials. If adoption stalls, can reprice or bundle differently.",
    monitoredBy: "Copilot seat count disclosures, enterprise CIO surveys",
  },
  {
    id: "antitrust-regulatory",
    description: "Antitrust action forces Microsoft to unwind its AI partnerships or limits bundling of AI into Office/Windows.",
    category: "regulatory",
    severity: "medium",
    probability: "low",
    mitigation: "EU and US regulators have been focused on Apple and Google; Microsoft's AI strategy is partnership-based not acquisition-based. OpenAI is an investment, not a subsidiary.",
    monitoredBy: "FTC/DOJ filings, EU Digital Markets Act enforcement actions",
  },
  {
    id: "ai-commoditization",
    description: "Foundation models commoditize rapidly, destroying OpenAI's advantage and making the Microsoft/OpenAI partnership less valuable.",
    category: "technological",
    severity: "medium",
    probability: "medium",
    mitigation: "Even if models commoditize, Microsoft's distribution advantage (O365 300M seats) and Azure infrastructure moat remain. Commodity models still need infrastructure.",
    monitoredBy: "GPT-vs-open-source performance benchmarks, enterprise model adoption surveys",
  },
];

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

// ─── META Thesis Components ───────────────────────────────────────────────────

const metaAssumptions: ThesisKeyAssumption[] = [
  {
    id: "dap-distribution-moat",
    text: "3.5B+ daily active people across Facebook, Instagram, and WhatsApp represents the largest organic distribution network in history — advertisers cannot ignore it regardless of sentiment.",
    category: "competitive_moat",
    importance: "critical",
    measurable: true,
    metric: "family_dap_billions",
  },
  {
    id: "att-recovery-complete",
    text: "The ATT headwind from iOS 14.5 is a one-time step-change that Meta adapts to via its Advantage+ AI ad system — not a permanent structural revenue impairment.",
    category: "market_dynamics",
    importance: "critical",
    measurable: true,
    metric: "ad_revenue_yoy_growth_pct",
  },
  {
    id: "reels-monetization",
    text: "Reels engagement monetizes at near-Feed CPM rates within 2-3 years of launch, eliminating the monetization headwind from the shift toward short-form video.",
    category: "financials",
    importance: "important",
    measurable: true,
    metric: "reels_cpm_vs_feed_cpm_ratio",
  },
  {
    id: "whatsapp-business-untapped",
    text: "WhatsApp Business messaging becomes a material revenue contributor — Meta charges businesses for customer communication at scale across 2B+ active WhatsApp users.",
    category: "market_dynamics",
    importance: "important",
    measurable: true,
    metric: "whatsapp_business_revenue_usd_billions",
  },
  {
    id: "zuckerberg-capital-discipline",
    text: "The Year of Efficiency signals durable capital discipline — Reality Labs losses stay <$20B/year and never again consume >50% of operating income.",
    category: "management",
    importance: "supporting",
    measurable: true,
    metric: "reality_labs_annual_loss_usd_billions",
  },
];

const metaOutcomes: ExpectedOutcome[] = [
  {
    id: "ad-revenue-recovery",
    description: "Ad revenue returns to 20%+ YoY growth for 4+ consecutive quarters, demonstrating the ATT headwind is fully overcome.",
    timeframe: "2-3 years",
    targetDate: "2025-12-31",
    measurable: true,
    metric: "ad_revenue_yoy_growth_pct",
    target: ">20% YoY ad revenue growth for 4 consecutive quarters",
    importance: "primary",
  },
  {
    id: "dap-growth",
    description: "Family DAPs grow to 4B+ showing that the engagement moat is durable despite TikTok competition.",
    timeframe: "3-4 years",
    targetDate: "2026-12-31",
    measurable: true,
    metric: "family_dap_billions",
    target: ">4.0B family daily active people",
    importance: "primary",
  },
  {
    id: "whatsapp-revenue",
    description: "WhatsApp Business contributes >$10B annual revenue, demonstrating monetization of the messaging asset.",
    timeframe: "4-5 years",
    targetDate: "2027-12-31",
    measurable: true,
    metric: "whatsapp_business_annual_revenue_usd_billions",
    target: ">$10B annual WhatsApp business revenue",
    importance: "secondary",
  },
];

const metaRisks: ThesisRisk[] = [
  {
    id: "dap-decline",
    description: "Daily active people decline YoY for 2 consecutive quarters, indicating the platform is entering structural user decline.",
    category: "competitive",
    severity: "critical",
    probability: "low",
    mitigation: "Facebook's demographic shift to older users is a feature (higher spending power). Instagram dominates 18-35. WhatsApp is infrastructure in many markets. Kill condition defined.",
    monitoredBy: "quarterly DAP disclosures, demographic survey data",
  },
  {
    id: "reality-labs-runaway",
    description: "Reality Labs losses exceed $20B/year, indicating uncontrolled metaverse spend without credible monetization path.",
    category: "execution",
    severity: "high",
    probability: "low",
    mitigation: "Zuckerberg explicitly committed to capital discipline in Year of Efficiency. Reality Labs losses are tracked quarterly. Kill condition defined.",
    monitoredBy: "Reality Labs quarterly P&L disclosure",
  },
  {
    id: "regulatory-breakup",
    description: "Antitrust regulators force Meta to divest Instagram or WhatsApp, destroying the cross-platform network effect that underpins the thesis.",
    category: "regulatory",
    severity: "critical",
    probability: "low",
    mitigation: "FTC's Meta antitrust case lost in court twice. European DMA is focused on interoperability, not breakup. The probability of divestiture has decreased.",
    monitoredBy: "FTC case status, EU DMA enforcement actions",
  },
  {
    id: "advertiser-boycott",
    description: "Major advertiser exodus due to brand safety concerns around Meta's content moderation policies.",
    category: "execution",
    severity: "medium",
    probability: "low",
    mitigation: "The 2020 advertiser boycott lasted 2 months and had minimal revenue impact. Advertisers return because Meta's targeting ROI is unmatched.",
    monitoredBy: "advertiser concentration data, top 100 advertiser status",
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...");

  const msft = await db.position.create({
    data: {
      ticker: "MSFT",
      name: "Microsoft Corporation",
      sector: "Technology",
      industry: "Cloud Computing & Enterprise Software",
      assetClass: "equity",
      shares: 50,
      avgCost: 280.0,
      entryDate: new Date("2022-11-15"),
      status: "active",
      notes: "Core holding — AI infrastructure + enterprise distribution moat",
      thesis: {
        create: {
          originalThesis:
            "Microsoft has built an insurmountable moat in enterprise AI through three compounding advantages: (1) Azure's infrastructure scale and enterprise trust relationships that took 20 years to build; (2) the OpenAI partnership and $13B investment giving exclusive access to GPT-4 class models for Copilot; (3) the Office 365/Teams distribution engine reaching 300M+ commercial seats that instantly monetizes AI at scale. Unlike consumer AI plays, Microsoft's AI monetization is already contractual and recurring — enterprises renew Copilot licenses just as they renew Office. Expected 3-5 year horizon for full Copilot adoption to compound through the installed base.",
          currentAssessment:
            "Thesis intact. Azure AI continues to be the fastest-growing segment. Copilot adoption metrics tracking ahead of projections.",
          keyAssumptions: j(msftAssumptions),
          expectedOutcomes: j(msftOutcomes),
          risks: j(msftRisks),
          holdingPeriod: "3-5 years",
          holdingPeriodMonths: 48,
          entryConfidence: 8,
          healthStatus: "intact",
          healthScore: 8,
          lastReviewedAt: new Date("2024-10-30"),
        },
      },
      killConditions: {
        create: [
          {
            conditionType: "quantitative",
            description: "Azure cloud revenue growth drops below 15% for two consecutive quarters",
            metric: "azure_revenue_growth_yoy",
            operator: "lt",
            threshold: 15.0,
            status: "active",
          },
          {
            conditionType: "qualitative",
            description: "OpenAI ends the Microsoft exclusivity arrangement or licenses GPT-class models to Google/Amazon at equivalent terms",
            status: "active",
          },
          {
            conditionType: "qualitative",
            description: "Copilot adoption stalls — fewer than 20% of M365 commercial seats convert within 3 years of launch",
            status: "active",
          },
        ],
      },
      journalEntries: {
        create: [
          {
            entryType: "buy_rationale",
            content:
              "Opened at $280 following post-ChatGPT announcement selloff. Market pricing this as speculative. I see contractual enterprise AI monetization through an existing install base.",
          },
        ],
      },
    },
  });

  const nvda = await db.position.create({
    data: {
      ticker: "NVDA",
      name: "NVIDIA Corporation",
      sector: "Technology",
      industry: "Semiconductors — AI Infrastructure",
      assetClass: "equity",
      shares: 30,
      avgCost: 450.0,
      entryDate: new Date("2023-01-20"),
      status: "active",
      notes: "AI infrastructure picks-and-shovels play — CUDA moat is the thesis",
      thesis: {
        create: {
          originalThesis:
            "NVIDIA is the indispensable infrastructure layer for the AI buildout cycle. The CUDA ecosystem is a 15-year moat — not just hardware, but an entire software ecosystem (cuDNN, cuBLAS, TensorRT, NCCL) that every AI researcher and engineer has trained on. The H100 datacenter GPU cycle is the largest product cycle in semiconductors since the smartphone era. This is not a cyclical chip upcycle — this is a new permanent capex line item. AI infrastructure is now mandatory operating expense.",
          currentAssessment:
            "Thesis intact and accelerating. H100/H200 demand still exceeding supply. Blackwell ramp extending the datacenter cycle.",
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
              "Opened at $450. Consensus treats this as cyclical gaming GPU upcycle. I believe it's structural datacenter transformation. Key insight: every company is now a mandatory GPU buyer.",
          },
        ],
      },
    },
  });

  const meta = await db.position.create({
    data: {
      ticker: "META",
      name: "Meta Platforms, Inc.",
      sector: "Technology",
      industry: "Social Media & Digital Advertising",
      assetClass: "equity",
      shares: 40,
      avgCost: 200.0,
      entryDate: new Date("2022-11-10"),
      status: "active",
      notes: "Contrarian entry — 3.5B DAP distribution moat mispriced during 2022 panic",
      thesis: {
        create: {
          originalThesis:
            "Meta was severely mispriced in late 2022 due to three conflated fears: ATT impact on ad revenue (being treated as permanent), TikTok competition (being treated as existential), and Reality Labs losses (being treated as uncontrolled). The core asset being ignored: 3.7B daily active people — the largest distribution network in human history. At $200, the market implied no recovery. My thesis: ATT is a one-time headwind Meta adapts to, Reels monetizes at near-Feed rates, WhatsApp Business is an untapped revenue stream, and the FCF business ($40B+ annually) funds any experiment including Reality Labs.",
          currentAssessment:
            "Thesis confirmed and exceeded. Year of Efficiency. Advantage+ drove ad revenue recovery beyond projections. Reels fully monetizing. AI assistant across apps is a new catalyst.",
          keyAssumptions: j(metaAssumptions),
          expectedOutcomes: j(metaOutcomes),
          risks: j(metaRisks),
          holdingPeriod: "3-5 years",
          holdingPeriodMonths: 48,
          entryConfidence: 7,
          healthStatus: "intact",
          healthScore: 9,
          lastReviewedAt: new Date("2024-10-30"),
        },
      },
      killConditions: {
        create: [
          {
            conditionType: "quantitative",
            description: "Daily active people declines YoY for two consecutive quarters",
            metric: "family_dap_yoy_growth",
            operator: "lt",
            threshold: 0.0,
            status: "active",
          },
          {
            conditionType: "quantitative",
            description: "Reality Labs annual losses exceed $20B",
            metric: "reality_labs_annual_loss_usd_billions",
            operator: "gt",
            threshold: 20.0,
            status: "active",
          },
          {
            conditionType: "qualitative",
            description: "Regulatory breakup of Meta — forced separation of Instagram, WhatsApp, or Facebook becomes likely",
            status: "active",
          },
        ],
      },
      journalEntries: {
        create: [
          {
            entryType: "buy_rationale",
            content:
              "Opened at $200. Market cap $540B generating $17B FCF in a trough year. ATT, TikTok, Reality Labs fears are real but being treated as permanent. I'm buying the distribution moat at a value price.",
          },
          {
            entryType: "thesis_update",
            content:
              "Q3 2023: META DAP 3.14B (+7% YoY). Ad revenue +23% YoY. Advantage+ driving higher advertiser ROI. Reels CPM at ~55% of Feed CPM (closing fast). Reality Labs Q3 loss $3.7B (~$15B annual run rate — within kill condition). All core thesis assumptions confirmed.",
          },
        ],
      },
    },
  });

  // Watchlist
  await db.watchlist.createMany({
    data: [
      {
        ticker: "AMZN",
        name: "Amazon.com, Inc.",
        interestReason: "AWS hyperscaler + Amazon Ads two-engine compounder. Monitoring for entry.",
        draftThesis: "AWS is the picks-and-shovels for cloud AI inference. Amazon Ads monetizes higher-intent purchase signals than Google Search. Logistics moat took $200B to build.",
        targetEntryPrice: 170.0,
      },
      {
        ticker: "GOOG",
        name: "Alphabet Inc.",
        interestReason: "Monitoring for thesis disruption — AI Overviews impact on Search monetization is the key variable.",
        draftThesis: "Alphabet owns Search (attention graph), YouTube (entertainment graph), and is building enterprise cloud AI (GCP + Gemini). Still developing conviction on AI-Search cannibalization thesis.",
        targetEntryPrice: null,
      },
    ],
  });

  console.log("Seeded positions:", { msft: msft.id, nvda: nvda.id, meta: meta.id });
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
