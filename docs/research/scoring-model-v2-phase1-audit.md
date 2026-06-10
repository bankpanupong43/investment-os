# Scoring Model V2 Phase 1 — Audit Report
*Generated: 2026-06-10 12:29:10 UTC*

## Changes Implemented

| Dimension | V1 | V2 |
|---|---|---|
| Revenue Growth range | normalize(−10, 35) | normalize(−20, 50) |
| EPS Growth range | normalize(−20, 60) | normalize(−30, 100) |
| FCF scoring | normalize(0, 60,000); null excluded from avg | normalize(−30k, 60k); null→30; <−30k→0 |
| Weights | BQ×0.35 + G×0.25 + FS×0.20 + CA×0.15 + V×0.05 | BQ×(7/19) + G×(5/19) + FS×(4/19) + CA×(3/19) + V×0 |
| Effective weights | 35 / 25 / 20 / 15 / 5 | 36.8 / 26.3 / 21.1 / 15.8 / 0 |

---

## Top 20 Rankings — V2

| # | Ticker | Total V2 | Total V1 | Δ | BQ | Growth | FS | CA | Val |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **NVDA** | 95.5 | 96.4 | -0.9 | 97.6 | 87.2 | 98.8 | 100.0 | 50 |
| 2 | **NVO** | 82.0 | 82.4 | -0.4 | 100.0 | 62.9 | 60.8 | 100.0 | 50 |
| 3 | **LLY** | 79.0 | 74.7 | +4.3 | 91.7 | 100.0 | 24.4 | 87.5 | 50 |
| 4 | **AAPL** | 74.0 | 74.2 | -0.2 | 80.5 | 39.1 | 86.7 | 100.0 | 50 |
| 5 | **V** | 71.2 | 68.9 | +2.3 | 93.9 | 35.8 | 67.7 | 81.8 | 50 |
| 6 | **DECK** | 70.7 | 69.8 | +0.9 | 73.0 | 52.8 | 67.1 | 100.0 | 50 |
| 7 | **MA** | 70.7 | 68.6 | +2.1 | 99.2 | 41.0 | 36.1 | 100.0 | 50 |
| 8 | **TSM** | 70.4 | 81.2 | -10.8 | 80.6 | 66.4 | 62.2 | 64.5 | 50 |
| 9 | **MSFT** | 69.5 | 70.4 | -0.9 | 79.6 | 42.5 | 97.7 | 53.3 | 50 |
| 10 | **META** | 68.0 | 68.0 | +0.0 | 83.3 | 41.1 | 88.2 | 49.9 | 50 |
| 11 | **GOOGL** | 66.3 | 68.5 | -2.2 | 68.4 | 49.9 | 96.8 | 48.0 | 50 |
| 12 | **ASML** | 60.9 | 59.4 | +1.5 | 71.7 | 44.0 | 55.5 | 71.0 | 50 |
| 13 | **EXP** | 59.1 | 56.7 | +2.4 | 70.0 | 38.6 | 53.6 | 75.0 | 50 |
| 14 | **TXRH** | 53.2 | 51.1 | +2.1 | 43.3 | 39.2 | 62.2 | 87.5 | 50 |
| 15 | **MELI** | 48.7 | 50.6 | -1.9 | 37.5 | 79.9 | 37.8 | 37.5 | 50 |
| 16 | **SAP** | 48.5 | 46.9 | +1.6 | 55.0 | 38.7 | 63.1 | 30.0 | 50 |
| 17 | **AMZN** | 42.5 | 42.1 | +0.4 | 38.7 | 46.1 | 58.6 | 24.1 | 50 |
| 18 | **SHOP** | 42.4 | 41.8 | +0.6 | 39.8 | 35.8 | 67.7 | 26.0 | 50 |
| 19 | **COST** | 40.0 | 38.5 | +1.5 | 24.4 | 35.5 | 67.5 | 47.5 | 50 |
| 20 | **CELH** | 39.0 | 36.3 | +2.7 | 40.1 | 20.7 | 66.7 | 30.0 | 50 |

---

## Full Universe — Before / After

