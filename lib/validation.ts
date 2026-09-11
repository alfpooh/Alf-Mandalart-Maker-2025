/**
 * What counts as content a person actually wrote.
 *
 * One module because the browser and the server have to agree. The Save button
 * used to be enabled for a box holding nothing but spaces, and the server
 * stored whatever arrived, so a subgoal could be confirmed, counted towards
 * 8/8, and written to the database while being visually empty.
 */

/** Collapses surrounding whitespace. What gets stored, never the raw input. */
export function normalizeContent(text: string): string {
  return text.trim()
}

/** True when there is nothing to save — no text, or only whitespace. */
export function isBlank(text: string | null | undefined): boolean {
  return normalizeContent(text ?? "").length === 0
}

/**
 * Every cell trimmed, for the save path.
 *
 * A metric that is only whitespace becomes null rather than an empty string:
 * the column is nullable precisely because not every action has one, and "" and
 * null reading differently downstream is a bug waiting to happen.
 */
export function normalizeCell<T extends { content: string; metric: string | null }>(
  cell: T,
): T {
  const metric = normalizeContent(cell.metric ?? "")
  return { ...cell, content: normalizeContent(cell.content), metric: metric || null }
}
