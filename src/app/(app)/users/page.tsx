import { redirect } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/auth";
import { isAdminEmail } from "@/auth.config";
import { createUser, resetUserPassword, updateUserAccess } from "@/app/actions/auth";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/password";
import { Empty, Field, Select } from "@/components/fields";

const MSG: Record<string, [string, string]> = {
  created: ["User added. Share the email and password with them; they can change it under Settings.", "text-good"],
  reset: ["Password reset.", "text-good"],
  saved: ["Saved.", "text-good"],
  exists: ["A user with that email already exists.", "text-bad"],
  email: ["Enter a valid email.", "text-bad"],
  short: [`Passwords need at least ${MIN_PASSWORD} characters.`, "text-bad"],
  long: [`Passwords can have at most ${MAX_PASSWORD} characters.`, "text-bad"],
  weak: ["Too easy to guess. Avoid common words, repeated characters and your email name.", "text-bad"],
};

const EVENT_LABEL: Record<string, string> = {
  login: "Signed in",
  login_failed: "Wrong password",
  login_locked: "Locked out (too many attempts)",
  setup_password: "Admin password set with setup code",
  setup_failed: "Wrong setup code",
  password_changed: "Changed own password",
  user_created: "Added user",
  password_reset: "Reset password",
  user_deactivated: "Removed access",
  user_activated: "Restored access",
  user_made_admin: "Made admin",
  user_made_member: "Made member",
  user_deleted: "Deleted user",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await currentUser();
  if (!me?.isAdmin) redirect("/");
  const { msg } = await searchParams;
  const [users, events] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.createdAt)),
    db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(50),
  ]);
  return (
    <div className="max-w-4xl">
      <h1 className="page-title">Family users</h1>
      <p className="page-sub">Everyone who can sign in. Admins can add people, reset passwords and remove access. Members can use everything else.</p>
      {msg && MSG[msg] && <div className={`card mb-4 text-sm ${MSG[msg][1]}`}>{MSG[msg][0]}</div>}

      <div className="card mb-4 overflow-x-auto">
        {users.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                <th>Name / email</th>
                <th>Role</th>
                <th>Last sign-in</th>
                <th>Reset password</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.email === me.email;
                const admin = u.role === "admin" || isAdminEmail(u.email);
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td>
                      <div>{u.name || "—"}{self && <span className="ml-1 text-xs text-ink-3">(you)</span>}</div>
                      <div className="text-xs text-ink-3">{u.email}</div>
                      {!u.active && <div className="text-xs text-bad">Access removed</div>}
                    </td>
                    <td>{admin ? "Admin" : "Member"}</td>
                    <td className="whitespace-nowrap text-ink-2">
                      {u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Never"}
                    </td>
                    <td>
                      <form action={resetUserPassword} className="flex gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="password" type="password" required minLength={MIN_PASSWORD} placeholder="New password" autoComplete="new-password" className="input w-36" />
                        <button className="btn-ghost text-xs">Set</button>
                      </form>
                    </td>
                    <td>
                      {!self && (
                        <div className="flex flex-wrap gap-1">
                          {[
                            u.active ? ["deactivate", "Remove access"] : ["activate", "Restore access"],
                            ...(isAdminEmail(u.email) ? [] : [u.role === "admin" ? ["make_member", "Make member"] : ["make_admin", "Make admin"]]),
                          ].map(([action, label]) => (
                            <form key={action} action={updateUserAccess}>
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="action" value={action} />
                              <button className="btn-ghost text-xs">{label}</button>
                            </form>
                          ))}
                          <form action={updateUserAccess}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="action" value="delete" />
                            <button className="btn-danger">Delete</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <form action={createUser} className="card grid gap-3 md:grid-cols-2">
        <div className="card-title md:col-span-2">Add a family member</div>
        <Field label="Name">
          <input name="name" className="input" placeholder="e.g. Lakshmi" />
        </Field>
        <Field label="Email (used to sign in)">
          <input name="email" type="email" required className="input" />
        </Field>
        <Field label={`Password (at least ${MIN_PASSWORD} characters)`}>
          <input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
        </Field>
        <Field label="Role">
          <Select name="role" options={[{ value: "member", label: "Member: can view and edit finances" }, { value: "admin", label: "Admin: can also manage users" }]} />
        </Field>
        <div>
          <button className="btn">Add user</button>
        </div>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <div className="card-title">Security activity</div>
        <p className="mb-3 text-xs text-ink-3">The last 50 sign-ins, failed attempts, lockouts and user changes.</p>
        {events.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>By</th>
                <th>For</th>
                <th>IP address</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{e.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className={/failed|locked/.test(e.event) ? "text-bad" : ""}>{EVENT_LABEL[e.event] ?? e.event}</td>
                  <td>{e.actor}</td>
                  <td>{e.target && e.target !== e.actor ? e.target : ""}</td>
                  <td className="text-ink-3">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
