import { signIn } from "@/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const devLogin = process.env.NODE_ENV !== "production" && !!process.env.DEV_LOGIN_EMAIL;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm text-center">
        <h1 className="mb-1 text-lg font-semibold">Family Finance</h1>
        <p className="mb-5 text-sm text-ink-2">Private. Only family members can sign in.</p>
        {error && <p className="mb-4 text-sm text-bad">This account is not on the family list.</p>}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn w-full">Sign in with Google</button>
        </form>
        {devLogin && (
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
      </div>
    </main>
  );
}
