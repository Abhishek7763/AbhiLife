# AbhiLife

AbhiLife is a private, offline-first personal improvement system built for one user. It is designed to turn raw thoughts into investigated goals, goals into clear next actions, and daily execution into a long-term life record.

## Locked architecture

- UI: HTML + CSS + JavaScript
- Build tool: Vite
- Android wrapper: Capacitor
- Primary personal data: user-owned `Documents/AbhiLife` folder on Android
- Android folder access: Storage Access Framework (SAF) with persistable read/write permission
- Browser persistence: intentionally not used for personal data
- Data format: versioned, structured JSON plus original-format attachments
- Backup: portable `.abhilife` archive (planned)
- Cloud database: none by default
- GitHub: application source code only; never personal life data

## Current status — v0.6.0 Goal Investigation

The current build includes:

- mobile-first application shell
- native Life Inbox capture, edit, archive and restore
- one-question-at-a-time Goal Investigation flow
- 9 reflection questions covering origin, why, outcome, cost, process, control, timing, conflict and commitment
- step-by-step investigation answers saved directly inside the Inbox record
- resumable investigation drafts with progress shown as answered questions, not a life score
- final user-controlled decisions: Real Goal, Someday, Think More, or Archive
- `Real Goal` moves a thought to `accepted` / Ready for Goal Definition; it is not activated automatically
- completed investigation answers remain preserved for future review
- backward-compatible Inbox data: v0.5 records without investigation fields still validate
- versioned data contract and validators
- one-file-per-day history path contract (`records/YYYY/MM/DD.json`)
- safe path generation and traversal protection
- Android SAF native storage bridge
- persistent AbhiLife folder connection/reconnection status
- new-vault initialization that refuses to overwrite existing data
- native atomic-style text writes with temporary verification and rollback
- validated last-known-good snapshots under `.recovery/`
- full health scans for required directories and critical JSON files
- safe restore that preserves a corrupt source copy before recovery
- app-level safe JSON writes with read-back validation and rollback
- web preview that intentionally never becomes the personal-data master
- GitHub Actions web verification and reproducible Android debug APK build
- Vercel production deployment support

## Goal Investigation rule

A raw thought is not automatically a goal. AbhiLife preserves the user's own reasoning and never calculates a score or makes the final decision. A `Real Goal` decision only means the thought is ready for the next Goal Definition phase.

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
