import { signIn, devLoginEnabled, emailLinkEnabled, googleEnabled } from "@/auth";
import { emailSignInLink, loginWithPassword, setupPassword } from "@/app/actions/auth";
import { MIN_PASSWORD } from "@/lib/password";

const ERRORS: Record<string, string> = {
  password: "Email or password is wrong.",
  link: "Could not send the sign-in link. Try again or use your password.",
  AccessDenied: "This account is not on the family list.",
  Configuration: "Sign-in is not set up correctly. For emailed links, check RESEND_API_KEY in Vercel; password sign-in still works.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
};
const SETUP: Record<string, string> = {
  disabled: "Password setup is turned off. Add SETUP_CODE in Vercel settings, or sign in with an emailed link.",
  invalid: "Setup code or email is not right.",
  short: `Use at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords do not match.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; setup?: string }>;
}) {
  const sp = await searchParams;
  const error = sp.error ? ERRORS[sp.error] ?? "Sign-in failed. Try again." : null;
  const setupError = sp.setup ? SETUP[sp.setup] : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-center text-lg font-semibold">Family Finance</h1>
        <p className="mb-5 text-center text-sm text-ink-2">Private. Only family members can sign in.</p>
        {error && <p className="mb-4 text-sm text-bad">{error}</p>}
        {sp.sent && (
          <p className="mb-4 rounded-lg bg-bg p-3 text-sm">
            If that email is on the family list, a sign-in link is on its way. It works once, for 15 minutes.
          </p>
        )}

        <form action={loginWithPassword} className="grid gap-3">
          <label>
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          <label>
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          <button className="btn w-full">Sign in</button>
        </form>

        {emailLinkEnabled() && (
          <form action={emailSignInLink} className="mt-5 grid gap-2 border-t border-line pt-4">
            <span className="label">Or get a one-time sign-in link by email</span>
            <div className="flex gap-2">
              <input name="email" type="email" required placeholder="you@example.com" className="input" />
              <button className="btn-ghost shrink-0">Email link</button>
            </div>
          </form>
        )}

        {googleEnabled() && (
          <form
            className="mt-3"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="btn-ghost w-full">Sign in with Google</button>
          </form>
        )}

        {devLoginEnabled() && (
          <form
            className="mt-2"
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/" });
            }}
          >
            <button className="btn-ghost w-full">Dev login</button>
          </form>
        )}

        <details className="mt-5 border-t border-line pt-4" open={!!setupError}>
          <summary className="cursor-pointer text-sm text-ink-2">First time here, or forgot your password?</summary>
          {setupError && <p className="mt-2 text-sm text-bad">{setupError}</p>}
          <form action={setupPassword} className="mt-3 grid gap-3">
            <label>
              <span className="label">Email</span>
              <input name="email" type="email" required className="input" />
            </label>
            <label>
              <span className="label">Setup code (from the app&apos;s Vercel settings)</span>
              <input name="code" required autoComplete="off" className="input" />
            </label>
            <label>
              <span className="label">New password (at least {MIN_PASSWORD} characters)</span>
              <input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
            </label>
            <label>
              <span className="label">Repeat new password</span>
              <input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
            </label>
            <button className="btn-ghost w-full">Set password and sign in</button>
          </form>
          {emailLinkEnabled() && (
            <p className="mt-2 text-xs text-ink-3">You can also sign in with an emailed link and set a password under Settings.</p>
          )}
        </details>
      </div>
    </main>
  );
}
