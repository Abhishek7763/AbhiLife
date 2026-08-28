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

## Current status — v0.14.0 Bad Habit Engine

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
- unwanted behavior definitions with Trigger, Time Pattern, Place/Context, Immediate Reward and Long-term Cost
- intervention planning through Remove Cue, Increase Friction, Environment Change and Replacement Behavior
- Bad Habit states: Active / Paused / Archived with restoration and no definition/history deletion
- multiple same-day behavior evidence events: Occurred / Interrupted / Replaced
- zero logged events are not automatically interpreted as success
- no streak, shame score or gamified life score
- task, positive-habit and bad-habit evidence coexist in `records/YYYY/MM/DD.json`
- backward-compatible reading of older daily records that do not yet contain `badHabitEvents`
- bad-habit definitions live separately at `habits/bad-items.json`
- optional bad-habit data participates in validated recovery snapshots and vault repair once it exists
- Android SAF native storage bridge and persistent folder reconnection
- atomic-style writes, read-back validation, rollback and `.recovery/` snapshots
- web preview that never becomes the personal-data master
- GitHub Actions web verification plus reproducible Android debug APK builds
- Vercel production deployment support

## Core behavior rule

AbhiLife does not calculate a life score and does not turn one miss or one unwanted-behavior occurrence into a failed day or identity verdict. Evidence is used to improve the system. Positive habits and unwanted habits remain distinct: positive habits are repeated intentionally; unwanted habits are analyzed through triggers, context, immediate reward, friction, environment and replacement behavior.

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
