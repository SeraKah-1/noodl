# Noodl

<p align="center">
  <img src="public/icon-512.png" width="140" alt="Noodl mascot — use your noodle" />
</p>

<h2 align="center">Use your noodle.</h2>
<h3 align="center">Turn class material into a study loop that refuses to let you fake understanding.</h3>

<p align="center">
  <strong>Live now → <a href="https://noodl-beta.vercel.app/">noodl-beta.vercel.app</a></strong><br />
  OpenAI Build Week 2026 · <strong>Education</strong> · MIT · brand-new repo (July 18, 2026)
</p>

<p align="center">
  <a href="https://noodl-beta.vercel.app/"><img alt="Open live demo" src="https://img.shields.io/badge/OPEN_LIVE_DEMO-111827?style=for-the-badge&logo=vercel&logoColor=white" /></a>
  <a href="https://openai.devpost.com/"><img alt="OpenAI Build Week 2026" src="https://img.shields.io/badge/OpenAI_Build_Week-2026-10a37f?style=for-the-badge&logo=openai&logoColor=white" /></a>
  <a href="https://github.com/SeraKah-1/noodl/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/SeraKah-1/noodl/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" /></a>
</p>

<p align="center">
  <a href="#i-am-actually-obsessed-with-this-problem">Why I'm obsessed</a> ·
  <a href="#the-dream-im-selling">The dream</a> ·
  <a href="#what-noodl-does-in-painful-detail">Product deep dive</a> ·
  <a href="#build-week-story-messy-and-real">Build Week story</a> ·
  <a href="#for-judges">For judges</a> ·
  <a href="#run-it-tonight">Run it</a>
</p>

---

## I am actually obsessed with this problem

Here's the thing that keeps me up.

