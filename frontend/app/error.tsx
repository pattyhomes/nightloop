"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console so it's visible in dev tools without triggering a reload loop.
    console.error("[Nightloop] Unhandled render error:", error);
  }, [error]);

  return (
    <div
      style={{
        maxWidth: 600,
        margin: "80px auto",
        padding: "32px 24px",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        textAlign: "center"
      }}
    >
      <h2 style={{ fontSize: 22, margin: "0 0 12px", color: "#111827" }}>
        Something went wrong
      </h2>
      <p style={{ color: "#6b7280", fontSize: 15, margin: "0 0 24px" }}>
        {error?.message ?? "An unexpected error occurred loading Nightloop."}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "10px 24px",
          background: "#1d4ed8",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        Try again
      </button>
    </div>
  );
}
