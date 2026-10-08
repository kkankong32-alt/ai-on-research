import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, configured } from "./firebase.js";
import {
  hashCode,
  newCode,
  makeParticipants,
  recordKey,
  INSTRUMENT_VERSION,
  schoolLoginKey,
  normalizeCode,
} from "../utils/domain.js";

let demo = false,
  session = null;
const listeners = new Set();
const memory = {
  projects: [],
  participants: {},
  records: {},
  codings: {},
  roster: {},
  reviews: {},
  login: {},
};
const emit = () => listeners.forEach((f) => f());
export const isDemo = () => demo;
export const currentSession = () => session;
export const setSession = (s) => {
  session = s;
};
export async function adminLogin() {
  if (!configured)
    throw Error(
      "Firebase 연결을 준비하고 있습니다. 아직 연구자료를 수집할 수 없습니다.",
    );
  await setPersistence(auth, browserLocalPersistence);
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
  const s = await getDoc(doc(db, "admins", user.email));
  if (!s.exists() || !s.data().active) {
    await signOut(auth);
    throw Error("연구회원으로 등록된 계정이 아닙니다.");
  }
  demo = false;
  session = { role: s.data().role, email: user.email, uid: user.uid };
  return session;
}
export async function resume() {
  if (!auth) return null;
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  if (!user.isAnonymous) {
    const a = await getDoc(doc(db, "admins", user.email));
    if (a.exists() && a.data().active)
      return (session = {
        role: a.data().role,
        email: user.email,
        uid: user.uid,
      });
    return null;
  }
  const b = await getDoc(doc(db, "bindings", user.uid));
  if (!b.exists()) return null;
  const v = b.data();
  const p = await getDoc(
    doc(db, "projects", v.project_id, "participants", v.participant_id),
  );
  if (!p.exists()) return null;
  return (session = {
    role: "student",
    uid: user.uid,
    ...v,
    displayName: p.data().displayName,
  });
}
export async function studentLogin(code, loginMethod = "code") {
  if (demo) {
    for (const p of memory.projects) {
      const pair = Object.entries(memory.roster[p.id]).find(
        ([, r]) => r.code && normalizeCode(r.code) === normalizeCode(code),
      );
      const student =
        pair &&
        memory.participants[p.id].find((s) => s.id === pair[0] && s.active);
      if (student && !p.archived)
        return (session = {
          role: "student",
          project_id: p.id,
          participant_id: student.id,
          uid: `preview-${student.id}`,
          displayName: student.displayName,
        });
    }
    throw Error("입력한 접속정보를 다시 확인해 주세요.");
  }
  if (!configured) throw Error("아직 준비 중이에요. 선생님께 알려 주세요.");
  await setPersistence(auth, browserLocalPersistence);
  if (!auth.currentUser?.isAnonymous) {
    if (auth.currentUser) await signOut(auth);
    await signInAnonymously(auth);
  }
  const codeHash = await hashCode(code);
  const a = await getDoc(
    doc(db, loginMethod === "school" ? "school_access" : "access", codeHash),
  );
  if (!a.exists()) throw Error("입력한 접속정보를 다시 확인해 주세요.");
  const v = a.data();
  await setDoc(doc(db, "bindings", auth.currentUser.uid), {
    ...v,
    codeHash,
    loginMethod,
  });
  const p = await getDoc(
    doc(db, "projects", v.project_id, "participants", v.participant_id),
  );
  session = {
    role: "student",
    uid: auth.currentUser.uid,
    ...v,
    displayName: p.data().displayName,
  };
  return session;
}
export async function logout() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith("aion-draft:")) localStorage.removeItem(k);
  }
  session = null;
  demo = false;
  if (auth?.currentUser) await signOut(auth);
}
export function preview(role = "ADMIN") {
  demo = true;
  if (!memory.projects.length) {
    const p = {
      id: "preview-project",
      name: "우리의 첫 번째 과학 탐구",
      teacher: "연구 선생님",
      group: "탐구교실",
      topic: "질문에서 발견까지",
      startDate: "2026-10-05",
      sessionCount: 4,
      enabled: {
        PRE: true,
        POST: true,
        DELAYED: false,
        journal: true,
        prompt: true,
        validity: true,
      },
      postOpen: false,
      delayedOpen: false,
      archived: false,
    };
    memory.projects = [p];
    memory.participants[p.id] = makeParticipants(20);
    memory.records[p.id] = [];
    memory.roster[p.id] = Object.fromEntries(
      memory.participants[p.id].map((s) => [
        s.id,
        { code: newCode(), name: "" },
      ]),
    );
    memory.codings[p.id] = {};
    memory.reviews[p.id] = [];
  }
  session =
    role === "student"
      ? {
          role,
          project_id: memory.projects[0].id,
          participant_id: "S007",
          uid: "preview-student",
          displayName: "학생 07",
        }
      : { role: "SUPER_ADMIN", email: "미리보기", uid: "preview-admin" };
  return session;
}
export function watchProjects(cb, err) {
  if (demo) {
    const f = () => cb([...memory.projects]);
    f();
    listeners.add(f);
    return () => listeners.delete(f);
  }
  return onSnapshot(
    collection(db, "projects"),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    err,
  );
}
export function watchProject(id, cb, err) {
  if (demo) {
    const f = () => cb({ ...memory.projects.find((p) => p.id === id) });
    f();
    listeners.add(f);
    return () => listeners.delete(f);
  }
  return onSnapshot(
    doc(db, "projects", id),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null),
    err,
  );
}
export function watchList(pid, type, cb, err, sid) {
  if (demo) {
    const f = () => {
      const data =
        type === "participants"
          ? memory.participants[pid]
          : type === "records"
            ? memory.records[pid]
            : type === "teacher_codings"
              ? Object.entries(memory.codings[pid] || {}).map(([id, v]) => ({
                  id,
                  ...v,
                }))
              : memory.reviews[pid];
      cb(
        (data || []).filter(
          (v) => !sid || type !== "records" || v.participant_id === sid,
        ),
      );
    };
    f();
    listeners.add(f);
    return () => listeners.delete(f);
  }
  let q = collection(db, "projects", pid, type);
  if (sid && type === "records")
    q = query(q, where("participant_id", "==", sid));
  return onSnapshot(
    q,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    err,
  );
}
export async function createProject(input) {
  const id = crypto.randomUUID();
  const names =
    input.names
      ?.split("\n")
      .map((n) => n.trim())
      .filter(Boolean) || [];
  const students = makeParticipants(names.length || Number(input.count));
  const { names: _, count: __, ...settings } = input;
  const project = {
    ...settings,
    id,
    archived: false,
    postOpen: false,
    delayedOpen: false,
    createdAt: demo ? new Date().toISOString() : serverTimestamp(),
  };
  if (demo) {
    memory.projects.push(project);
    memory.participants[id] = students;
    memory.records[id] = [];
    memory.codings[id] = {};
    memory.roster[id] = Object.fromEntries(
      students.map((s, i) => [s.id, { name: names[i] || "", code: newCode() }]),
    );
    memory.reviews[id] = [];
    emit();
    return id;
  }
  await setDoc(doc(db, "projects", id), project);
  try {
    for (let i = 0; i < students.length; i += 100) {
      const batch = writeBatch(db);
      for (const [j, s] of students.slice(i, i + 100).entries()) {
        const code = newCode(),
          codeHash = await hashCode(code);
        batch.set(doc(db, "projects", id, "participants", s.id), {
          ...s,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, "projects", id, "private_roster", s.id), {
          name: names[i + j] || "",
          code,
          codeHash,
        });
        batch.set(doc(db, "access", codeHash), {
          project_id: id,
          participant_id: s.id,
          tokenVersion: 1,
        });
      }
      await batch.commit();
    }
    return id;
  } catch (e) {
    await setDoc(
      doc(db, "projects", id),
      { provisioningFailed: true },
      { merge: true },
    );
    throw Error(
      "프로젝트 생성 중 일부 학생코드를 만들지 못했습니다. 학생 목록을 확인해 주세요.",
    );
  }
}
export async function updateProject(id, patch) {
  if (demo) {
    Object.assign(
      memory.projects.find((p) => p.id === id),
      patch,
    );
    emit();
    return;
  }
  await setDoc(
    doc(db, "projects", id),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
export async function getRoster(id) {
  if (demo) return memory.roster[id] || {};
  const s = await getDocs(collection(db, "projects", id, "private_roster"));
  return Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
}
export async function getSchoolLogin(pid) {
  if (demo) return memory.login[pid] || {};
  const r = await getDoc(doc(db, "projects", pid, "private_settings", "login"));
  return r.data() || {};
}
export async function configureSchoolLogin(pid, enabled) {
  const existing = await getSchoolLogin(pid);
  const settings = {
    ...existing,
    projectCode: existing.projectCode || newCode(),
  };
  if (demo) {
    memory.login[pid] = settings;
    await updateProject(pid, { schoolLoginEnabled: enabled });
  } else {
    const batch = writeBatch(db);
    batch.set(doc(db, "projects", pid, "private_settings", "login"), settings);
    batch.update(doc(db, "projects", pid), { schoolLoginEnabled: enabled });
    await batch.commit();
  }
  return settings;
}
export async function saveSchoolIdentity(pid, sid, fields) {
  const config = await getSchoolLogin(pid);
  const school = Object.fromEntries(
    ["grade", "classroom", "number"].map((k) => [k, Number(fields[k])]),
  );
  const schoolHash = await hashCode(
    schoolLoginKey(
      config.projectCode,
      school.grade,
      school.classroom,
      school.number,
    ),
  );
  if (demo) {
    if (
      Object.entries(memory.roster[pid]).some(
        ([id, r]) => id !== sid && r.schoolHash === schoolHash,
      )
    )
      throw Error("이 학년·반·번호는 다른 학생에게 이미 등록되어 있습니다.");
    memory.roster[pid][sid] = {
      ...memory.roster[pid][sid],
      school,
      schoolHash,
    };
    return;
  }
  await runTransaction(db, async (tx) => {
    const rr = doc(db, "projects", pid, "private_roster", sid);
    const ar = doc(db, "school_access", schoolHash);
    const [r, a, participant] = await Promise.all([
      tx.get(rr),
      tx.get(ar),
      tx.get(doc(db, "projects", pid, "participants", sid)),
    ]);
    if (
      a.exists() &&
      (a.data().participant_id !== sid || a.data().project_id !== pid)
    )
      throw Error("이 학년·반·번호는 다른 학생에게 이미 등록되어 있습니다.");
    if (r.data()?.schoolHash && r.data().schoolHash !== schoolHash)
      tx.delete(doc(db, "school_access", r.data().schoolHash));
    tx.set(rr, { ...r.data(), school, schoolHash });
    tx.set(ar, {
      project_id: pid,
      participant_id: sid,
      tokenVersion: participant.data().tokenVersion,
    });
  });
}
export async function schoolLogin(projectCode, grade, classroom, number) {
  const key = schoolLoginKey(projectCode, grade, classroom, number);
  if (demo) {
    const hash = await hashCode(key);
    for (const p of memory.projects) {
      if (!p.schoolLoginEnabled || p.archived) continue;
      const pair = Object.entries(memory.roster[p.id]).find(
        ([, r]) => r.schoolHash === hash,
      );
      if (pair) {
        const student = memory.participants[p.id].find(
          (s) => s.id === pair[0] && s.active,
        );
        if (student)
          return (session = {
            role: "student",
            project_id: p.id,
            participant_id: student.id,
            uid: `preview-${student.id}`,
            displayName: student.displayName,
          });
      }
    }
    throw Error("입력한 접속정보를 다시 확인해 주세요.");
  }
  return studentLogin(key, "school");
}
export async function changeStudent(pid, sid, patch) {
  if (demo) {
    Object.assign(
      memory.participants[pid].find((s) => s.id === sid),
      patch,
    );
    emit();
    return;
  }
  await setDoc(doc(db, "projects", pid, "participants", sid), patch, {
    merge: true,
  });
}
export async function rotateCode(pid, sid) {
  const code = newCode(),
    codeHash = await hashCode(code);
  if (demo) {
    memory.roster[pid][sid] = { ...memory.roster[pid][sid], code };
    return code;
  }
  await runTransaction(db, async (tx) => {
    const pr = doc(db, "projects", pid, "participants", sid),
      rr = doc(db, "projects", pid, "private_roster", sid);
    const [p, r] = await Promise.all([tx.get(pr), tx.get(rr)]);
    const tokenVersion = p.data().tokenVersion + 1;
    if (r.data()?.codeHash) tx.delete(doc(db, "access", r.data().codeHash));
    tx.update(pr, { tokenVersion });
    tx.set(rr, { ...r.data(), code, codeHash });
    tx.set(doc(db, "access", codeHash), {
      project_id: pid,
      participant_id: sid,
      tokenVersion,
    });
    if (r.data()?.schoolHash)
      tx.set(doc(db, "school_access", r.data().schoolHash), {
        project_id: pid,
        participant_id: sid,
        tokenVersion,
      });
  });
  return code;
}
export async function addStudent(pid, name = "") {
  if (demo) {
    const list = memory.participants[pid];
    const s = makeParticipants(list.length + 1).at(-1);
    list.push(s);
    memory.roster[pid][s.id] = { name, code: newCode() };
    emit();
    return;
  }
  const s = await getDocs(collection(db, "projects", pid, "participants"));
  const next = Math.max(0, ...s.docs.map((d) => Number(d.id.slice(1)))) + 1;
  const p = makeParticipants(next).at(-1),
    code = newCode(),
    codeHash = await hashCode(code);
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "projects", pid, "participants", p.id);
    if ((await tx.get(ref)).exists())
      throw Error("다른 연구자가 학생을 추가했습니다. 다시 시도해 주세요.");
    tx.set(ref, { ...p, createdAt: serverTimestamp() });
    tx.set(doc(db, "projects", pid, "private_roster", p.id), {
      name,
      code,
      codeHash,
    });
    tx.set(doc(db, "access", codeHash), {
      project_id: pid,
      participant_id: p.id,
      tokenVersion: 1,
    });
  });
}
export async function saveRecord(
  pid,
  sid,
  kind,
  unit,
  data,
  status = "draft",
  expectedRevision = 0,
) {
  const id = recordKey(sid, kind, unit);
  if (demo) {
    const list = memory.records[pid],
      old = list.find((r) => r.id === id);
    if (old?.status === "submitted") throw Error("이미 제출한 기록이에요.");
    const next = {
      id,
      project_id: pid,
      participant_id: sid,
      kind,
      unit: String(unit),
      session_id: kind === "survey" ? null : Number(unit),
      phase: kind === "survey" ? unit : null,
      data,
      status,
      instrumentVersion: INSTRUMENT_VERSION,
      revision: (old?.revision || 0) + 1,
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: status === "submitted" ? new Date().toISOString() : null,
    };
    if (old) Object.assign(old, next);
    else list.push(next);
    emit();
    return next.revision;
  }
  const ref = doc(db, "projects", pid, "records", id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref),
      old = snap.data();
    if (old?.status === "submitted")
      throw Error("이미 제출한 기록이에요. 선생님께 수정을 요청해 주세요.");
    if ((old?.revision || 0) !== expectedRevision)
      throw Error(
        "다른 기기에서 기록이 바뀌었어요. 현재 초안을 보관한 뒤 새로고침해 주세요.",
      );
    const revision = (old?.revision || 0) + 1;
    if (old)
      tx.set(doc(ref, "revisions", String(old.revision)), {
        before: old,
        changedBy: auth.currentUser.uid,
        changedAt: serverTimestamp(),
        reason: "student-save",
      });
    tx.set(ref, {
      project_id: pid,
      participant_id: sid,
      kind,
      unit: String(unit),
      session_id: kind === "survey" ? null : Number(unit),
      phase: kind === "survey" ? unit : null,
      data,
      status,
      instrumentVersion: INSTRUMENT_VERSION,
      revision,
      createdAt: old?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      submittedAt: status === "submitted" ? serverTimestamp() : null,
    });
    return revision;
  });
}
export async function reopen(pid, record) {
  if (demo) {
    memory.records[pid].find((r) => r.id === record.id).status = "draft";
    emit();
    return;
  }
  const ref = doc(db, "projects", pid, "records", record.id);
  await runTransaction(db, async (tx) => {
    const old = (await tx.get(ref)).data();
    tx.set(doc(ref, "revisions", String(old.revision)), {
      before: old,
      changedBy: auth.currentUser.uid,
      changedAt: serverTimestamp(),
      reason: "admin-reopen",
    });
    tx.update(ref, {
      status: "draft",
      revision: old.revision + 1,
      updatedAt: serverTimestamp(),
      submittedAt: null,
    });
  });
}
export async function saveCoding(pid, rid, data) {
  if (demo) {
    memory.codings[pid][rid] = data;
    emit();
    return;
  }
  const ref = doc(db, "projects", pid, "teacher_codings", rid);
  await runTransaction(db, async (tx) => {
    const old = (await tx.get(ref)).data();
    if (old)
      tx.set(doc(ref, "revisions", String(old.revision)), {
        before: old,
        changedBy: auth.currentUser.uid,
        changedAt: serverTimestamp(),
      });
    tx.set(ref, {
      ...data,
      revision: (old?.revision || 0) + 1,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    });
  });
}
export async function saveReview(pid, id, data) {
  if (demo) {
    const list = memory.reviews[pid];
    const i = list.findIndex((v) => v.id === id);
    if (i < 0) list.push({ id, ...data });
    else list[i] = { id, ...data };
    emit();
    return;
  }
  await setDoc(doc(db, "projects", pid, "validity_reviews", id), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}
export async function listAdmins() {
  if (demo) return [{ email: "미리보기", active: true, role: "SUPER_ADMIN" }];
  return (await getDocs(collection(db, "admins"))).docs.map((d) => ({
    email: d.id,
    ...d.data(),
  }));
}
export async function setAdmin(email, active) {
  if (demo) return;
  await setDoc(
    doc(db, "admins", email.trim().toLowerCase()),
    { role: "ADMIN", active, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
export async function backup(pid) {
  const result = { schemaVersion: 1, exportedAt: new Date().toISOString() };
  if (demo)
    return {
      ...result,
      project: memory.projects.find((p) => p.id === pid),
      participants: memory.participants[pid],
      records: memory.records[pid],
      teacher_codings: memory.codings[pid],
      validity_reviews: memory.reviews[pid],
    };
  result.project = (await getDoc(doc(db, "projects", pid))).data();
  for (const type of [
    "participants",
    "records",
    "teacher_codings",
    "validity_reviews",
  ]) {
    const s = await getDocs(collection(db, "projects", pid, type));
    result[type] = await Promise.all(
      s.docs.map(async (d) => {
        const v = { id: d.id, ...d.data() };
        if (type === "records" || type === "teacher_codings") {
          const r = await getDocs(collection(d.ref, "revisions"));
          v.revisions = r.docs.map((x) => ({ id: x.id, ...x.data() }));
        }
        return v;
      }),
    );
  }
  return result;
}
