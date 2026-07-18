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

- Enable **GitHub** (Client ID/Secret from GitHub OAuth App)
- Enable **Google** (optional)

Redirect URLs:

- `http://localhost:5173/`
- production URL(s)

### 3. Client env

`.env.local` (already gitignored):

```env
VITE_SUPABASE_URL=https://xikribjyvqrilgbaxdel.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### 4. Edge Function (optional, best practice)

```bash
# with Supabase CLI logged in
supabase functions deploy session --project-ref xikribjyvqrilgbaxdel
```

Verifies JWT and returns quiz/SRS counts for the signed-in user.

`@supabase/server` is installed for Node/API handlers if you add a custom backend later.

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
