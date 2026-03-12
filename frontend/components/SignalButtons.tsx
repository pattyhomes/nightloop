import { useState } from "react";
import { submitSignal, SignalSubmission } from "../lib/api";

type SignalButtonsProps = {
  venueId: string;
  onSubmitted?: () => void;
};

type SignalOption = {
  emoji: string;
  label: string;
  signal_type: SignalSubmission["signal_type"];
  signal_strength: number;
};

const SIGNAL_OPTIONS: SignalOption[] = [
  { emoji: "🔥", label: "Packed", signal_type: "crowd_report", signal_strength: 90 },
  { emoji: "😴", label: "Dead", signal_type: "crowd_report", signal_strength: 10 },
  { emoji: "🚶", label: "Short line", signal_type: "line_report", signal_strength: 10 },
  { emoji: "⏳", label: "Long line", signal_type: "line_report", signal_strength: 90 },
  { emoji: "🎧", label: "Event happening", signal_type: "event_report", signal_strength: 80 }
];

export default function SignalButtons({ venueId, onSubmitted }: SignalButtonsProps) {
  const [submittingLabel, setSubmittingLabel] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = async (option: SignalOption) => {
    try {
      setSubmittingLabel(option.label);
      setStatusMessage(null);

      await submitSignal({
        venue_id: venueId,
        signal_type: option.signal_type,
        signal_strength: option.signal_strength,
        source: "user"
      });

      setStatusMessage(`Sent: ${option.emoji} ${option.label}`);
      onSubmitted?.();
    } catch {
      setStatusMessage("Couldn’t send signal. Please try again.");
    } finally {
      setSubmittingLabel(null);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#4b5563" }}>Report what it feels like right now:</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SIGNAL_OPTIONS.map((option) => {
          const isSubmitting = submittingLabel === option.label;

          return (
            <button
              key={option.label}
              type="button"
              onClick={() => void handleSubmit(option)}
              disabled={Boolean(submittingLabel)}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 13,
                cursor: submittingLabel ? "not-allowed" : "pointer",
                opacity: submittingLabel && !isSubmitting ? 0.6 : 1
              }}
            >
              {isSubmitting ? "Sending…" : `${option.emoji} ${option.label}`}
            </button>
          );
        })}
      </div>
      {statusMessage && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#4b5563" }}>{statusMessage}</p>}
    </div>
  );
}
