// Access only after student authentication; scope recovery to that project/student.
export const draftKey = (pid, recordId, preview = false) =>
  `${preview ? "aion-preview-draft" : "aion-draft-v2"}:${pid}:${recordId}`;
export function readDraft(storage, pid, recordId, uid, preview = false) {
  const key = draftKey(pid, recordId, preview);
  const legacy = `aion-draft:${uid}:${pid}:${recordId}`;
  const candidates = [key, legacy];
  if (!preview) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (
        k?.startsWith("aion-draft:") &&
        !k.startsWith("aion-draft:preview-") &&
        k.endsWith(`:${pid}:${recordId}`) &&
        !candidates.includes(k)
      )
        candidates.push(k);
    }
  }
  for (const sourceKey of candidates) {
    try {
      const value = JSON.parse(storage.getItem(sourceKey));
      if (value?.data && Number.isInteger(value.baseRevision))
        return { ...value, sourceKey };
    } catch {
      /* Try another compatible draft, without deleting unreadable data. */
    }
  }
  return null;
}
