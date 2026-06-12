"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionCategory = "portfolio" | "theme" | "company" | "macro";
type ActionCategory = "BUY" | "ADD" | "HOLD" | "REDUCE" | "EXIT" | "WATCH";

interface RecommendedAction {
  category: ActionCategory;
  ticker?: string;
  title: string;
  reason: string;
  confidence: number;
}

interface RelatedEntity {
  type: "company" | "theme" | "decision" | "regime";
  id: string;
  label: string;
}

interface CopilotAnswer {
  question: string;
  category: QuestionCategory;
  confidence: number;
  answer: string;
  sources: string[];
  details: Record<string, unknown>;
  recommendedActions: RecommendedAction[];
  relatedEntities: RelatedEntity[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  "What should I do next?",
  "Should I remove GLDM?",
  "Why is Defense overweight?",
  "What breaks my NVDA thesis?",
  "What is the current regime?",
  "Why is AI Infrastructure increasing?",
  "What breaks my GLDM thesis?",
  "Why do I own ITA?",
];

const CATEGORY_CONFIG: Record<QuestionCategory, { label: string; bg: string; text: string; border: string }> = {
  portfolio: { label: "Portfolio",  bg: "#EEF3FD", text: "#3E6AE1", border: "#BFDBFE" },
  theme:     { label: "Theme",      bg: "#F0FDF4", text: "#15803D", border: "#86EFAC" },
  company:   { label: "Company",    bg: "#FFF7ED", text: "#92400E", border: "#FED7AA" },
  macro:     { label: "Macro",      bg: "#F4F4F4", text: "#5C5E62", border: "#DDDDDD" },
};

const ACTION_STYLE: Record<ActionCategory, { bg: string; text: string }> = {
  EXIT:   { bg: "#FEF2F2", text: "#991B1B" },
  REDUCE: { bg: "#FFF7ED", text: "#92400E" },
  ADD:    { bg: "#F0FDF4", text: "#15803D" },
  BUY:    { bg: "#EEF3FD", text: "#3E6AE1" },
  WATCH:  { bg: "#FFFBEB", text: "#D97706" },
  HOLD:   { bg: "#F4F4F4", text: "#5C5E62" },
};

const ENTITY_HREF: Record<RelatedEntity["type"], (id: string) => string> = {
  company:  id => `/portfolio/${id}`,
  theme:    id => `/portfolio?tab=allocation`,
  decision: id => `/portfolio/${id}`,
  regime:   _  => `/intelligence`,
};

// ─── Components ───────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "#15803D" : value >= 65 ? "#D97706" : "#DC2626";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}%</span>
    </div>
  );
}

