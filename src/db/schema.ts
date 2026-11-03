// Creative Notes: on-device schema (IndexedDB via Dexie 4).
// The real data store: everything lives on the device in IndexedDB.
//
// Rules:
// - ids are UUIDv7 strings (sortable by creation time); times are epoch ms UTC.
// - Fields named `enc` hold an AES-GCM blob of the record's private text fields
//   when the passcode lock is on; otherwise the plain fields are used and `enc`
//   is absent. Only indexed fields below stay in plain text.
// - IndexedDB has no foreign keys: deleteMeeting() cascades in one transaction.
// - Dexie index syntax: first entry is the primary key, `&` = unique,
//   `[a+b]` = compound index, `*` = multi-entry.

import Dexie, { type Table } from 'dexie';

export type Id = string;
export type Ms = number;

export type EncBlob = { iv: Uint8Array; data: ArrayBuffer };

export type CaptureMode = 'online' | 'offline' | 'mixed';
export type MeetingStatus = 'recording' | 'processing' | 'done' | 'failed';
export type AiStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Meeting {
  id: Id;
  title?: string;                 // private
  startedAt: Ms;
  endedAt?: Ms;
  durationS?: number;
  status: MeetingStatus;
  captureMode: CaptureMode;
  aiStatus: AiStatus;
  language?: string;              // BCP 47, or 'auto'
  speakerCount?: number;
  source: 'live' | 'import';
  locked?: boolean;
  createdAt: Ms;
  updatedAt: Ms;
  enc?: EncBlob;
}

export interface Segment {
  id: Id;
  meetingId: Id;
  startMs: number;                // from meeting start
  endMs: number;
  speaker?: string;               // 'S1', 'You'... absent offline
  text?: string;                  // private
  engine: 'cloud' | 'whisper' | 'browser' | 'demo';
  enc?: EncBlob;
}

export interface Insight {
  id: Id;
  meetingId: Id;
  kind: 'decision' | 'risk' | 'idea' | 'action';
  atMs: number;
  text?: string;                  // private
  enc?: EncBlob;
}

export interface Summary {
  meetingId: Id;                  // primary key: one per meeting
  overview?: string;              // private
  decisions?: string[];           // private
  keyTopics?: { title: string; detail: string }[];  // private
  generatedMs: number;
  model: string;
  updatedAt: Ms;
  enc?: EncBlob;
}

export interface ActionItem {
  id: Id;
  meetingId: Id;
  owner?: string;                 // private
  text?: string;                  // private
  dueText?: string;               // private
  dueAt?: Ms;
  priority: 1 | 2 | 3;
  done: 0 | 1;                    // number so it can be indexed
  exportedAt?: Ms;
  /** When to remind; reminders are shown once, then remindedAt is set. */
  remindAt?: Ms;
  remindedAt?: Ms;
  completedAt?: Ms;
  enc?: EncBlob;
}

/** A to-do the user wrote (not from a meeting summary). */
export interface Todo {
  id: Id;
  text?: string;                  // private
  done: 0 | 1;
  dueAt?: Ms;
  remindAt?: Ms;
  remindedAt?: Ms;
  completedAt?: Ms;
  /** Where it came from: typed, spoken, or made from a quick note. */
  source: 'typed' | 'dictated' | 'note';
  noteId?: Id;
  createdAt: Ms;
  updatedAt: Ms;
  enc?: EncBlob;
}

export interface ManualNote {
  id: Id;
  meetingId: Id;
  atMs: number;
  text?: string;                  // private
  enc?: EncBlob;
}

export interface Note {
  id: Id;
  meetingId?: Id;                 // nullable: survives meeting delete
  source: 'typed' | 'dictated' | 'shortcut' | 'share' | 'inbox';
  inboxId?: string;               // unique: an inbox pull never duplicates
  text?: string;                  // private
  tags?: string[];                // private
  createdAt: Ms;
  updatedAt: Ms;
  enc?: EncBlob;
}

export interface ScoreCard {
  meetingId: Id;
  overall: number;                // 0-100
  decisionDensity: number;
  actionQuality: number;
  participationBalance: number;
  timeEfficiency: number;
  updatedAt: Ms;
}

export interface ChatMessage {
  id: Id;
  thread: 'global' | Id;          // 'global' = Ask, otherwise a meeting id (copilot)
  role: 'user' | 'assistant';
  content?: string;               // private
  citations?: Id[];               // private (meeting ids)
  createdAt: Ms;
  enc?: EncBlob;
}

export interface AiJob {
  id: Id;
  meetingId: Id;
  kind: 'summary' | 'insights' | 'score';
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  nextRunAt: Ms;
  lastError?: string;             // error code only, never content
  contentHash?: string;           // sha-256 of the transcript sent
  createdAt: Ms;
  updatedAt: Ms;
}

export interface Setting { key: string; value: unknown }

export interface CryptoMeta {
  key: 'passcode';
  salt: Uint8Array;
  iterations: number;             // 600_000
  verifier: EncBlob;              // encrypts a known string to check the passcode
}

export class CreativeNotesDB extends Dexie {
  meetings!: Table<Meeting, Id>;
  segments!: Table<Segment, Id>;
  insights!: Table<Insight, Id>;
  summaries!: Table<Summary, Id>;
  actionItems!: Table<ActionItem, Id>;
  manualNotes!: Table<ManualNote, Id>;
  notes!: Table<Note, Id>;
  scoreCards!: Table<ScoreCard, Id>;
  chatMessages!: Table<ChatMessage, Id>;
  aiJobs!: Table<AiJob, Id>;
  todos!: Table<Todo, Id>;
  settings!: Table<Setting, string>;
  cryptoMeta!: Table<CryptoMeta, string>;

  constructor() {
    super('creative-notes');
    this.version(1).stores({
      meetings:     'id, startedAt, status, aiStatus, captureMode, updatedAt',
      segments:     'id, meetingId, [meetingId+startMs]',
      insights:     'id, meetingId, [meetingId+atMs], kind',
      summaries:    'meetingId',
      actionItems:  'id, meetingId, done, dueAt',
      manualNotes:  'id, meetingId, [meetingId+atMs]',
      notes:        'id, createdAt, meetingId, source, &inboxId',
      scoreCards:   'meetingId',
      chatMessages: 'id, [thread+createdAt]',
      aiJobs:       'id, &[meetingId+kind], status, nextRunAt',
      settings:     'key',
      cryptoMeta:   'key',
    });
    // v2: to-dos, and reminders on to-dos and meeting action items. Additive: existing data is kept.
    this.version(2).stores({
      actionItems:  'id, meetingId, done, dueAt, remindAt',
      todos:        'id, done, dueAt, remindAt, createdAt, noteId',
    });
  }
}

export const db = new CreativeNotesDB();
