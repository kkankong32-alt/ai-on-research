import { questionIds, scoreSurvey, tasksFor } from "./domain.js";
import { RUBRIC } from "../data/codebook.js";
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
  if (kind === "survey")
    return [
      [
        ...base,
        "phase",
        ...questionIds,
        "E5_raw",
        "E5_reverse",
        ..."ABCDE".split("").map((k) => k + "_mean"),
        "submitted_at",
      ],
      ...list
        .filter((r) => r.kind === "survey")
        .map((r) => {
          const s = scoreSurvey(r.data.raw);
          return [
            ...b(r),
            r.phase,
            ...questionIds.map((k) => r.data.raw[k]),
            s.E5_raw,
            s.E5_reverse,
            ..."ABCDE".split("").map((k) => s[k + "_mean"]),
            date(r.submittedAt),
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