| Ticker | V1 Total | V2 Total | Δ | V1 Growth | V2 Growth | V1 FS | V2 FS |
|---|---|---|---|---|---|---|---|
| NVDA | 96.4 | 95.5 | -0.9 | 100.0 | 87.2 | 98.8 | 98.8 |
| NVO | 82.4 | 82.0 | -0.4 | 82.6 | 62.9 | 46.3 | 60.8 |
| LLY | 74.7 | 79.0 | +4.3 | 100.0 | 100.0 | 10.0 | 24.4 |
| AAPL | 74.2 | 74.0 | -0.2 | 44.9 | 39.1 | 86.7 | 86.7 |
| V | 68.9 | 71.2 | +2.3 | 39.2 | 35.8 | 57.2 | 67.7 |
| DECK | 69.8 | 70.7 | +0.9 | 66.6 | 52.8 | 50.7 | 67.1 |
| MA | 68.6 | 70.7 | +2.1 | 47.8 | 41.0 | 22.5 | 36.1 |
| TSM | 81.2 | 70.4 | -10.8 | 87.9 | 66.4 | 94.3 | 62.2 |
| MSFT | 70.4 | 69.5 | -0.9 | 49.9 | 42.5 | 97.7 | 97.7 |
| META | 68.0 | 68.0 | +0.0 | 47.3 | 41.1 | 85.4 | 88.2 |
| GOOGL | 68.5 | 66.3 | -2.2 | 62.0 | 49.9 | 96.8 | 96.8 |
| ASML | 59.4 | 60.9 | +1.5 | 52.6 | 44.0 | 40.1 | 55.5 |
| EXP | 56.7 | 59.1 | +2.4 | 44.0 | 38.6 | 37.0 | 53.6 |
| TXRH | 51.1 | 53.2 | +2.1 | 44.9 | 39.2 | 45.6 | 62.2 |
| MELI | 50.6 | 48.7 | -1.9 | 100.0 | 79.9 | 21.7 | 37.8 |
| SAP | 46.9 | 48.5 | +1.6 | 44.1 | 38.7 | 47.9 | 63.1 |
| AMZN | 42.1 | 42.5 | +0.4 | 55.9 | 46.1 | 42.2 | 58.6 |
| SHOP | 41.8 | 42.4 | +0.6 | 44.6 | 35.8 | 51.6 | 67.7 |
| COST | 38.5 | 40.0 | +1.5 | 38.9 | 35.5 | 53.3 | 67.5 |
| CELH | 36.3 | 39.0 | +2.7 | 21.1 | 20.7 | 50.1 | 66.7 |
| JPM | 38.1 | 37.6 | -0.5 | 28.2 | 28.8 | 50.0 | 50.0 |
| BABA | 34.3 | 28.4 | -5.9 | 15.5 | 20.9 | 91.7 | 60.8 |
| TSLA | 21.7 | 24.4 | +2.7 | 7.9 | 12.2 | 54.2 | 68.9 |
| PCVX | 22.5 | 13.7 | -8.8 | 0.0 | 0.0 | 100.0 | 65.0 |

---

## Biggest Winners (top 10 by Δ)

| Ticker | V1 | V2 | Δ | Primary Driver |
|---|---|---|---|---|
| **LLY** | 74.7 | 79.0 | +4.3 | FCF range shift (FCF=8000M) |
| **CELH** | 36.3 | 39.0 | +2.7 | FCF range shift (FCF=100M) |
| **TSLA** | 21.7 | 24.4 | +2.7 | FCF range shift (FCF=7245M) |
| **EXP** | 56.7 | 59.1 | +2.4 | FCF range shift (FCF=400M) |
| **V** | 68.9 | 71.2 | +2.3 | FCF range shift (FCF=22033M) |
| **MA** | 68.6 | 70.7 | +2.1 | FCF range shift (FCF=11000M) |
| **TXRH** | 51.1 | 53.2 | +2.1 | FCF range shift (FCF=320M) |
| **SAP** | 46.9 | 48.5 | +1.6 | FCF range shift (FCF=5500M) |
| **ASML** | 59.4 | 60.9 | +1.5 | FCF range shift (FCF=4500M) |
| **COST** | 38.5 | 40.0 | +1.5 | FCF range shift (FCF=8916M) |

