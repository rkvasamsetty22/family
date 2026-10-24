import { saveSettings } from "@/app/actions/masters";
import { getSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";
import { Field } from "@/components/fields";
import { changePassword } from "@/app/actions/auth";
import { MIN_PASSWORD } from "@/lib/password";

const PW: Record<string, [string, string]> = {
  saved: ["Password saved.", "text-good"],
  short: [`Use at least ${MIN_PASSWORD} characters.`, "text-bad"],
  mismatch: ["The two passwords do not match.", "text-bad"],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ pw?: string }> }) {
  const { pw } = await searchParams;
  const s = await getSettings();
  return (
    <div className="max-w-xl">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Preferences for importing and reminders.</p>
      <form action={saveSettings} className="card grid gap-3">
        <Field label="Petty expense limit (₹): debits below this with no rule go straight to Petty expenses">
          <input name="pettyThreshold" defaultValue={s.pettyThreshold} inputMode="decimal" className="input" />
        </Field>
        <Field label="Email reminder: days ahead to include">
          <input name="reminderDays" defaultValue={s.reminderDays} inputMode="numeric" className="input" />
        </Field>
        <Field label="Family members (comma separated, used to tag spending)">
          <input name="members" defaultValue={s.members} className="input" />
        </Field>
        <div>
          <button className="btn">Save</button>
        </div>
      </form>
      <form action={changePassword} className="card mt-4 grid gap-3">
        <div className="card-title mb-0">Set or change your password</div>
        {pw && PW[pw] && <p className={`text-sm ${PW[pw][1]}`}>{PW[pw][0]}</p>}
        <Field label={`New password (at least ${MIN_PASSWORD} characters)`}>
          <input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
        </Field>
        <Field label="Repeat new password">
          <input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
        </Field>
        <div>
          <button className="btn">Save password</button>
        </div>
      </form>
      <div className="card mt-4 text-sm text-ink-2">
        <div className="card-title">Integrations</div>
        <p>PDF reading and AI head suggestions: {aiEnabled() ? "on" : "off (set ANTHROPIC_API_KEY)"}</p>
        <p>Daily email reminders: {process.env.RESEND_API_KEY ? `on, to ${process.env.REMINDER_TO}` : "off (set RESEND_API_KEY)"}</p>
      </div>
    </div>
  );
}
