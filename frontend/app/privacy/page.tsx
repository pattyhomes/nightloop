import { linkStyle, mutedStyle, pageStyle } from "../legalPageStyles";

export const metadata = {
  title: "Nightloop Privacy Policy"
};

export default function PrivacyPage() {
  return (
    <main style={pageStyle}>
      <h1>Nightloop Privacy Policy</h1>
      <p style={mutedStyle}>Last updated April 30, 2026</p>

      <p>
        Nightloop is a beta nightlife planning app. For beta support or privacy
        questions, contact{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>.
      </p>

      <h2>Information We Collect</h2>
      <p>
        We collect information needed to operate the beta, including account
        identifiers from Supabase Auth and Sign in with Apple, profile details
        such as display name and username, age eligibility attestation, nightlife
        preferences, friend relationships, friend requests, blocks, reports,
        Decision room activity, room messages, attendance intents, venue signals,
        notification preferences and device tokens, and app or device information
        needed to run, secure, and debug the service.
      </p>
      <p>
        We also process venue and event information from source-backed providers
        and public or venue-owned sources. That venue information is not intended
        to identify you unless you choose to interact with it through a signal,
        attendance intent, message, or report.
      </p>

      <h2>How We Collect Information</h2>
      <p>
        We collect information you provide directly, such as profile settings,
        preferences, friend actions, room messages, reports, and support emails.
        We collect some information automatically when you use the app, such as
        app requests, authentication state, device tokens for notifications, and
        operational logs. We collect location only through iOS permission flows
        and only for app features that need it.
      </p>

      <h2>How We Use Information</h2>
      <p>
        We use information to provide Nightloop features, including account
        access, age-gated beta eligibility, venue recommendations, venue signal
        verification, private friend activity, Decision rooms, notifications,
        moderation, abuse prevention, account deletion, troubleshooting, and
        service security.
      </p>
      <p>
        We do not sell personal information. The beta does not include
        third-party advertising SDKs or third-party analytics SDKs.
      </p>

      <h2>Location</h2>
      <p>
        Nightloop uses location while the app is open to sort nearby venues and
        verify live venue signals near a venue. Precise coordinates are not
        displayed to other users. Signal verification coordinates are sent to the
        backend only when needed to verify that you are near the venue for a
        signal. Friend-visible signal activity is limited to safe context such
        as venue, signal type, and time.
      </p>
      <p>
        You can revoke location access at any time in iOS Settings. If you revoke
        location access, nearby sorting and at-venue signal verification may not
        work, but you can still use other parts of the app.
      </p>

      <h2>Service Providers</h2>
      <p>
        We use service providers to operate the beta, including Supabase,
        Railway, Vercel, Google Maps, and Apple.
      </p>
      <p>
        These providers process information only as needed to provide hosting,
        authentication, maps, notifications, app distribution, security, and
        operational support. We expect service providers that process user data
        to protect that data consistently with this policy and applicable law.
      </p>

      <h2>Social Features, Reports, And Moderation</h2>
      <p>
        Nightloop includes private social features such as friend requests,
        friend activity, attendance intents, room messages, and Decision room
        votes. Blocks are designed to enforce mutual invisibility. Reports may
        include profile, activity, room, or message references so we can review
        abuse, safety, and support issues.
      </p>
      <p>
        Room messages and replies are friend-scoped or room-scoped, not public
        venue content. Decision votes are shown as aggregate counts, not named
        vote lists.
      </p>

      <h2>Retention And Deletion</h2>
      <p>
        We keep information for as long as needed to provide the beta, maintain
        safety and integrity, comply with legal obligations, and debug service
        issues. Tonight-only social activity and Decision room data are designed
        to expire after the nightlife-day window. Some operational logs may be
        retained for a limited period by our hosting and infrastructure providers.
      </p>
      <p>
        You can request account deletion in the app from Profile settings. If you
        cannot access the app, email support at{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>
        . Deletion removes or anonymizes account, profile, social, room, signal,
        notification, and related app records where appropriate, except where we
        need to retain limited information for security, legal, or abuse-prevention
        reasons.
      </p>

      <h2>Choices And Consent</h2>
      <p>
        You can manage permissions such as location and notifications in iOS
        Settings. You can change app preferences, Ghost Mode, notification
        preferences, friend relationships, and blocks inside Nightloop where
        available. You can stop using social sharing by enabling Ghost Mode or
        by not submitting social actions.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect user
        information, including authenticated API access, server-side provider
        keys, and separation between Supabase Auth and product data access. No
        method of transmission or storage is perfectly secure, but we work to
        reduce risk and limit data access to what is needed to operate the beta.
      </p>

      <h2>Children</h2>
      <p>
        Nightloop is not intended for children. The app includes age eligibility
        checks because it is focused on nightlife venues and friend planning.
      </p>

      <h2>Beta Diagnostics And Feedback</h2>
      <p>
        The first beta does not include a third-party analytics SDK. We may use
        TestFlight feedback, Apple crash reports, backend logs, and direct tester
        feedback to improve Nightloop and investigate issues.
      </p>

      <h2>Account Deletion</h2>
      <p>
        The account deletion page is available at{" "}
        <a href="/delete-account" style={linkStyle}>
          /delete-account
        </a>
        . You can also email support at{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, support, accessibility requests, or account
        deletion help, contact{" "}
        <a href="mailto:axelbaumcharles@gmail.com" style={linkStyle}>
          axelbaumcharles@gmail.com
        </a>.
      </p>
    </main>
  );
}