function AnswerPanel({ answer, loading }: { answer: CopilotAnswer | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-xl p-6 space-y-4">
        <div className="h-4 bg-[#EEEEEE] rounded animate-pulse w-1/3" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-3 bg-[#EEEEEE] rounded animate-pulse" style={{ width: `${100 - i * 10}%` }} />
          ))}
        </div>
        <div className="h-3 bg-[#EEEEEE] rounded animate-pulse w-2/3" />
      </div>
    );
  }

  if (!answer) return null;

  const catConf = CATEGORY_CONFIG[answer.category];
  const lines   = answer.answer.split("\n");

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide shrink-0 mt-0.5"
          style={{ backgroundColor: catConf.bg, color: catConf.text }}
        >
          {catConf.label}
        </span>
        <div className="text-sm text-[#5C5E62] italic leading-relaxed">&ldquo;{answer.question}&rdquo;</div>
      </div>

      {/* Confidence */}
      <div>
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-1.5">Confidence</div>
        <ConfidenceBar value={answer.confidence} />
      </div>

      {/* Answer */}
      <div>
        <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Answer</div>
        <div className="space-y-1.5">
          {lines.map((line, i) => {
            if (!line.trim()) return null;
            const isHeader = !line.startsWith("•") && !line.startsWith("-") && !line.match(/^\d+\./) && !line.includes("|") && i > 0 && lines[i - 1]?.trim() === "";
            const isBullet = line.startsWith("•") || line.startsWith("-");
            const isNumber = /^\d+\./.test(line);
            return (
              <div
                key={i}
                className={
                  isHeader
                    ? "text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest pt-1"
                    : isBullet || isNumber
                    ? "text-sm text-[#5C5E62] pl-2"
                    : "text-sm text-[#393C41]"
                }
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sources */}
      {answer.sources.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Sources Used</div>
          <div className="flex flex-wrap gap-1.5">
            {answer.sources.map(src => (
              <span key={src} className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#F4F4F4] text-[#8E8E8E]">
                {src}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {answer.recommendedActions.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Recommended Actions</div>
          <div className="space-y-2">
            {answer.recommendedActions.map((a, i) => {
              const s = ACTION_STYLE[a.category] ?? ACTION_STYLE.HOLD;
              const href = a.ticker
                ? (["EXIT", "REDUCE", "ADD"].includes(a.category) ? `/portfolio/${a.ticker}` : `/research?q=${a.ticker}`)
                : "/portfolio";
              return (
                <Link
                  key={i}
                  href={href}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#EEEEEE] hover:bg-[#F4F4F4] transition-colors"
                >
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide shrink-0"
                    style={{ backgroundColor: s.bg, color: s.text }}
                  >
                    {a.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#171A20] leading-tight">{a.title}</div>
                    <div className="text-xs text-[#8E8E8E] truncate mt-0.5">{a.reason}</div>
                  </div>
                  <span className="text-xs font-bold tabular-nums shrink-0" style={{
                    color: a.confidence >= 80 ? "#15803D" : a.confidence >= 65 ? "#D97706" : "#DC2626",
                  }}>
                    {a.confidence}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Related Entities */}
      {answer.relatedEntities.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-2">Related</div>
          <div className="flex flex-wrap gap-1.5">
            {answer.relatedEntities.map(e => (
              <Link
                key={`${e.type}-${e.id}`}
                href={ENTITY_HREF[e.type](e.id)}
                className="text-xs font-medium px-2.5 py-1 rounded-full border border-[#EEEEEE] text-[#3E6AE1] hover:bg-[#EEF3FD] transition-colors"
              >
                {e.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AskPage() {
  const [question, setQuestion]   = useState("");
  const [answer, setAnswer]       = useState<CopilotAnswer | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const answerRef                 = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [question]);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setQuestion(q);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json() as CopilotAnswer;
      setAnswer(data);
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-[#171A20]">CIO Copilot</h1>
        <p className="text-[#8E8E8E] text-sm mt-0.5">Ask one question. Brain OS pulls from every engine.</p>
      </div>

      {/* Question input */}
      <form onSubmit={handleSubmit} className="bg-white border border-[#EEEEEE] rounded-xl p-4 space-y-3">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Brain OS..."
          rows={1}
          className="w-full resize-none text-sm text-[#171A20] placeholder-[#AAAAAA] bg-transparent outline-none leading-relaxed"
          style={{ minHeight: "2rem", maxHeight: "10rem" }}
        />
        <div className="flex items-center justify-between pt-1 border-t border-[#F4F4F4]">
          <span className="text-[10px] text-[#AAAAAA]">Enter to submit, Shift+Enter for newline</span>
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#3E6AE1" }}
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      {/* Suggested questions */}
      {!answer && !loading && (
        <div>
          <div className="text-[10px] font-semibold text-[#AAAAAA] uppercase tracking-widest mb-3">Suggested Questions</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-[#EEEEEE] text-[#5C5E62] hover:border-[#3E6AE1] hover:text-[#3E6AE1] hover:bg-[#EEF3FD] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl p-4 text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Answer panel */}
      <div ref={answerRef}>
        <AnswerPanel answer={answer} loading={loading} />
      </div>

      {/* Ask another question button */}
      {answer && !loading && (
        <button
          onClick={() => { setAnswer(null); setQuestion(""); textareaRef.current?.focus(); }}
          className="text-sm text-[#3E6AE1] hover:underline"
        >
          ← Ask another question
        </button>
      )}
    </div>
  );
}
