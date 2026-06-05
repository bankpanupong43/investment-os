import { BaseAgent } from "./base";
import { portfolioTools } from "@/tools/portfolio";
import { journalTools } from "@/tools/journal";
import { newsTools } from "@/tools/news";
import { marketTools } from "@/tools/market";
import { thesisEvaluationTools } from "@/tools/thesis-evaluation";
import { THESIS_EVALUATOR_SYSTEM_PROMPT } from "@/prompts/thesis-evaluator";

export class ThesisEvaluatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "ThesisEvaluator",
      systemPrompt: THESIS_EVALUATOR_SYSTEM_PROMPT,
      tools: [
        ...thesisEvaluationTools,
        ...portfolioTools,
        ...journalTools,
        ...newsTools,
        ...marketTools,
      ],
      maxIterations: 20,
    });
  }

  /** Score all active positions. Returns evaluations ordered by overall score ascending (weakest first). */
  async evaluateAll() {
    return this.run(
      "Evaluate the thesis for every active portfolio position. " +
        "For each position, call get_thesis_for_evaluation, assess every assumption, outcome, and risk with specific evidence, " +
        "then call save_thesis_evaluation. After completing all evaluations, summarize which positions have the weakest theses."
    );
  }

  /** Score a single position's thesis. */
  async evaluatePosition(ticker: string) {
    return this.run(
      `Evaluate the investment thesis for ${ticker}. ` +
        "Load the full thesis with get_thesis_for_evaluation, then systematically assess each key assumption, " +
        "expected outcome, and risk against current evidence. " +
        "Be specific — cite actual metrics, events, and data points. " +
        "Then save the complete evaluation with save_thesis_evaluation."
    );
  }

  /** Compare the thesis against a specific event (e.g., earnings release). */
  async evaluateAfterEvent(ticker: string, eventDescription: string) {
    return this.run(
      `Evaluate the ${ticker} thesis in light of this event: "${eventDescription}". ` +
        "Load the thesis, then assess which assumptions, outcomes, and risks are affected by this event. " +
        "Focus the evaluation on how this specific event changes your view of each component. " +
        "Save the evaluation with a note about which components were most impacted."
    );
  }

  /** Compare two thesis versions and evaluate the evolution. */
  async compareVersions(ticker: string, versionA?: number, versionB?: number) {
    const versionNote =
      versionA && versionB ? `versions ${versionA} and ${versionB}` : "the original and current versions";
    return this.run(
      `Compare the thesis evolution for ${ticker}: ${versionNote}. ` +
        "First fetch the current thesis with get_thesis_for_evaluation, then call compare_thesis_versions. " +
        "Analyze what changed between versions: which assumptions were added/removed/modified, " +
        "which outcomes evolved, and which risks were re-assessed. " +
        "Was each revision appropriate given what was known at the time?"
    );
  }
}
