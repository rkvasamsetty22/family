import { signIn, devLoginEnabled, googleEnabled } from "@/auth";
import { loginWithPassword, setupPassword } from "@/app/actions/auth";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/password";

const ERRORS: Record<string, string> = {
  password: "Email or password is wrong.",
  CredentialsSignin: "Email or password is wrong.",
  locked: "Too many attempts. Wait 15 minutes and try again, or ask an admin to reset your password.",
  AccessDenied: "This account has not been added to Family users.",
};
const SETUP: Record<string, string> = {
  disabled: "Password setup is turned off. Add SETUP_CODE in Vercel settings.",
  invalid: "Setup code or email is not right. This form is only for the admin emails set in Vercel.",
  short: `Use at least ${MIN_PASSWORD} characters.`,
  mismatch: "The two passwords do not match.",
  long: `Use at most ${MAX_PASSWORD} characters.`,
  weak: "Too easy to guess. Avoid common words, repeated characters and your email name.",
  locked: "Too many wrong setup codes. The form is paused for an hour.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; setup?: string; changed?: string }>;
}) {
  const sp = await searchParams;
  const errorKey = sp.code === "locked" ? "locked" : sp.error;
  const error = errorKey ? ERRORS[errorKey] ?? "Sign-in failed. Try again." : null;
  const setupError = sp.setup ? SETUP[sp.setup] : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-3 flex justify-center" data-tone="overview"><span className="grid h-10 w-10 place-items-center rounded-xl bg-tint text-lg font-bold text-white" aria-hidden>₹</span></div>
        <h1 className="mb-1 text-center text-lg font-semibold">Family Finance Manager</h1>
        <p className="mb-5 text-center text-sm text-ink-2">Private. Only family members can sign in.</p>
        {error && <p className="mb-4 text-sm text-bad">{error}</p>}
        {sp.changed && !error && <p className="mb-4 text-sm text-good">Password changed. Sign in again with the new one.</p>}
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
          <summary className="cursor-pointer text-sm text-ink-2">Admin: first-time setup or forgot password</summary>
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
          <p className="mt-2 text-xs text-ink-3">Other family members: ask the admin to add you or reset your password under Family users.</p>
        </details>
      </div>
    </main>
  );
}
