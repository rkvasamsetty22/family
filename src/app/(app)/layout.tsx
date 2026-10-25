import { currentUser, signOut } from "@/auth";
import { pendingCount } from "@/lib/posting";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const pending = await pendingCount();
  return (
    <AppShell
      isAdmin={user.isAdmin}
      pending={pending}
      footer={
        <form
          className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 md:block md:py-3"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <div className="truncate text-xs text-ink-3 md:mb-1">{user.email}</div>
          <button className="text-xs text-ink-2 underline">Sign out</button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
