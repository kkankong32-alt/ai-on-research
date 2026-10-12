import { scoreSurvey, tasksFor } from "./domain.js";
import { RUBRIC } from "../data/codebook.js";
import {
  instrumentVersion,
  instrumentsFor,
  itemLabel,
  questionIdsFor,
} from "../data/instruments.js";
export function csv(rows) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = v == null ? "" : String(v);
            if (typeof v === "string" && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const date = (v) =>
  v?.toDate
    ? v.toDate().toISOString()
    : v?.seconds
      ? new Date(v.seconds * 1000).toISOString()
      : v || "";
export function exportRows(
  kind,
  p,
  participants,
  records,
  codings = {},
  roster = {},
  includeNames = false,
) {
  const base = [
    "project_id",
    "participant_id",
    ...(includeNames ? ["name"] : []),
  ];
  const b = (r) => [
    p.id,
    r.participant_id,
    ...(includeNames ? [roster[r.participant_id]?.name || ""] : []),
  ];
  const list = records.filter((r) => r.status === "submitted");
  const surveyIds = [
    ...new Set([
      ...questionIdsFor(p),
      ...list
        .filter((r) => r.kind === "survey")
        .flatMap((r) => questionIdsFor(r)),
    ]),
  ];
  if (kind === "dictionary") {
    const versions = [
      ...new Set([
        instrumentVersion(p),
        ...records.map((r) => instrumentVersion(r)),
      ]),
    ];
    return [
      [
        "instrument_version",
        "section",
        "stable_item_id",
        "display_item",
        "text",
        "note",
        "reverse_scored",
      ],
      ...versions.flatMap((v) =>
        instrumentsFor(v).flatMap((s) =>
          s.items.map(([id, text, note]) => [
            v,
            s.id,
            id,
            itemLabel(id, v),
            text,
            note || "",
            id === "E5",
          ]),
        ),
      ),
    ];
  }
  if (kind === "survey")
    return [
      [
        ...base,
        "phase",
        ...surveyIds,
        "E5_raw",
        "E5_reverse",
        ..."ABCDE".split("").map((k) => k + "_mean"),
        "submitted_at",
        "instrument_version",
        "question_count",
      ],
      ...list
        .filter((r) => r.kind === "survey")
        .map((r) => {
          const s = scoreSurvey(r.data.raw, r);
          return [
            ...b(r),
            r.phase,
            ...surveyIds.map((k) =>
              questionIdsFor(r).includes(k) ? r.data.raw[k] : "",
            ),
            s.E5_raw,
            s.E5_reverse,
            ..."ABCDE".split("").map((k) => s[k + "_mean"]),
            date(r.submittedAt),
            instrumentVersion(r),
            questionIdsFor(r).length,
          ];
        }),
    ];
  if (kind === "journal") {
    const fields = [
      "question",
      "learned",
      "doubt",
      "check",
      "no_doubt",
      "struggle",
      "challenge",
      "mood",
      "next",
    ];
    return [
      [
        ...base,
        "session_id",
        ...fields,
        "auto_valence",
        "auto_verify",
        "teacher_valence",
        "teacher_verify",
        "teacher_meta",
        "teacher_memo",
        "created_at",
        "questions_json",
        "instrument_version",
      ],
      ...list
        .filter((r) => r.kind === "journal")
        .map((r) => [
          ...b(r),
          r.session_id,
          ...fields.map((k) => r.data[k]),
          r.data.auto?.valence,
          r.data.auto?.verify,
          codings[r.id]?.valence,
          codings[r.id]?.verify,
          codings[r.id]?.meta,
          codings[r.id]?.memo,
          date(r.createdAt),
          JSON.stringify(r.data.questions || {}),
          instrumentVersion(r),
        ]),
    ];
  }
  if (kind === "prompt")
    return [
      [
        ...base,
        "session_id",
        "conversation_id",
        "turn_no",
        "speaker",
        "raw_text",
        "auto_code",
        "teacher_code",
        "final_code",
        "created_at",
        "prompt_question",
        "code_source",
        "context_review_needed",
        "instrument_version",
      ],
      ...list
        .filter((r) => r.kind === "prompt")
        .flatMap((r) =>
          r.data.turns.map((t) => {
            const teacher = codings[r.id]?.codes?.[t.turn_no] ?? null;
            return [
              ...b(r),
              r.session_id,
              r.id,
              t.turn_no,
              t.speaker,
              t.raw_text,
              t.auto_code,
              teacher,
              teacher ?? t.auto_code,
              date(r.createdAt),
              r.data.questions?.prompt || "",
              t.speaker !== "student"
                ? ""
                : teacher
                  ? "teacher"
                  : "automatic_draft",
              t.speaker === "student" && !teacher && t.auto_code === "R-ACCEPT",
              instrumentVersion(r),
            ];
          }),
        ),
    ];
  if (kind === "rubric")
    return [
      [
        ...base,
        "session_id",
        "conversation_id",
        ...RUBRIC.flatMap((x) => [
          x.k + "_auto",
          x.k + "_teacher",
          x.k + "_final",
        ]),
        "teacher_memo",
        "instrument_version",
      ],
      ...list
        .filter((r) => r.kind === "prompt")
        .map((r) => [
          ...b(r),
          r.session_id,
          r.id,
          ...RUBRIC.flatMap((x) => [
            r.data.rubricDraft?.[x.k],
            codings[r.id]?.rubric?.[x.k],
            codings[r.id]?.rubric?.[x.k] ?? r.data.rubricDraft?.[x.k],
          ]),
          codings[r.id]?.memo,
          instrumentVersion(r),
        ]),
    ];
  return [
    [...base, "active", "completed", "total", "progress_percent"],
    ...participants.map((s) => {
      const tasks = tasksFor(p, s.id, records),
        n = tasks.filter((t) => t.done).length;
      return [
        ...b({ participant_id: s.id }),
        s.active,
        n,
        tasks.length,
        tasks.length ? Math.round((n / tasks.length) * 100) : 0,
      ];
    }),
  ];
}
