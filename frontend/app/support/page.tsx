import { linkStyle, mutedStyle, pageStyle } from "../legalPageStyles";

export const metadata = {
  title: "Nightloop Support"
};

export default function SupportPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Support</h1>
      <p style={mutedStyle}>Beta support</p>

      <p>
        For help with the Nightloop beta, email{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>.
      </p>

      <p>
        Please include your TestFlight email, device model, iOS version, and a short
        description of what happened. Screenshots or screen recordings are helpful when
        available.
      </p>
    </main>
  );
}
