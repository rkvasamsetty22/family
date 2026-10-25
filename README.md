# Family Finance

A private dashboard for one family's money: bank statements, cash, books by head, loans, payables and receivables, insurance and due dates, in INR.

## What it does (phase 1)

- **Statement import**: upload CSV or Excel (.xlsx) exports from Indian banks (HDFC, SBI, ICICI, Axis and similar layouts are detected automatically). PDF statements are read by Claude when `ANTHROPIC_API_KEY` is set. Re-importing an overlapping statement skips lines already stored. The uploaded file is never stored.
- **Head prompts**: each new line goes to the **Review queue**. Lines are pre-filled in this order: your saved rules, transfers between your own accounts / ATM withdrawals / card bill payments, petty expenses (debits under the limit in Settings go straight to *Petty expenses*), then an AI suggestion. Tick *Always* when posting to save a rule; matching lines still in the queue are filed at once.
- **Books**: Income, Expense, Investment, Loan and Transfer heads. Only Income and Expense count towards income, expenses and savings.
- **Cash entries**: add cash income and spending from the Ledger page.
- **Loans** taken and given. Linking an EMI line to a loan reduces its outstanding by the principal part (EMI minus a month's interest).
- **Payables and receivables** with due dates and monthly/quarterly/yearly repeats.
- **Insurance** (life, term, health, vehicle, property) with cover totals and renewal dates. Linking a premium line to a policy moves its next due date forward.
- **Due dates** page and an optional daily reminder email.
- **Dashboard** for the Indian financial year (April to March).

Policy numbers and loan account numbers are encrypted at rest (AES-256-GCM).

## Security

- Passwords are hashed with scrypt at OWASP's recommended cost (older hashes are upgraded at the next sign-in). Common or easily guessed passwords are refused.
- Five wrong passwords for an email, or twenty from one IP address, within 15 minutes lock sign-in for 15 minutes. Wrong setup codes pause the setup form for an hour. An admin resetting a password clears its lockout.
- Sessions end after 2 hours without use and 12 hours after sign-in. Changing or resetting a password signs out every other device.
- Every request is checked against Family users in the database, so removing access takes effect on the person's next click.
- Strict security headers on every response: a nonce-based Content Security Policy, HSTS, no framing, no caching of financial pages.
- Family users shows the last 50 security events (sign-ins, failed attempts, lockouts, user changes) with IP addresses.

## Signing in

People sign in with email and password.

- The emails in `ALLOWED_EMAILS` are the **admins**. The first time (or after forgetting the password), an admin uses *Admin: first-time setup or forgot password* on the login page with the `SETUP_CODE` set in Vercel.
- Admins add everyone else under **Family users**: name, email, password and role (member or admin). They can reset passwords, remove or restore access, and delete users. Removing access takes effect on the person's next click.
- Anyone can change their own password under Settings.
- Google sign-in is optional (set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`); it only lets in people already added under Family users.

## Run locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, ALLOWED_EMAILS
npm run db:migrate
npm run db:seed             # default heads + a "Cash in hand" account
npm run dev
```

For local use without Google, set `DEV_LOGIN_EMAIL` to an allowed email; a *Dev login* button appears (never in production builds).

`npm test` runs the statement parser and security tests.

## Deploy (Vercel + Neon)

1. Add a Neon database from Vercel's Storage tab (this sets `DATABASE_URL`), or create one on neon.tech and copy the pooled connection string.
2. Optional, for Google sign-in: in Google Cloud Console, create an OAuth client (Web). Authorised redirect URI: `https://<your-app>.vercel.app/api/auth/callback/google`.
3. Import the repo in Vercel and set the environment variables from `.env.example`:
   `DATABASE_URL`, `AUTH_SECRET` (`npx auth secret`), `ALLOWED_EMAILS`, `SETUP_CODE`, `ENCRYPTION_KEY` (any long random passphrase; keep a copy: losing it makes stored policy numbers unreadable), and optionally `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `REMINDER_TO` (reminder email), `CRON_SECRET`.
4. Nothing to run by hand: the `vercel-build` script applies migrations and seeds default heads on every deploy (both are safe to repeat).
5. Deploy. The reminder cron in `vercel.json` runs daily at 08:00 IST.

## Roadmap

- Phase 2: investments and assets (land, house, gold, vehicles, stocks, company stakes) with approximate values, net worth, reports, Excel export.
- Phase 3: goals and projections (children's education fees with inflation, retirement corpus), cash-flow forecast and a financial health scorecard.
