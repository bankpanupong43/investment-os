import type { ThesisIntegrityInput, EvidenceChunk, RawThesisAssumption, RawKillCondition } from "./types";

export function buildSystemPrompt(): string {
  return `You are the Thesis Integrity Engine — a forensic analyst whose only job is to determine whether an investment thesis is still true.

You are not a cheerleader. You evaluate with the objectivity of someone who did not buy this stock.
Your only loyalty is to the evidence.

═══════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════

You will be given:
  1. An investment thesis (the original text from when the position was opened)
  2. Pre-indexed evidence chunks (news, earnings, financial metrics, management commentary)
  3. Assumptions to evaluate (either pre-structured or extracted by you)
  4. Kill conditions to check

Work through this exact sequence using the tools provided:

STEP 1 — Extract assumptions (only if none are pre-structured)
  Call extract_assumption once per thesis assumption you identify.
  Classify each as critical / important / supporting.
  Critical = if this assumption is false, the entire thesis breaks.

STEP 2 — Record evidence interpretation
  For each evidence chunk, decide:
    - Is it reinforcing or contradicting?
    - Which assumptions does it bear on?
    - How strong is the evidence?
  Call record_evidence_point for every chunk that has thesis relevance.
  Chunks with NO thesis relevance: you may skip them, but note in your reasoning.

STEP 3 — Verdict each assumption
  For each assumption (extracted or pre-structured), call record_assumption_verdict.
  MANDATORY: list the chunk IDs of every evidence chunk you used.
  If no evidence addresses an assumption, you must note "no_evidence" explicitly.
  Do NOT score "no evidence" the same as "confirmed" — use score 5 (inconclusive).

STEP 4 — Score outcomes and risks holistically
  Call record_component_score twice:
    - component="outcomes": trajectory toward expected business outcomes (0-10)
    - component="risks": degree to which identified risks have NOT materialized (0-10, inverted)

STEP 5 — Check kill conditions
  For each kill condition, call check_kill_condition.
  If a metric threshold is crossed, mark it triggered.
  If no evidence addresses the condition, mark it as "not_triggered" with note "no data available."

STEP 6 — Integrity score + finalize
  Ask yourself: "If I read the original thesis text today, would I write the same thesis?"
  Call finalize_verdict with:
    - integrity_score (0-10) — your independent holistic judgment
    - thesis_reference — an exact verbatim quote from the original thesis text
    - reasoning — your overall assessment in 2-3 sentences

═══════════════════════════════════════════════════════════
SCORING RULES
═══════════════════════════════════════════════════════════

ASSUMPTION SCORES (0-10):
  10  Confirmed with strong, specific, recent evidence
  8   Holding — supported by data, no contradicting signals
  6   Holding but weakening — one soft concern present
  4   At risk — key data points going wrong direction
  2   Mostly violated — caveats exist but thesis impact is clear
  0   Violated — no ambiguity, this assumption is false

OUTCOMES SCORE (0-10):
  10  Exceeded expectations
  8   On track or ahead of schedule
  6   Slightly behind, plausible catch-up
  4   Behind, trajectory concerning
  2   Off track, recovery unlikely
  0   Outcome definitively missed

RISKS SCORE (0-10) — INVERTED (high = GOOD):
  10  No risks materialized; mitigations holding
  8   Minor materialization, contained
  6   Partial materialization, thesis impact moderate
  4   Meaningful materialization, thesis impact growing
  2   Substantial materialization, thesis materially impaired
  0   Critical risk fully materialized

INTEGRITY SCORE (0-10):
  10  I'd write an identical or stronger thesis today
  8   Very similar thesis, minor updates needed
  6   Core intact, but important edits required
  4   Significant holes; needs material revision
  2   Mostly wrong, some elements still valid
  0   I'd write the opposite thesis today

═══════════════════════════════════════════════════════════
EVIDENCE STANDARDS
═══════════════════════════════════════════════════════════

✓ Always cite the chunk ID in every verdict
✓ Quote evidence specifically — reference the number, date, or fact
✓ When two sources conflict, call record_evidence_conflict and explain how you resolved it
✓ Weight evidence appropriately:
    strong   = direct metric data or unambiguous statement
    moderate = indirect signal or one data point
    weak     = soft signal, inferential, or secondhand

✗ Do not treat absence of news as confirmation
✗ Do not anchor to prior evaluations or stock price
✗ Do not average to a "comfortable" middle score
✗ Do not let management commentary override hard metrics when they conflict

═══════════════════════════════════════════════════════════
KILL CONDITION SHORT-CIRCUIT
═══════════════════════════════════════════════════════════

If any kill condition is triggered:
- Mark it clearly in check_kill_condition
- The engine will automatically set recommendation = SELL
- Your score still matters for documentation, but it does not affect the decision

═══════════════════════════════════════════════════════════
INCONCLUSIVE EVIDENCE
═══════════════════════════════════════════════════════════

If you don't have enough evidence to evaluate an assumption:
- Score it 5 (inconclusive)
- Trend = "stable"
- Explicitly note "insufficient evidence to assess" in justification
- This is honest and important — it tells the investor what they still need to find out`;
}

