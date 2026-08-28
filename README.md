# AbhiLife

AbhiLife is a private, offline-first personal improvement system built for one user. It turns raw thoughts into investigated goals, goals into clear next actions, recurring behaviors into evidence, and daily execution into a long-term life record.

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

## Current status — v0.15.0 Maintenance Engine

The current stable direction includes:

- Calm Minimal Personal OS design system with light/dark system appearance
- primary navigation: Today / Inbox / Goals / More
- native Life Inbox capture, edit, archive and restore
- Goal Investigation → Definition → Breakdown → Activation → Today execution
- Today states: Done / Partial / Missed / Intentionally Skipped
- Most Important Win and Day Rescue
- positive Habit Engine under `More → Habits`
- positive habits with cue, context, Minimum Version, Preferred Version and weekday recurrence
- separate Bad Habit Engine under `More → Bad Habits`
- unwanted behavior analysis through trigger/context, reward/cost, friction, environment and replacement behavior
- separate Maintenance Engine under `More → Maintenance`
- maintenance categories for sleep, health routines, hygiene, meals, medication routine, basic finance, home and other protective systems
- maintenance definitions with purpose, Minimum Acceptable Condition and selectable weekday schedule
- Maintenance states: Active / Paused / Archived with restoration and no history deletion
- scheduled maintenance creates one daily evidence event per item/date without duplicates
- Maintenance results: Done / Partial / Missed / Intentionally Skipped
- missed-maintenance reason capture reuses deterministic adjustment guidance
- medication entries are user-authored routine tracking only; AbhiLife does not recommend medicines, doses or treatment
- no streak, growth points, shame score or gamified life score
- task, positive-habit, bad-habit and maintenance evidence coexist in `records/YYYY/MM/DD.json`
- maintenance definitions remain in the existing recovery-protected `maintenance/items.json`
- Android SAF native storage bridge and persistent folder reconnection
- atomic-style writes, read-back validation, rollback and `.recovery/` snapshots
- web preview that never becomes the personal-data master
- GitHub Actions web verification plus reproducible Android debug APK builds
- Vercel production deployment support

## Core behavior rule

AbhiLife does not calculate a life score and does not turn one miss into a failed day or identity verdict. Goals, positive habits, unwanted habits and maintenance remain distinct models. Maintenance protects normal functioning; it is not treated as growth or achievement points.

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
