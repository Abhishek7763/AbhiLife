# AbhiLife

AbhiLife is a private, offline-first personal improvement system built for one user. It is designed to turn raw thoughts into validated goals, goals into clear next actions, and daily execution into a long-term life record.

## Locked architecture

- UI: HTML + CSS + JavaScript
- Build tool: Vite
- Android wrapper: Capacitor
- Primary personal data: user-owned `Documents/AbhiLife` folder on Android
- Browser persistence: intentionally not used for personal data
- Data format: versioned, structured JSON plus original-format attachments
- Backup: portable `.abhilife` archive (planned)
- Cloud database: none by default
- GitHub: application source code only; never personal life data

## Current status

Foundation v0.1 includes:

- mobile-first application shell
- Today screen concept
- Life Inbox preview
- Life Departments foundation
- versioned data schema factories
- storage boundary that prevents web preview from becoming the master data store
- Capacitor-ready configuration
- Vercel-ready static build

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Android scaffolding will be added in the native-storage phase after the filesystem contract is finalized.

## Data principle

**The app is replaceable. The user's life data is not.**

The long-term target is that a new phone can reconnect to an existing AbhiLife folder or restore a portable `.abhilife` backup and continue from the same history.