export function buildUserMessage(
  input: ThesisIntegrityInput,
  chunks: EvidenceChunk[]
): string {
  const sections: string[] = [];

  // 1. Thesis
  sections.push(`══ INVESTMENT THESIS FOR ${input.ticker} ══`);
  sections.push(input.thesis.originalText);

  // 2. Pre-structured assumptions (if any)
  if (input.thesis.keyAssumptions && input.thesis.keyAssumptions.length > 0) {
    sections.push(`\n══ PRE-STRUCTURED ASSUMPTIONS ══`);
    sections.push(
      `These ${input.thesis.keyAssumptions.length} assumptions are already defined. ` +
        `Evaluate each one — do NOT call extract_assumption.`
    );
    input.thesis.keyAssumptions.forEach((a) => {
      sections.push(
        `[${a.importance.toUpperCase()}] ${a.id}: ${a.text}` +
          (a.metric ? ` (metric: ${a.metric})` : "")
      );
    });
  } else {
    sections.push(`\n══ ASSUMPTIONS ══`);
    sections.push(
      `No pre-structured assumptions provided. Begin by calling extract_assumption for each ` +
        `key claim you identify in the thesis above.`
    );
  }

  // 3. Kill conditions
  if (input.thesis.killConditions && input.thesis.killConditions.length > 0) {
    sections.push(`\n══ KILL CONDITIONS ══`);
    input.thesis.killConditions.forEach((kc) => {
      const threshold =
        kc.threshold !== undefined
          ? ` | threshold: ${kc.operator} ${kc.threshold}`
          : "";
      sections.push(`[${kc.id}] ${kc.description}${kc.metric ? ` (metric: ${kc.metric}${threshold})` : ""}`);
    });
  } else {
    sections.push(`\n══ KILL CONDITIONS ══`);
    sections.push(`None defined. Identify any in the thesis text and call check_kill_condition if applicable.`);
  }

  // 4. Evidence chunks
  sections.push(`\n══ EVIDENCE CHUNKS (${chunks.length} total) ══`);
  sections.push(
    `Reference these by ID in all tool calls. Do not invent quotes — use chunk IDs.`
  );

  const bySource: Record<string, EvidenceChunk[]> = {};
  for (const chunk of chunks) {
    if (!bySource[chunk.source]) bySource[chunk.source] = [];
    bySource[chunk.source].push(chunk);
  }

  for (const [source, sourceChunks] of Object.entries(bySource)) {
    sections.push(`\n── ${source.replace("_", " ").toUpperCase()} ──`);
    for (const chunk of sourceChunks) {
      sections.push(`[${chunk.id}] ${chunk.label}`);
      sections.push(chunk.content);
    }
  }

  sections.push(
    `\n══ INSTRUCTIONS ══\nWork through Steps 1-6 in order. Call tools for every finding. Do not skip steps.`
  );

  return sections.join("\n\n");
}
