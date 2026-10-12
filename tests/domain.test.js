import test from "node:test";
import assert from "node:assert/strict";
import {
  makeParticipants,
  newCode,
  hashCode,
  parseConversation,
  autoCode,
  scoreSurvey,
  questionIds,
  validateRecord,
  tasksFor,
  schoolLoginKey,
  sessionQuestions,
  sessionSettings,
} from "../src/utils/domain.js";
import { exportRows, csv } from "../src/utils/export.js";
import { indices, scaleIndices } from "../src/utils/validity.js";
import {
  instrumentVersion,
  INSTRUMENT_VERSION,
  LATEST_INSTRUMENT_VERSION as V2,
  surveyFor,
  questionIdsFor,
  itemLabel,
  instrumentsFor,
} from "../src/data/instruments.js";
import { codesFor } from "../src/data/codebook.js";
import { draftKey, readDraft } from "../src/utils/drafts.js";
test("pending drafts recover after account UID changes without crossing students or projects", () => {
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) || null,
  };
  const pending = { data: { question: "저장되지 않은 기록" }, baseRevision: 0 };
  values.set("aion-draft:old-uid:p:S001_journal_1", JSON.stringify(pending));
  assert.deepEqual(
    readDraft(storage, "p", "S001_journal_1", "new-uid").data,
    pending.data,
  );
  assert.equal(readDraft(storage, "p", "S002_journal_1", "new-uid"), null);
  assert.equal(readDraft(storage, "q", "S001_journal_1", "new-uid"), null);
  assert.equal(
    readDraft(storage, "p", "S001_journal_1", "new-uid", true),
    null,
  );
  const latest = {
    ...pending,
    data: { question: "계속 작성한 기록" },
    baseRevision: 2,
  };
  values.set(draftKey("p", "S001_journal_1"), JSON.stringify(latest));
  assert.equal(
    readDraft(storage, "p", "S001_journal_1", "another-uid").baseRevision,
    2,
  );
  assert.equal(values.size, 2);
});
test("malformed local drafts are preserved and valid recovery candidates remain usable", () => {
  const values = new Map([
    [draftKey("p", "S001_survey_PRE"), "{broken"],
    [
      "aion-draft:u:p:S001_survey_PRE",
      JSON.stringify({ data: { raw: { A1: 3 } }, baseRevision: 1 }),
    ],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) || null,
  };
  assert.equal(readDraft(storage, "p", "S001_survey_PRE", "u").data.raw.A1, 3);
  assert.equal(values.get(draftKey("p", "S001_survey_PRE")), "{broken");
});
test("oversized conversations are detected before both autosave and submission", () => {
  const data = {
    raw: "나: 질문",
    turns: Array.from({ length: 501 }, () => ({ speaker: "student" })),
  };
  assert.match(validateRecord("prompt", data, false), /500/);
  assert.match(validateRecord("prompt", data, true), /500/);
  assert.ok(
    validateRecord("prompt", { raw: "가".repeat(180001), turns: [] }, false),
  );
  assert.equal(
    validateRecord("prompt", { raw: "", turns: [], note: "" }, false),
    null,
  );
});
test("legacy projects remain 28 items while revised labels keep stable identities", () => {
  assert.equal(instrumentVersion({}), INSTRUMENT_VERSION);
  assert.equal(questionIdsFor({}).length, 28);
  assert.equal(questionIdsFor(V2).length, 26);
  assert.deepEqual(
    surveyFor(V2).map((s) => s.items.length),
    [5, 6, 6, 4, 5],
  );
  assert.equal(itemLabel("A6", V2), "A5");
  assert.equal(itemLabel("D2", V2), "D1");
  assert.equal(itemLabel("D5", V2), "D4");
  assert.equal(itemLabel("A6"), "A6");
  assert.ok(!questionIdsFor(V2).includes("A5"));
  assert.ok(!questionIdsFor(V2).includes("D1"));
  assert.throws(() => surveyFor("unknown"));
});
test("revision scoring ignores retired items without mutating historical answers", () => {
  const raw = Object.fromEntries(questionIds.map((k) => [k, 4]));
  raw.A5 = 1;
  raw.D1 = 1;
  raw.E5 = 2;
  const before = structuredClone(raw);
  assert.equal(scoreSurvey(raw).A_mean, 21 / 6);
  assert.equal(scoreSurvey(raw).D_mean, 17 / 5);
  assert.equal(scoreSurvey(raw, V2).A_mean, 4);
  assert.equal(scoreSurvey(raw, V2).D_mean, 4);
  assert.equal(scoreSurvey(raw, V2).E_mean, 4);
  assert.equal(scoreSurvey(raw, V2).E5_raw, 2);
  assert.equal(scoreSurvey(raw, V2).E5_reverse, 4);
  assert.deepEqual(raw, before);
  delete raw.A6;
  assert.equal(scoreSurvey(raw, V2).A_mean, null);
});
test("revised submissions require exactly their own 26 answers", () => {
  const raw = Object.fromEntries(questionIdsFor(V2).map((k) => [k, 3]));
  assert.equal(validateRecord("survey", { raw }, true, V2), null);
  assert.ok(validateRecord("survey", { raw }, true));
  assert.ok(validateRecord("survey", { raw: { ...raw, A5: 3 } }, true, V2));
  assert.ok(validateRecord("survey", { raw: { ...raw, E5: 0 } }, true, V2));
});
test("CSV separates versions and supplies display labels without replacing original IDs", () => {
  const records = [undefined, V2].map((v, i) => ({
    id: String(i),
    participant_id: "S001",
    kind: "survey",
    phase: i ? "POST" : "PRE",
    status: "submitted",
    instrumentVersion: v,
    data: { raw: Object.fromEntries(questionIdsFor(v).map((k) => [k, 3])) },
  }));
  records[0].data.raw.A5 = 1;
  const original = structuredClone(records);
  const rows = exportRows(
    "survey",
    { id: "p", instrumentVersion: V2 },
    [],
    records,
  );
  const at = (k) => rows[0].indexOf(k);
  assert.equal(rows[1][at("instrument_version")], INSTRUMENT_VERSION);
  assert.equal(rows[2][at("instrument_version")], V2);
  assert.equal(rows[1][at("A5")], 1);
  assert.equal(rows[2][at("A5")], "");
  assert.equal(rows[2][at("A6")], 3);
  assert.equal(rows[2][at("question_count")], 26);
  assert.ok(rows.every((r) => r.length === rows[0].length));
  assert.deepEqual(records, original);
  const dict = exportRows("dictionary", { instrumentVersion: V2 }, [], records);
  assert.ok(dict.some((r) => r[0] === V2 && r[2] === "A6" && r[3] === "A5"));
  assert.ok(
    dict.some(
      (r) =>
        r[0] === INSTRUMENT_VERSION &&
        r[2] === "A5" &&
        r[4].includes("아이디어"),
    ),
  );
});
test("blue revisions apply only to revised instruments and custom questions survive", () => {
  const note = (v, id) =>
    instrumentsFor(v)
      .flatMap((s) => s.items)
      .find((x) => x[0] === id);
  assert.match(note(V2, "B6")[1], /탐구활동이 잘 진행 되지 않으면/);
  assert.match(note(V2, "J3")[2], /확인이 필요해서/);
  assert.doesNotMatch(note(undefined, "J3")[2], /확인이 필요해서/);
  assert.match(codesFor(V2).find((c) => c.k === "Q-HYP").ex, /각설탕/);
  assert.match(codesFor().find((c) => c.k === "Q-HYP").ex, /거품/);
  const p = {
    instrumentVersion: V2,
    enabled: { prompt: false },
    sessions: { 1: { questions: { doubt: "우리 반의 질문" } } },
  };
  const snapshot = sessionQuestions(p, 1);
  assert.equal(snapshot.doubt, "우리 반의 질문");
  p.sessions[1].questions.doubt = "새 질문";
  assert.equal(snapshot.doubt, "우리 반의 질문");
  assert.equal(sessionSettings(p, 1).prompt, false);
});
test("R-ACCEPT exports distinguish automatic context review from teacher confirmation", () => {
  const r = {
    id: "r",
    kind: "prompt",
    status: "submitted",
    data: {
      turns: [
        {
          turn_no: 1,
          speaker: "student",
          auto_code: "R-ACCEPT",
          raw_text: "응",
        },
      ],
    },
  };
  for (const teacher of [null, "R-ACCEPT", "Q-INFO"]) {
    const rows = exportRows("prompt", {}, [], [r], {
      r: { codes: { 1: teacher } },
    });
    const at = (k) => rows[1][rows[0].indexOf(k)];
    assert.equal(at("context_review_needed"), !teacher);
    assert.equal(at("code_source"), teacher ? "teacher" : "automatic_draft");
    assert.equal(at("final_code"), teacher || "R-ACCEPT");
    assert.equal(rows[0].length, rows[1].length);
  }
});
test("session questions use defaults, keep overrides and omit AI tasks when disabled", () => {
  const p = {
    sessionCount: 2,
    enabled: { journal: true, prompt: true },
    sessions: {
      1: {
        prompt: false,
        questions: { question: "오늘 실험에서 바꾼 조건은?", learned: "  " },
      },
    },
  };
  const q = sessionQuestions(p, 1);
  assert.equal(q.question, "오늘 실험에서 바꾼 조건은?");
  assert.equal(q.learned, "오늘 새로 알게 된 것");
  assert.equal(sessionSettings(p, 1).questions.question, q.question);
  assert.notEqual(sessionQuestions(p, 2).question, q.question);
  assert.equal(
    tasksFor(p, "S001", []).some((t) => t.unit === "1" && t.kind === "prompt"),
    false,
  );
  p.sessions[1].questions.question = "수정한 질문";
  assert.equal(q.question, "오늘 실험에서 바꾼 조건은?");
});
test("AI conversation submission requires dialogue but no tool selection", () => {
  assert.equal(
    validateRecord(
      "prompt",
      { raw: "나: 관찰을 어떻게 비교할까요?", turns: [{ speaker: "student" }] },
      true,
    ),
    null,
  );
  assert.ok(validateRecord("prompt", { raw: "", turns: [] }, true));
});
test("school identity is project-scoped, normalized and unambiguous", async () => {
  assert.equal(
    schoolLoginKey("ABCD-EFGH", "05", "02", "07"),
    schoolLoginKey("abcdefgh", 5, 2, 7),
  );
  assert.notEqual(
    await hashCode(schoolLoginKey("ABCD", 1, 23, 4)),
    await hashCode(schoolLoginKey("ABCD", 12, 3, 4)),
  );
  assert.notEqual(
    schoolLoginKey("ABCD", 5, 2, 7),
    schoolLoginKey("EFGH", 5, 2, 7),
  );
  for (const bad of ["", 0, -1, 1.5, 1000, "abc"])
    assert.throws(() => schoolLoginKey("ABCD", bad, 2, 7));
});
test("20 students and expanded IDs remain stable", () => {
  const s = makeParticipants(20);
  assert.equal(s[6].id, "S007");
  assert.equal(s[6].displayName, "학생 07");
  assert.equal(makeParticipants(120)[119].id, "S120");
  assert.throws(() => makeParticipants(-1));
});
test("cryptographic readable codes normalize and hash", async () => {
  const c = newCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(
    await hashCode(c),
    await hashCode(c.toLowerCase().replaceAll("-", "")),
  );
  assert.equal(new Set(Array.from({ length: 1000 }, newCode)).size, 1000);
});
test("all 28 items and E5 raw remain intact", () => {
  assert.equal(questionIds.length, 28);
  const raw = Object.fromEntries(questionIds.map((k) => [k, 2]));
  const score = scoreSurvey(raw);
  assert.equal(raw.E5, 2);
  assert.equal(score.E5_raw, 2);
  assert.equal(score.E5_reverse, 4);
  assert.equal(score.E_mean, 2.4);
  assert.equal(score.A_mean, 2);
  assert.equal(scoreSurvey({ E5: 2 }).E_mean, null);
});
test("parser preserves long content, code blocks and unlabeled text", () => {
  const raw =
    "나: 근거를 알려줘\nAI: 답변\n```js\nconst a=1;\n```\n학생: " +
    "긴 원문".repeat(3000);
  const p = parseConversation(raw);
  assert.equal(p.length, 3);
  assert.equal(p[0].auto_code, "Q-VERIFY");
  assert.equal(p[0].teacher_code, null);
  assert.ok(p[1].raw_text.includes("const a=1;"));
  assert.ok(p[2].raw_text.length > 6000);
  assert.equal(parseConversation("표지 없는 대화\n\n계속된 글").length, 1);
  assert.equal(
    parseConversation("You said:\n왜?\nChatGPT said:\n이유")[1].speaker,
    "ai",
  );
});
test("coding teacher overrides do not mutate auto", () => {
  const r = {
    id: "S007_prompt_1",
    participant_id: "S007",
    kind: "prompt",
    session_id: 1,
    status: "submitted",
    data: {
      turns: [
        {
          turn_no: 1,
          speaker: "student",
          raw_text: "빛이 뭐야?",
          auto_code: "Q-INFO",
        },
      ],
    },
  };
  const rows = exportRows("prompt", { id: "p" }, [], [r], {
    [r.id]: { codes: { 1: "Q-VERIFY" } },
  });
  assert.equal(rows[1][7], "Q-INFO");
  assert.equal(rows[1][8], "Q-VERIFY");
  assert.equal(rows[1][9], "Q-VERIFY");
  assert.equal(r.data.turns[0].auto_code, "Q-INFO");
});
test("anonymous export never includes roster name or access code", () => {
  const p = { id: "a" },
    r = {
      id: "r",
      participant_id: "S007",
      phase: "PRE",
      kind: "survey",
      status: "submitted",
      data: { raw: Object.fromEntries(questionIds.map((k) => [k, 3])) },
    };
  const out = csv(
    exportRows(
      "survey",
      p,
      [],
      [r],
      {},
      { S007: { name: "비밀이름", code: "SECRET" } },
      false,
    ),
  );
  assert.ok(out.startsWith("\ufeff"));
  assert.ok(out.includes("S007"));
  assert.ok(!out.includes("비밀이름"));
  assert.ok(!out.includes("SECRET"));
  assert.ok(csv([["=1+1", 'a,"b\nc']]).includes("'=1+1"));
});
test("pre and post task gates, optional journals, delayed manual", () => {
  const p = {
    sessionCount: 1,
    enabled: {
      PRE: true,
      POST: true,
      DELAYED: true,
      journal: true,
      prompt: false,
    },
  };
  let t = tasksFor(p, "S007", []);
  assert.equal(t[1].open, true);
  assert.equal(t[2].open, false);
  t = tasksFor(p, "S007", [
    { id: "S007_survey_PRE", status: "submitted" },
    { id: "S007_journal_1", status: "submitted" },
  ]);
  assert.equal(t[2].open, true);
  assert.equal(t[3].open, false);
});
test("journey totals follow 3 and 6 sessions without fixed counts", () => {
  for (const [sessionCount, total] of [
    [3, 8],
    [6, 14],
  ]) {
    const p = {
      sessionCount,
      enabled: { PRE: true, POST: true, journal: true, prompt: true },
    };
    assert.equal(tasksFor(p, "S007", []).length, total);
  }
});
test("per-session overrides omit disabled activities and retain stable identities", () => {
  const p = {
    sessionCount: 3,
    enabled: { journal: true, prompt: true },
    sessions: {
      1: { journal: false, prompt: false },
      2: { prompt: false },
      3: { journal: false },
    },
  };
  const tasks = tasksFor(p, "S007", []);
  assert.deepEqual(
    tasks.map((t) => [t.kind, t.unit, t.open]),
    [
      ["journal", "2", true],
      ["prompt", "3", true],
    ],
  );
  assert.equal(tasksFor({ ...p, sessionCount: 2 }, "S007", []).length, 1);
});
test("sequential sessions require all enabled earlier activities and skip disabled kinds", () => {
  const p = {
    sessionCount: 3,
    enabled: { PRE: true, journal: true, prompt: true },
    sessions: {
      1: { access: "sequential" },
      2: { prompt: false, access: "sequential" },
      3: { access: "sequential" },
    },
  };
  const records = ["survey_PRE", "journal_1"].map((id) => ({
    id: `S007_${id}`,
    status: "submitted",
  }));
  let t = tasksFor(p, "S007", records);
  assert.equal(t.find((x) => x.unit === "2").open, false);
  assert.equal(t.find((x) => !x.done && x.open).kind, "prompt");
  records.push({ id: "S007_prompt_1", status: "submitted" });
  t = tasksFor(p, "S007", records);
  assert.equal(t.find((x) => !x.done && x.open).unit, "2");
  records.push({ id: "S007_journal_2", status: "submitted" });
  assert.equal(
    tasksFor(p, "S007", records).find((x) => !x.done && x.open).unit,
    "3",
  );
});
test("manual open bypasses earlier incomplete sessions; explicit lock overrides auto", () => {
  const p = {
    sessionCount: 3,
    enabled: { journal: true },
    sessions: {
      1: { access: "locked" },
      2: { access: "sequential" },
      3: { access: "open" },
    },
  };
  const t = tasksFor(p, "S007", []);
  assert.deepEqual(
    t.map((x) => x.open),
    [false, false, true],
  );
  assert.equal(t.find((x) => !x.done && x.open).unit, "3");
  assert.equal(
    tasksFor(
      {
        ...p,
        sessions: {
          1: { access: "locked" },
          2: { access: "sequential" },
          3: { access: "sequential" },
        },
      },
      "S007",
      [],
    ).find((x) => !x.done && x.open),
    undefined,
  );
});
test("only configured completed records count; draft and removed records do not advance journey", () => {
  const p = { sessionCount: 1, enabled: { journal: true, POST: true } };
  const records = [
    { id: "S007_journal_1", status: "draft" },
    { id: "S007_prompt_1", status: "submitted" },
    { id: "S007_journal_2", status: "submitted" },
  ];
  const t = tasksFor(p, "S007", records);
  assert.equal(t.length, 2);
  assert.equal(t.filter((x) => x.done).length, 0);
  assert.equal(t.find((x) => x.unit === "POST").open, false);
});
test("missing and invalid survey answers do not submit", () => {
  assert.ok(validateRecord("survey", { raw: {} }, true));
  assert.equal(
    validateRecord(
      "survey",
      { raw: Object.fromEntries(questionIds.map((k) => [k, 3])) },
      true,
    ),
    null,
  );
  assert.ok(
    validateRecord(
      "survey",
      { raw: Object.fromEntries(questionIds.map((k) => [k, "3"])) },
      true,
    ),
  );
});
test("CVI indices and missing response denominators", () => {
  const x = indices([4, 3, 4, 2, null]);
  assert.equal(x.N, 4);
  assert.equal(x.I, 0.75);
  assert.equal(x.cvr, 0.5);
  assert.equal(indices([]).I, null);
  assert.equal(scaleIndices([["A1"]], [{ ratings: { A1: { r: 4 } } }]).ua, 1);
});
