import { linkStyle, mutedStyle, pageStyle } from "../legalPageStyles";

export const metadata = {
  title: "Nightloop Accessibility"
};

export default function AccessibilityPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Accessibility</h1>
      <p style={mutedStyle}>Beta accessibility support</p>

      <p>
        Nightloop is working toward a usable accessible experience for beta testers.
      </p>

      <p>
        To report an accessibility issue or request an accommodation, email{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>.
        Please include the flow you were using, device model, and iOS version.
      </p>
    </main>
  );
}
