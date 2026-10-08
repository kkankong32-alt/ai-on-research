import { SURVEY, INSTRUMENT_VERSION } from "../data/instruments.js";
import { CODE_RULES, MOODS, POS_WORDS, NEG_WORDS } from "../data/codebook.js";
export const questionIds = SURVEY.flatMap((s) => s.items.map((i) => i[0]));
export const phaseNames = {
  PRE: "시작 전 나의 생각",
  POST: "탐구 후 나의 생각",
  DELAYED: "다시 돌아보는 나의 생각",
};
export const recordKey = (sid, kind, unit) => `${sid}_${kind}_${unit}`;
export function makeParticipants(count) {
  if (!Number.isInteger(count) || count < 1 || count > 500)
    throw Error("학생 수는 1~500명으로 입력해 주세요.");
  return Array.from({ length: count }, (_, i) => ({
    id: `S${String(i + 1).padStart(3, "0")}`,
    displayName: `학생 ${String(i + 1).padStart(2, "0")}`,
    active: true,
    tokenVersion: 1,
  }));
}
export function newCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  const a = crypto.getRandomValues(new Uint8Array(16));
  for (const n of a) s += alphabet[n % alphabet.length];
  return s.match(/.{4}/g).join("-");
}
export const normalizeCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function schoolLoginKey(projectCode, grade, classroom, number) {
  const values = [grade, classroom, number].map(Number);
  if (
    !normalizeCode(projectCode) ||
    !values.every((n) => Number.isInteger(n) && n >= 1 && n <= 999)
  )
    throw Error("프로젝트 입장코드와 학년·반·번호(1~999)를 확인해 주세요.");
  return `SCHOOL${normalizeCode(projectCode)}G${values[0]}C${values[1]}N${values[2]}`;
}
export async function hashCode(s) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalizeCode(s)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function scoreSurvey(raw) {
  const out = {
    E5_raw: raw.E5 ?? null,
    E5_reverse: raw.E5 ? 6 - raw.E5 : null,
  };
  for (const s of SURVEY) {
    const v = s.items
      .map(([id]) => raw[id])
      .filter((x) => Number.isInteger(x) && x >= 1 && x <= 5);
    out[s.id + "_mean"] =
      v.length === s.items.length
        ? s.items.reduce(
            (n, [id]) => n + (id === "E5" ? 6 - raw[id] : raw[id]),
            0,
          ) / v.length
        : null;
  }
  return out;
}
export const autoCode = (text) =>
  CODE_RULES.find(([, re]) => re.test(text.trim()))?.[0] ?? "Q-INFO";
