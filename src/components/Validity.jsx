import React, { useState } from "react";
import { INSTRUMENTS } from "../data/instruments.js";
import { indices, scaleIndices } from "../utils/validity.js";
import { csv, download } from "../utils/export.js";
import * as store from "../services/store.js";
import { Button, Field, ErrorBox, Status, useList } from "./UI.jsx";
export default function Validity({ p }) {
  const [reviews, error] = useList(
      (cb, e) => store.watchList(p.id, "validity_reviews", cb, e),
      [p.id],
    ),
    [mode, setMode] = useState("results"),
    [group, setGroup] = useState("A"),
    [id, setId] = useState(null),
    [data, setData] = useState({
      info: { label: "", role: "", years: "", field: "" },
      ratings: {},
      suff: {},
      overall: "",
      submitted: false,
    }),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const raters = reviews.filter((r) => r.submitted),
    section = INSTRUMENTS.find((s) => s.id === group);
  function start(r) {
    setId(r?.id || crypto.randomUUID());
    setData(
      r || {
        info: { label: "", role: "", years: "", field: "" },
        ratings: {},
        suff: {},
        overall: "",
        submitted: false,
      },
    );
    setMode("form");
    setMsg("");
  }
  function rating(q, k, v) {
    setData((d) => ({
      ...d,
      ratings: { ...d.ratings, [q]: { ...d.ratings[q], [k]: v } },
    }));
  }
  async function save(submitted) {
    setBusy(true);
    setMsg("");
    try {
      if (
        submitted &&
        INSTRUMENTS.flatMap((s) => s.items).some(
          ([id]) => !data.ratings[id]?.r || !data.ratings[id]?.c,
        )
      )
        throw Error("모든 항목의 적합성과 명확성을 선택해 주세요.");
      if (!data.info.label.trim())
        throw Error("검토자 식별명을 입력해 주세요.");
      await store.saveReview(p.id, id, { ...data, submitted });
      setMsg(submitted ? "검토를 제출했습니다." : "검토 초안을 저장했습니다.");
      if (submitted) setMode("results");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportReview() {
    const rows = [
      [
        "review_id",
        "reviewer",
        "role",
        "years",
        "field",
        "submitted",
        "instrument",
        "item",
        "relevance",
        "clarity",
        "comment",
        "representativeness",
        "overall",
      ],
    ];
    for (const r of reviews)
      for (const s of INSTRUMENTS)
        for (const [id] of s.items)
          rows.push([
            r.id,
            r.info.label,
            r.info.role,
            r.info.years,
            r.info.field,
            r.submitted,
            s.id,
            id,
            r.ratings[id]?.r,
            r.ratings[id]?.c,
            r.ratings[id]?.n,
            r.suff[s.id],
            r.overall,
          ]);
    download("내용타당도_원자료.csv", csv(rows), "text/csv;charset=utf-8");
  }
  function exportIndices() {
    const rows = [
      [
        "instrument",
        "item",
        "N",
        "I_CVI",
        "clarity_I_CVI",
        "k_star",
        "CVR_relevance_based",
        "S_CVI_Ave",
        "S_CVI_UA",
      ],
    ];
    for (const s of INSTRUMENTS) {
      const scale = scaleIndices(s.items, raters);
      for (const [id] of s.items) {
        const r = indices(raters.map((v) => v.ratings[id]?.r)),
          c = indices(raters.map((v) => v.ratings[id]?.c));
        rows.push([s.id, id, r.N, r.I, c.I, r.k, r.cvr, scale.ave, scale.ua]);
      }
    }
    download("내용타당도_지수.csv", csv(rows), "text/csv;charset=utf-8");
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>연구도구 · 내용타당도 검토</h2>
          <p>검사 문항, 성찰저널, 코드북과 루브릭을 함께 검토합니다.</p>
        </div>
        <Button primary onClick={() => start()}>
          새 전문가 검토
        </Button>
      </div>
      <ErrorBox error={error} />
      <div className="row wrap">
        <Button onClick={() => setMode("results")}>분석 결과</Button>
        <Button onClick={exportReview}>원자료 CSV</Button>
        <Button onClick={exportIndices}>지수 CSV</Button>
        <Status>제출 완료 {raters.length}명</Status>
      </div>
      <p role="status">{msg}</p>
      <div className="tabs">
        {INSTRUMENTS.map((s) => (
          <button
            key={s.id}
            className={group === s.id ? "active" : ""}
            onClick={() => setGroup(s.id)}
          >
            {s.id} {s.title.replace(/^[A-E]\. /, "")}
          </button>
        ))}
      </div>
      {mode === "form" ? (
        <>
          <section className="card">
            <h3>전문가 정보</h3>
            <div className="grid2">
              {[
                ["label", "검토자 식별명"],
                ["role", "직위 / 역할"],
                ["years", "경력(년)"],
                ["field", "전문 분야"],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input
                    value={data.info[k]}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        info: { ...d.info, [k]: e.target.value },
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </section>
          <h3>{section.title}</h3>
          <p>{section.construct}</p>
          {section.items.map(([qid, text, note]) => (
            <section className="card" key={qid}>
              <h3>
                {qid} · {text}
              </h3>
              {note && <p className="raw-text">{note}</p>}
              <div className="grid2">
                {[
                  ["r", "적합성"],
                  ["c", "명확성"],
                ].map(([k, l]) => (
                  <Field key={k} label={l}>
                    <select
                      value={data.ratings[qid]?.[k] || ""}
                      onChange={(e) => rating(qid, k, Number(e.target.value))}
                    >
                      <option value="">선택</option>
                      {[1, 2, 3, 4].map((v) => (
                        <option key={v} value={v}>
                          {v} ·{" "}
                          {k === "r"
                            ? [
                                "적합하지 않음",
                                "상당한 수정 필요",
                                "적합(약간 수정)",
                                "매우 적합",
                              ][v - 1]
                            : [
                                "매우 불명확",
                                "다소 불명확",
                                "대체로 명확",
                                "매우 명확",
                              ][v - 1]}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <Field label="의견">
                <textarea
                  value={data.ratings[qid]?.n || ""}
                  onChange={(e) => rating(qid, "n", e.target.value)}
                />
              </Field>
            </section>
          ))}
          <section className="card">
            <Field label="영역 대표성 / 보완 의견">
              <textarea
                value={data.suff[group] || ""}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    suff: { ...d.suff, [group]: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="전체 의견">
              <textarea
                value={data.overall}
                onChange={(e) =>
                  setData((d) => ({ ...d, overall: e.target.value }))
                }
              />
            </Field>
            <div className="row between">
              <Button busy={busy} onClick={() => save(false)}>
                초안 저장
              </Button>
              <Button primary busy={busy} onClick={() => save(true)}>
                전체 검토 제출
              </Button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <h3>{section.title}</h3>
            <div className="score-grid">
              {Object.entries(scaleIndices(section.items, raters)).map(
                ([k, v]) => (
                  <div key={k}>
                    <span>{k === "ave" ? "S-CVI/Ave" : "S-CVI/UA"}</span>
                    <strong>{v?.toFixed(3) || "—"}</strong>
                  </div>
                ),
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>N</th>
                    <th>I-CVI</th>
                    <th>명확성</th>
                    <th>k*</th>
                    <th>기존 CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map(([id]) => {
                    const r = indices(raters.map((v) => v.ratings[id]?.r)),
                      c = indices(raters.map((v) => v.ratings[id]?.c));
                    return (
                      <tr key={id}>
                        <th>{id}</th>
                        <td>{r.N}</td>
                        <td>{r.I?.toFixed(3) || "—"}</td>
                        <td>{c.I?.toFixed(3) || "—"}</td>
                        <td>{r.k?.toFixed(3) || "—"}</td>
                        <td>{r.cvr?.toFixed(3) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted">
              기존 방식 CVR은 적합성 3·4점 응답을 기준으로 계산합니다. 전통적
              필수성 판단 CVR과 구분하여 해석하세요. 제출된 검토만 집계합니다.
            </p>
          </section>
          <h3>검토자별 응답</h3>
          {reviews.map((r) => (
            <section className="card row between" key={r.id}>
              <div>
                <strong>{r.info.label}</strong>
                <p>
                  {r.info.role} · {r.submitted ? "제출 완료" : "초안"}
                </p>
              </div>
              <Button onClick={() => start(r)}>열기</Button>
            </section>
          ))}
        </>
      )}
    </>
  );
}
