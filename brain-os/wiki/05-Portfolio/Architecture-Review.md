# Portfolio Architecture Review

**Type:** Monthly structural analysis
**Generated:** First day of each month
**Engine:** `src/lib/architecture-review-engine.ts`
**API:** `GET /api/portfolio-architecture`

---

## Purpose

The Architecture Review is a monthly deep-dive into the structural quality of the portfolio. Unlike the daily Blueprint (which focuses on regime-adaptive allocation targets and capital deployment), the Architecture Review measures the portfolio's underlying construction quality across four dimensions and produces an Architecture Score (0–100).

It does not issue buy/sell orders. All outputs are recommendations only.

---

## Architecture Score

**Total: 0–100** (sum of four 0–25 sub-dimensions)

| Dimension | Max | What It Measures |
|---|---|---|
| Diversification | 25 | Sector HHI — lower concentration = higher score |
| Concentration | 25 | Single-stock and sector limit compliance |
| Hedge Quality | 25 | Gold + cash + ETF hedge coverage |
| Regime Resilience | 25 | Portfolio behavior across 4 standard scenarios |

**Grades:** A (90–100) · B (75–89) · C (60–74) · D (45–59) · F (0–44)

---

## Output Sections

### 1. Exposure Map
Maps portfolio weight across four dimensions:
- **By Sector** — Technology, Healthcare, Financials, etc.
- **By Geography** — US vs. International
- **By Theme** — AI Infrastructure, Platform AI, Healthcare/GLP-1, Payments, etc.
- **By Size** — Large Cap (>$10B), Mid Cap ($2B–$10B), Small Cap (<$2B)

Plus summary stats: `cashPct`, `hedgePct`, `equityPct`.

### 2. Concentration Analysis
- **Sector HHI** — Herfindahl-Hirschman Index for sector concentration (0–10,000; US DoJ: >2,500 = highly concentrated)
- **HHI Level** — low / moderate / high / extreme
- **Top 7 Positions** — ranked by allocation %
- **Breaches** — single-stock or sector violations/warnings vs. defined limits

Breach thresholds:
- Single stock > 20%: violation
- Single stock > 15%: warning
- Sector > 50%: violation
- Sector > 40%: warning

### 3. Hidden Correlation Analysis
Identifies groups of held positions that share a dominant risk factor:

| Cluster | Tickers | Shared Risk |
|---|---|---|
| AI Infrastructure | NVDA, TSM, ASML, MU | AI capex slowdown |
| Platform AI & Cloud | MSFT, GOOGL, AMZN, META | AI revenue miss |
| Taiwan Supply Chain | NVDA, TSM, ASML, AAPL, MU | Cross-strait tension |
| Digital Advertising | META, GOOGL | Ad market downturn |
| GLP-1 Pharma | LLY, NVO | Clinical / regulatory risk |
| Payments Duopoly | V, MA | Consumer credit crisis |

Also reports macro-level exposures: `aiTechExposurePct`, `taiwanRiskPct`, `adRevenueExposurePct`.

### 4. Hedge Effectiveness Audit
Evaluates each hedge type present in the portfolio:

| Hedge Type | Tickers | Effectiveness |
|---|---|---|
| Gold | GLDM, GLD, IAU | Taiwan Conflict + Recession |
| Cash | CASH | All scenarios (opportunity cost in bull) |
| Defense ETF | ITA, XAR | Taiwan Conflict + AI Boom |
| Broad Market ETF | SPY, QQQ, VOO | AI Boom + Soft Landing |

Outputs:
- `hedgeScore` (0–100): composite quality metric
- `scenarioAdequacy`: per-scenario hedge coverage assessment
- `missingHedgeTypes`: what's absent from the hedge toolkit
- `recommendations`: specific actions to improve hedge coverage

### 5. Scenario Stress Tests
Four standard scenarios evaluated against the current portfolio:
- **Taiwan Conflict** — supply chain shock, geopolitical flight-to-safety
- **Recession** — earnings compression, ad-market contraction
- **AI Boom** — AI capex acceleration, risk-on environment
- **Soft Landing** — benign macro, broad equity rally

Each stress test includes:
- Estimated portfolio return range
- Top worst / best positions
- Hedge coverage adequacy (`sufficient` / `adequate` / `insufficient`)
- Hedge offset narrative

*Note: Scenario data is sourced from the most recent daily Portfolio Blueprint in the DB.*

### 6. Recommendations
Prioritized, rules-based action items:

| Priority | Category | Trigger |
|---|---|---|
| Critical | Concentration | Single-stock > 20% or sector > 50% |
| Critical | Diversification | Architecture score < 45 |
| High | Hedge | No gold position or cash < 3% |
| High | Regime | Worst-case scenario = very_negative + no hedge |
| Medium | Correlation | High-significance cluster (>30% combined) |
| Medium | Hedge | Gold < 3% or no ETF hedge |
| Medium | Diversification | Fewer than 4 distinct sectors |

---

## Data Sources

| Source | Used For |
|---|---|
| `Position` table | Current holdings + allocation % |
| `Universe` table | Market cap (size classification) + country |
| `InvestmentThesis` table | Conviction context |
| `OpportunityScore` table | V2 screener scores for held + watchlist tickers |
| `PortfolioBlueprint` table | Scenario analysis (latest daily blueprint) |
| `MorningBrief` table | Current market regime |
| `NewsletterItem` count | Newsletter intelligence density |

---

## Scheduler

Job name: `portfolio_architecture_review`
Frequency: Monthly — runs on **1st of each month** (nightly scheduler gate)
Database: `PortfolioArchitectureReview` table (one record per month, upserted)

---

## Related Pages

- [[Portfolio]] — current holdings and themes
- [[Phase-16-Architecture-Review]] — implementation notes

---

*Last updated: 2026-06-12*
