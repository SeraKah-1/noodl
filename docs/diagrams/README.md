# Noodl diagrams (English)

Exported visual documentation from README, Supabase docs, and product architecture.

| Folder | Contents |
|--------|----------|
| `src/` | Mermaid sources (`.mmd`) and table definitions (`tables.json`) |
| `out/` | Rendered PNG/SVG copies |
| `*.png` / `*.svg` | Same images at the folder root for quick GitHub browsing |
| `render.mjs` | Regenerator script |

## How to regenerate

```bash
# From repo root (uses system Chromium when present)
node docs/diagrams/render.mjs
```

Requires Node 18+, ImageMagick (`magick` or `convert`) for tables, and Chromium/Chrome for Mermaid CLI.

## Index

### Flowcharts & sequences (from product docs + extras)

| Image | Description | Origin |
|-------|-------------|--------|
| [01-learning-loop.png](01-learning-loop.png) | Material → Bloom blueprint → retrieval → spaced review | README |
| [02-generation-pipeline.png](02-generation-pipeline.png) | Bounded parallel question batches | README |
| [03-build-week-journey.png](03-build-week-journey.png) | Vibe-code debt → audit → release candidate | README |
| [04-architecture.png](04-architecture.png) | Browser local-first + Supabase + BYOK providers | README |
| [05-sync-sequence.png](05-sync-sequence.png) | Outbox sync across devices | README |
| [06-visualization-pipeline.png](06-visualization-pipeline.png) | AI Visual Lab scan → HTML5 sim generation | **Added** |
| [07-knowledge-graph-ux.png](07-knowledge-graph-ux.png) | Graph build + zoom/pan/review UX | **Added** |
| [08-accessibility-inputs.png](08-accessibility-inputs.png) | Keyboard/touch primary; nose/hand opt-in | **Added** |
| [09-provider-routing.png](09-provider-routing.png) | Settings model/key → quiz/sim/chat | **Added** |
| [10-bloom-allocation.png](10-bloom-allocation.png) | Percentages → counts → smart overflow | **Added** |
| [11-app-views.png](11-app-views.png) | Main app surfaces after generation | **Added** |
| [12-data-security.png](12-data-security.png) | BYOK, IDB, RLS, camera boundary | **Added** |

### Tables (from README & Supabase docs)

| Image | Description | Origin |
|-------|-------------|--------|
| [13-bloom-levels.png](13-bloom-levels.png) | C1–C5 cognitive targets | README |
| [14-learning-experiences.png](14-learning-experiences.png) | Modes, SRS, Mix Room, packs | README |
| [15-human-vs-codex.png](15-human-vs-codex.png) | Product decisions vs agent work | README |
| [16-verification-areas.png](16-verification-areas.png) | Tests and gates | README |
| [17-submission-evidence.png](17-submission-evidence.png) | Build Week evidence row | README |
| [18-supabase-sync-map.png](18-supabase-sync-map.png) | Which tables sync when | SUPABASE.md |
| [19-cloud-module-roles.png](19-cloud-module-roles.png) | Cloud-related modules | SUPABASE.md |
| [20-oauth-redirect-checklist.png](20-oauth-redirect-checklist.png) | Auth URL checklist | SUPABASE.md |

All labels and captions in this folder are **English**.
