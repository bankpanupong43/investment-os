// Theme Allocation Configuration — Phase 22
// Single source of truth for theme universe, ticker mappings, base targets, and regime adjustments.

export const THEME_IDS = [
  "ai-infrastructure",
  "semiconductors",
  "healthcare",
  "defense",
  "cybersecurity",
  "consumer",
  "financials",
  "energy",
  "cash",
  "gold",
  "broad",
] as const;

export type ThemeId = typeof THEME_IDS[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  "ai-infrastructure": "AI Infrastructure",
  "semiconductors":    "Semiconductors",
  "healthcare":        "Healthcare",
  "defense":           "Defense",
  "cybersecurity":     "Cybersecurity",
  "consumer":          "Consumer",
  "financials":        "Financials",
  "energy":            "Energy",
  "cash":              "Cash",
  "gold":              "Gold",
  "broad":             "Broad Market",
};

// Map ticker → primary theme (one ticker = one theme)
export const TICKER_THEME_MAP: Record<string, ThemeId> = {
  // AI Infrastructure
  NVDA:  "ai-infrastructure",
  MSFT:  "ai-infrastructure",
  GOOGL: "ai-infrastructure",
  GOOG:  "ai-infrastructure",
  META:  "ai-infrastructure",
  AMZN:  "ai-infrastructure", // AWS drives primary value
  AAPL:  "ai-infrastructure",
  SMCI:  "ai-infrastructure",
  // Semiconductors
  TSM:   "semiconductors",
  ASML:  "semiconductors",
  AMD:   "semiconductors",
  INTC:  "semiconductors",
  QCOM:  "semiconductors",
  MU:    "semiconductors",
  AMAT:  "semiconductors",
  LRCX:  "semiconductors",
  // Healthcare
  LLY:   "healthcare",
  NVO:   "healthcare",
  JNJ:   "healthcare",
  UNH:   "healthcare",
  ABBV:  "healthcare",
  MRK:   "healthcare",
  PFE:   "healthcare",
  AMGN:  "healthcare",
  // Defense
  ITA:   "defense",
  LMT:   "defense",
  RTX:   "defense",
  NOC:   "defense",
  GD:    "defense",
  HII:   "defense",
  BA:    "defense",
  // Cybersecurity
  CRWD:  "cybersecurity",
  NET:   "cybersecurity",
  PANW:  "cybersecurity",
  ZS:    "cybersecurity",
  FTNT:  "cybersecurity",
  S:     "cybersecurity",
  // Consumer
  SHOP:  "consumer",
  MELI:  "consumer",
  TSLA:  "consumer",
  HD:    "consumer",
  NKE:   "consumer",
  SBUX:  "consumer",
  // Financials
  JPM:   "financials",
  BAC:   "financials",
  GS:    "financials",
  MS:    "financials",
  V:     "financials",
  MA:    "financials",
  // Energy
  XOM:   "energy",
  CVX:   "energy",
  COP:   "energy",
  // Cash & equivalents
  CASH:  "cash",
  SGOV:  "cash",
  SHY:   "cash",
  TLT:   "cash",
  BND:   "cash",
  // Gold / hard assets
  GLDM:  "gold",
  GLD:   "gold",
  IAU:   "gold",
  // Broad market ETFs
  VOO:   "broad",
  SPY:   "broad",
  VTI:   "broad",
  QQQ:   "broad",
  IJH:   "broad",
  VTWO:  "broad",
  IWM:   "broad",
};

// Neutral base allocations (must sum to 100)
export const THEME_BASE_TARGETS: Record<ThemeId, number> = {
  "ai-infrastructure": 18,
  "semiconductors":     7,
  "healthcare":        12,
  "defense":            8,
  "cybersecurity":      2,
  "consumer":           5,
  "financials":         5,
  "energy":             3,
  "cash":              28,
  "gold":               7,
  "broad":              5,
};

// Regime adjustments (must sum to 0 per regime; applied to base targets)
export const THEME_REGIME_ADJUSTMENTS: Record<string, Partial<Record<ThemeId, number>>> = {
  "Risk On": {
    "ai-infrastructure": +15,
    "semiconductors":    +8,
    "cybersecurity":     +3,
    "consumer":          +2,
    "cash":              -15,
    "healthcare":        -5,
    "defense":           -5,
    "gold":              -3,
  },
  "Neutral": {},
  "Risk Off": {
    "cash":              +20,
    "gold":              +5,
    "defense":           +5,
    "healthcare":        +5,
    "ai-infrastructure": -15,
    "semiconductors":    -8,
    "consumer":          -7,
    "financials":        -5,
  },
};

// Keywords for newsletter intelligence overlay (case-insensitive match on title + keyPoints)
export const THEME_KEYWORDS: Record<ThemeId, string[]> = {
  "ai-infrastructure": ["artificial intelligence", " AI ", "cloud", "data center", "ChatGPT", "OpenAI", "Nvidia", "NVDA", "GPU", "LLM", "machine learning", "Microsoft AI", "Google AI", "AWS"],
  "semiconductors":    ["semiconductor", "chip", "chipmaker", "TSMC", "TSM", "ASML", "foundry", "wafer", "fab ", "AMD", "lithography"],
  "healthcare":        ["healthcare", "health care", "biotech", "pharmaceutical", "pharma", "FDA", "drug approval", "Eli Lilly", "Novo Nordisk", "GLP-1", "obesity drug"],
  "defense":           ["defense", "defence", "military", "weapon", "NATO", "geopolitical", "war", "conflict", "Lockheed", "Raytheon", "Pentagon"],
  "cybersecurity":     ["cybersecurity", "cyber security", "cyber attack", "ransomware", "hack", "breach", "CrowdStrike", "Palo Alto", "Cloudflare"],
  "consumer":          ["consumer", "retail", "spending", "discretionary", "e-commerce", "consumer confidence"],
  "financials":        ["bank", "banking", "financial", "Federal Reserve", "interest rate", "lending", "credit", "Goldman", "JPMorgan"],
  "energy":            ["oil", "gas", "energy", "crude", "OPEC", "petroleum", "renewable energy"],
  "cash":              ["cash", "treasury", "money market", "yield", "T-bill", "fixed income", "bond yield"],
  "gold":              ["gold", "precious metal", "GLD", "GLDM", "store of value", "safe haven"],
  "broad":             ["S&P 500", "Nasdaq", "broad market", "index fund", "VIX", "market rally", "market selloff"],
};