---

## Biggest Losers (bottom 10 by Δ)

| Ticker | V1 | V2 | Δ | Primary Driver |
|---|---|---|---|---|
| **TSM** | 81.2 | 70.4 | -10.8 | FCF null penalty (FCF was excluded, now 30 → drags FS avg) |
| **PCVX** | 22.5 | 13.7 | -8.8 | FCF null penalty (FCF was excluded, now 30 → drags FS avg) |
| **BABA** | 34.3 | 28.4 | -5.9 | FCF null penalty (FCF was excluded, now 30 → drags FS avg) |
| **GOOGL** | 68.5 | 66.3 | -2.2 | Growth ceilings widened — previously near ceiling (RevGr=15.1%, EPSGr=34.5%) |
| **MELI** | 50.6 | 48.7 | -1.9 | Growth ceilings widened — previously near ceiling (RevGr=38.0%, EPSGr=70.0%) |
| **NVDA** | 96.4 | 95.5 | -0.9 | Growth ceilings widened — previously near ceiling (RevGr=65.5%, EPSGr=66.7%) |
| **MSFT** | 70.4 | 69.5 | -0.9 | Growth ceilings widened — previously near ceiling (RevGr=14.9%, EPSGr=15.6%) |
| **JPM** | 38.1 | 37.6 | -0.5 | Growth ceilings widened — previously near ceiling (RevGr=3.3%, EPSGr=1.5%) |
| **NVO** | 82.4 | 82.0 | -0.4 | Growth ceilings widened — previously near ceiling (RevGr=25.0%, EPSGr=50.0%) |
| **AAPL** | 74.2 | 74.0 | -0.2 | Growth ceilings widened — previously near ceiling (RevGr=6.4%, EPSGr=22.7%) |

---

## All Changes Greater Than 5 Points

| Ticker | V1 | V2 | Δ | Growth V1→V2 | FS V1→V2 | FCF | Notes |
|---|---|---|---|---|---|---|---|
| **BABA** | 34.3 | 28.4 | -5.9 | 15.5 → 20.9 | 91.7 → 60.8 | null | FCF null→30 penalty |
| **PCVX** | 22.5 | 13.7 | -8.8 | 0.0 → 0.0 | 100.0 → 65.0 | null | FCF null→30 penalty |
| **TSM** | 81.2 | 70.4 | -10.8 | 87.9 → 66.4 | 94.3 → 62.2 | null | FCF null→30 penalty |

---

## Dimension Changes — Growth

Growth scoring affected every ticker. Wider ceilings mean companies that were previously at the ceiling now score lower; companies with truly exceptional growth (>50% revenue, >100% EPS) are now differentiable.

| Ticker | RevGr% | EPSGr% | V1 Growth | V2 Growth | Δ Growth |
|---|---|---|---|---|---|
| BABA | 2.7 | -17.9 | 15.5 | 20.9 | +5.4 |
| TSLA | -2.9 | -47.0 | 7.9 | 12.2 | +4.3 |
| COST | 8.2 | 10.0 | 38.9 | 35.5 | -3.4 |
| V | 11.3 | 4.8 | 39.2 | 35.8 | -3.4 |
| EXP | 6.0 | 22.0 | 44.0 | 38.6 | -5.4 |
| SAP | 10.0 | 15.0 | 44.1 | 38.7 | -5.4 |
| TXRH | 9.0 | 18.0 | 44.9 | 39.2 | -5.7 |
| AAPL | 6.4 | 22.7 | 44.9 | 39.1 | -5.8 |
| META | 22.2 | -1.6 | 47.3 | 41.1 | -6.2 |
| MA | 11.5 | 18.2 | 47.8 | 41.0 | -6.8 |
| MSFT | 14.9 | 15.6 | 49.9 | 42.5 | -7.4 |
| ASML | 12.0 | 25.0 | 52.6 | 44.0 | -8.6 |
| SHOP | 30.1 | -39.4 | 44.6 | 35.8 | -8.8 |
| AMZN | 12.4 | 29.7 | 55.9 | 46.1 | -9.8 |
| GOOGL | 15.1 | 34.5 | 62.0 | 49.9 | -12.1 |
| NVDA | 65.5 | 66.7 | 100.0 | 87.2 | -12.8 |
| DECK | 16.2 | 40.0 | 66.6 | 52.8 | -13.8 |
| NVO | 25.0 | 50.0 | 82.6 | 62.9 | -19.7 |
| MELI | 38.0 | 70.0 | 100.0 | 79.9 | -20.1 |
| TSM | 33.0 | 44.3 | 87.9 | 66.4 | -21.5 |

