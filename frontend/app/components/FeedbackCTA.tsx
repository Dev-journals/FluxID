"use client";

import { MessageSquarePlus, ExternalLink } from "lucide-react";
import { FEEDBACK_FORM_URL } from "../../lib/constants";
import { OPEN_FEEDBACK_EVENT } from "./Feedback";

// Dashboard call-to-action for community growth. Two distinct actions:
//  - "Give Feedback" → opens the external Google Form (formal onboarding +
//    proof-of-usage tracking).
//  - "Join Beta" → opens the in-app feedback widget (backend-connected), NOT
//    the form.
export default function FeedbackCTA() {
  const openInAppFeedback = () => {
    window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT));
  };

  return (
    <div className="card p-4 sm:p-6 mt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 16 }} className="mb-1">
            Give feedback &amp; join the beta
          </h3>
          <p style={{ color: "var(--foreground-muted)", fontSize: 13, lineHeight: 1.5 }}>
            Your input shapes what we build next. Give formal feedback on the Google Form, or
            drop a quick note in-app to join the beta.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="card-primary inline-flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-[var(--background)] hover:opacity-90 transition-opacity"
          >
            <ExternalLink size={16} />
            Give Feedback
          </a>
          <button
            onClick={openInAppFeedback}
            className="pressed inline-flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-[var(--foreground)] hover:opacity-90 transition-opacity"
          >
            <MessageSquarePlus size={16} />
            Join Beta
          </button>
        </div>
      </div>
    </div>
  );
}
