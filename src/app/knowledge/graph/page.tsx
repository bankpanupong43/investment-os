"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const KnowledgeGraph = dynamic(
  () => import("@/components/knowledge/KnowledgeGraph"),
  { ssr: false, loading: () => (
    <div className="h-full flex items-center justify-center text-sm text-[#8E8E8E]">
      Loading knowledge graph…
    </div>
  )},
);

function SubNav() {
  return (
    <div className="bg-white border-b border-[#EEEEEE] px-6 flex items-center shrink-0">
      <Link
        href="/knowledge"
        className="px-4 py-3 text-sm font-medium text-[#5C5E62] hover:text-[#171A20] border-b-2 border-transparent transition-colors"
      >
        Overview
      </Link>
      <Link
        href="/knowledge/graph"
        className="px-4 py-3 text-sm font-semibold text-[#3E6AE1] border-b-2 border-[#3E6AE1]"
      >
        Graph
      </Link>
    </div>
  );
}

function GraphContent() {
  const params    = useSearchParams();
  const focusNode = params.get("focus");

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 0px)" }}>
      <SubNav />
      <div className="flex-1 overflow-hidden">
        <KnowledgeGraph focusNode={focusNode} />
      </div>
    </div>
  );
}

export default function KnowledgeGraphPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col overflow-hidden" style={{ height: "100vh" }}>
        <div className="bg-white border-b border-[#EEEEEE] px-6 flex items-center shrink-0">
          <span className="px-4 py-3 text-sm text-[#5C5E62]">Overview</span>
          <span className="px-4 py-3 text-sm font-semibold text-[#3E6AE1] border-b-2 border-[#3E6AE1]">Graph</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-[#8E8E8E]">
          Loading…
        </div>
      </div>
    }>
      <GraphContent />
    </Suspense>
  );
}
