export const metadata = {
  title: "Nightloop Privacy Policy"
};

const pageStyle = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "56px 20px 80px",
  lineHeight: 1.7,
  color: "#f4f0ff",
  background: "#08050f",
  minHeight: "100vh"
};

const mutedStyle = { color: "#b9accf" };

export default function PrivacyPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Privacy Policy</h1>
      <p style={mutedStyle}>Last updated April 30, 2026</p>

      <p>
        Nightloop is a beta nightlife planning app. For beta support or privacy
        questions, contact <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a>.
      </p>

      <h2>Information We Collect</h2>
      <p>
        We collect information needed to operate the beta, including account profile details,
        age eligibility attestation, preferences, friend relationships, blocks, reports,
        Decision room activity, room messages, attendance intents, venue signals, and app
        or device information needed to run, secure, and debug the service.
      </p>

      <h2>Location</h2>
      <p>
        Nightloop uses location while the app is open to sort nearby venues and verify
        live venue signals near a venue. Precise coordinates are not displayed to other users.
      </p>

      <h2>Service Providers</h2>
      <p>
        We use service providers to operate the beta, including Supabase, Railway, Vercel,
        Google Maps, and Apple.
      </p>

      <h2>Beta Diagnostics And Feedback</h2>
      <p>
        The first beta does not include a third-party analytics SDK. We may use TestFlight
        feedback, Apple crash reports, backend logs, and direct tester feedback to improve
        Nightloop and investigate issues.
      </p>

      <h2>Account Deletion</h2>
      <p>
        You can request account deletion in the app from Profile settings. If you cannot
        access the app, email support at{" "}
        <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a>.
      </p>
    </main>
  );
}
