# Supabase setup

The app runs without any of this — plans stay in the browser and the account
button is hidden. Work through these steps when you want saving, sign-in and a
real daily limit.

## 1. Create the project

Make a project at [supabase.com](https://supabase.com), then copy from
**Project Settings → API**:

| Value | Goes in |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

The service role key bypasses row level security. It belongs only in server
environment variables — never in a `NEXT_PUBLIC_*` name, and never in the
browser.

## 2. Apply the schema

Paste `supabase/schema.sql` into the SQL editor and run it, or use the CLI:

```bash
supabase db push
```

It creates seven tables, their row level security policies, a trigger that
makes a profile row for each new sign-in, and two functions:

- `claim_draft(token, new_owner)` — moves an anonymous draft onto an account in
  one statement. A half-finished claim would leave someone's Mandalart owned by
  nobody and readable by nobody, so it must not be split into separate updates.
- `purge_expired()` — deletes drafts past their 24 hours and quota rows older
  than a week.

## 3. Schedule the cleanup

Unclaimed drafts accumulate otherwise. In **Database → Cron** (or the
`pg_cron` extension), run `purge_expired()` daily:

```sql
select cron.schedule('purge-expired', '0 3 * * *', $$select public.purge_expired()$$);
```

## 4. Google sign-in

1. In Google Cloud Console, create an **OAuth 2.0 Client ID** (Web application).
2. Add this authorized redirect URI — the value comes from the Supabase
   dashboard under **Authentication → Providers → Google**:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste the client ID and secret into that same Supabase page and enable the
   provider.
4. Under **Authentication → URL Configuration**, add your app's origins to
   **Redirect URLs**: `http://localhost:3000/**` for development, plus your
   deployed origin.

The app's own callback is `/auth/callback`; it exchanges the code for a session
and then sends the user to `/auth/claim`, which moves any anonymous draft onto
the new account.

## 5. Quota salt

```
ANON_QUOTA_SALT=<any long random string>
```

Client IPs are hashed with this before being stored, so the quota table holds
no addresses. Without it the anonymous limit is not enforced — the code refuses
to store an unsalted hash of an IP, because that is reversible in minutes.

Changing the salt resets everyone's daily count.

## Checking it works

- The account button appears once `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- Make a Mandalart while signed out, then sign in: it should move to your
  account and open at its own URL.
- Make a second one while signed out from the same address: refused, with a
  prompt to sign in.
- If a step fails, the browser copy is untouched — nothing a user made is lost
  by a Supabase problem.
