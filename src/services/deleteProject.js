import {
  collection, doc, getDocs, query, where, limit, runTransaction,
  writeBatch, deleteDoc, serverTimestamp,
} from "firebase/firestore";

// Freeze writes first, remove descendants and external login mappings, and
// remove the parent last. A failed run can safely resume from the same project.
export async function deleteProjectData(db, pid, confirmation, onProgress = () => {}) {
  const projectRef = doc(db, "projects", pid);
  const exists = await runTransaction(db, async (tx) => {
    const snap = await tx.get(projectRef);
    if (!snap.exists()) return false;
    if (confirmation !== snap.data().name)
      throw Error("프로젝트 이름을 정확히 입력해 주세요.");
    if (!snap.data().deleting) {
      tx.update(projectRef, {
        deleting: true, archived: true, deletionStartedAt: serverTimestamp(),
      });
    }
    return true;
  });
  if (!exists) return;
  let deleted = 0;
  async function drain(source, revisions = false) {
    while (true) {
      const snap = await getDocs(query(source, limit(200)));
      if (snap.empty) break;
      if (revisions) {
        for (const entry of snap.docs)
          await drain(collection(entry.ref, "revisions"));
      }
      const batch = writeBatch(db);
      snap.docs.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
      deleted += snap.size;
      onProgress(deleted);
    }
  }
  for (const name of ["records", "teacher_codings"])
    await drain(collection(projectRef, name), true);
  for (const name of ["validity_reviews", "participants", "private_roster", "private_settings"])
    await drain(collection(projectRef, name));
  for (const name of ["access", "school_access", "school_projects", "bindings"])
    await drain(query(collection(db, name), where("project_id", "==", pid)));
  await deleteDoc(projectRef);
}
