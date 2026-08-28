# AbhiLife

AbhiLife is a private, offline-first personal improvement system built for one user. It turns raw thoughts into investigated goals, goals into clear next actions, and daily execution into a long-term life record.

## Locked architecture

- UI: HTML + CSS + JavaScript
- Build tool: Vite
- Android wrapper: Capacitor
- Primary personal data: user-owned `Documents/AbhiLife` folder on Android
- Android folder access: Storage Access Framework (SAF) with persistable read/write permission
- Browser persistence: intentionally not used for personal data
- Data format: versioned structured JSON plus original-format attachments
- Backup: portable `.abhilife` archive planned for a later phase
- Cloud database: none by default
- GitHub: application source code only; never personal life data

## Current status — v0.12.0 Day Rescue

The current stable direction includes:

- Calm Minimal Personal OS design system with light/dark system appearance
- primary navigation: Today / Inbox / Goals / More
- native Life Inbox capture, edit, archive and restore
- one-question-at-a-time Goal Investigation with resumable answers
- user-controlled outcomes: Real Goal / Someday / Think More / Archive
- Goal Definition with department, why, outcome, success condition, priority, capacity and optional target date
- Goal Breakdown: strategy → milestones → projects → weekly actions → tasks → Next Action
- Ready-goal activation into the Today daily record
- Today execution states: Done / Partial / Missed / Intentionally Skipped
- Most Important Win selection
- missed-task reason capture with deterministic next-adjustment guidance
- Day Rescue: one tap protects the pending Most Important Win plus one shortest useful remaining action
- Day Rescue intentionally releases other pending items without treating them as failure
- a 5-minute `Prepare tomorrow` recovery action inside the rescue plan
- new goal actions are deferred from the current day after Day Rescue locks the remaining plan
- Day Rescue completion stored in the permanent daily record
- one-file-per-day history contract: `records/YYYY/MM/DD.json`
- Android SAF native storage bridge and persistent folder reconnection
- new-vault initialization that refuses to overwrite existing data
- atomic-style writes, read-back validation, rollback and `.recovery/` snapshots
- full vault health checks and repair support
- web preview that never becomes the personal-data master
- GitHub Actions web verification plus reproducible Android debug APK builds
- Vercel production deployment support

## Core behavior rule

AbhiLife does not calculate a life score and does not turn one miss into a failed day. Execution outcomes are evidence. Missed reasons are used to improve the next plan, and Day Rescue narrows the remaining day instead of trying to recover the original schedule at all costs.

## Development

```bash
npm install
npm run dev
```

Full verification:

```bash
npm run verify
```

The Android CI workflow generates a fresh Capacitor Android project, installs the local AbhiLife SAF plugin, compiles a debug APK, and uploads it as the `AbhiLife-debug-apk` workflow artifact.

## Data principle

**The app is replaceable. The user's life data is not.**
