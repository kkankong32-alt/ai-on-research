import assert from "node:assert/strict";
import { deleteProjectData } from "../src/services/deleteProject.js";
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
  deleteDoc,
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
// Match the client's read-before-write transaction, including revision history.
async function saveLikeClient(d, id, data, submit = false) {
  const ref = doc(d, "projects", "p", "records", id);
  return runTransaction(d, async (tx) => {
    const old = (await tx.get(ref)).data();
    const project = (await tx.get(doc(d, "projects", "p"))).data();
    if (old)
      tx.set(doc(ref, "revisions", String(old.revision)), {
        before: old,
        changedBy: "a",
        changedAt: serverTimestamp(),
        reason: "student-save",
      });
    tx.set(ref, {
      ...data,
      instrumentVersion:
        old?.instrumentVersion ||
        project.instrumentVersion ||
        "ai-on-report-2026-v1",
      revision: (old?.revision || 0) + 1,
      createdAt: old?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: submit ? "submitted" : "draft",
      submittedAt: submit ? serverTimestamp() : null,
    });
  });
}
for (const version of ["ai-on-report-2026-v1", "ai-on-feedback-2026-v2"]) {
  test(`first-save transactions, autosave, submission and reread for all record types: ${version}`, async () => {
    await env.withSecurityRulesDisabled(async (c) =>
      updateDoc(doc(c.firestore(), "projects", "p"), {
        instrumentVersion: version,
      }),
    );
    const d = anon("a");
    const survey = { ...record("S001"), unit: "POST", phase: "POST" };
    if (version.endsWith("v2")) {
      delete survey.data.raw.A5;
      delete survey.data.raw.D1;
    }
    const journal = {
      ...record("S001"),
      kind: "journal",
      unit: "1",
      session_id: 1,
      phase: null,
      data: {
        question: "탐구 질문",
        learned: "발견",
        doubt: "",
        check: "",
        no_doubt: true,
        struggle: "다시 시도",
        challenge: 2,
        mood: "헷갈림",
        next: "다음 탐구",
        auto: { valence: 0, verify: 0, meta: null },
        questions: { question: "오늘의 탐구 질문" },
      },
    };
    const prompt = {
      ...record("S001"),
      kind: "prompt",
      unit: "1",
      session_id: 1,
      phase: null,
      data: {
        raw: "나: 왜 그럴까?",
        turns: [
          {
            speaker: "student",
            turn_no: 1,
            raw_text: "왜 그럴까?",
            auto_code: "Q-REASON",
          },
        ],
        note: "",
        rubricDraft: { rea: 2 },
        questions: { prompt: "대화를 기록해요" },
      },
    };
    for (const r of [survey, journal, prompt]) {
      const id = `S001_${r.kind}_${r.unit}`;
      await assertSucceeds(saveLikeClient(d, id, r));
      await assertSucceeds(saveLikeClient(d, id, r));
      await assertSucceeds(saveLikeClient(d, id, r, true));
      const saved = (
        await assertSucceeds(getDoc(doc(d, "projects", "p", "records", id)))
      ).data();
      assert.equal(saved.revision, 3);
      assert.equal(saved.status, "submitted");
      assert.equal(saved.instrumentVersion, version);
      assert.deepEqual(saved.data, r.data);
    }
  });
}
test("absent record reads are restricted to the bound active student and project", async () => {
  const d = anon("a");
  await assertSucceeds(
    getDoc(doc(d, "projects", "p", "records", "S001_journal_1")),
  );
  for (const id of ["S002_journal_1", "S0010_journal_1", "S001_unknown_1"])
    await assertFails(getDoc(doc(d, "projects", "p", "records", id)));
  await assertFails(
    getDoc(doc(d, "projects", "q", "records", "S001_journal_1")),
  );
  await assertFails(
    getDoc(doc(anon("unbound"), "projects", "p", "records", "S001_journal_1")),
  );
  await updateDoc(doc(admin(), "projects", "p", "participants", "S001"), {
    active: false,
  });
  await assertFails(
    getDoc(doc(d, "projects", "p", "records", "S001_journal_1")),
  );
});
test("revised 26 item submission succeeds; retired or missing items and wrong versions fail", async () => {
  const v2 = "ai-on-feedback-2026-v2";
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), "projects", "p"), { instrumentVersion: v2 }),
  );
  const data = {
    ...record("S001"),
    unit: "POST",
    phase: "POST",
    status: "submitted",
    submittedAt: serverTimestamp(),
    instrumentVersion: v2,
  };
  delete data.data.raw.A5;
  delete data.data.raw.D1;
  const ref = doc(anon("a"), "projects", "p", "records", "S001_survey_POST");
  await assertFails(
    setDoc(ref, { ...data, instrumentVersion: "ai-on-report-2026-v1" }),
  );
  await assertFails(
    setDoc(ref, { ...data, data: { raw: { ...data.data.raw, A5: 3 } } }),
  );
  await assertFails(
    setDoc(ref, { ...data, data: { raw: { ...data.data.raw, D1: 3 } } }),
  );
  const missing = { ...data.data.raw };
  delete missing.A6;
  await assertFails(setDoc(ref, { ...data, data: { raw: missing } }));
  await assertFails(
    setDoc(ref, { ...data, data: { raw: { ...data.data.raw, E5: 6 } } }),
  );
  await assertSucceeds(setDoc(ref, data));
});
test("legacy project still accepts 28 items and rejects revised records", async () => {
  const ref = doc(anon("a"), "projects", "p", "records", "S001_survey_POST");
  const data = {
    ...record("S001"),
    unit: "POST",
    phase: "POST",
    status: "submitted",
    submittedAt: serverTimestamp(),
  };
  await assertFails(
    setDoc(ref, { ...data, instrumentVersion: "ai-on-feedback-2026-v2" }),
  );
  await assertSucceeds(setDoc(ref, data));
});
test("project instrument is immutable while ordinary settings and memberships stay intact", async () => {
  const d = admin();
  const member = await getDoc(doc(d, "admins", "admin@example.com"));
  const old = await getDoc(
    doc(d, "projects", "p", "records", "S001_survey_PRE"),
  );
  await assertFails(
    updateDoc(doc(d, "projects", "p"), {
      instrumentVersion: "ai-on-feedback-2026-v2",
    }),
  );
  await assertSucceeds(updateDoc(doc(d, "projects", "p"), { name: "updated" }));
  await assertSucceeds(
    setDoc(doc(d, "projects", "new-v2"), {
      instrumentVersion: "ai-on-feedback-2026-v2",
      archived: false,
    }),
  );
  await assertFails(
    updateDoc(doc(d, "projects", "new-v2"), {
      instrumentVersion: "ai-on-report-2026-v1",
    }),
  );
  assert.deepEqual(
    (await getDoc(doc(d, "admins", "admin@example.com"))).data(),
    member.data(),
  );
  assert.deepEqual(
    (
      await getDoc(doc(d, "projects", "p", "records", "S001_survey_PRE"))
    ).data(),
    old.data(),
  );
});
test("expert reviews stay with their project version and legacy reviews remain editable", async () => {
  const d = admin();
  await assertSucceeds(
    setDoc(doc(d, "projects", "p", "validity_reviews", "legacy"), {
      ratings: { A5: { r: 4 } },
      submitted: false,
    }),
  );
  await assertSucceeds(
    updateDoc(doc(d, "projects", "p", "validity_reviews", "legacy"), {
      submitted: true,
    }),
  );
  await assertFails(
    updateDoc(doc(d, "projects", "p", "validity_reviews", "legacy"), {
      instrumentVersion: "ai-on-feedback-2026-v2",
    }),
  );
  await assertSucceeds(
    setDoc(doc(d, "projects", "v2"), {
      instrumentVersion: "ai-on-feedback-2026-v2",
      archived: false,
    }),
  );
  const ref = doc(d, "projects", "v2", "validity_reviews", "new");
  await assertFails(setDoc(ref, { ratings: { A6: { r: 4 } } }));
  await assertSucceeds(
    setDoc(ref, {
      instrumentVersion: "ai-on-feedback-2026-v2",
      ratings: { A6: { r: 4 } },
    }),
  );
});
test("admin can check and create new school login mappings while feature is disabled", async () => {
  const d = admin();
  await updateDoc(doc(d, "projects", "p"), { schoolLoginEnabled: false });
  for (const col of ["school_projects", "school_access"]) {
    const ref = doc(d, col, "f".repeat(64));
    await assertSucceeds(
      runTransaction(d, async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists()) throw Error("Unexpected mapping");
        tx.set(ref, {
          project_id: "p",
          participant_id: "S001",
          tokenVersion: 1,
          projectCode: "test",
        });
      }),
    );
  }
});
test("short project codes cannot be listed or used when school login is off", async () => {
  const hash = "e".repeat(64);
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), "projects", "p"), {
      schoolLoginEnabled: true,
    });
    await setDoc(doc(c.firestore(), "school_projects", hash), {
      project_id: "p",
      projectCode: "test-only",
    });
  });
  await assertSucceeds(getDoc(doc(anon("a"), "school_projects", hash)));
  await assertFails(getDocs(collection(anon("a"), "school_projects")));
  await assertFails(
    setDoc(doc(anon("a"), "school_projects", hash), { project_id: "q" }),
  );
  await updateDoc(doc(admin(), "projects", "p"), { schoolLoginEnabled: false });
  await assertFails(getDoc(doc(anon("a"), "school_projects", hash)));
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

