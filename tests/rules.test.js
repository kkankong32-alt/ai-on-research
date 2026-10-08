import test, { before, after, beforeEach } from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  writeBatch,
  serverTimestamp,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ai-on",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
after(async () => env?.cleanup());
const anon = (uid) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } })
    .firestore();
const admin = (email = "admin@example.com") =>
  env
    .authenticatedContext(email, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await Promise.all([
      setDoc(doc(d, "admins", "admin@example.com"), {
        active: true,
        role: "ADMIN",
      }),
      setDoc(doc(d, "admins", "super@example.com"), {
        active: true,
        role: "SUPER_ADMIN",
      }),
      ...["p", "q"].map((p) =>
        setDoc(doc(d, "projects", p), {
          archived: false,
          sessionCount: 4,
          enabled: {
            PRE: true,
            POST: true,
            DELAYED: true,
            journal: true,
            prompt: true,
          },
        }),
      ),
      ...["S001", "S002"].map((s) =>
        setDoc(doc(d, "projects", "p", "participants", s), {
          active: true,
          tokenVersion: 1,
        }),
      ),
      setDoc(doc(d, "bindings", "a"), {
        project_id: "p",
        participant_id: "S001",
        tokenVersion: 1,
        codeHash: "a".repeat(64),
      }),
      setDoc(doc(d, "bindings", "b"), {
        project_id: "p",
        participant_id: "S002",
        tokenVersion: 1,
        codeHash: "b".repeat(64),
      }),
      setDoc(doc(d, "access", "a".repeat(64)), {
        project_id: "p",
        participant_id: "S001",
        tokenVersion: 1,
      }),
      setDoc(doc(d, "projects", "p", "private_roster", "S001"), {
        name: "private",
        code: "secret",
      }),
      setDoc(doc(d, "projects", "p", "records", "S001_survey_PRE"), {
        ...record("S001"),
        createdAt: new Date(0),
        updatedAt: new Date(0),
        revision: 1,
      }),
      setDoc(doc(d, "projects", "p", "records", "S002_survey_PRE"), {
        ...record("S002"),
        createdAt: new Date(0),
        updatedAt: new Date(0),
        revision: 1,
      }),
    ]);
  });
});
function record(s) {
  return {
    project_id: "p",
    participant_id: s,
    kind: "survey",
    unit: "PRE",
    session_id: null,
    phase: "PRE",
    data: {
      raw: Object.fromEntries(
        ["A", "B", "C", "D", "E"].flatMap((c) =>
          Array.from({ length: "ABC".includes(c) ? 6 : 5 }, (_, i) => [
            c + (i + 1),
            3,
          ]),
        ),
      ),
    },
    status: "draft",
    instrumentVersion: "ai-on-report-2026-v1",
    revision: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    submittedAt: null,
  };
}
test("admin can check and create new school login mappings while feature is disabled", async () => {
  const d = admin();
  await updateDoc(doc(d, 'projects', 'p'), {schoolLoginEnabled: false});
  for (const col of ['school_projects', 'school_access']) {
    const ref = doc(d, col, 'f'.repeat(64));
    await assertSucceeds(runTransaction(d, async tx => {
      const existing = await tx.get(ref);
      if (existing.exists()) throw Error('Unexpected mapping');
      tx.set(ref, {project_id:'p', participant_id:'S001', tokenVersion:1, projectCode:'test'});
    }));
  }
});
test("short project codes cannot be listed or used when school login is off", async () => {
  const hash = 'e'.repeat(64);
  await env.withSecurityRulesDisabled(async c => {
    await updateDoc(doc(c.firestore(), 'projects', 'p'), {schoolLoginEnabled: true});
    await setDoc(doc(c.firestore(), 'school_projects', hash), {project_id: 'p', projectCode: 'test-only'});
  });
  await assertSucceeds(getDoc(doc(anon('a'), 'school_projects', hash)));
  await assertFails(getDocs(collection(anon('a'), 'school_projects')));
  await assertFails(setDoc(doc(anon('a'), 'school_projects', hash), {project_id: 'q'}));
  await updateDoc(doc(admin(), 'projects', 'p'), {schoolLoginEnabled: false});
  await assertFails(getDoc(doc(anon('a'), 'school_projects', hash)));
});
test("submitted dialogue without a tool and with recorded question is accepted", async () => {
  const r = {
    ...record("S001"),
    kind: "prompt",
    unit: "1",
    session_id: 1,
    phase: null,
    status: "submitted",
    submittedAt: serverTimestamp(),
    data: {
      raw: "나: 관찰 결과를 비교해 줘",
      turns: [{ speaker: "student", raw_text: "관찰 결과를 비교해 줘" }],
      note: "",
      questions: { prompt: "어떤 근거를 확인했나요?" },
    },
  };
  await assertSucceeds(
    setDoc(doc(anon("a"), "projects", "p", "records", "S001_prompt_1"), r),
  );
  await assertSucceeds(
    updateDoc(doc(admin(), "projects", "p"), {
      sessions: { 2: { prompt: false } },
    }),
  );
  await assertFails(
    setDoc(doc(anon("a"), "projects", "p", "records", "S001_prompt_2"), {
      ...r,
      unit: "2",
      session_id: 2,
    }),
  );
});
test("school login binds same student, isolates peers, and revokes when disabled", async () => {
  const hash = "c".repeat(64);
  const link = { project_id: "p", participant_id: "S001", tokenVersion: 1 };
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), "projects", "p"), {
      schoolLoginEnabled: true,
    });
    await setDoc(doc(c.firestore(), "school_access", hash), link);
    await setDoc(
      doc(c.firestore(), "projects", "p", "private_settings", "login"),
      { projectCode: "PRIVATE" },
    );
  });
  const d = anon("school-device");
  await assertSucceeds(getDoc(doc(d, "school_access", hash)));
  await assertFails(getDocs(collection(d, "school_access")));
  await assertFails(
    getDoc(doc(d, "projects", "p", "private_settings", "login")),
  );
  await assertFails(
    setDoc(doc(d, "bindings", "school-device"), {
      ...link,
      participant_id: "S002",
      codeHash: hash,
      loginMethod: "school",
    }),
  );
  await assertSucceeds(
    setDoc(doc(d, "bindings", "school-device"), {
      ...link,
      codeHash: hash,
      loginMethod: "school",
    }),
  );
  await assertSucceeds(
    getDoc(doc(d, "projects", "p", "records", "S001_survey_PRE")),
  );
  await assertFails(
    getDoc(doc(d, "projects", "p", "records", "S002_survey_PRE")),
  );
  await assertFails(getDoc(doc(d, "projects", "q")));
  await assertSucceeds(
    updateDoc(doc(admin(), "projects", "p"), { schoolLoginEnabled: false }),
  );
  await assertFails(
    getDoc(doc(d, "projects", "p", "records", "S001_survey_PRE")),
  );
  await assertFails(
    setDoc(doc(d, "bindings", "school-device"), {
      ...link,
      codeHash: hash,
      loginMethod: "school",
    }),
  );
  await assertSucceeds(
    getDoc(doc(anon("a"), "projects", "p", "records", "S001_survey_PRE")),
  );
});
test("changed school number invalidates old binding and students cannot register themselves", async () => {
  const hash = "d".repeat(64);
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), "projects", "p"), {
      schoolLoginEnabled: true,
    });
    await setDoc(doc(c.firestore(), "school_access", hash), {
      project_id: "p",
      participant_id: "S002",
      tokenVersion: 1,
    });
    await setDoc(doc(c.firestore(), "bindings", "old-number"), {
      project_id: "p",
      participant_id: "S001",
      tokenVersion: 1,
      codeHash: hash,
      loginMethod: "school",
    });
  });
  await assertFails(getDoc(doc(anon("old-number"), "projects", "p")));
  await assertFails(
    setDoc(doc(anon("a"), "school_access", hash), {
      project_id: "p",
      participant_id: "S001",
      tokenVersion: 1,
    }),
  );
});
test("session-specific enablement and manual lock are enforced on writes", async () => {
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "projects", "p"), {
      "enabled.prompt": false,
      sessions: {
        1: { prompt: true, access: "open" },
        2: { prompt: true, access: "locked" },
        3: { prompt: false },
      },
    }),
  );
  const prompt = (n) => ({
    ...record("S001"),
    kind: "prompt",
    unit: String(n),
    session_id: n,
    phase: null,
    data: { raw: "나: 빛이 뭐야?", turns: [], note: "", tool: "" },
  });
  await assertSucceeds(
    setDoc(
      doc(anon("a"), "projects", "p", "records", "S001_prompt_1"),
      prompt(1),
    ),
  );
  await assertFails(
    setDoc(
      doc(anon("a"), "projects", "p", "records", "S001_prompt_2"),
      prompt(2),
    ),
  );
  await assertFails(
    setDoc(
      doc(anon("a"), "projects", "p", "records", "S001_prompt_3"),
      prompt(3),
    ),
  );
});
test("student A cannot read or write student B", async () => {
  const d = anon("a");
  await assertFails(
    getDoc(doc(d, "projects", "p", "records", "S002_survey_PRE")),
  );
  await assertFails(
    updateDoc(doc(d, "projects", "p", "records", "S002_survey_PRE"), {
      data: { raw: { A1: 5 } },
    }),
  );
  await assertSucceeds(
    getDoc(doc(d, "projects", "p", "records", "S001_survey_PRE")),
  );
});
test("student cannot list roster, private names, or admin collections", async () => {
  const d = anon("a");
  await assertFails(getDocs(collection(d, "projects", "p", "participants")));
  await assertFails(getDoc(doc(d, "projects", "p", "private_roster", "S001")));
  await assertFails(getDocs(collection(d, "admins")));
  await assertFails(getDocs(collection(d, "access")));
  await assertFails(getDoc(doc(d, "projects", "q")));
});
test("unregistered Google account denied, registered admin allowed", async () => {
  await assertFails(getDoc(doc(admin("unknown@example.com"), "projects", "p")));
  await assertSucceeds(
    getDoc(doc(admin(), "projects", "p", "records", "S002_survey_PRE")),
  );
});
test("forged binding and escalation are rejected", async () => {
  const d = anon("new");
  await assertFails(
    setDoc(doc(d, "bindings", "new"), {
      project_id: "p",
      participant_id: "S002",
      tokenVersion: 1,
      codeHash: "a".repeat(64),
    }),
  );
  await assertSucceeds(
    setDoc(doc(d, "bindings", "new"), {
      project_id: "p",
      participant_id: "S001",
      tokenVersion: 1,
      codeHash: "a".repeat(64),
    }),
  );
  await assertFails(
    setDoc(doc(d, "admins", "new"), { active: true, role: "SUPER_ADMIN" }),
  );
  await assertFails(
    setDoc(doc(admin(), "admins", "x@example.com"), {
      active: true,
      role: "ADMIN",
    }),
  );
  await assertSucceeds(
    setDoc(doc(admin("super@example.com"), "admins", "x@example.com"), {
      active: true,
      role: "ADMIN",
    }),
  );
});
test("revocation invalidates existing device sessions", async () => {
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "projects", "p", "participants", "S001"), {
      tokenVersion: 2,
    }),
  );
  await assertFails(
    getDoc(doc(anon("a"), "projects", "p", "records", "S001_survey_PRE")),
  );
});
test("draft query requires participant isolation", async () => {
  const d = anon("a");
  await assertFails(getDocs(collection(d, "projects", "p", "records")));
  await assertSucceeds(
    getDocs(
      query(
        collection(d, "projects", "p", "records"),
        where("participant_id", "==", "S001"),
      ),
    ),
  );
});
test("revision snapshot required and immutable; submitted records locked", async () => {
  const d = anon("a"),
    r = doc(d, "projects", "p", "records", "S001_survey_PRE"),
    old = (await getDoc(r)).data();
  await assertFails(
    updateDoc(r, { revision: 2, updatedAt: serverTimestamp() }),
  );
  const batch = writeBatch(d);
  batch.set(doc(r, "revisions", "1"), {
    before: old,
    changedBy: "a",
    changedAt: serverTimestamp(),
    reason: "student-save",
  });
  batch.update(r, {
    revision: 2,
    status: "submitted",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(r, { data: { raw: { A1: 1 } } }));
  await assertFails(updateDoc(doc(r, "revisions", "1"), { reason: "erase" }));
});
test("student cannot edit teacher coding", async () => {
  await assertFails(
    setDoc(
      doc(anon("a"), "projects", "p", "teacher_codings", "S001_survey_PRE"),
      { codes: { 1: "Q-VERIFY" } },
    ),
  );
});
test("unauthed access denied", async () => {
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore(), "access", "a".repeat(64)),
    ),
  );
});

test("malformed and incomplete submitted surveys rejected", async () => {
  const d = anon("a"),
    base = record("S001");
  await assertFails(
    setDoc(doc(d, "projects", "p", "records", "S001_survey_POST"), {
      ...base,
      unit: "POST",
      phase: "POST",
      status: "submitted",
      submittedAt: serverTimestamp(),
      data: { raw: { A1: 3 } },
    }),
  );
  await assertFails(
    setDoc(doc(d, "projects", "p", "records", "S001_survey_POST"), {
      ...base,
      unit: "POST",
      phase: "POST",
      data: { raw: { A1: 6 } },
    }),
  );
});
