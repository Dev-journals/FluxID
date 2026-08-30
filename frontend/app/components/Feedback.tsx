"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, Star, X, Send, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { useFreighter } from "../context/FreighterContext";
import { useToast } from "./Toast";
import { submitFeedback } from "../../lib/metricsApi";
import { FEEDBACK_FORM_URL } from "../../lib/constants";

// Custom event name other components dispatch to open this modal.
export const OPEN_FEEDBACK_EVENT = "fluxid:open-feedback";

// App-wide feedback widget: a floating button that expands on hover to reveal
// a short CTA with links to the Google Form and the in-app feedback modal.
// Clicking either link or the button itself opens the appropriate action.
// Mounted once in ClientLayout so it's available on every dashboard route.
export default function Feedback() {
  const pathname = usePathname();
  const { publicKey } = useFreighter();
  const { showToast } = useToast();
  const onSettingsPage = pathname === "/dashboard/settings";

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, open);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, open);
  }, []);

  const reset = () => {
    setRating(0);
    setHover(0);
    setMessage("");
  };

  const handleSubmit = async () => {
    if (rating < 1) {
      showToast("Please pick a rating", "warning");
      return;
    }
    if (!message.trim()) {
      showToast("Please add a short message", "warning");
      return;
    }
    setSubmitting(true);
    const ok = await submitFeedback(rating, message.trim(), publicKey);
    setSubmitting(false);
    if (ok) {
      showToast("Thanks for the feedback!", "success");
      reset();
      setOpen(false);
    } else {
      showToast("Could not send feedback. Please try again.", "error");
    }
  };

  const openInAppFeedback = () => {
    window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT));
  };

  return (
    <>
      {/* Floating trigger — sits above the mobile bottom-nav (bottom-24) so they don't overlap */}
      <div
        className={`fixed right-4 z-40 group ${
          onSettingsPage ? "bottom-32 lg:bottom-28" : "bottom-24 lg:bottom-6"
        }`}
      >
        {/* Collapsed button */}
        <button
          onClick={openInAppFeedback}
          aria-label="Send feedback"
          className="flex items-center gap-2 card-primary px-4 py-3 rounded-full font-bold text-[var(--background)] shadow-2xl hover:opacity-90 transition-opacity"
        >
          <MessageSquarePlus size={18} />
          <span className="hidden sm:inline text-sm">Feedback / Join Beta</span>
        </button>

        {/* Hover card — expands above the button on hover */}
        <div className="absolute bottom-full mb-3 right-0 w-72 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 transform group-hover:translate-y-0 translate-y-2">
          <div className="card p-4 shadow-2xl">
            <h3
              style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 14 }}
              className="mb-1"
            >
              Give feedback &amp; join the beta
            </h3>
            <p
              style={{
                color: "var(--foreground-muted)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
              className="mb-3"
            >
              Your input shapes what we build next. Give formal feedback on the
              Google Form, or drop a quick note in-app to join the beta.
            </p>
            <div className="flex items-center gap-2">
              <a
                href={FEEDBACK_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="card-primary inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-[var(--background)] text-xs hover:opacity-90 transition-opacity"
              >
                <ExternalLink size={12} />
                Give Feedback
              </a>
              <button
                onClick={openInAppFeedback}
                className="pressed inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-[var(--foreground)] text-xs hover:opacity-90 transition-opacity"
              >
                <MessageSquarePlus size={12} />
                Join Beta
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => !submitting && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="card p-6 w-full max-w-md"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 20 }}>
                    Send feedback
                  </h2>
                  <p style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
                    Tell us what&apos;s working and what isn&apos;t.
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="p-1 rounded-lg text-[var(--foreground-muted)] hover:bg-[var(--surface)] transition-colors"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    className="p-1"
                  >
                    <Star
                      size={28}
                      style={{
                        color: (hover || rating) >= n ? "var(--primary)" : "var(--border)",
                        fill: (hover || rating) >= n ? "var(--primary)" : "transparent",
                      }}
                      className="transition-colors"
                    />
                  </button>
                ))}
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What should we improve?"
                rows={4}
                maxLength={2000}
                className="w-full pressed px-4 py-3 rounded-xl text-[var(--foreground)] outline-none resize-none mb-4"
              />

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70 flex items-center justify-center gap-2"
              >
                <Send size={16} />
                {submitting ? "Sending..." : "Send feedback"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
