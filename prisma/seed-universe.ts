import { PrismaClient } from "@prisma/client";
import { computeScores } from "../src/lib/scoring-engine";

const db = new PrismaClient();

const UNIVERSE_DATA = [
  // ── Tier 1: Large Cap (S&P 500 / Nasdaq 100 leaders) ──────────────────────
  { ticker: "AAPL",  companyName: "Apple Inc.",                 exchange: "NASDAQ", sector: "Technology",          industry: "Consumer Electronics",  marketCap: 3300000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 46.2, operatingMargin: 30.1, revenueGrowth: 5.1,  epsGrowth: 11.2, debtToEquity: 1.73, roic: 55.4, freeCashFlow: 110000, sharesOutstanding: 15400 } },
  { ticker: "NVDA",  companyName: "NVIDIA Corporation",         exchange: "NASDAQ", sector: "Technology",          industry: "Semiconductors",        marketCap: 3100000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 73.8, operatingMargin: 55.0, revenueGrowth: 122.4, epsGrowth: 400.0, debtToEquity: 0.38, roic: 95.2, freeCashFlow: 26000, sharesOutstanding: 24500 } },
  { ticker: "MSFT",  companyName: "Microsoft Corporation",      exchange: "NASDAQ", sector: "Technology",          industry: "Software",               marketCap: 3150000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 70.1, operatingMargin: 45.2, revenueGrowth: 16.0, epsGrowth: 20.0, debtToEquity: 0.79, roic: 35.1, freeCashFlow: 70000, sharesOutstanding: 7440 } },
  { ticker: "GOOG",  companyName: "Alphabet Inc. (Class C)",    exchange: "NASDAQ", sector: "Communication Svcs",  industry: "Internet Search",        marketCap: 2100000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 58.1, operatingMargin: 32.3, revenueGrowth: 14.4, epsGrowth: 30.4, debtToEquity: 0.05, roic: 25.6, freeCashFlow: 60000, sharesOutstanding: 8550 } },
  { ticker: "AMZN",  companyName: "Amazon.com Inc.",            exchange: "NASDAQ", sector: "Consumer Discretionary", industry: "E-Commerce",          marketCap: 2200000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 49.2, operatingMargin: 11.0, revenueGrowth: 12.0, epsGrowth: 150.0, debtToEquity: 0.68, roic: 18.2, freeCashFlow: 50000, sharesOutstanding: 10600 } },
  { ticker: "META",  companyName: "Meta Platforms Inc.",        exchange: "NASDAQ", sector: "Communication Svcs",  industry: "Social Media",          marketCap: 1500000, universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 82.0, operatingMargin: 43.4, revenueGrowth: 22.1, epsGrowth: 60.2, debtToEquity: 0.05, roic: 34.8, freeCashFlow: 52000, sharesOutstanding: 2550 } },
  { ticker: "TSLA",  companyName: "Tesla Inc.",                 exchange: "NASDAQ", sector: "Consumer Discretionary", industry: "Electric Vehicles",   marketCap: 900000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 18.2, operatingMargin: 8.4,  revenueGrowth: -0.7, epsGrowth: -23.0, debtToEquity: 0.09, roic: 10.5, freeCashFlow: 2000, sharesOutstanding: 3190 } },
  { ticker: "JPM",   companyName: "JPMorgan Chase & Co.",       exchange: "NYSE",   sector: "Financials",           industry: "Diversified Banks",     marketCap: 680000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 64.8, operatingMargin: 40.0, revenueGrowth: 11.0, epsGrowth: 12.0, debtToEquity: null, roic: 16.4, freeCashFlow: null, sharesOutstanding: 2860 } },
  { ticker: "V",     companyName: "Visa Inc.",                  exchange: "NYSE",   sector: "Financials",           industry: "Payment Technology",    marketCap: 580000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 80.2, operatingMargin: 68.1, revenueGrowth: 10.1, epsGrowth: 16.0, debtToEquity: 1.82, roic: 45.2, freeCashFlow: 18000, sharesOutstanding: 2070 } },
  { ticker: "MA",    companyName: "Mastercard Inc.",            exchange: "NYSE",   sector: "Financials",           industry: "Payment Technology",    marketCap: 475000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 78.0, operatingMargin: 58.4, revenueGrowth: 11.5, epsGrowth: 18.2, debtToEquity: 2.20, roic: 130.0, freeCashFlow: 11000, sharesOutstanding: 960 } },
  { ticker: "LLY",   companyName: "Eli Lilly and Company",     exchange: "NYSE",   sector: "Healthcare",           industry: "Pharmaceuticals",        marketCap: 780000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 80.9, operatingMargin: 35.0, revenueGrowth: 52.0, epsGrowth: 110.0, debtToEquity: 2.80, roic: 35.0, freeCashFlow: 8000, sharesOutstanding: 950 } },
  { ticker: "COST",  companyName: "Costco Wholesale Corp.",    exchange: "NASDAQ", sector: "Consumer Staples",     industry: "Warehouse Clubs",        marketCap: 380000,  universeTier: "tier1", country: "US", assetType: "equity",
    fund: { grossMargin: 12.6, operatingMargin: 3.5,  revenueGrowth: 9.0,  epsGrowth: 17.0, debtToEquity: 0.40, roic: 28.0, freeCashFlow: 7500, sharesOutstanding: 443 } },

  // ── Tier 2: Mid Cap ────────────────────────────────────────────────────────
  { ticker: "DECK",  companyName: "Deckers Outdoor Corp.",     exchange: "NYSE",   sector: "Consumer Discretionary", industry: "Footwear",              marketCap: 21000,  universeTier: "tier2", country: "US", assetType: "equity",
    fund: { grossMargin: 54.8, operatingMargin: 20.2, revenueGrowth: 16.2, epsGrowth: 40.0, debtToEquity: 0.00, roic: 40.2, freeCashFlow: 800, sharesOutstanding: 25 } },
  { ticker: "TXRH",  companyName: "Texas Roadhouse Inc.",      exchange: "NASDAQ", sector: "Consumer Discretionary", industry: "Restaurants",           marketCap: 12000,  universeTier: "tier2", country: "US", assetType: "equity",
    fund: { grossMargin: 14.0, operatingMargin: 10.0, revenueGrowth: 9.0,  epsGrowth: 18.0, debtToEquity: 0.28, roic: 35.0, freeCashFlow: 320, sharesOutstanding: 68 } },
  { ticker: "CELH",  companyName: "Celsius Holdings Inc.",     exchange: "NASDAQ", sector: "Consumer Staples",     industry: "Beverages",              marketCap: 5000,   universeTier: "tier2", country: "US", assetType: "equity",
    fund: { grossMargin: 48.2, operatingMargin: 12.0, revenueGrowth: 9.0,  epsGrowth: -40.0, debtToEquity: 0.00, roic: 12.0, freeCashFlow: 100, sharesOutstanding: 260 } },
  { ticker: "EXP",   companyName: "Eagle Materials Inc.",      exchange: "NYSE",   sector: "Materials",            industry: "Construction Materials",  marketCap: 9000,   universeTier: "tier2", country: "US", assetType: "equity",
    fund: { grossMargin: 44.0, operatingMargin: 32.0, revenueGrowth: 6.0,  epsGrowth: 22.0, debtToEquity: 0.80, roic: 30.0, freeCashFlow: 400, sharesOutstanding: 53 } },

  // ── Tier 3: Small Cap ──────────────────────────────────────────────────────
  { ticker: "MELI",  companyName: "MercadoLibre Inc.",         exchange: "NASDAQ", sector: "Consumer Discretionary", industry: "E-Commerce",            marketCap: 110000, universeTier: "tier3", country: "US", assetType: "equity",
    fund: { grossMargin: 36.0, operatingMargin: 12.0, revenueGrowth: 38.0, epsGrowth: 70.0, debtToEquity: 1.80, roic: 15.0, freeCashFlow: 2000, sharesOutstanding: 51 } },
  { ticker: "PCVX",  companyName: "Vaxcyte Inc.",              exchange: "NASDAQ", sector: "Healthcare",           industry: "Biotech",                 marketCap: 7000,   universeTier: "tier3", country: "US", assetType: "equity",
    fund: { grossMargin: null, operatingMargin: null, revenueGrowth: null, epsGrowth: null, debtToEquity: 0.0, roic: null, freeCashFlow: null, sharesOutstanding: 120 } },

  // ── Tier 4: ETF Universe ───────────────────────────────────────────────────
  { ticker: "VOO",   companyName: "Vanguard S&P 500 ETF",      exchange: "NYSE",   sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "QQQ",   companyName: "Invesco QQQ Trust",          exchange: "NASDAQ", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "SPY",   companyName: "SPDR S&P 500 ETF Trust",     exchange: "NYSE",   sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "VTI",   companyName: "Vanguard Total Stock Market ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "VBK",   companyName: "Vanguard Small-Cap Growth ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "IWM",   companyName: "iShares Russell 2000 ETF",   exchange: "NYSE",   sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "IJH",   companyName: "iShares Core S&P Mid-Cap ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "GLDM",  companyName: "SPDR Gold MiniShares Trust", exchange: "NYSE",   sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "ITA",   companyName: "iShares U.S. Aerospace & Defense ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "SCHD",  companyName: "Schwab US Dividend Equity ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "MOAT",  companyName: "VanEck Morningstar Wide Moat ETF", exchange: "NYSE", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "QUAL",  companyName: "iShares MSCI USA Quality Factor ETF", exchange: "NASDAQ", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "VTWO",  companyName: "Vanguard Russell 2000 ETF", exchange: "NASDAQ", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },
  { ticker: "VXUS",  companyName: "Vanguard Total International Stock ETF", exchange: "NASDAQ", sector: null, industry: null, marketCap: null, universeTier: "tier4", country: "US", assetType: "etf", fund: null },

  // ── Tier 5: International Compounders ─────────────────────────────────────
  { ticker: "ASML",  companyName: "ASML Holding N.V.",         exchange: "NASDAQ", sector: "Technology",          industry: "Semiconductor Equipment", marketCap: 295000, universeTier: "tier5", country: "NL", assetType: "equity",
    fund: { grossMargin: 51.3, operatingMargin: 32.0, revenueGrowth: 12.0, epsGrowth: 25.0, debtToEquity: 0.82, roic: 28.4, freeCashFlow: 4500, sharesOutstanding: 390 } },
  { ticker: "TSM",   companyName: "Taiwan Semiconductor Mfg.", exchange: "NYSE",   sector: "Technology",          industry: "Semiconductors",          marketCap: 780000, universeTier: "tier5", country: "TW", assetType: "equity",
    fund: { grossMargin: 53.2, operatingMargin: 42.2, revenueGrowth: 25.0, epsGrowth: 36.0, debtToEquity: 0.33, roic: 22.0, freeCashFlow: 20000, sharesOutstanding: 25900 } },
  { ticker: "NVO",   companyName: "Novo Nordisk A/S",          exchange: "NYSE",   sector: "Healthcare",          industry: "Pharmaceuticals",         marketCap: 420000, universeTier: "tier5", country: "DK", assetType: "equity",
    fund: { grossMargin: 84.1, operatingMargin: 44.2, revenueGrowth: 25.0, epsGrowth: 50.0, debtToEquity: 0.62, roic: 80.0, freeCashFlow: 8000, sharesOutstanding: 2230 } },
  { ticker: "SHOP",  companyName: "Shopify Inc.",              exchange: "NYSE",   sector: "Technology",          industry: "E-Commerce Platform",     marketCap: 140000, universeTier: "tier5", country: "CA", assetType: "equity",
    fund: { grossMargin: 50.0, operatingMargin: 10.0, revenueGrowth: 25.0, epsGrowth: null, debtToEquity: 0.10, roic: 5.0, freeCashFlow: 800, sharesOutstanding: 1300 } },
  { ticker: "SAP",   companyName: "SAP SE",                   exchange: "NYSE",   sector: "Technology",          industry: "Enterprise Software",     marketCap: 260000, universeTier: "tier5", country: "DE", assetType: "equity",
    fund: { grossMargin: 72.0, operatingMargin: 18.0, revenueGrowth: 10.0, epsGrowth: 15.0, debtToEquity: 0.40, roic: 12.0, freeCashFlow: 5500, sharesOutstanding: 1190 } },
  { ticker: "BABA",  companyName: "Alibaba Group Holding",    exchange: "NYSE",   sector: "Consumer Discretionary", industry: "E-Commerce",            marketCap: 230000, universeTier: "tier5", country: "CN", assetType: "equity",
    fund: { grossMargin: 38.0, operatingMargin: 14.0, revenueGrowth: 8.0,  epsGrowth: 10.0, debtToEquity: 0.22, roic: 10.0, freeCashFlow: 16000, sharesOutstanding: 21000 } },
];

