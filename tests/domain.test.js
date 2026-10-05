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
} from "../src/utils/domain.js";
import { exportRows, csv } from "../src/utils/export.js";
import { indices, scaleIndices } from "../src/utils/validity.js";
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
  assert.equal(t[1].open, false);
  assert.equal(t[2].open, false);
  t = tasksFor(p, "S007", [
    { id: "S007_survey_PRE", status: "submitted" },
    { id: "S007_journal_1", status: "submitted" },
  ]);
  assert.equal(t[2].open, true);
  assert.equal(t[3].open, undefined);
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
