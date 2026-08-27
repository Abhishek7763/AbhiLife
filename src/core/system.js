export const APP_NAME = 'AbhiLife';
export const APP_VERSION = '0.8.0';
export const DATA_SCHEMA_VERSION = 1;
export const ABHILIFE_ROOT_NAME = 'AbhiLife';
export const DATA_FORMAT = 'abhilife-data';

export const DEFAULT_LIFE_AREAS = Object.freeze([
  { id: 'health', name: 'Health', order: 10 },
  { id: 'career', name: 'Career', order: 20 },
  { id: 'finance', name: 'Finance', order: 30 },
  { id: 'relationships', name: 'Relationships', order: 40 },
  { id: 'learning', name: 'Learning', order: 50 },
  { id: 'personal', name: 'Personal', order: 60 }
]);

export const LIFE_AREAS = DEFAULT_LIFE_AREAS.map((area) => area.name);

export const AREA_STATES = Object.freeze([
  'not_assessed',
  'on_track',
  'maintaining',
  'needs_attention',
  'blocked',
  'no_current_focus'
]);

export const GOAL_STATES = Object.freeze([
  'inbox',
  'investigating',
  'defined',
  'someday',
  'active',
  'paused',
  'completed',
  'dropped'
]);

export const GOAL_PRIORITIES = Object.freeze(['low', 'medium', 'high']);

export const INBOX_THOUGHT_STATES = Object.freeze([
  'inbox',
  'investigating',
  'accepted',
  'someday',
  'archived'
]);

export const INVESTIGATION_QUESTION_KEYS = Object.freeze([
  'origin',
  'why',
  'outcome',
  'cost',
  'process',
  'control',
  'timing',
  'conflict',
  'commitment'
]);

export const INVESTIGATION_STATUSES = Object.freeze(['draft', 'completed']);
export const INVESTIGATION_DECISIONS = Object.freeze(['real_goal', 'someday', 'think_more', 'archive']);

export const EXECUTION_STATES = Object.freeze(['done', 'partial', 'missed', 'skipped']);
export const HABIT_STATES = Object.freeze(['active', 'paused', 'archived']);
export const REVIEW_TYPES = Object.freeze(['weekly', 'monthly', 'yearly']);

export const MISSED_REASONS = Object.freeze([
  'forgot',
  'no_time',
  'low_energy',
  'too_difficult',
  'too_large',
  'unclear',
  'distraction',
  'unexpected_work',
  'not_important_now',
  'other'
]);