async function main() {
  console.log("Seeding investment universe…");

  let created = 0, skipped = 0, scored = 0;

  for (const item of UNIVERSE_DATA) {
    const existing = await db.universe.findUnique({ where: { ticker: item.ticker } });
    if (existing) { skipped++; continue; }

    const entry = await db.universe.create({
      data: {
        ticker: item.ticker,
        companyName: item.companyName,
        exchange: item.exchange ?? null,
        sector: item.sector ?? null,
        industry: item.industry ?? null,
        marketCap: item.marketCap ?? null,
        universeTier: item.universeTier,
        country: item.country,
        assetType: item.assetType,
      },
    });

    if (item.fund) {
      await db.fundamental.create({
        data: {
          universeId: entry.id,
          revenueGrowth:     item.fund.revenueGrowth     ?? null,
          epsGrowth:         item.fund.epsGrowth         ?? null,
          grossMargin:       item.fund.grossMargin       ?? null,
          operatingMargin:   item.fund.operatingMargin   ?? null,
          freeCashFlow:      item.fund.freeCashFlow      ?? null,
          debtToEquity:      item.fund.debtToEquity      ?? null,
          roic:              item.fund.roic              ?? null,
          sharesOutstanding: item.fund.sharesOutstanding ?? null,
        },
      });

      const scores = computeScores(item.fund);
      await db.universeScore.create({
        data: {
          universeId:        entry.id,
          businessQuality:   scores.businessQuality,
          growth:            scores.growth,
          financialStrength: scores.financialStrength,
          capitalAllocation: scores.capitalAllocation,
          valuation:         scores.valuation,
          totalScore:        scores.totalScore,
        },
      });
      scored++;
    }

    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (existing): ${skipped}, Scored: ${scored}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
