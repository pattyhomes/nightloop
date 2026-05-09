import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

const TOKEN_STORAGE_KEY = "nightloop_admin_jwt";

const shellStyle = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "32px 20px 72px",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "#111827"
};

const panelStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  background: "#fff"
};

const inputStyle = {
  width: "100%",
  minHeight: 36,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "7px 9px",
  font: "inherit",
  boxSizing: "border-box" as const
};

const buttonStyle = {
  border: "1px solid #111827",
  borderRadius: 6,
  background: "#111827",
  color: "#fff",
  minHeight: 34,
  padding: "7px 12px",
  fontWeight: 700,
  cursor: "pointer"
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#fff",
  color: "#111827"
};

function withDisabledStyle<T extends Record<string, unknown>>(style: T, disabled: boolean) {
  return disabled
    ? {
        ...style,
        opacity: 0.45,
        cursor: "not-allowed"
      }
    : style;
}

function getBackendBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BACKEND_BASE_URL?.trim();
  return (value || "http://localhost:4000").replace(/\/$/, "");
}

function normalizeSupabaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function getEmailRedirectUrl() {
  return `${window.location.origin}/admin/token-helper`;
}

async function readSupabaseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      error?: string;
      error_description?: string;
      msg?: string;
      message?: string;
    };
    const detail = body.error_description ?? body.message ?? body.msg ?? body.error;
    return detail ? `${fallback}: ${detail}` : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminTokenHelperPage() {
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProduction = process.env.NODE_ENV === "production";
  const backendBaseUrl = useMemo(() => getBackendBaseUrl(), []);

  async function requestSupabaseToken() {
    const baseUrl = normalizeSupabaseUrl(supabaseUrl);
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey.trim(),
        Authorization: `Bearer ${anonKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: email.trim(),
        password
      })
    });

    if (!response.ok) {
      throw new Error(await readSupabaseError(response, `Supabase sign-in failed (${response.status})`));
    }

    const body = (await response.json()) as {
      access_token?: string;
      user?: { id?: string };
    };
    if (!body.access_token) {
      throw new Error("Supabase did not return an access token.");
    }

    setToken(body.access_token);
    setAuthUserId(body.user?.id ?? "");
    return body.access_token;
  }

  async function createAccount() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const baseUrl = normalizeSupabaseUrl(supabaseUrl);
      const redirectTo = encodeURIComponent(getEmailRedirectUrl());
      const response = await fetch(`${baseUrl}/auth/v1/signup?redirect_to=${redirectTo}`, {
        method: "POST",
        headers: {
          apikey: anonKey.trim(),
          Authorization: `Bearer ${anonKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      if (!response.ok) {
        throw new Error(await readSupabaseError(response, `Supabase account creation failed (${response.status})`));
      }

      const body = (await response.json()) as {
        access_token?: string;
        user?: { id?: string };
      };
      setAuthUserId(body.user?.id ?? "");

      if (body.access_token) {
        setToken(body.access_token);
        setMessage("Account created and signed in. Click Bootstrap Admin next.");
      } else {
        setMessage("Account created. Check your email for Supabase confirmation, then come back and click Bootstrap Admin.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const baseUrl = normalizeSupabaseUrl(supabaseUrl);
      const response = await fetch(`${baseUrl}/auth/v1/resend`, {
        method: "POST",
        headers: {
          apikey: anonKey.trim(),
          Authorization: `Bearer ${anonKey.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "signup",
          email: email.trim(),
          options: {
            email_redirect_to: getEmailRedirectUrl()
          }
        })
      });

      if (!response.ok) {
        throw new Error(await readSupabaseError(response, `Supabase confirmation resend failed (${response.status})`));
      }

      setMessage("Confirmation email requested. Use the newest email from Supabase, then return here and click Bootstrap Admin.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation resend failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createConfirmedDevAccount() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${backendBaseUrl}/api/v1/dev/confirmed-auth-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Confirmed dev account creation failed (${response.status}).`);
      }

      const adminToken = await requestSupabaseToken();
      setMessage("Confirmed dev account is ready and signed in. Click Bootstrap Admin next.");
      window.localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmed dev account creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await requestSupabaseToken();
      setMessage("Signed in. Now click Bootstrap Admin, or use the combined button next time.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapAdmin() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const adminToken = token || (await requestSupabaseToken());

      const meResponse = await fetch(`${backendBaseUrl}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (!meResponse.ok) {
        throw new Error(`Backend /me failed (${meResponse.status}).`);
      }

      const response = await fetch(`${backendBaseUrl}/api/v1/admin/bootstrap-local`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });
      if (!response.ok) {
        throw new Error(`Admin bootstrap failed (${response.status}).`);
      }

      window.localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
      setMessage("Admin bootstrap complete. Token saved for the ops dashboard.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin bootstrap failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) {
      setError("No token to copy yet.");
      return;
    }

    await navigator.clipboard.writeText(token);
    setMessage("Token copied.");
  }

  if (isProduction) {
    return (
      <main style={shellStyle}>
        <h1>Token helper unavailable</h1>
        <p>This local admin helper is disabled in production builds.</p>
      </main>
    );
  }

  return (
    <main style={shellStyle}>
      <p style={{ margin: "0 0 10px" }}>
        <Link href="/admin" style={{ color: "#1d4ed8", fontWeight: 700 }}>
          Back to ops dashboard
        </Link>
      </p>
      <h1 style={{ margin: 0, fontSize: 30 }}>Local Admin Token Helper</h1>
      <p style={{ color: "#4b5563" }}>
        Sign in with a Supabase Auth user, bootstrap that user as local ops admin, then use the token in the ops dashboard.
      </p>

      <form onSubmit={signIn} style={{ ...panelStyle, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Supabase project URL
          <input
            value={supabaseUrl}
            onChange={(event) => setSupabaseUrl(event.target.value)}
            placeholder="https://your-project.supabase.co"
            style={inputStyle}
            required
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Supabase publishable/anon key
          <input
            value={anonKey}
            onChange={(event) => setAnonKey(event.target.value)}
            placeholder="sb_publishable_... or anon JWT"
            type="password"
            style={inputStyle}
            required
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            style={inputStyle}
            required
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            style={inputStyle}
            required
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" disabled={loading} style={withDisabledStyle(buttonStyle, loading)}>
            Sign In
          </button>
          <button type="button" onClick={createAccount} disabled={loading} style={withDisabledStyle(secondaryButtonStyle, loading)}>
            Create Account
          </button>
          <button type="button" onClick={resendConfirmation} disabled={loading} style={withDisabledStyle(secondaryButtonStyle, loading)}>
            Resend Confirmation
          </button>
          <button type="button" onClick={createConfirmedDevAccount} disabled={loading} style={withDisabledStyle(secondaryButtonStyle, loading)}>
            Create Confirmed Dev Account
          </button>
          <button type="button" onClick={bootstrapAdmin} disabled={loading} style={withDisabledStyle(secondaryButtonStyle, loading)}>
            Bootstrap Admin
          </button>
          <button type="button" onClick={copyToken} disabled={!token} style={withDisabledStyle(secondaryButtonStyle, !token)}>
            Copy Token
          </button>
          <button type="button" onClick={() => window.location.assign("/admin")} style={secondaryButtonStyle}>
            Open Ops
          </button>
        </div>
      </form>

      {authUserId && (
        <p style={{ color: "#4b5563" }}>
          Signed in auth user: <code>{authUserId}</code>
        </p>
      )}
      {message && <p style={{ color: "#047857", fontWeight: 700 }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}
      {token && (
        <textarea
          readOnly
          value={token}
          style={{
            ...inputStyle,
            marginTop: 12,
            minHeight: 120,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }}
        />
      )}
    </main>
  );
}
