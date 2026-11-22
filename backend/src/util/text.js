const STOP = new Set(['the','and','for','how','where','what','does','this','that','with','from','which','used','use','are','can','you','into','about','file','code']);

// "Where is requireAuth used?" -> ['requireauth']
export const keywords = (q) => (q.toLowerCase().match(/[a-z0-9_]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t));

// "getUserById" / "get_user_by_id" -> ['get','user','by','id']
export const splitIdentifiers = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) || [];

// Pulls out things that look like code identifiers or file names from a question.
export function extractIdentifiers(q) {
  const ids = new Set();
  for (const m of q.matchAll(/`([^`]+)`/g)) ids.add(m[1]);
  for (const m of q.matchAll(/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|\b[\w./-]+\.\w{1,4}\b|\b\w+\.\w+\b/g)) ids.add(m[0]);
  return [...ids];
}
