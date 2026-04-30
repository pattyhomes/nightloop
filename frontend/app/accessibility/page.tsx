export const metadata = {
  title: "Nightloop Accessibility"
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
        <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a>. Please
        include the flow you were using, device model, and iOS version.
      </p>
    </main>
  );
}
