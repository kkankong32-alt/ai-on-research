import React, { useEffect, useRef, useState } from "react";
import { Link, Routes, Route, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Lock,
  MessageSquare,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import * as store from "../services/store.js";
import { SURVEY } from "../data/instruments.js";
import { MOODS, TOOLS } from "../data/codebook.js";
import {
  tasksFor,
  recordKey,
  phaseNames,
  parseConversation,
  autoCode,
  rubricDraft,
  journalDraft,
  validateRecord,
  scoreSurvey,
} from "../utils/domain.js";
import {
  Button,
  Field,
  Status,
  Empty,
  ErrorBox,
  Scale,
  Progress,
  useList,
  ArrowLeft,
} from "./UI.jsx";
export default function Student({ user }) {
  const [project, setProject] = useState(null),
    [error, setError] = useState("");
  const [records, recordError, recordsLoaded] = useList(
    (cb, err) =>
      store.watchList(user.project_id, "records", cb, err, user.participant_id),
    [user.project_id],
  );
  useEffect(
    () =>
      store.watchProject(user.project_id, setProject, () =>
        setError(
          "프로젝트에 접속할 수 없어요. 선생님께 개인코드를 확인해 주세요.",
        ),
      ),
    [user.project_id],
  );
  if (error || recordError)
    return (
      <main>
        <ErrorBox error={error || recordError} />
      </main>
    );
  if (!project || !recordsLoaded)
    return <main>탐구 기록을 불러오고 있어요…</main>;
  const tasks = tasksFor(project, user.participant_id, records);
  return (
    <Routes>
      <Route
        path="/"
        element={<StudentHome user={user} project={project} tasks={tasks} />}
      />
      <Route
        path="record/:kind/:unit"
        element={
          <RecordRoute
            user={user}
            project={project}
            tasks={tasks}
            records={records}
          />
        }
      />
    </Routes>
  );
}
function StudentHome({ user, project, tasks }) {
  const next = tasks.find((t) => !t.done && t.open),
    done = tasks.filter((t) => t.done).length;
  return (
    <main className="student-main">
      <div className="page-intro">
        <span className="eyebrow">MY EXPLORATION</span>
        <h1>
          반가워요, {user.displayName} <span className="wave">✦</span>
        </h1>
        <p>우리의 탐구를 한 걸음 더 이어가 볼까요?</p>
      </div>
      <section className="next-card">
        <div>
          <Status type="green">
            {done === tasks.length ? "탐구 기록 완료" : "지금 할 일"}
          </Status>
          <h2>
            {next?.title ||
              (done === tasks.length
                ? "모든 기록을 차곡차곡 남겼어요!"
                : "다음 탐구가 열리면 이어가요")}
          </h2>
          <p>{project.name}</p>
          {next && (
            <Link
              className="btn primary"
              to={`record/${next.kind}/${next.unit}`}
            >
              오늘의 탐구 기록하기 <ArrowRight size={18} />
            </Link>
          )}
        </div>
        <div className="next-art" aria-hidden="true">
          <NotebookPen size={70} />
          <Sparkles size={24} />
        </div>
      </section>
      <section className="journey">
        <div className="row between">
          <h2>나의 탐구 여정</h2>
          <span>{done}개 완료</span>
        </div>
        <Progress value={done} max={tasks.length} />
        {tasks.map((t, i) => (
          <div
            className={`journey-row ${t.done ? "done" : ""}`}
            key={`${t.kind}-${t.unit}`}
          >
            <span className="step-circle">
              {t.done ? (
                <Check size={18} />
              ) : !t.open ? (
                <Lock size={16} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <div>
              <h3>{t.title}</h3>
              <small>
                {t.done
                  ? "기록을 잘 남겼어요"
                  : t.open
                    ? "나의 생각을 남겨요"
                    : "아직 열리지 않았어요"}
              </small>
            </div>
            {t.open || t.done ? (
              <Link className="text-button" to={`record/${t.kind}/${t.unit}`}>
                {t.done ? "기록 보기" : "기록하기"} <ArrowRight size={16} />
              </Link>
            ) : (
              <Status>잠김</Status>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
function RecordRoute(props) {
  const { kind, unit } = useParams();
  const task = props.tasks.find((t) => t.kind === kind && t.unit === unit);
  if (!task || (!task.open && !task.done))
    return (
      <main>
        <Empty title="아직 열리지 않은 기록이에요">
          선생님이 열어 주시면 기록할 수 있어요.
        </Empty>
        <Link to="/student">나의 탐구로 돌아가기</Link>
      </main>
    );
  return (
    <RecordEditor
      key={`${kind}-${unit}`}
      {...props}
      kind={kind}
      unit={unit}
      record={props.records.find(
        (r) => r.id === recordKey(props.user.participant_id, kind, unit),
      )}
    />
  );
}
const initial = (kind) =>
  kind === "survey"
    ? { raw: {} }
    : kind === "journal"
      ? {
          question: "",
          learned: "",
          doubt: "",
          check: "",
          no_doubt: null,
          struggle: "",
          challenge: null,
          mood: "",
          next: "",
        }
      : { tool: "", raw: "", turns: [], note: "" };
function RecordEditor({ user, project, record, kind, unit }) {
  const navigate = useNavigate(),
    key = `aion-draft:${user.uid}:${project.id}:${recordKey(user.participant_id, kind, unit)}`;
  const [recovered] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {}
    return null;
  });
  const staleDraft =
    !!recovered && recovered.baseRevision !== (record?.revision || 0);
  const [data, setData] = useState(
    recovered?.data || record?.data || initial(kind),
  );
  const [page, setPage] = useState(0),
    [status, setStatus] = useState(""),
    [error, setError] = useState(
      staleDraft
        ? "다른 기기에서 변경된 기록이 있습니다. 이 기기의 초안을 내려받아 보관한 뒤 선생님과 확인해 주세요."
        : "",
    ),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(record?.status === "submitted");
  const revision = useRef(record?.revision || 0),
    current = useRef(data),
    dirty = useRef(!!recovered && record?.status !== "submitted"),
    chain = useRef(Promise.resolve()),
    mounted = useRef(true),
    conflict = useRef(staleDraft),
    timer = useRef(null);
  useEffect(() => {
    if (record && !dirty.current && record.revision > revision.current) {
      revision.current = record.revision;
      setData(record.data);
      current.current = record.data;
      setDone(record.status === "submitted");
    }
  }, [record]);
  function persist(value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data: value, baseRevision: revision.current }),
      );
    } catch {
      setError(
        "이 기기에 임시 저장할 공간이 부족해요. 화면을 닫지 말고 선생님께 알려 주세요.",
      );
    }
  }
  function change(patch) {
    const next = { ...current.current, ...patch };
    current.current = next;
    setData(next);
    dirty.current = true;
    persist(next);
    setStatus(
      navigator.onLine ? "저장 중…" : "인터넷이 끊겼어요 · 기기에 임시 저장됨",
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 700);
  }
  function flush(submit = false) {
    clearTimeout(timer.current);
    const run = async () => {
      if (conflict.current)
        throw Error(
          "다른 기기의 변경 내용과 충돌했습니다. 초안을 내려받고 새로고침해 주세요.",
        );
      if (!submit && !dirty.current) return;
      if (!navigator.onLine) {
        setStatus("인터넷이 끊겼어요 · 기기에 임시 저장됨");
        if (submit)
          throw Error(
            "인터넷 연결 후 제출해 주세요. 작성한 내용은 기기에 남아 있어요.",
          );
        return;
      }
      const value = current.current;
      let payload = value;
      if (kind === "survey")
        payload = { ...value, derived: scoreSurvey(value.raw) };
      if (kind === "journal") payload = { ...value, auto: journalDraft(value) };
      if (kind === "prompt")
        payload = { ...value, rubricDraft: rubricDraft(value.turns) };
      setStatus("저장 중…");
      try {
        revision.current = await store.saveRecord(
          project.id,
          user.participant_id,
          kind,
          unit,
          payload,
          submit ? "submitted" : "draft",
          revision.current,
        );
        if (current.current === value) {
          dirty.current = false;
          localStorage.removeItem(key);
        } else persist(current.current);
        if (mounted.current)
          setStatus(store.isDemo() ? "미리보기에서만 저장됨" : "✓ 저장 완료");
        setError("");
      } catch (e) {
        if (/다른 기기/.test(e.message)) conflict.current = true;
        setStatus("저장하지 못했어요 · 기기에 임시 저장됨");
        setError(e.message);
        throw e;
      }
    };
    const p = chain.current.then(run);
    chain.current = p.catch(() => {});
    if (!submit) p.catch(() => {});
    return p;
  }
  useEffect(() => {
    mounted.current = true;
    if (dirty.current) timer.current = setTimeout(() => flush(), 100);
    const online = () => {
      if (dirty.current) {
        setStatus("다시 저장하는 중…");
        flush();
      }
    };
    const leave = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leave);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  async function submit() {
    setError("");
    const e = validateRecord(kind, current.current, true);
    if (e) {
      setError(e);
      return;
    }
    setBusy(true);
    try {
      await flush(true);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function back() {
    if (dirty.current) await flush().catch(() => {});
    navigate("/student");
  }
  if (done)
    return (
      <main className="form-main">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={18} /> 나의 탐구
        </button>
        <section className="success-card">
          <div className="success-icon">
            <Check size={34} />
          </div>
          <span className="eyebrow">WELL DONE</span>
          <h1>생각을 잘 남겼어요!</h1>
          <p>
            다음 탐구에서 또 만나요.
            <br />
            제출한 기록을 고치려면 선생님께 말씀해 주세요.
          </p>
          <Button primary onClick={back}>
            나의 탐구로 돌아가기 <ArrowRight size={18} />
          </Button>
        </section>
        <details className="card">
          <summary>내가 남긴 기록 보기</summary>
          <RecordText kind={kind} data={record?.data || data} />
        </details>
      </main>
    );
  return (
    <main className="form-main">
      <div className="row between">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={18} /> 나의 탐구
        </button>
        <small role="status" aria-live="polite">
          {status || "작성한 내용은 자동 저장돼요"}
        </small>
      </div>
      <div className="page-intro">
        <span className="eyebrow">
          {kind === "survey" ? "MY THOUGHTS" : `${unit}차시 · MY EXPLORATION`}
        </span>
        <h1>
          {kind === "survey"
            ? phaseNames[unit]
            : kind === "journal"
              ? "오늘의 탐구를 돌아봐요"
              : "AI와 나눈 대화를 남겨요"}
        </h1>
        <p>
          {kind === "survey"
            ? "정답은 없어요. 지금 내 생각과 가장 가까운 숫자를 골라요."
            : kind === "journal"
              ? "짧아도 괜찮아요. 내 생각을 나의 말로 적어 봐요."
              : "대화 전체를 복사해서 붙여 넣으면 돼요."}
        </p>
      </div>
      <ErrorBox error={error} />
      {conflict.current && (
        <Button
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            a.download = "내-임시-초안.json";
            a.click();
          }}
        >
          현재 초안 내려받기
        </Button>
      )}
      {kind === "survey" ? (
        <>
          <Progress value={Object.keys(data.raw).length} max={28} />
          <div className="section-label">{page + 1} / 5 · 나의 생각</div>
          {SURVEY[page].items.map(([id, text]) => (
            <section className="question-card" key={id}>
              <h3>
                <span>{id}</span>
                {text.replace(/^\(역채점\) /, "")}
              </h3>
              <Scale
                label={id}
                value={data.raw[id]}
                onChange={(n) => change({ raw: { ...data.raw, [id]: n } })}
              />
            </section>
          ))}
          <div className="row between">
            <Button
              disabled={page === 0}
              onClick={() => {
                setPage(page - 1);
                setError("");
                window.scrollTo(0, 0);
              }}
            >
              이전
            </Button>
            <Button
              primary
              busy={busy}
              onClick={() => {
                if (SURVEY[page].items.some(([id]) => !data.raw[id])) {
                  setError("아직 답하지 않은 문항을 골라 주세요.");
                  return;
                }
                if (page < 4) {
                  setPage(page + 1);
                  setError("");
                  window.scrollTo(0, 0);
                } else submit();
              }}
            >
              {page < 4 ? "다음으로" : "내 생각 제출하기"}{" "}
              <ArrowRight size={18} />
            </Button>
          </div>
        </>
      ) : null}
      {kind === "journal" ? (
        <>
          <div className="mini-steps">
            {["오늘의 발견", "의심하고 확인하기", "다음 탐구로"].map((s, i) => (
              <span key={s} className={page === i ? "active" : ""}>
                {i + 1}. {s}
              </span>
            ))}
          </div>
          <section className="card journal-form">
            {page === 0 ? (
              <>
                <TextField
                  label="오늘의 탐구 질문"
                  hint="내가 알아보려 한 것을 한 문장으로 적어요."
                  value={data.question}
                  onChange={(v) => change({ question: v })}
                />
                <TextField
                  label="오늘 새로 알게 된 것"
                  hint="사실이나 방법, 무엇이든 좋아요."
                  value={data.learned}
                  onChange={(v) => change({ learned: v })}
                />
              </>
            ) : page === 1 ? (
              <>
                <h3>AI를 의심하거나 다시 확인한 순간이 있었나요?</h3>
                <div className="chips">
                  {[
                    [false, "있었어요"],
                    [true, "오늘은 없었어요"],
                  ].map(([v, t]) => (
                    <button
                      key={t}
                      aria-pressed={data.no_doubt === v}
                      onClick={() => change({ no_doubt: v })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {data.no_doubt === false && (
                  <>
                    <TextField
                      label="무엇이 이상하다고 생각했나요?"
                      value={data.doubt}
                      onChange={(v) => change({ doubt: v })}
                    />
                    <TextField
                      label="어떻게 확인했나요?"
                      value={data.check}
                      onChange={(v) => change({ check: v })}
                    />
                  </>
                )}
                <TextField
                  label="어려웠던 점과 넘은 방법"
                  hint="막혔던 순간과 해결하려고 해 본 것을 적어요."
                  value={data.struggle}
                  onChange={(v) => change({ struggle: v })}
                />
              </>
            ) : (
              <>
                <Field
                  label="오늘의 도전 점수"
                  hint="1 조금 도전했어요 · 5 아주 많이 도전했어요"
                >
                  <Scale
                    ends={false}
                    label="도전 점수"
                    value={data.challenge}
                    onChange={(v) => change({ challenge: v })}
                  />
                </Field>
                <Field label="오늘의 마음">
                  <div className="chips">
                    {MOODS.map(([m]) => (
                      <button
                        type="button"
                        key={m}
                        aria-pressed={data.mood === m}
                        onClick={() => change({ mood: m })}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="오늘의 마음 직접 입력"
                    value={data.mood}
                    placeholder="다른 말로 적어도 좋아요"
                    onChange={(e) => change({ mood: e.target.value })}
                    maxLength={100}
                  />
                </Field>
                <TextField
                  label="다음에 해보고 싶은 것"
                  value={data.next}
                  onChange={(v) => change({ next: v })}
                />
              </>
            )}
          </section>
          <div className="row between">
            <Button disabled={!page} onClick={() => setPage(page - 1)}>
              이전
            </Button>
            <Button
              primary
              busy={busy}
              onClick={() => {
                if (page < 2) {
                  setPage(page + 1);
                  window.scrollTo(0, 0);
                } else submit();
              }}
            >
              {page < 2 ? "다음으로" : "오늘의 기록 제출하기"}{" "}
              <ArrowRight size={18} />
            </Button>
          </div>
        </>
      ) : null}
      {kind === "prompt" ? (
        <>
          <section className="card">
            <Field label="어떤 AI와 이야기했나요?">
              <div className="chips">
                {TOOLS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={data.tool === t}
                    onClick={() => change({ tool: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label="대화 전체 붙여넣기"
              hint="이름이나 연락처가 들어 있지 않은지 살펴봐요."
            >
              <textarea
                rows={9}
                value={data.raw}
                onChange={(e) =>
                  change({
                    raw: e.target.value,
                    turns: parseConversation(e.target.value),
                  })
                }
                placeholder={
                  "나: 소리는 어떻게 전달돼?\nAI: 소리는 진동으로 전달돼요."
                }
              />
            </Field>
            <TextField
              label="덧붙이고 싶은 말 (선택)"
              value={data.note}
              onChange={(v) => change({ note: v })}
            />
          </section>
          <section className="card">
            <div className="row between">
              <h2>대화가 잘 나뉘었나요?</h2>
              <Status>{data.turns.length}개 발화</Status>
            </div>
            <p>
              이름표를 누르면 ‘나’와 ‘AI’를 바꿀 수 있어요. 이름표가 없는 대화는
              직접 확인해 주세요.
            </p>
            {!data.turns.length ? (
              <Empty title="대화를 붙여 넣어 주세요" />
            ) : (
              data.turns.map((t, i) => (
                <div className={`turn ${t.speaker}`} key={i}>
                  <button
                    className="speaker"
                    onClick={() =>
                      change({
                        turns: data.turns.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                speaker:
                                  x.speaker === "student" ? "ai" : "student",
                                auto_code:
                                  x.speaker === "ai"
                                    ? autoCode(x.raw_text)
                                    : null,
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    {t.speaker === "student" ? "나" : "AI"}
                  </button>
                  <p>{t.raw_text}</p>
                </div>
              ))
            )}
          </section>
          <Button primary busy={busy} onClick={submit}>
            대화 기록 제출하기 <ArrowRight size={18} />
          </Button>
        </>
      ) : null}
    </main>
  );
}
function TextField({ label, hint, value, onChange }) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={20000}
      />
    </Field>
  );
}
export function RecordText({ kind, data }) {
  if (kind === "survey")
    return (
      <dl className="record-text">
        {SURVEY.flatMap((s) => s.items).map(([id, text]) => (
          <React.Fragment key={id}>
            <dt>
              {id} {text.replace(/^\(역채점\) /, "")}
            </dt>
            <dd>{data.raw[id]}점</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  if (kind === "prompt") return <pre className="raw-text">{data.raw}</pre>;
  const labels = {
    question: "오늘의 탐구 질문",
    learned: "오늘 새로 알게 된 것",
    doubt: "의심한 내용",
    check: "확인한 방법",
    struggle: "어려웠던 점과 넘은 방법",
    challenge: "도전 점수",
    mood: "오늘의 마음",
    next: "다음에 해보고 싶은 것",
  };
  return (
    <dl className="record-text">
      {Object.entries(labels).map(([k, l]) => (
        <React.Fragment key={k}>
          <dt>{l}</dt>
          <dd>{data[k] || "—"}</dd>
        </React.Fragment>
      ))}
      {data.no_doubt && <p>AI를 의심한 순간: 오늘은 없었어요</p>}
    </dl>
  );
}
