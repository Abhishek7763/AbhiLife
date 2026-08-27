import { ABHILIFE_ROOT_NAME } from '../core/system.js';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export const DATA_PATHS = Object.freeze({
  rootName: ABHILIFE_ROOT_NAME,
  manifest: 'manifest.json',
  settings: 'settings.json',
  inbox: 'inbox/items.json',
  departments: 'departments/items.json',
  goals: 'goals/items.json',
  habits: 'habits/items.json',
  maintenance: 'maintenance/items.json',
  plansDir: 'plans',
  recordsDir: 'records',
  reviewsDir: 'reviews',
  notesDir: 'notes',
  attachmentsDir: 'attachments',
  backupsDir: 'backups',
  recoveryDir: '.recovery'
});

export const REQUIRED_DIRECTORIES = Object.freeze([
  'inbox',
  'departments',
  'goals',
  'habits',
  'maintenance',
  'plans',
  'records',
  'reviews',
  'notes',
  'attachments',
  'backups',
  '.recovery'
]);

export function assertSafeSegment(value, label = 'path segment') {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function assertSafeRelativePath(path, label = 'path') {
  if (typeof path !== 'string' || !path.trim() || path.startsWith('/') || path.includes('\\')) {
    throw new Error(`Invalid ${label}.`);
  }
  for (const segment of path.split('/')) assertSafeSegment(segment, label);
  return path;
}

export function recoverySnapshotPath(path) {
  return `${DATA_PATHS.recoveryDir}/${assertSafeRelativePath(path, 'recovery source path')}.last-good`;
}

export function recoveryCorruptPath(path) {
  return `${DATA_PATHS.recoveryDir}/${assertSafeRelativePath(path, 'recovery source path')}.corrupt`;
}

export function recordPath(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error('Daily record date must use YYYY-MM-DD.');
  }
  const [year, month, day] = dateISO.split('-');
  return `${DATA_PATHS.recordsDir}/${year}/${month}/${day}.json`;
}

export function planPath(goalId) {
  return `${DATA_PATHS.plansDir}/${assertSafeSegment(goalId, 'goal id')}.json`;
}

export function weeklyReviewPath(year, week) {
  const y = String(year);
  const w = String(week).padStart(2, '0');
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(w) || Number(w) < 1 || Number(w) > 53) {
    throw new Error('Invalid ISO week.');
  }
  return `${DATA_PATHS.reviewsDir}/weekly/${y}/W${w}.json`;
}

export function monthlyReviewPath(year, month) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || Number(m) < 1 || Number(m) > 12) {
    throw new Error('Invalid year or month.');
  }
  return `${DATA_PATHS.reviewsDir}/monthly/${y}/${m}.json`;
}
