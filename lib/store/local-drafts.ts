/**
 * Drafts kept in the browser.
 *
 * Until Supabase is wired this is the only copy of a Mandalart, so it is
 * written after every step rather than on completion — the old app lost all 64
 * cells on a refresh, which is the failure this exists to remove.
 *
 * Everything here tolerates storage being unavailable. Private windows and
 * blocked site data both throw on access, and a planner that crashes instead of
 * degrading would be worse than one that simply cannot remember.
 */

import {
  ACTIONS_PER_SUBGOAL,
  SUBGOAL_COUNT,
  type EditorCell,
  type EditorDraft,
  type Language,
} from "../types"

const INDEX_KEY = "mandalart.drafts"
const DRAFT_PREFIX = "mandalart.draft."

/** Drafts older than this are cleared, matching the 24h server-side draft TTL. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    // Touching the property is itself what throws when site data is blocked.
    return window.localStorage
  } catch {
    return null
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function cell(content: string, metric: string | null = null): EditorCell {
  return { id: newId(), content, metric, isConfirmed: false, isEditing: false }
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

function readIndex(store: Storage): string[] {
  try {
    const raw = store.getItem(INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []
  } catch {
    return []
  }
}

function writeIndex(store: Storage, ids: string[]): void {
  try {
    store.setItem(INDEX_KEY, JSON.stringify(ids))
  } catch {
    /* quota or blocked storage — the draft in memory still works */
  }
}

export function loadDraft(id: string): EditorDraft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(DRAFT_PREFIX + id)
    if (!raw) return null
    const draft = JSON.parse(raw) as EditorDraft
    // A shape from an older build is not worth crashing over.
    if (!draft || typeof draft.mainGoal !== "string" || !Array.isArray(draft.subgoals)) {
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function saveDraft(draft: EditorDraft): EditorDraft {
  const stamped: EditorDraft = { ...draft, updatedAt: new Date().toISOString() }
  const store = storage()
  if (!store) return stamped

  try {
    store.setItem(DRAFT_PREFIX + stamped.id, JSON.stringify(stamped))
    const ids = readIndex(store).filter((id) => id !== stamped.id)
    writeIndex(store, [stamped.id, ...ids])
  } catch {
    /* see above — never let a save failure take the screen down */
  }
  return stamped
}

export function deleteDraft(id: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(DRAFT_PREFIX + id)
    writeIndex(
      store,
      readIndex(store).filter((existing) => existing !== id),
    )
  } catch {
    /* nothing useful to do */
  }
}

/** Most recently updated first. Drops index entries whose draft is gone. */
export function listDrafts(): EditorDraft[] {
  const store = storage()
  if (!store) return []

  const drafts: EditorDraft[] = []
  const live: string[] = []
  for (const id of readIndex(store)) {
    const draft = loadDraft(id)
    if (draft) {
      drafts.push(draft)
      live.push(id)
    }
  }
  writeIndex(store, live)
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Clears drafts past the 24h window. Safe to call on every load. */
export function purgeExpiredDrafts(): void {
  const cutoff = Date.now() - MAX_AGE_MS
  for (const draft of listDrafts()) {
    if (Date.parse(draft.updatedAt) < cutoff) deleteDraft(draft.id)
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createDraft(
  mainGoal: string,
  language: Language,
  subgoals: string[],
): EditorDraft {
  const now = new Date().toISOString()
  return {
    id: newId(),
    mainGoal,
    language,
    step: "review-subgoals",
    subgoals: subgoals.slice(0, SUBGOAL_COUNT).map((content) => cell(content)),
    actions: {},
    createdAt: now,
    updatedAt: now,
  }
}

/** Attaches one subgoal's generated actions, replacing anything already there. */
export function withActions(
  draft: EditorDraft,
  subgoalId: string,
  actions: { content: string; metric: string | null }[],
): EditorDraft {
  return {
    ...draft,
    actions: {
      ...draft.actions,
      [subgoalId]: actions
        .slice(0, ACTIONS_PER_SUBGOAL)
        .map((a) => cell(a.content, a.metric)),
    },
  }
}

// ---------------------------------------------------------------------------
// Cell edits
// ---------------------------------------------------------------------------

type CellPatch = Partial<Pick<EditorCell, "content" | "isConfirmed" | "isEditing">>

export function patchSubgoal(
  draft: EditorDraft,
  index: number,
  patch: CellPatch,
): EditorDraft {
  return {
    ...draft,
    subgoals: draft.subgoals.map((c, i) => (i === index ? { ...c, ...patch } : c)),
  }
}

export function patchAction(
  draft: EditorDraft,
  subgoalId: string,
  index: number,
  patch: CellPatch,
): EditorDraft {
  const list = draft.actions[subgoalId]
  if (!list) return draft
  return {
    ...draft,
    actions: {
      ...draft.actions,
      [subgoalId]: list.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    },
  }
}

export function confirmAllSubgoals(draft: EditorDraft): EditorDraft {
  return {
    ...draft,
    subgoals: draft.subgoals.map((c) => ({ ...c, isConfirmed: true, isEditing: false })),
  }
}

export function confirmAllActions(draft: EditorDraft, subgoalId: string): EditorDraft {
  const list = draft.actions[subgoalId]
  if (!list) return draft
  return {
    ...draft,
    actions: {
      ...draft.actions,
      [subgoalId]: list.map((c) => ({ ...c, isConfirmed: true, isEditing: false })),
    },
  }
}
