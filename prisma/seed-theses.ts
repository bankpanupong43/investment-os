/**
 * Seed investment theses for all active positions and watchlist items.
 * All records except NVDA are marked isDraft=true — they require human review.
 * Run: npm run db:seed-theses
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const THESES = [
  // ── Active Positions ────────────────────────────────────────────────────────
  {
    ticker: "CASH",
    status: "active",
    title: "Deployment Capital — Target Allocation Execution",
    thesis:
      "60.1% of the portfolio ($26,578 / ฿867,764) is held as consolidated cash across Dime! USD, Dime! Save, and FCD-USD accounts. This represents strategic dry powder awaiting deployment into the 5-position target allocation plan. Primary target: MSFT (60% of plan = $23,890). Secondary fills: META, AMZN, NVDA, AAPL to target weight. Total gap to fill: $32,428 vs. available cash $26,578 — a shortfall of $5,850 requiring an additional capital contribution.",
    whyOwn:
      "Cash is held intentionally, not by default. Until MSFT and other target positions are funded to plan weight, cash drag is preferable to chasing positions at suboptimal sizing. The allocation engine shows current equity positions represent only 18.6% of the target plan.",
    risks:
      "Opportunity cost vs. deployed equity returns compounding; Thai Baht depreciation reducing THB savings purchasing power; inflation eroding real value of idle cash; decision paralysis delaying MSFT accumulation.",
    killCriteria:
      "Reduce CASH aggressively as MSFT and target positions are funded. Target: CASH allocation below 20% of total portfolio. At that point, re-evaluate whether remaining cash reserve is adequate or should be fully deployed.",
    confidenceScore: 5,
    reviewFrequency: "monthly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "AAPL",
    status: "active",
    title: "Consumer Ecosystem Lock-in + Services Monetisation",
    thesis:
      "Apple's 1B+ iPhone user base is locked into an ecosystem (App Store, iCloud, Apple Pay, Apple TV+) that generates high-margin recurring services revenue. Services gross margin exceeds 70% vs. hardware ~36%, driving mix shift toward more predictable, higher-quality earnings. The installed base is the distribution engine — services revenue scales at near-zero marginal cost on top of it.",
    whyOwn:
      "No other company combines Apple's hardware brand loyalty with a recurring services layer built on top of it. The 1B+ device installed base is the asset. Apple's buyback program (retiring ~3% of float annually) provides additional compounding return on top of earnings growth.",
    risks:
      "App Store regulatory pressure (EU DMA, US DOJ) forcing alternative payments and reducing 30% take rate; iPhone growth saturation in China as local competitors gain share; AI integration falling behind Android/Google ecosystem; management succession risk post-Cook.",
    killCriteria:
      "App Store forced to adopt alternative payments causing >15% Services revenue decline; China iPhone market share falls below 12% with no recovery trajectory; Net income declines for two consecutive years on structural margin compression.",
    confidenceScore: 7,
    reviewFrequency: "quarterly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "NVDA",
    status: "active",
    title: "AI Infrastructure Monopoly — CUDA Ecosystem Moat",
    thesis:
      "NVIDIA is the indispensable infrastructure layer for AI training and inference. The CUDA ecosystem — cuDNN, TensorRT, NCCL, the full software stack — is a 15-year moat that every ML engineer and system has been trained on. Datacenter GPU spending has shifted from discretionary R&D to mandatory operating expense: every company building on AI must pay NVIDIA. With Hopper delivering ~3x the performance per watt of Ampere and Blackwell on the horizon, NVIDIA's competitive position is strengthening, not weakening.",
    whyOwn:
      "NVIDIA is the toll booth on the AI highway. Unlike model companies (OpenAI, Anthropic) whose moats are intellectual and erosible, NVIDIA's moat is physical (fabs, packaging), software (CUDA), and ecosystem (partners, enterprise ISVs). The datacenter segment is growing 200%+ YoY and has yet to see hyperscaler capex peak.",
    risks:
      "Hyperscaler custom silicon (Google TPU, Amazon Trainium, Meta MTIA) accelerating; AMD ROCm achieving sufficient CUDA compatibility for training workloads; export control expansion cutting China addressable market further; hyperscaler capex reduction if AI ROI is questioned at scale.",
    killCriteria:
      "Datacenter revenue growth <30% YoY for two consecutive quarters; AMD captures >25% of hyperscaler GPU training workloads; datacenter gross margin falls below 65% for two consecutive quarters.",
    confidenceScore: 9,
    reviewFrequency: "quarterly",
    isDraft: false,
    lastReviewedAt: new Date("2024-11-20"),
  },
  {
    ticker: "GOOG",
    status: "active",
    title: "Search Monopoly + Cloud AI Reinvention",
    thesis:
      "Alphabet owns three durable digital assets: Google Search (~90% global query intent share), YouTube (2B+ monthly users, largest video platform), and Google Cloud (GCP, fastest-growing major hyperscaler). AI is a near-term competitive threat to Search but a medium-term tailwind — Gemini monetisation through AI Overviews, GCP AI services, and Workspace AI can offset any Search CPM headwinds.",
    whyOwn:
      "Near-monopoly on search intent generates $240B+ annual revenue. GCP + Gemini provides the most undervalued entry point to enterprise AI relative to Azure (MSFT) or AWS (AMZN) at this valuation multiple. Alphabet's valuation implies the market is not yet pricing in GCP becoming a $100B+ revenue business.",
    risks:
      "AI Overviews reducing Search click-through rates and CPMs structurally; DOJ antitrust case forcing Chrome or Android divestiture; TikTok/Reels capturing video attention from YouTube among under-35 cohort; GCP market share stagnating behind Azure.",
    killCriteria:
      "Google Search revenue declines YoY for two consecutive quarters due to AI cannibalization; DOJ ruling forces divestiture of Chrome, Android, or Google Play; GCP growth falls below 15% YoY for two consecutive quarters.",
    confidenceScore: 7,
    reviewFrequency: "quarterly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "AMZN",
    status: "active",
    title: "AWS Hyperscaler + Amazon Ads Two-Engine Compounder",
    thesis:
      "Amazon operates two independently valuable businesses: AWS (~31% cloud market share, $100B+ revenue run rate, highest-margin segment) and Amazon Commerce+Ads (world's largest e-commerce platform monetised through high-intent advertising). AWS is the primary profit driver while Amazon Ads has become the third-largest digital ad platform, monetising purchase intent that outperforms Google Search for product queries.",
    whyOwn:
      "No competitor combines cloud infrastructure scale (AWS #1) with the world's largest purchase-intent dataset (Amazon.com). This creates advertising targeting advantages that Google and Meta cannot replicate. AWS + Ads generates sufficient FCF to fund logistics, Prime content, and experiments while still compounding.",
    risks:
      "AWS growth deceleration from market saturation or share loss to Azure; Amazon logistics cost base re-inflating from labour and fuel cost increases; FTC marketplace antitrust case forcing structural separation; Prime membership growth plateauing in core markets.",
    killCriteria:
      "AWS revenue growth drops below 15% YoY for two consecutive quarters; Operating margin reverts below 5% due to logistics cost re-inflation; FTC wins structural separation of Amazon marketplace from AWS.",
    confidenceScore: 7,
    reviewFrequency: "quarterly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "ITA",
    status: "active",
    title: "U.S. Aerospace & Defense — Secular Rearmament Tailwind",
    thesis:
      "ITA holds U.S. aerospace and defence contractors (Raytheon, L3Harris, Northrop Grumman, Lockheed Martin, TransDigm, BWX) providing diversified exposure to the structural increase in global defence spending post-Ukraine. NATO members are expanding budgets toward 2–3% of GDP; U.S. defence budget exceeds $900B/year with bipartisan support; Indo-Pacific tensions drive sustained demand for advanced weapons systems.",
    whyOwn:
      "Defence spending is government-mandated, contract-backed, and counter-cyclical — not subject to consumer or corporate cycle risk. ITA provides diversified exposure without single-contractor concentration. Geopolitical risk has permanently re-priced higher, making this a multi-year structural position.",
    risks:
      "U.S. government deficit reduction forcing defence budget cuts; peace resolution in Ukraine causing European rearmament reversal; specific programme cancellations (F-35, B-21) impacting major holdings; expense ratio drag vs. direct ownership of individual names.",
    killCriteria:
      "U.S. Congress passes multi-year defence budget cuts exceeding 10% in real terms; core holdings (RTX, LMT, NOC, L3H) experience systematic contract cancellations impacting >20% of revenue; better, lower-cost vehicle for sector exposure is identified.",
    confidenceScore: 6,
    reviewFrequency: "annually",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "GLDM",
    status: "active",
    title: "Physical Gold — Inflation & Portfolio Tail-Risk Hedge",
    thesis:
      "GLDM tracks physical gold, serving as portfolio insurance against USD debasement (from sustained fiscal deficits), stagflation scenarios where equities and bonds decline simultaneously, and geopolitical tail-risk events that drive safe-haven demand. Gold has no earnings risk, no management risk, and no bankruptcy risk. It maintains purchasing power across currency regimes.",
    whyOwn:
      "Gold's role is portfolio construction, not alpha generation — it provides near-zero or negative correlation to equity risk during stress events and reduces maximum drawdown. With $33T+ U.S. national debt and structural fiscal deficits, the case for gold as a dollar debasement hedge is intact. GLDM at 0.10% expense ratio is the most cost-efficient physical gold vehicle.",
    risks:
      "Rising real interest rates (TIPS yield) making gold opportunity cost prohibitive vs. Treasury bills; USD structural strengthening reducing gold's relative purchasing power; portfolio equity exposure becoming sufficiently defensive that uncorrelated ballast is redundant.",
    killCriteria:
      "Real interest rates (10Y TIPS) exceed 3% for an extended period with credible reduction in fiscal deficit trajectory; portfolio's equity exposure becomes sufficiently defensive that uncorrelated ballast is redundant; GLDM expense ratio increases materially above peers.",
    confidenceScore: 6,
    reviewFrequency: "annually",
    isDraft: true,
    lastReviewedAt: null,
  },
  // ── Watchlist Items ─────────────────────────────────────────────────────────
  {
    ticker: "MSFT",
    status: "watchlist",
    title: "Azure AI Moat — Growth Flagship (60% of Allocation Plan)",
    thesis:
      "Microsoft is the primary deployment target: 60% of total capital ($23,890 of $39,816 plan). Azure's 20-year enterprise trust relationships and compliance certifications create a switching-cost moat no hyperscaler can replicate in <5 years. The $13B OpenAI investment provides exclusive enterprise AI access via Azure OpenAI. Office 365's 300M+ commercial seat distribution monetises AI at scale through Copilot at $30/seat — the first truly contracted, recurring enterprise AI revenue stream.",
    whyOwn:
      "No other company combines Azure infrastructure scale (#2 cloud globally), O365 enterprise distribution (300M seats), and OpenAI AI exclusivity in a single P&L. Copilot monetisation is already live and contractual, unlike all other AI plays which remain speculative at this stage.",
    risks:
      "Azure growth decelerating below 15% YoY as cloud market matures; OpenAI partnership ending or losing exclusivity; Copilot enterprise adoption stalling below 20% of M365 commercial seats at year 3; antitrust action limiting AI bundling with existing Microsoft monopoly products.",
    killCriteria:
      "Azure revenue growth <15% YoY for two consecutive quarters; OpenAI ends exclusive enterprise deployment arrangement; Copilot commercial seats fail to reach 50M within 3 years of general availability; management pivots capital allocation from AI infrastructure to share buybacks.",
    confidenceScore: 8,
    reviewFrequency: "quarterly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "META",
    status: "watchlist",
    title: "3.5B DAP Distribution Moat — Defensive Bucket (10% Target)",
    thesis:
      "Meta owns the world's largest social distribution network: 3.5B+ daily active people across Facebook, Instagram, and WhatsApp. The Advantage+ AI advertising system has fully recovered from the iOS ATT headwind, driving ad revenue above pre-ATT growth rates. WhatsApp Business (2B+ users) remains a largely unmonetised asset. FCF exceeds $50B annually. Reality Labs losses appear capped below $20B/year.",
    whyOwn:
      "Advertisers cannot ignore 3.5B daily active people — Meta's reach is structurally durable. At ~20x earnings for a $50B+ FCF business with multiple growth vectors (Reels, WhatsApp Business, Llama AI) and proven management efficiency discipline, the valuation appears attractive for a defensive allocation.",
    risks:
      "DAP growth reversal from TikTok/YouTube Shorts competitive pressure; Reality Labs annual losses exceeding $20B/year; DOJ/FTC regulatory breakup forcing Instagram or WhatsApp divestiture; advertiser brand safety boycott triggered by content moderation controversy.",
    killCriteria:
      "Family daily active people declines YoY for two consecutive quarters; Reality Labs losses exceed $20B annually; U.S. regulatory action makes forced Instagram/WhatsApp divestiture likely (>50% probability); AI assistant fails to monetise after 2+ years and management does not course-correct.",
    confidenceScore: 7,
    reviewFrequency: "quarterly",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "IJH",
    status: "watchlist",
    title: "S&P 400 Mid-Cap Index — Size Factor Diversification",
    thesis:
      "IJH tracks the S&P 400 Mid-Cap index (~400 U.S. companies above small-cap threshold but below S&P 500). Mid-cap companies historically outperform both large-caps and small-caps over full market cycles — they have the growth profile of small-caps with the operational maturity of large-caps. IJH at 0.05% expense ratio is one of the cheapest mid-cap exposures available.",
    whyOwn:
      "Current portfolio is heavily concentrated in mega-cap tech (AAPL, NVDA, GOOG, AMZN, MSFT target) and sector-specific ETFs. IJH would add 400 companies across industrials, financials, healthcare, and consumer sectors, providing genuine diversification without active management tracking error.",
    risks:
      "Mid-cap underperforms in risk-off environments where capital flees to mega-cap quality; rising rates compress mid-cap multiples more than large-cap; lower liquidity vs. SPY/QQQ during market stress.",
    killCriteria:
      "Achieve sufficient diversification through individual stock selection that an index vehicle is redundant; expense ratio materially increases; better mid-cap vehicle identified; portfolio mandate shifts to higher-conviction concentrated positions only.",
    confidenceScore: 6,
    reviewFrequency: "annually",
    isDraft: true,
    lastReviewedAt: null,
  },
  {
    ticker: "VTWO",
    status: "watchlist",
    title: "Russell 2000 Small-Cap — Fed Pivot Tactical Opportunity",
    thesis:
      "VTWO tracks the Russell 2000 small-cap index (2,000 U.S. small-cap companies). Small-cap outperforms most strongly when: (1) the Fed pivots to cutting rates (small-caps carry more floating-rate debt), (2) the economic cycle enters early expansion (small-cap operating leverage amplifies earnings), (3) USD weakens (small-caps are more domestically focused). The investment case is explicitly tactical — size-factor rotation when macro conditions align.",
    whyOwn:
      "Small-cap carries the highest historical size premium over long periods. VTWO at 0.10% expense ratio is the lowest-cost Russell 2000 vehicle available. Entry at the beginning of a rate-cutting cycle would capture the full interest-rate sensitivity premium. This is a tactical position to add when macro conditions are right.",
    risks:
      "Fed rate cuts delayed or reversed due to persistent inflation; U.S. recession disproportionately impacting small businesses vs. large-cap multinationals; USD structural strengthening; small-cap liquidity deterioration in risk-off periods amplifying drawdowns.",
    killCriteria:
      "Fed pivots back to hiking cycle after initiating cuts; recession becomes base case with >60% probability; better entry via individual small-cap companies identified; portfolio capital constraints require reallocation to higher-conviction positions.",
    confidenceScore: 6,
    reviewFrequency: "annually",
    isDraft: true,
    lastReviewedAt: null,
  },
];

async function main() {
  console.log("Seeding investment theses...\n");

  let created = 0;
  let updated = 0;

  for (const t of THESES) {
    const { lastReviewedAt, ...data } = t;
    const result = await db.investmentThesis.upsert({
      where: { ticker: t.ticker },
      create: { ...data, lastReviewedAt: lastReviewedAt ?? undefined },
      update: { ...data, lastReviewedAt: lastReviewedAt ?? undefined },
    });
    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    console.log(`  [${isNew ? "NEW" : "UPDATE"}] ${result.ticker.padEnd(5)} — ${result.title}`);
    if (isNew) created++;
    else updated++;
  }

  // ── Validation Report ──────────────────────────────────────────────────────
  const all = await db.investmentThesis.findMany({ orderBy: { confidenceScore: "desc" } });

  const active    = all.filter(t => t.status === "active");
  const watchlist = all.filter(t => t.status === "watchlist");
  const drafts    = all.filter(t => t.isDraft);
  const now       = new Date();

  function freqDays(f: string) {
    if (f === "monthly") return 30;
    if (f === "quarterly") return 90;
    return 365;
  }

  function isOverdue(t: typeof all[0]) {
    if (!t.lastReviewedAt) return true;
    const due = new Date(t.lastReviewedAt);
    due.setDate(due.getDate() + freqDays(t.reviewFrequency));
    return due < now;
  }

  const overdue = all.filter(isOverdue);
  const avgConfidence = all.reduce((s, t) => s + t.confidenceScore, 0) / all.length;

  const dist = { high: 0, medium: 0, moderate: 0 };
  for (const t of all) {
    if (t.confidenceScore >= 8) dist.high++;
    else if (t.confidenceScore >= 6) dist.medium++;
    else dist.moderate++;
  }

  console.log("\n" + "─".repeat(60));
  console.log("INVESTMENT THESIS SEED VALIDATION REPORT");
  console.log("─".repeat(60));
  console.log(`Total theses:      ${all.length}  (${created} created, ${updated} updated)`);
  console.log(`  Active:          ${active.length}`);
  console.log(`  Watchlist:       ${watchlist.length}`);
  console.log(`Coverage:          ${all.length}/${active.length + watchlist.length} (100%)`);
  console.log(`Average confidence: ${avgConfidence.toFixed(1)} / 10`);
  console.log(`Draft (AI-gen):    ${drafts.length} — require human review`);
  console.log(`Published:         ${all.length - drafts.length}`);
  console.log(`Reviews overdue:   ${overdue.length}`);
  console.log("\nConfidence distribution:");
  console.log(`  High   (8-10): ${"█".repeat(dist.high)} ${dist.high}`);
  console.log(`  Medium (6-7):  ${"█".repeat(dist.medium)} ${dist.medium}`);
  console.log(`  Low    (1-5):  ${"█".repeat(dist.moderate)} ${dist.moderate}`);
  console.log("\nTop conviction:");
  for (const t of all.slice(0, 3)) {
    const flag = isOverdue(t) ? " [REVIEW DUE]" : "";
    console.log(`  ${t.confidenceScore}/10  ${t.ticker.padEnd(5)} — ${t.title}${flag}`);
  }
  console.log("\nOverdue for review:");
  for (const t of overdue) {
    const last = t.lastReviewedAt ? t.lastReviewedAt.toISOString().slice(0, 10) : "never";
    console.log(`  ${t.ticker.padEnd(5)} — last reviewed: ${last} (${t.reviewFrequency})`);
  }
  console.log("─".repeat(60));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
