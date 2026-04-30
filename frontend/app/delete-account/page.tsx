export const metadata = {
  title: "Nightloop Delete Account"
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

export default function DeleteAccountPage() {
  return (
    <main style={pageStyle}>
      <h1>Delete Your Nightloop Account</h1>
      <p style={mutedStyle}>Beta account deletion</p>

      <p>
        In the Nightloop app, go to Profile, then Account, then Delete account. Follow the
        prompts to request deletion.
      </p>

      <p>
        If you cannot access the app, email{" "}
        <a href="mailto:axelbaumcharles@gmail.com">axelbaumcharles@gmail.com</a> from the
        email address associated with your beta account.
      </p>

      <p>
        Deletion removes or anonymizes profile, social, room, signal, and notification
        records according to the beta data model.
      </p>
    </main>
  );
}