test("project deletion requires an administrator, a matching name and a deletion lock", async () => {
  await updateDoc(doc(admin(), "projects", "p"), { name: "삭제 테스트" });
  await assertFails(deleteDoc(doc(admin(), "projects", "p")));
  await assertFails(
    deleteDoc(doc(admin(), "projects", "p", "records", "S001_survey_PRE")),
  );
  await assertFails(deleteProjectData(anon("a"), "p", "삭제 테스트"));
  await assert.rejects(
    deleteProjectData(admin(), "p", "wrong"),
    /프로젝트 이름/,
  );
  assert.equal(
    (await getDoc(doc(admin(), "projects", "p"))).data().deleting,
    undefined,
  );
});

test("deleting projects block new writes, new student bindings, reopening and student deletion", async () => {
  const d = admin();
  await updateDoc(doc(d, "projects", "p"), { deleting: true, archived: true });
  await assertFails(
    updateDoc(doc(d, "projects", "p"), { deleting: false, archived: false }),
  );
  await assertFails(
    setDoc(doc(d, "projects", "p", "participants", "S003"), { active: true }),
  );
  await assertFails(
    setDoc(doc(d, "projects", "p", "validity_reviews", "new"), { value: 1 }),
  );
  await assertFails(
    setDoc(doc(d, "access", "c".repeat(64)), { project_id: "p" }),
  );
  await assertFails(
    setDoc(doc(anon("new"), "bindings", "new"), {
      project_id: "p",
      participant_id: "S001",
      tokenVersion: 1,
      codeHash: "a".repeat(64),
    }),
  );
  await assertFails(
    getDoc(doc(anon("a"), "projects", "p", "records", "S001_survey_PRE")),
  );
  await assertFails(
    deleteDoc(doc(anon("a"), "projects", "p", "records", "S001_survey_PRE")),
  );
  await assertFails(deleteDoc(doc(d, "projects", "q")));
  await assertFails(
    getDocs(query(collection(d, "bindings"), where("project_id", "==", "q"))),
  );
});