## Dimension Changes — Financial Strength

FCF now always contributes to financial strength. Null FCF penalized at 30. Negative FCF scored on a signed range rather than zeroed.

| Ticker | FCF ($M) | V1 FS | V2 FS | Δ FS | Note |
|---|---|---|---|---|---|
| CELH | 100 | 50.1 | 66.7 | +16.6 | FCF range shift |
| EXP | 400 | 37.0 | 53.6 | +16.6 | FCF range shift |
| TXRH | 320 | 45.6 | 62.2 | +16.6 | FCF range shift |
| AMZN | -470 | 42.2 | 58.6 | +16.4 | neg FCF now scored |
| DECK | 800 | 50.7 | 67.1 | +16.4 | FCF range shift |
| SHOP | 2,128 | 51.6 | 67.7 | +16.1 | FCF range shift |
| MELI | 2,000 | 21.7 | 37.8 | +16.1 | FCF range shift |
| ASML | 4,500 | 40.1 | 55.5 | +15.4 | FCF range shift |
| SAP | 5,500 | 47.9 | 63.1 | +15.2 | FCF range shift |
| TSLA | 7,245 | 54.2 | 68.9 | +14.7 | FCF range shift |
| NVO | 8,000 | 46.3 | 60.8 | +14.5 | FCF range shift |
| LLY | 8,000 | 10.0 | 24.4 | +14.4 | FCF range shift |
| COST | 8,916 | 53.3 | 67.5 | +14.2 | FCF range shift |
| MA | 11,000 | 22.5 | 36.1 | +13.6 | FCF range shift |
| V | 22,033 | 57.2 | 67.7 | +10.5 | FCF range shift |
| META | 49,627 | 85.4 | 88.2 | +2.8 | FCF range shift |
| BABA | null | 91.7 | 60.8 | -30.9 | null→30 penalty |
| TSM | null | 94.3 | 62.2 | -32.1 | null→30 penalty |
| PCVX | null | 100.0 | 65.0 | -35.0 | null→30 penalty |

---

## Ranking Movement

| Ticker | V1 Rank | V2 Rank | Move |
|---|---|---|---|
| NVDA | 1 | 1 | — |
| NVO | 2 | 2 | — |
| LLY | 4 | 3 | ↑1 |
| AAPL | 5 | 4 | ↑1 |
| V | 8 | 5 | ↑3 |
| DECK | 7 | 6 | ↑1 |
| MA | 9 | 7 | ↑2 |
| TSM | 3 | 8 | ↓5 |
| MSFT | 6 | 9 | ↓3 |
| META | 11 | 10 | ↑1 |
| GOOGL | 10 | 11 | ↓1 |
| ASML | 12 | 12 | — |
| EXP | 13 | 13 | — |
| TXRH | 14 | 14 | — |
| MELI | 15 | 15 | — |
| SAP | 16 | 16 | — |
| AMZN | 17 | 17 | — |
| SHOP | 18 | 18 | — |
| COST | 19 | 19 | — |
| CELH | 21 | 20 | ↑1 |
| JPM | 20 | 21 | ↓1 |
| BABA | 22 | 22 | — |
| TSLA | 24 | 23 | ↑1 |
| PCVX | 23 | 24 | ↓1 |

---

*Model version: V2 Phase 1. Sector-adjusted gross margins, bank heuristics, and market cap valuation are reserved for later phases.*