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

## Current status — v0.3.0 Native Storage Foundation

The current build includes:

- mobile-first application shell
- Today screen concept
- Life Inbox preview
- Life Departments foundation
- versioned data contract and validators
- one-file-per-day history path contract (`records/YYYY/MM/DD.json`)
- safe path generation and traversal protection
- Android SAF native storage bridge
- persistent AbhiLife folder connection/reconnection status
- new-vault initialization that refuses to overwrite existing data
- atomic-style text writes with temporary verification and recovery copy
- web preview that intentionally never becomes the personal-data master
- GitHub Actions web verification
- reproducible Android debug APK build and artifact upload
- Vercel production deployment support

The Inbox UI is still a preview: permanent Inbox writes will be enabled only after the storage foundation is locked and tested on-device.

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
