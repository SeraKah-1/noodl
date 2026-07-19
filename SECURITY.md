# Security Policy

## Reporting a vulnerability

Please do not disclose security vulnerabilities, credentials, private study material, or user data in a public issue.

Use [GitHub private vulnerability reporting](https://github.com/SeraKah-1/noodl/security/advisories/new) and include:

- the affected route, component, or data flow;
- reproduction steps and expected impact;
- browser, deployment, and provider details where relevant;
- a minimal proof of concept with secrets and personal data removed.

You should receive an acknowledgement as soon as the report is reviewed. Please allow time to reproduce and coordinate a fix before public disclosure.

## Security boundaries

- Noodl is local-first. IndexedDB stores local quizzes, materials, and review state.
- AI generation is bring-your-own-key. Provider credentials must never be committed to the repository.
- Variables prefixed with `VITE_` are bundled for the browser and must not contain service-role, secret, or privileged server credentials.
- Supabase cloud features rely on authenticated sessions, Row Level Security, grants, and privacy-safe public projections.
- Camera input is opt-in. MediaPipe landmark inference runs in the browser; raw camera frames are not intentionally uploaded by Noodl.
- Public packs must not expose private source material or owner-only metadata.

## Supported versions

Security fixes target the latest code on the default branch and the currently deployed release candidate. Older commits are not maintained as separate release lines.

## Before deploying

1. Apply the current Supabase schema or migrations.
2. Verify RLS and grants with `npm test`.
3. Run `npm audit --omit=dev` and `npm run build`.
4. Confirm OAuth redirect allow-lists for the exact production domains.
5. Test public sharing in an incognito session with a separate account.
6. Confirm that no `.env.local`, API key, token, private source document, or service-role credential is included in the build or repository.
