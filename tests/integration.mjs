import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import {
  questionIdsFor,
  LATEST_INSTRUMENT_VERSION,
} from "../src/data/instruments.js";
import { exportRows } from "../src/utils/export.js";
import {
  scoreSurvey,
  parseConversation,
  rubricDraft,
  journalDraft,
} from "../src/utils/domain.js";

// Real service functions, with both Firebase services confined to a demo emulator.
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw Error("Run through Firebase emulators:exec; never against production.");
const vite = await createServer({
  configFile: false,
  envFile: false,
  server: { middlewareMode: true },
  define: {
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("fake-api-key"),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify("demo-ai-on"),
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify("localhost"),
    "import.meta.env.VITE_USE_EMULATORS": JSON.stringify("true"),
  },
});
const env = await initializeTestEnvironment({
  projectId: "demo-ai-on",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: fs.readFileSync("firestore.rules", "utf8"),
  },
});
try {
  const store = await vite.ssrLoadModule("/src/services/store.js");
  const { auth, db, configured } = await vite.ssrLoadModule(
    "/src/services/firebase.js",
  );
  assert.ok(configured);
  assert.equal(db.app.options.projectId, "demo-ai-on");
  const email = "qa-teacher@example.test";
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "admins", email), {
      active: true,
      role: "SUPER_ADMIN",
    }),
  );
  async function teacher() {
    const token =
      [
        { alg: "none", typ: "JWT" },
        {
          sub: "qa-teacher",
          email,
          email_verified: true,
          iss: "https://accounts.google.com",
          aud: "demo-ai-on",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".";
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
    assert.equal((await store.resume()).role, "SUPER_ADMIN");
  }
  await teacher();
  const pid = await store.createProject({
    name: "Integration QA",
    teacher: "QA",
    group: "QA",
    topic: "QA",
    count: 2,
    sessionCount: 1,
    enabled: {
      PRE: true,
      POST: true,
      DELAYED: true,
      journal: true,
      prompt: true,
      validity: true,
    },
  });
  const roster = await store.getRoster(pid);
  const settings = await store.configureSchoolLogin(pid, true);
  await store.saveSchoolIdentity(pid, "S001", {
    grade: 5,
    classroom: 2,
    number: 7,
  });
  const raw = Object.fromEntries(
    questionIdsFor(LATEST_INSTRUMENT_VERSION).map((k) => [k, 3]),
  );
  raw.E5 = 2;
  const conversations = parseConversation(
    "나: 왜 그렇게 생각해?\nAI: 비교해 보세요.\n나: 다른 자료와 비교할게",
  );
  const journal = {
    question: "탐구 질문",
    learned: "발견",
    doubt: "",
    check: "",
    no_doubt: true,
    struggle: "재시도",
    challenge: 2,
    mood: "헷갈림",
    next: "다음 탐구",
    questions: { question: "오늘의 질문" },
  };
  journal.auto = journalDraft(journal);
  const payloads = {
    survey: { raw, derived: scoreSurvey(raw, LATEST_INSTRUMENT_VERSION) },
    journal,
    prompt: {
      raw: "나: 왜 그렇게 생각해?\nAI: 비교해 보세요.\n나: 다른 자료와 비교할게",
      turns: conversations,
      note: "",
      rubricDraft: rubricDraft(conversations),
      questions: { prompt: "기록해요" },
    },
  };
  await store.logout();
  assert.equal(
    (await store.studentLogin(roster.S001.code)).participant_id,
    "S001",
  );
  for (const kind of ["survey", "journal", "prompt"]) {
    const unit = kind === "survey" ? "PRE" : "1";
    let rev = await store.saveRecord(
      pid,
      "S001",
      kind,
      unit,
      payloads[kind],
      "draft",
      0,
    );
    rev = await store.saveRecord(
      pid,
      "S001",
      kind,
      unit,
      payloads[kind],
      "draft",
      rev,
    );
    rev = await store.saveRecord(
      pid,
      "S001",
      kind,
      unit,
      payloads[kind],
      "submitted",
      rev,
    );
    assert.equal(rev, 3);
    await assert.rejects(
      store.saveRecord(pid, "S001", kind, unit, payloads[kind], "draft", rev),
    );
  }
  await store.logout();
  assert.equal(
    (await store.schoolLogin(settings.shortCode, 5, 2, 7)).participant_id,
    "S001",
  );
  assert.equal(
    (
      await getDoc(doc(db, "projects", pid, "records", "S001_survey_PRE"))
    ).data().data.raw.E5,
    2,
  );
  await assert.rejects(
    getDoc(doc(db, "projects", pid, "private_roster", "S001")),
  );
  await assert.rejects(
    getDoc(doc(db, "projects", pid, "records", "S002_journal_1")),
  );
  await teacher();
  const rref = doc(db, "projects", pid, "records", "S001_journal_1");
  const record = { id: "S001_journal_1", ...(await getDoc(rref)).data() };
  await store.reopen(pid, record);
  await store.saveCoding(pid, "S001_prompt_1", {
    codes: { 1: "Q-VERIFY" },
    rubric: { ver: 3 },
    memo: "검토",
  });
  await store.saveCoding(pid, "S001_prompt_1", {
    codes: { 1: "Q-REASON" },
    rubric: { ver: 2 },
    memo: "재검토",
  });
  await store.saveReview(pid, "expert-qa", {
    instrumentVersion: LATEST_INSTRUMENT_VERSION,
    submitted: false,
    info: { label: "QA" },
    ratings: { A6: { r: 4, c: 4 } },
    suff: {},
    overall: "",
  });
  const backup = await store.backup(pid);
  assert.equal(backup.records.length, 3);
  assert.equal(backup.validity_reviews.length, 1);
  assert.equal(
    backup.records.find((r) => r.kind === "journal").revisions.length,
    3,
  );
  assert.equal(backup.teacher_codings[0].revision, 2);
  for (const kind of [
    "survey",
    "journal",
    "prompt",
    "rubric",
    "progress",
    "dictionary",
  ]) {
    const rows = exportRows(
      kind,
      { id: pid, ...backup.project },
      backup.participants,
      backup.records,
    );
    assert.ok(rows.length >= 1);
    assert.ok(
      rows.every((row) => row.length === rows[0].length),
      kind,
    );
  }
  await store.logout();
  await store.studentLogin(roster.S001.code);
  await assert.rejects(
    store.saveRecord(pid, "S001", "journal", "1", journal, "draft", 3),
    /다른 기기/,
  );
  assert.equal(
    await store.saveRecord(
      pid,
      "S001",
      "journal",
      "1",
      journal,
      "submitted",
      4,
    ),
    5,
  );
  await teacher();
  const submittedBackup = await store.backup(pid);
  for (const kind of ["survey", "journal", "prompt", "rubric"]) {
    const rows = exportRows(
      kind,
      { id: pid, ...submittedBackup.project },
      submittedBackup.participants,
      submittedBackup.records,
    );
    assert.ok(rows.length > 1, `${kind} has submitted data`);
    assert.ok(rows.every((row) => row.length === rows[0].length));
  }
  await store.setAdmin("qa-member@example.test", true);
  assert.equal(
    (await store.listAdmins()).find((m) => m.email === "qa-member@example.test")
      .active,
    true,
  );
  await store.setAdmin("qa-member@example.test", false);
  assert.equal(
    (await store.listAdmins()).find((m) => m.email === "qa-member@example.test")
      .active,
    false,
  );
  const oldCode = roster.S001.code;
  await store.rotateCode(pid, "S001");
  await store.logout();
  await assert.rejects(store.studentLogin(oldCode));
  await store.schoolLogin(settings.shortCode, 5, 2, 7);
  await teacher();
  await store.addStudent(pid, "");
  assert.equal(
    (await getDocs(collection(db, "projects", pid, "participants"))).size,
    3,
  );
  await store.updateProject(pid, { archived: true });
  await store.logout();
  await assert.rejects(store.schoolLogin(settings.shortCode, 5, 2, 7));
  console.log(
    "PASS: real service create/login/save/resume/reopen/coding/review/CSV/backup/conflict/rotate/add/archive/membership",
  );
} finally {
  await env.cleanup();
  await vite.close();
}
process.exit(0);
