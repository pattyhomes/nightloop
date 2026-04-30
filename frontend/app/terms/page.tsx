export const metadata = {
  title: "Nightloop Terms"
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

export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Terms</h1>
      <p style={mutedStyle}>Last updated April 30, 2026</p>

      <p>
        Nightloop is a beta nightlife planning service. By using the beta, you agree to
        use it responsibly and understand that the product is still changing.
      </p>

      <h2>Age And Safety</h2>
      <p>
        Nightloop is intended for users legally allowed to enter nightlife venues. Nightloop
        does not guarantee venue admission, safety, wait times, covers, event details, or
        any venue condition.
      </p>

      <h2>Beta Availability</h2>
      <p>
        Beta features may change, break, or be removed. Venue information can be incomplete
        and is planning guidance only, not a guarantee.
      </p>

      <h2>User Content</h2>
      <p>
        Do not post abusive, misleading, illegal, or privacy-invasive content. Nightloop may
        remove content, restrict accounts, and process reports to protect testers and operate
        the service.
      </p>

      <h2>Support</h2>
      <p>
        For beta support, contact{" "}
        <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a>.
      </p>
    </main>
  );
}