test("complete deletion drains multiple batches, revisions and all login mappings without touching another project", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const batch = writeBatch(d);
    batch.update(doc(d, "projects", "p"), { name: "삭제 테스트" });
    for (let i = 0; i < 205; i++)
      batch.set(
        doc(
          d,
          "projects",
          "p",
          "records",
          "S001_survey_PRE",
          "revisions",
          String(i),
        ),
        { before: { test: i } },
      );
    for (const path of [
      "projects/p/teacher_codings/r",
      "projects/p/teacher_codings/r/revisions/1",
      "projects/p/private_settings/login",
      "projects/p/validity_reviews/v",
      "school_access/old-hash",
      "school_projects/short-hash",
      "access/stale-hash",
    ])
      batch.set(doc(d, path), { project_id: "p" });
    for (const name of [
      "access",
      "school_access",
      "school_projects",
      "bindings",
    ])
      batch.set(doc(d, name, "unrelated"), { project_id: "q" });
    await batch.commit();
  });
  const progress = [];
  await assertSucceeds(
    deleteProjectData(admin(), "p", "삭제 테스트", (n) => progress.push(n)),
  );
  assert.ok(progress.at(-1) > 205);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    assert.equal((await getDoc(doc(d, "projects", "p"))).exists(), false);
    for (const path of [
      "records",
      "participants",
      "private_roster",
      "private_settings",
      "validity_reviews",
      "teacher_codings",
      "records/S001_survey_PRE/revisions",
      "teacher_codings/r/revisions",
    ])
      assert.equal(
        (await getDocs(collection(d, "projects/p/" + path))).size,
        0,
        path,
      );
    for (const name of [
      "access",
      "school_access",
      "school_projects",
      "bindings",
    ]) {
      assert.equal(
        (
          await getDocs(
            query(collection(d, name), where("project_id", "==", "p")),
          )
        ).size,
        0,
        name,
      );
      assert.equal((await getDoc(doc(d, name, "unrelated"))).exists(), true);
    }
    assert.equal((await getDoc(doc(d, "projects", "q"))).exists(), true);
  });
  await assertSucceeds(deleteProjectData(admin(), "p", "삭제 테스트"));
});

test("interrupted deletion keeps the lock and resumes", async () => {
  await updateDoc(doc(admin(), "projects", "p"), { name: "재시도" });
  await assert.rejects(
    deleteProjectData(admin(), "p", "재시도", () => {
      throw Error("connection lost");
    }),
    /connection lost/,
  );
  assert.equal(
    (await getDoc(doc(admin(), "projects", "p"))).data().deleting,
    true,
  );
  await assertSucceeds(deleteProjectData(admin(), "p", "재시도"));
  assert.equal((await getDoc(doc(admin(), "projects", "p"))).exists(), false);
});