Students (me included, friends included, basically everyone I've ever watched prepare for a midterm) do this loop: open PDF → highlight yellow → re-read until the page feels *known* → close laptop feeling productive → sit in the exam and watch the answer dissolve. That feeling of "I knew this last night" is not knowledge. It's **familiarity**. Retrieval is a different sport.

And then the market "fixed" it with AI quiz spam. Paste notes. Get 20 questions. Half of them are pure recall. Half of them hallucinate a fact that was never in the file. None of them tell you *what cognitive muscle* you're training. Difficulty slider says "hard" like that means something. It doesn't. Real exams mix remember / understand / apply / analyze / evaluate whether the app is ready or not.

So I got angry in a productive way.

**Noodl** is my answer: take *your* material (notes, PDFs, topic text, URLs, library items), force an explicit **Bloom C1–C5 percentage blueprint** you can see and edit, generate questions grounded in that source, practice under real pressure modes, pull weak concepts back with spaced review, and — this part is non-negotiable for me — let someone **publish a public study pack** so a whole class isn't blocked because only one person has an API key.

I'm not building "another chatbot with a quiz button." I'm trying to build a **deliberate cognitive workout machine** for people who refuse to confuse rereading with learning.

If that sounds ambitious for a Build Week project that didn't even exist as this repo two days ago — good. Ambition is the point.

---

## The dream I'm selling

Imagine a study group where:

1. One person does the heavy generation pass on their materials.  
2. Everyone else opens a **share link** and practices — retrieval, flashcards, spaced review — **without** each student wiring a paid model account.  
3. The quiz isn't a mystery bag. You can look at the Bloom mix and say "we're under-trained on application, bump C3."  
4. Weak concepts come back later instead of dying in a notes app.  
5. Optional hands-free modes exist for people who want them, without trapping keyboard/touch users into a camera cult.  
6. Your keys and your private notes default to **you**, not a black-box homework cloud.

That's the social value. Not "AI is cool." **Access + intentional practice + ownership.**

OpenAI Build Week exists to show what happens when builders stop treating agents as autocomplete and start treating them as multi-hour engineering partners. Noodl is my Education-track bet on that future: GPT-5.6 + Codex didn't just "help me type" — they made a production-shaped product possible in a window where solo patch-coding was failing me.

**Live demo (please click this):** [https://noodl-beta.vercel.app/](https://noodl-beta.vercel.app/)

---

## For judges (OpenAI Build Week · Education)

| Item | Where |
|---|---|
| Track | **Education** — AI that helps students (and teachers) practice on real materials |
| Working product | [noodl-beta.vercel.app](https://noodl-beta.vercel.app/) |
| Source | [github.com/SeraKah-1/noodl](https://github.com/SeraKah-1/noodl) · MIT · public |
| Repo age | **Created July 18, 2026** — check the commit graph. This is a Build Week construction, not a rebranded multi-year codebase |
| README / setup | This file · `npm ci` · `npm run dev` · key in Settings |
| Demo video | YouTube &lt;3 min (upload for Devpost) — until then the live site is the truth |
| Codex `/feedback` session ID | Goes in the **Devpost form** after you run `/feedback` in the Codex session that carried the main remediation (not stored in git) |
| How Codex + GPT-5.6 were used | Full story in [Build Week story](#build-week-story-messy-and-real) — analysis-first, long-horizon remediation, agentic planning |

Judging axes I care about matching:

- **Technological implementation** — non-trivial app, real Codex leverage, not a thin wrapper  
- **Design** — complete product loop you can run today, not a notebook screenshot  
- **Potential impact** — retrieval practice + shareable packs for real student economics  
- **Quality of idea** — Bloom-as-contract + local-first + public packs, not "GPT makes quiz"  

---

## What Noodl does (in painful detail)

### 1) You bring material. Noodl plans before it spams questions.

Input paths: upload files, paste topic, pull from library, URL flows where wired. The system looks at language, mines concept candidates, tags priorities (high / moderate / filler), then allocates question counts against **your** Bloom distribution.

This is the part I refuse to compromise on. If you can't see the plan, the model is driving. If you can see and set C1–C5 percentages, **you** are designing the workout.

| Level | Cognitive target | Example intention |
|---|---|---|
| **C1** | Remember | Term, definition, fact |
| **C2** | Understand | Explain / distinguish |
| **C3** | Apply | Use in a concrete situation |
| **C4** | Analyze | Compare, decompose, infer |
| **C5** | Evaluate | Judge with criteria |

Bloom is not magic grade prophecy. It's a shared vocabulary so learner and generator are arguing about the *same* thing.

```mermaid
flowchart LR
    A["Your material"] --> B["Concept priorities"]
    B --> C["Bloom % blueprint"]
    C --> D["Grounded batches"]
    D --> E["Active retrieval"]
    E --> F["Explanations"]
    F --> G["Spaced review"]
    G --> E
    D --> H["Public pack"]
```

### 2) Generation that doesn't die in one giant JSON explosion

I got burned by "one huge request" designs — token limits, malformed JSON, entire quiz gone. Noodl generates in **bounded parallel waves**, keeps fulfilled results, validates/normalizes, rejects near-duplicates, tops up when short, and can smart-overflow upward a Bloom level when the source is exhausted instead of asking the same fact five times.

Is it perfect? No. Is it engineered like I care if a student loses a 40-question set at 1am? Yes.

```mermaid
flowchart TD
    S["Assessment plan"] --> W["Parallel wave"]
    W --> B1["Batch A"]
    W --> B2["Batch B"]
    W --> B3["Batch C"]
    B1 --> R["Keep successes"]
    B2 --> R
    B3 --> R
    R --> V["Validate"]
    V --> D["Dedupe"]
    D --> Q{"Target met?"}
    Q -->|No| T["Bounded top-up"]
    T --> V
    Q -->|Yes| P["Playable quiz"]
```

### 3) Practice modes that feel different on purpose

- **Standard** — clean retrieval  
- **Survival** — pressure; mistakes hurt  
- **Time Rush** — clock is part of the workout  
- **Keyboard-first controls** — because pointing at every option with a mouse during a 50-question set is cruelty  
- **Flashcards** — rate recall when you don't need full MCQ chrome  
- **Neuro-Sync** — SM-2-style return of weak items (the concepts you keep missing should not get to hide)  
- **Mix Room** — smash multiple saved units into a broader exam simulation  

### 4) When text is not enough

- **Visual Lab** — scan material for concepts that deserve interactive HTML5 sims / diagrams / process flows (pick a real study pack first — no orphan "demo with empty topic string")  
- **Knowledge graph** — concept map from questions + explanations, zoom/pan, click into review  
- **Material overview / deep insight** — cluster what the quiz is *actually* testing  

### 5) Access & ownership (the political part, said out loud)

- **BYOK multi-provider** at runtime — Gemini, OpenAI, Anthropic, OpenRouter, Groq, custom OpenAI-compatible endpoints. Settings picks the model that then powers generate / chat / viz / etc.  
- **Local-first** — IndexedDB is the source of truth. Works as guest.  
- **Optional Supabase** — auth, outbox sync, tombstones, public discovery with RLS. Offline mutations shouldn't resurrect like zombies.  
- **Public packs** — privacy-safe projection so sharing doesn't mean "here is my entire private library dump."  
- **Camera optional** — nose-tip dwell / hand gestures after eye-tracking on consumer webcams proved unstable. Keyboard and touch remain primary. MediaPipe stays on-device. Camera off by default.

### 6) Diagrams for people who want to stare at the system

English exports live in [`docs/diagrams/`](docs/diagrams/) — learning loop, generation pipeline, architecture, sync, visual lab, graph UX, accessibility, provider routing, Bloom allocation, security map, and more. I generated them because if I'm going to claim architecture, I should show it.

---

## Build Week story (messy and real)

I'm going to be annoyingly honest, because the git history is public and lying is pointless.

### This repo is new. The *ideas* are older.

Noodl as **this GitHub repository** was created **July 18, 2026**. Open the commits. It's a Build Week creature. What I *did* have was a graveyard of my own experiments — quiz generators, flashcard flows, visual/simulation toys, camera control prototypes, sync attempts — sitting in other folders and half-finished branches. Build Week was the deadline-shaped excuse to fuse them into **one** product instead of another abandoned demo.

So no: this is not "secretly a 2023 product with a fresh README." It is a rework under fire.

### Vibecoding week one energy (it worked until it didn't)

I vibecoded hard. Multiple AI coding agents. Hop agent when stuck. Ship UI that looks complete. For a while it felt like cheating physics — features appearing in hours that used to take days.

Then reality collected payment.

Under the pretty screens, systems disagreed with each other. I'd ask an agent to fix a bug. It would add more code. The symptom would move. Or a new one would spawn. I burned **hours** in pure debugging loops — grading weirdness, resume state, sync hanging forever, sharing edge cases, provider routing, security stuff I did not want to ship half-done, accessibility paths that only worked in the happy demo. I could not tell if the foundation was trash or if patch-on-patch had just buried the real bugs under new bugs.

That spiral is what a lot of "AI coding" looks like if you only ever say "fix this" without changing how you work.

### Then I used Codex the way Build Week is actually about

I moved the serious work into **Codex** powered by **GPT-5.6** — the stack OpenAI is putting in front of builders this week for a reason.

And I changed the prompt strategy completely.

I did **not** open with "add three features."

I asked for a full repository analysis. Senior engineer tone. Correctness, clean structure, security, UX engineering, the unsexy audit. Not a vibe. A **diagnosis**.

What came back genuinely shocked me. Detailed. Cross-layer. Needle-in-the-haystack findings I didn't know were there. That was the first time in the whole week I felt like the tool was smarter than my panic.

After I sat with the analysis, I authorized remediation. I typed almost no application code myself. I steered. Chat count stayed small. Runtime of the agent work was long — hours, not seconds — with large diffs, lots of deletion, tests and gates showing up, production-shaped cleanup. Stuff that would have been **weeks for a small human team** if we were grinding it classic-style compressed into a window that still feels unreal when I scroll the PR history.

What excited me most about GPT-5.6-in-Codex wasn't "it writes React." Lots of models write React. It was:

- holding a plan across a messy multi-surface app  
- understanding *deep* intent of a fix instead of local patch theater  
- agentic follow-through over long tasks  
- deleting dead paths instead of only appending  

That's the OpenAI story I'm here to tell. Build Week is a showcase of **agentic engineering**, not autocomplete cosplay — and Noodl is my Education proof that you can take a chaotic vibecoded mash-up and push it toward something I'm willing to put on Vercel with my name attached.

```mermaid
flowchart LR
    A["My old experiments"] --> B["One-day vibe mash-up"]
    B --> C["Looks done"]
    C --> D["Patch spiral / hours lost"]
    D --> E["Codex + GPT-5.6: analyze whole repo"]
    E --> F["Remediate, delete, verify"]
    F --> G["noodl-beta.vercel.app"]
```

### What I still own as the human

Bloom-as-contract. BYOK economics. Local-first. Camera as opt-in. Public packs without leaking private source. Honest limits (no fake grade guarantees). The product *taste*. Codex accelerated implementation at a level that still makes me slightly giddy — and the direction is still mine.

---

## Architecture (for the obsessed)

Browser local-first shell:

```mermaid
flowchart TB
    subgraph Browser["Browser"]
        UI["React 19 UI"]
        STORE["Zustand"]
        ORCH["Assessment + providers"]
        IDB[("IndexedDB truth")]
        VISION["MediaPipe opt-in"]
        PWA["Vite PWA shell"]
        UI --> STORE --> ORCH
        STORE <--> IDB
        UI --> VISION
        PWA --> UI
    end
    ORCH --> BYOK["BYOK providers"]
    IDB <--> OUT["Outbox + tombstones"]
    OUT <--> SUPA[("Supabase Auth · Postgres · RLS")]
    SUPA --> PUB["Public pack projection"]
```

Sync when online + signed in; offline edits queue; deletes use tombstones so they don't resurrect. Diagrams and tables: [`docs/diagrams/`](docs/diagrams/).

Security boundaries worth shouting: no production secrets in `VITE_*`, keys stay client-side, camera defaults off, public share is a projection. Details in [`SECURITY.md`](SECURITY.md).

---

## Run it tonight

### Requirements

- Node.js 20+ (CI has used Node 24)  
- npm  
- A provider API key for generation  
- Optional Supabase for auth / sync / public discovery  

```bash
git clone https://github.com/SeraKah-1/noodl.git
cd noodl
cp .env.example .env.local
npm ci
npm run dev
```

Open the Vite URL. Fastest path: **Settings → AI providers → paste key → Save → generate**.

### Optional Supabase

1. Create a project  
2. Apply [`supabase/schema.sql`](supabase/schema.sql) or migrations under [`supabase/migrations/`](supabase/migrations/)  
3. Enable Google auth; add localhost + production URLs to redirect allow-list  
4. Set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No Supabase? Local guest study still works. Cloud features just stay dark.

### Quality gates

```bash
npm run lint    # strict TypeScript
npm test        # behavior + security regressions
npm run build   # typecheck + production PWA bundle
```

CI runs install / lint / test / build / audit on `main`.

### Project map

```text
components/     product screens (40+), modals, accessible chrome
services/       generation, providers, storage, sync, SRS, viz, graph, i18n, …
store/          Zustand app state
supabase/       schema + hardening migrations
tests/          node regression suite
docs/diagrams/  exported architecture images (English)
App.tsx         shell + view lifecycle
```

---

## Honest limits (excited ≠ delusional)

- Generation needs a key unless you're opening a shared public pack  
- Camera modes depend on device and lighting; keyboard/touch stay first-class  
- Bloom targets shape intent; they don't certify perfect question taxonomy  
- Cross-device sync needs a correctly migrated Supabase project  
- Demo video + Codex `/feedback` ID belong in Devpost — live site is already up  

I'm not going to claim Noodl replaces teachers or predicts exam scores. I *will* claim it makes intentional retrieval practice more accessible and more inspectable than yellow highlighters and mystery AI quizzes.

---

## What's next (I'm not done dreaming)

- Zero-key sample deck so every judge can click without configuring providers  
- Human-labeled evaluation set for Bloom / groundedness  
- Smarter recommendations for the learner's next Bloom mix  
- Public pack moderation + educator curation  
- Deeper assistive-input calibration  
- That &lt;3 minute YouTube walkthrough with audio covering Codex + GPT-5.6 usage  

---

## Research that feeds the idealism (not "we proved grades")

- [Retrieval practice improves learning vs repeated studying](https://pmc.ncbi.nlm.nih.gov/articles/PMC4593518/)  
- [Question generation using Bloom’s Taxonomy](https://aclanthology.org/2024.bea-1.1/)  

Direction, not a certificate.

---

## Contributing / license

PRs welcome if they preserve: source-grounded generation, explicit learning design, local-first ownership, accessible defaults, honest claims.

```bash
git checkout -b feat/your-change
npm ci && npm run lint && npm test && npm run build
```

Never commit `.env.local`, API keys, service-role secrets, or private student material.

**MIT** — [LICENSE](LICENSE)

---

<p align="center">
  <strong>Use your noodle.</strong><br />
  <sub>
    Built screaming-excited during OpenAI Build Week · Education<br />
    with Codex + GPT-5.6 as the long-horizon engineering partner that made shipping possible<br />
    <a href="https://noodl-beta.vercel.app/">noodl-beta.vercel.app</a>
  </sub>
</p>
