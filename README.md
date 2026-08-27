# AbhiLife

AbhiLife is a private, offline-first personal improvement system built for one user. It is designed to turn raw thoughts into validated goals, goals into clear next actions, and daily execution into a long-term life record.

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

## Current status — v0.5.0 Working Life Inbox

The current build includes:

- mobile-first application shell
- Android SAF native storage bridge and persistent AbhiLife folder connection
- versioned data contract and validators
- native atomic-style text writes with temporary verification and rollback
- validated last-known-good snapshots under `.recovery/`
- vault health scan and safe recovery actions
- **working native Life Inbox stored in `inbox/items.json`**
- capture raw thoughts without categorizing them
- newest-first active thought list
- inline edit flow
- soft archive instead of destructive deletion
- archived-thought view and restore
- item-level Inbox validation and duplicate-ID rejection
- recovery-safe Inbox writes for every capture/edit/archive/restore
- web preview that intentionally never persists personal thoughts
- one-file-per-day history path contract (`records/YYYY/MM/DD.json`)
- Life Departments foundation
- Today screen concept
- GitHub Actions web verification
- reproducible Android debug APK build and artifact upload
- Vercel production deployment support

## Inbox principle

**Capture first. Decide later.**

An Inbox item is only a raw thought. Capturing something does not make it a goal. Future phases will send selected thoughts through Goal Investigation before they can become active goals.

Archive is intentionally used instead of hard-delete so an impulsive cleanup cannot permanently erase a thought. Archived items are hidden from the active Inbox and can be restored.

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

The long-term target is that a new phone can reconnect to an existing AbhiLife folder or restore a portable `.abhilife` backup and continue from the same history.
