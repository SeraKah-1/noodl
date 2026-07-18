# Supabase setup for Noodl (cross-device sync)

## Architecture

```
┌─────────────┐     PKCE OAuth      ┌──────────────────┐
│  Browser A  │◄───────────────────►│  Supabase Auth   │
│ IndexedDB   │                     └────────┬─────────┘
│ + realtime  │                              │ JWT
└──────┬──────┘                              ▼
       │ upsert/select (RLS)        ┌──────────────────┐
       └───────────────────────────►│  Postgres tables │
┌──────┬──────┘                     │  quizzes, srs,   │
│  Browser B  │◄──── realtime ──────│  library, …      │
│ IndexedDB   │                     └──────────────────┘
└─────────────┘
```

- **Local-first:** writes always hit IndexedDB first.
- **Sync:** last-writer-wins on `client_updated_at`.
- **Soft delete:** `deleted_at` so devices can reconcile.
- **Realtime:** debounced pull when another device changes rows.
- **Keys:** browser = publishable/anon only. Secret = Edge Functions / server only.

## Your project

| Item | Value |
|------|--------|
| URL | `https://xikribjyvqrilgbaxdel.supabase.co` |
| Publishable | set as `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` |
| Secret | **never** put in `VITE_*` or git — only Edge/server env |

## One-time checklist

### 1. Apply schema

```bash
node scripts/apply-schema.mjs
# follow the SQL Editor link, paste supabase/schema.sql, Run
```

Creates: `user_profiles`, `quizzes`, `library_items`, `srs_items`, `devices`, `sync_state` + RLS + triggers + realtime publication attempts.

### 2. Auth providers

Dashboard → Authentication → Providers:

- Enable **Google** only (Client ID/Secret from Google Cloud Console)
- GitHub OAuth and Cloudflare Turnstile are **not** used

### URL Configuration (required for Vercel Google login)

**Authentication → URL Configuration** — wrong values cause:

`http://localhost:3000/?error=…&error_code=flow_state_already_used`

even when you started login on Vercel.

| Field | Set to |
|--------|--------|
| **Site URL** | Your **production** URL, e.g. `https://YOUR-APP.vercel.app` (not localhost) |
| **Redirect URLs** | One line each (trailing slash OK): |

```
https://YOUR-APP.vercel.app/
https://YOUR-APP.vercel.app/**
http://localhost:3000/
http://localhost:3000/**
http://127.0.0.1:3000/
```

Also add preview URLs if you use them (`https://noodl-*.vercel.app/**`).

**Why:** App sends `redirectTo = window.location.origin` (correct on Vercel).
If that origin is **not** in Redirect URLs, Supabase falls back to **Site URL**.
If Site URL is still `http://localhost:3000`, Google finishes and dumps you on localhost
with a dead PKCE state → `flow_state_already_used`.

This is a **dashboard** setting, not fixed by app deploy alone. Code never hardcodes localhost for OAuth.

### 3. Client env

`.env.local` (already gitignored):

```env
VITE_SUPABASE_URL=https://xikribjyvqrilgbaxdel.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### 4. Edge Function (optional, best practice)

**Do not paste this into SQL Editor.** Run in a terminal with [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
# install CLI once, then:
supabase login
supabase functions deploy session --project-ref xikribjyvqrilgbaxdel
```

Source: `supabase/functions/session/index.ts`  
Verifies the user JWT and returns quiz/SRS counts.

Cross-device **quiz sync does not require** this function — it is optional health/metrics.

`@supabase/server` is available for custom Node APIs if you add them later.

### 5. What syncs across devices

| Data | Table | When |
|------|--------|------|
| Quizzes | `quizzes` | save / login / online / realtime |
| Library materials | `library_items` | sync cycle |
| SRS cards | `srs_items` | add/review + sync |
| Device registry | `devices` | each full sync |
| Sync cursor | `sync_state` | pull/push timestamps |
| Profile | `user_profiles` | display name / last device |

**Not synced (by design):** raw third-party LLM API keys should stay on-device unless you deliberately add encrypted `provider_settings` later.

## App entry points

| File | Role |
|------|------|
| `supabase.ts` | Browser client + OAuth |
| `services/syncService.ts` | LWW merge, push/pull, realtime, devices |
| `services/storageService.ts` | Local IDB + calls cloud helpers |
| `services/srsService.ts` | SRS local + cloud upsert |
| `components/AuthWidget.tsx` | Login + manual Sync now |

## Security notes

1. Publishable key is public-by-design; **RLS** is the real gate.
2. Secret key bypasses RLS — treat like a root password.
3. If a secret was pasted into chat, **rotate it** in API Keys.
4. Prefer PKCE OAuth (already enabled in client).
