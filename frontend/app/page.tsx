import Link from "next/link";
import { linkStyle, mutedStyle, pageStyle } from "./legalPageStyles";

export default function HomePage() {
  return (
    <main style={pageStyle}>
      <p style={mutedStyle}>public page in progress · tonight happens in the app</p>
      <h1>Nightloop</h1>
      <p>
        Nightloop is a private nightlife planning beta for choosing where to go
        tonight with source-backed venue context, friends activity, and Decision
        rooms.
      </p>
      <p>
        The iOS app is currently distributed through TestFlight. For support,
        privacy questions, or account deletion help, use the links below.
      </p>

      <nav style={{ display: "grid", gap: 12, marginTop: 28 }}>
        <Link href="/privacy" style={linkStyle}>
          Privacy Policy
        </Link>
        <Link href="/terms" style={linkStyle}>
          Terms of Use
        </Link>
        <Link href="/support" style={linkStyle}>
          Support
        </Link>
        <Link href="/delete-account" style={linkStyle}>
          Delete Account
        </Link>
        <Link href="/accessibility" style={linkStyle}>
          Accessibility
        </Link>
      </nav>
    </main>
  );
}