export function parseConversation(raw) {
  const turns = [];
  let current = null;
  const u =
    /^\s*(?:\[)?(나의 말|내 질문|나|저|학생|사용자|user|you|me|q|질문|프롬프트|prompt)(?:\])?\s*(?:said|님의 말)?\s*[:：]\s*(.*)$/i;
  const a =
    /^\s*(?:\[)?(chatgpt|gemini|claude|gpt|클로드|제미나이|챗gpt|챗지피티|뤼튼|assistant|copilot|ai|답변|답|a)(?:\])?\s*(?:said|의 말)?\s*[:：]\s*(.*)$/i;
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const um = line.match(u),
      am = line.match(a),
      standalone =
        /^(You said|ChatGPT said|사용자|ChatGPT|Gemini|Claude|Assistant):?$/i.test(
          line.trim(),
        );
    if (um || am || standalone) {
      const speaker =
        um || /^(You said|사용자):?$/i.test(line.trim()) ? "student" : "ai";
      current = { speaker, raw_text: um?.[2] ?? am?.[2] ?? "" };
      turns.push(current);
    } else if (current) current.raw_text += "\n" + line;
    else if (line.trim()) {
      current = { speaker: "student", raw_text: line, uncertain: true };
      turns.push(current);
    }
  }
  return turns
    .filter((t) => t.raw_text.trim())
    .map((t, i) => ({
      ...t,
      turn_no: i + 1,
      auto_code: t.speaker === "student" ? autoCode(t.raw_text) : null,
      teacher_code: null,
    }));
}
export function rubricDraft(turns) {
  const f = {};
  for (const t of turns)
    if (t.speaker === "student") f[t.auto_code] = (f[t.auto_code] || 0) + 1;
  const lv = (n) => (n >= 2 ? 3 : n === 1 ? 2 : 1);
  return {
    evo: f["Q-HYP"] && f["Q-REASON"] ? 3 : f["Q-HYP"] ? 2 : 1,
    rea: lv(f["Q-REASON"]),
    ver: lv(f["Q-VERIFY"]),
    itr: lv(f["M-MODIFY"]),
    meta: lv(f["M-META"]),
  };
}
export function journalDraft(j) {
  return {
    valence:
      MOODS.find((m) => m[0] === j.mood)?.[1] ??
      (POS_WORDS.test(j.mood) ? 1 : NEG_WORDS.test(j.mood) ? -1 : 0),
    verify: j.no_doubt
      ? 0
      : /(다시|다른|비교|교과서|검색|실험|직접|책|선생님|측정)/.test(j.check)
        ? 2
        : 1,
    meta: null,
  };
}
export function validateRecord(kind, data, submit) {
  if (!submit) return null;
  if (
    kind === "survey" &&
    !questionIds.every(
      (k) =>
        Number.isInteger(data.raw?.[k]) && data.raw[k] >= 1 && data.raw[k] <= 5,
    )
  )
    return "아직 답하지 않은 문항을 확인해 주세요.";
  if (
    kind === "journal" &&
    (!data.question?.trim() ||
      !data.learned?.trim() ||
      !data.struggle?.trim() ||
      !data.next?.trim() ||
      !data.mood?.trim() ||
      !data.challenge ||
      typeof data.no_doubt !== "boolean" ||
      (!data.no_doubt && (!data.doubt?.trim() || !data.check?.trim())))
  )
    return "빈칸과 오늘의 도전 점수를 확인해 주세요.";
  if (
    kind === "prompt" &&
    (!data.raw?.trim() || !data.turns?.some((t) => t.speaker === "student"))
  )
    return "대화를 입력하고 내 말이 있는지 확인해 주세요.";
  if (
    kind === "prompt" &&
    new TextEncoder().encode(JSON.stringify(data)).length > 700000
  )
    return "대화가 너무 길어요. 원문을 나누어 기록해 주세요.";
  return null;
}
export const DEFAULT_SESSION_QUESTIONS = {
  question: "오늘의 탐구 질문",
  learned: "오늘 새로 알게 된 것",
  no_doubt: "오늘 탐구에서 의심하거나 다시 확인한 내용이 있었나요?",
  doubt: "무엇이 이상하다고 생각했나요?",
  check: "어떻게 확인했나요?",
  struggle: "어려웠던 점과 넘은 방법",
  challenge: "오늘의 도전 점수",
  mood: "오늘의 마음",
  next: "다음에 해보고 싶은 것",
  prompt: "이번 차시 탐구에서 주고받은 AI 대화를 기록해 주세요.",
};
export function sessionQuestions(project, number) {
  const custom = project.sessions?.[String(number)]?.questions || {};
  return Object.fromEntries(
    Object.entries(DEFAULT_SESSION_QUESTIONS).map(([k, value]) => [
      k,
      custom[k]?.trim() || value,
    ]),
  );
}
export function sessionSettings(project, number) {
  const custom = project.sessions?.[String(number)] || {};
  return {
    questions: custom.questions || {},
    journal: custom.journal ?? !!project.enabled.journal,
    prompt: custom.prompt ?? !!project.enabled.prompt,
    access: custom.access || "auto",
  };
}
export function tasksFor(project, sid, records) {
  const done = (kind, unit) =>
    records.some(
      (r) => r.id === recordKey(sid, kind, unit) && r.status === "submitted",
    );
  const out = [];
  if (project.enabled.PRE)
    out.push({
      kind: "survey",
      unit: "PRE",
      title: phaseNames.PRE,
      done: done("survey", "PRE"),
      open: true,
    });
  for (let i = 1; i <= project.sessionCount; i++) {
    const settings = sessionSettings(project, i);
    const open =
      settings.access !== "locked" &&
      (settings.access !== "sequential" || out.every((t) => t.done));
    for (const kind of ["journal", "prompt"])
      if (settings[kind])
        out.push({
          kind,
          unit: String(i),
          title: `${i}차시 ${kind === "journal" ? "탐구 돌아보기" : "AI 대화 기록"}`,
          done: done(kind, i),
          open,
        });
  }
  const sessionsDone = out.every((t) => t.done);
  if (project.enabled.POST)
    out.push({
      kind: "survey",
      unit: "POST",
      title: phaseNames.POST,
      done: done("survey", "POST"),
      open: !!project.postOpen || sessionsDone,
    });
  if (project.enabled.DELAYED)
    out.push({
      kind: "survey",
      unit: "DELAYED",
      title: phaseNames.DELAYED,
      done: done("survey", "DELAYED"),
      open: !!project.delayedOpen,
    });
  return out;
}
export { INSTRUMENT_VERSION };
