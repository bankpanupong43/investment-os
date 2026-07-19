export interface DecisionReview {
  id: string;
  ticker: string;
  thesisStatus: string;
  verdict: string;
  confidence: number;
  opportunityScore: number;
  lessonLearned: string;
  reviewDate: string;
}

export const THESIS_VERDICT_STYLE: Record<string, { bg: string; text: string }> = {
  "Strengthen": { bg: "#F0FDF4", text: "#15803D" },
  "Hold":       { bg: "#EEF3FD", text: "#3E6AE1" },
  "Monitor":    { bg: "#FFFBEB", text: "#D97706" },
  "Reduce":     { bg: "#FEF9EC", text: "#92400E" },
  "Exit":       { bg: "#FEF2F2", text: "#991B1B" },
};

export const THESIS_STATUS_STYLE: Record<string, { color: string }> = {
  "Confirmed":           { color: "#15803D" },
  "Partially Confirmed": { color: "#D97706" },
  "Broken":              { color: "#DC2626" },
};

export const HEALTH_STYLE: Record<string, string> = {
  intact: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  weakening: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  broken: "text-[#c0392b] bg-[#fdf0ee] border-[#f5c6c1]",
  monitoring: "text-[#3E6AE1] bg-[#EEF3FD] border-[#bfcffd]",
};

export const STATUS_STYLE: Record<string, string> = {
  active: "text-[#2d7d46] bg-[#eef7f1] border-[#c3e6cf]",
  closed: "text-[#5C5E62] bg-[#F4F4F4] border-[#EEEEEE]",
  trimmed: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
};
