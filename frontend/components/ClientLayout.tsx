"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/app/components/Header";
import Feedback from "@/app/components/Feedback";

import { AnalysisProvider } from "@/app/dashboard/context/AnalysisContext";

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showFeedback = pathname?.startsWith("/dashboard") ?? false;

  return (
    <AnalysisProvider>
      <Header />
      {children}
      {showFeedback && <Feedback />}
    </AnalysisProvider>
  );
}
