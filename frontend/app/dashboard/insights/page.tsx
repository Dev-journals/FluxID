"use client";

import { Sparkles } from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import ExplanationCard from "../../components/ExplanationCard";
import AssetBreakdown from "../../components/AssetBreakdown";

export default function InsightsPage() {
  const { analysis, analyzedAddress, isAnalyzing } = useAnalysis();

  return (
    <>
      <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
        Insights
      </h1>
      <p style={{ color: "var(--foreground-muted)", fontSize: 14 }} className="mb-6">
        Understand what this wallet&apos;s activity says about its financial behavior.
      </p>

      {isAnalyzing && (
        <div className="card p-6 text-center">
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>Generating insight…</p>
        </div>
      )}

      {!isAnalyzing && !analysis && (
        <div className="card p-8 text-center">
          <Sparkles size={32} style={{ color: "var(--foreground-muted)", margin: "0 auto 12px" }} />
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            Analyze a wallet to see its insight and suggestions here.
          </p>
        </div>
      )}

      {analysis && !isAnalyzing && (
        <div className="space-y-6">
          {analyzedAddress && (
            <p style={{ color: "var(--foreground-dim)", fontSize: 12 }} className="font-mono">
              Target: {analyzedAddress}
            </p>
          )}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-end pointer-events-none z-0">
              <img
                src="/3d-imgs-assest/fluxid_ai_analysis.png"
                alt="AI Analysis"
                className="w-[280px] sm:w-[400px] object-contain opacity-10 mix-blend-screen translate-y-8 translate-x-8"
              />
            </div>
            <div className="relative z-10">
              <ExplanationCard explanation={analysis.explanation} />
            </div>
          </div>
          <AssetBreakdown assets={analysis.assets} usd={analysis.usd} />
        </div>
      )}
    </>
  );
}
