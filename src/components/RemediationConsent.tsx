import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Clock, X } from "lucide-react";
import { toast } from "sonner";

type RemediationPreference = "pyqs" | "fundamentals" | "theory" | "all";

interface PendingRemediation {
  _id: Id<"pendingRemediations">;
  student_id: string;
  assignment_id: string;
  weak_topics: string[];
  status: "awaiting_consent" | "accepted" | "declined" | "expired";
  created_at: number;
  expires_at: number;
}

interface RemediationConsentProps {
  assignmentId: Id<"assignments">;
  studentId: string | null;
  agentBaseUrl: string;
}

/**
 * Formats remaining milliseconds as mm:ss for the consent countdown UI.
 */
function formatCountdown(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Renders a non-blocking consent side sheet for pending remediation offers and routes student decisions to negotiation node.
 */
export function RemediationConsent({ assignmentId, studentId, agentBaseUrl }: RemediationConsentProps) {
  const pendingOffers = useQuery(
    (api as unknown as Record<string, unknown>).pendingRemediations
      ? (api as any).pendingRemediations.listAwaiting
      : "skip",
    studentId
      ? {
          student_id: studentId,
          assignment_id: assignmentId,
        }
      : "skip",
  ) as PendingRemediation[] | undefined;

  const [dismissedOfferId, setDismissedOfferId] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const activeOffer = useMemo(() => {
    if (!pendingOffers || pendingOffers.length === 0) return null;
    const sorted = [...pendingOffers].sort((a, b) => a.created_at - b.created_at);
    const visible = sorted.find((offer) => String(offer._id) !== dismissedOfferId);
    return visible ?? null;
  }, [pendingOffers, dismissedOfferId]);

  useEffect(() => {
    if (!activeOffer) {
      setRemainingMs(0);
      return;
    }

    const tick = () => {
      const delta = activeOffer.expires_at - Date.now();
      setRemainingMs(delta);
      if (delta <= 0) {
        setDismissedOfferId(String(activeOffer._id));
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeOffer]);

  /**
   * Sends consent decision to the negotiation node endpoint and closes the panel after success.
   */
  const respond = async (consent: boolean, preference?: RemediationPreference) => {
    if (!activeOffer || !studentId || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${agentBaseUrl}/agent-negotiation/negotiation/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending_remediation_id: String(activeOffer._id),
          student_id: studentId,
          consent,
          preference,
        }),
      });
      if (!response.ok) {
        throw new Error(`Consent API failed: ${response.status}`);
      }
      setDismissedOfferId(String(activeOffer._id));
      toast.success(consent ? "Remediation started." : "Okay, skipped for now.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send consent response";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeOffer || remainingMs <= 0) {
    return null;
  }

  return (
    <aside className="fixed right-4 bottom-4 z-40 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Want to strengthen these now?</p>
          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">Choose a focus mode to continue.</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedOfferId(String(activeOffer._id))}
          className="rounded-md p-1 text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-soft)]"
          aria-label="Dismiss remediation offer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--color-text)]">Weak topics</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-text)]">
            {activeOffer.weak_topics.map((topic) => (
              <li key={topic}>• {topic}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
          <Clock className="h-3.5 w-3.5" />
          <span>Offer expires in {formatCountdown(remainingMs)}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void respond(true, "pyqs")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-strong)]"
          >
            PYQs
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void respond(true, "fundamentals")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-strong)]"
          >
            Fundamentals
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void respond(true, "theory")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-strong)]"
          >
            Deep Theory
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void respond(true, "all")}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-strong)]"
          >
            All
          </button>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void respond(false)}
          className="mt-3 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-subtle)] hover:bg-[var(--color-surface-soft)]"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
