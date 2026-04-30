export const metadata = {
  title: "Nightloop Support"
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

export default function SupportPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Support</h1>
      <p style={mutedStyle}>Beta support</p>

      <p>
        For help with the Nightloop beta, email{" "}
        <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a>.
      </p>

      <p>
        Please include your TestFlight email, device model, iOS version, and a short
        description of what happened. Screenshots or screen recordings are helpful when
        available.
      </p>
    </main>
  );
}
