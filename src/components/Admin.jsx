import React, { useState, useEffect } from "react";
import { Link, Routes, Route, useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Users,
  FolderOpen,
  Download,
  LayoutDashboard,
  NotebookPen,
  Settings,
  FlaskConical,
  Copy,
  Printer,
  Archive,
  ChevronRight,
} from "lucide-react";
import QRCode from "qrcode";
import * as store from "../services/store.js";
import { tasksFor, scoreSurvey, phaseNames } from "../utils/domain.js";
import { csv, download, exportRows } from "../utils/export.js";
import { CODES, RUBRIC } from "../data/codebook.js";
import {
  Button,
  Field,
  Status,
  Empty,
  ErrorBox,
  Progress,
  Scale,
  useList,
  ArrowLeft,
} from "./UI.jsx";
import { RecordText } from "./Student.jsx";
import Validity from "./Validity.jsx";
export default function Admin({ user }) {
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-label">RESEARCH WORKSPACE</div>
        <h2>연구관리</h2>
        <Link className="nav-link active" to="/admin">
          <LayoutDashboard size={19} /> 프로젝트
        </Link>
        {user.role === "SUPER_ADMIN" && (
          <Link className="nav-link" to="/admin/members">
            <Users size={19} /> 연구회원 관리
          </Link>
        )}
        <div className="sidebar-bottom">
          <ShieldNote />
        </div>
      </aside>
      <div className="admin-content">
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="new" element={<ProjectForm />} />
          <Route path="project/:pid/*" element={<ProjectView />} />
          <Route path="members" element={<Members user={user} />} />
        </Routes>
      </div>
    </div>
  );
}
function ShieldNote() {
  return (
    <>
      <div className="sidebar-symbol">
        <FlaskConical size={23} />
      </div>
      <strong>연구의 시작부터 끝까지</strong>
      <p>
        작은 기록을 모아
        <br />
        탐구의 변화를 살펴보세요.
      </p>
      <small>원자료 보존 · 익명 연구번호</small>
    </>
  );
}
function ProjectList() {
  const [projects, error] = useList(store.watchProjects, []),
    [archived, setArchived] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OVERVIEW</span>
          <h1>우리의 탐구 프로젝트</h1>
          <p>학생들의 질문과 발견을 한곳에서 이어갑니다.</p>
        </div>
        <Link className="btn primary" to="new">
          <Plus size={18} /> 새 프로젝트 만들기
        </Link>
      </div>
      <div className="stat-grid">
        <Metric label="전체 프로젝트" value={projects.length} unit="개" />
        <Metric
          label="진행 중"
          value={projects.filter((p) => !p.archived).length}
          unit="개"
        />
        <Metric
          label="보관함"
          value={projects.filter((p) => p.archived).length}
          unit="개"
        />
      </div>
      <div className="section-heading">
        <h2>프로젝트 목록</h2>
        <label className="check-label">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          보관된 프로젝트 보기
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="project-grid">
        {projects
          .filter((p) => archived || !p.archived)
          .map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
      </div>
      {!projects.length && (
        <Empty title="첫 번째 탐구를 열어 보세요">
          새 프로젝트를 만들면 학생 접속코드와 기록장이 준비됩니다.
        </Empty>
      )}
      <section className="info-strip">
        <FlaskConical size={24} />
        <div>
          <strong>학생은 기록에 집중하고, 선생님은 변화를 발견하세요.</strong>
          <p>프로젝트별로 검사, 성찰, AI 대화를 연결해 볼 수 있습니다.</p>
        </div>
      </section>
    </>
  );
}
function ProjectCard({ p }) {
  const [students] = useList(
      (cb, err) => store.watchList(p.id, "participants", cb, err),
      [p.id],
    ),
    [records] = useList(
      (cb, err) => store.watchList(p.id, "records", cb, err),
      [p.id],
    );
  const submitted = records.filter((r) => r.status === "submitted"),
    pre = submitted.filter((r) => r.phase === "PRE").length;
  return (
    <Link className="project-card" to={`project/${p.id}`}>
      <div className="row between">
        <span className="project-icon">
          <FolderOpen size={23} />
        </span>
        <Status type={p.archived ? "" : "green"}>
          {p.archived ? "보관됨" : "진행 중"}
        </Status>
      </div>
      <h2>{p.name}</h2>
      <p>
        {p.group} · {p.teacher}
      </p>
      <div className="project-meta">
        <span>
          <Users size={15} /> {students.length}명
        </span>
        <span>{p.sessionCount}차시</span>
      </div>
      <div className="card-divider" />
      <div className="row between">
        <span>사전검사</span>
        <strong>
          {pre} / {students.filter((s) => s.active).length}
        </strong>
      </div>
      <progress
        value={pre}
        max={students.filter((s) => s.active).length || 1}
      />
      <div className="row between card-foot">
        <small>누적 기록 {submitted.length}건</small>
        <span>
          프로젝트 열기 <ArrowUpRight size={17} />
        </span>
      </div>
    </Link>
  );
}
function Metric({ label, value, unit = "" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
const defaults = {
  name: "",
  teacher: "",
  group: "",
  topic: "",
  startDate: new Date().toISOString().slice(0, 10),
  sessionCount: 4,
  count: 20,
  names: "",
  enabled: {
    PRE: true,
    POST: true,
    DELAYED: false,
    journal: true,
    prompt: true,
    validity: false,
  },
};
function ProjectForm({ original, onSaved }) {
  const [form, setForm] = useState(
      original ? { ...defaults, ...original } : defaults,
    ),
    [step, setStep] = useState(0),
    [named, setNamed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (
        !form.name.trim() ||
        !form.teacher.trim() ||
        !form.group.trim() ||
        !form.topic.trim()
      )
        throw Error("프로젝트 기본정보를 모두 입력해 주세요.");
      if (form.sessionCount < 1 || form.sessionCount > 30)
        throw Error("차시 수는 1~30으로 입력해 주세요.");
      if (!Object.entries(form.enabled).some(([k, v]) => k !== "validity" && v))
        throw Error("사용할 학생 기록을 하나 이상 선택해 주세요.");
      if (original) {
        await store.updateProject(original.id, {
          name: form.name,
          teacher: form.teacher,
          group: form.group,
          topic: form.topic,
          startDate: form.startDate,
          enabled: form.enabled,
        });
        onSaved();
      } else {
        const id = await store.createProject({
          ...form,
          names: named ? form.names : "",
        });
        navigate(`/admin/project/${id}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow">
      <Link className="text-button" to="/admin">
        <ArrowLeft size={18} /> 프로젝트 목록
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NEW EXPLORATION</span>
          <h1>{original ? "프로젝트 설정" : "새로운 탐구를 시작해요"}</h1>
          <p>세 단계면 학생들의 기록장이 준비됩니다.</p>
        </div>
      </div>
      <div className="mini-steps">
        {["기본정보", "학생 설정", "사용할 기록"].map((s, i) => (
          <span key={s} className={step === i ? "active" : ""}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <ErrorBox error={error} />
      <section className="card">
        {step === 0 ? (
          <>
            <Field label="프로젝트명">
              <input
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="예: 우리 생활 속 소리 탐구"
                maxLength={120}
              />
            </Field>
            <div className="grid2">
              <Field label="담당 교사">
                <input
                  value={form.teacher}
                  onChange={(e) => change("teacher", e.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="대상 / 집단명">
                <input
                  value={form.group}
                  onChange={(e) => change("group", e.target.value)}
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label="탐구 주제">
              <input
                value={form.topic}
                onChange={(e) => change("topic", e.target.value)}
                maxLength={240}
              />
            </Field>
            <div className="grid2">
              <Field label="시작일">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => change("startDate", e.target.value)}
                />
              </Field>
              <Field
                label="차시 수"
                hint={
                  original
                    ? "기록 연결을 보존하기 위해 생성 후 차시 수는 고정됩니다."
                    : null
                }
              >
                <input
                  type="number"
                  min="1"
                  max="30"
                  disabled={!!original}
                  value={form.sessionCount}
                  onChange={(e) =>
                    change("sessionCount", Number(e.target.value))
                  }
                />
              </Field>
            </div>
          </>
        ) : step === 1 ? (
          original ? (
            <p>학생 추가와 비활성화는 ‘접속카드’ 메뉴에서 관리합니다.</p>
          ) : (
            <>
              <div className="choice-cards">
                <button aria-pressed={!named} onClick={() => setNamed(false)}>
                  <strong>실명 없이 사용</strong>
                  <small>추천 · 연구번호로 안전하게 기록</small>
                </button>
                <button aria-pressed={named} onClick={() => setNamed(true)}>
                  <strong>학생 명렬 사용</strong>
                  <small>관리자 화면에서만 실명 확인</small>
                </button>
              </div>
              {named ? (
                <Field
                  label="학생 명렬 붙여넣기"
                  hint="한 줄에 한 명씩 입력하세요. 실명은 연구 원자료와 분리됩니다."
                >
                  <textarea
                    rows={8}
                    value={form.names}
                    onChange={(e) => change("names", e.target.value)}
                  />
                </Field>
              ) : (
                <Field
                  label="학생 수"
                  hint="학생 01 / S001부터 자동으로 생성됩니다."
                >
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={form.count}
                    onChange={(e) => change("count", Number(e.target.value))}
                  />
                </Field>
              )}
            </>
          )
        ) : (
          <>
            <h2>프로젝트에서 사용할 기록</h2>
            {[
              ["PRE", "사전검사", "탐구 시작 전 나의 생각"],
              ["journal", "차시별 성찰저널", "질문, 발견, 확인, 마음의 기록"],
              ["prompt", "AI 대화 기록", "원문과 발화별 코딩"],
              ["POST", "사후검사", "차시 기록 완료 후 자동 개방"],
              ["DELAYED", "지연검사", "관리자가 정한 시점에 수동 개방"],
              ["validity", "내용타당도 검토", "관리자 전용 연구도구"],
            ].map(([k, t, d]) => (
              <label className="setting-option" key={k}>
                <input
                  type="checkbox"
                  checked={form.enabled[k]}
                  onChange={(e) =>
                    change("enabled", {
                      ...form.enabled,
                      [k]: e.target.checked,
                    })
                  }
                />
                <span>
                  <strong>{t}</strong>
                  <small>{d}</small>
                </span>
              </label>
            ))}
          </>
        )}
      </section>
      <div className="row between">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
          이전
        </Button>
        <Button
          primary
          busy={busy}
          onClick={() => (step < 2 ? setStep(step + 1) : submit())}
        >
          {step < 2 ? "다음으로" : original ? "설정 저장" : "프로젝트 만들기"}{" "}
          <ChevronRight size={18} />
        </Button>
      </div>
    </div>
  );
}
function ProjectView() {
  const { pid } = useParams(),
    [project, setProject] = useState(null),
    [tab, setTab] = useState("progress"),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const [participants, pe] = useList(
      (cb, e) => store.watchList(pid, "participants", cb, e),
      [pid],
    ),
    [records, re] = useList(
      (cb, e) => store.watchList(pid, "records", cb, e),
      [pid],
    ),
    [codingList, ce] = useList(
      (cb, e) => store.watchList(pid, "teacher_codings", cb, e),
      [pid],
    );
  useEffect(
    () => store.watchProject(pid, setProject, (e) => setError(e.message)),
    [pid],
  );
  const codings = Object.fromEntries(codingList.map((c) => [c.id, c]));
  if (!project) return <p>프로젝트를 불러오는 중입니다…</p>;
  const tabs = [
    ["progress", "진행현황"],
    ["timeline", "학생 기록"],
    ["charts", "차시별 변화"],
    ["cards", "접속카드"],
    ["export", "자료 내보내기"],
    ["settings", "설정"],
    ...(project.enabled.validity ? [["validity", "내용타당도"]] : []),
  ];
  return (
    <>
      <Link className="text-button" to="/admin">
        <ArrowLeft size={16} /> 프로젝트 목록
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROJECT WORKSPACE</span>
          <h1>{project.name}</h1>
          <p>
            {project.teacher} · {project.group} · {project.sessionCount}차시
          </p>
        </div>
        <Status type={project.archived ? "" : "green"}>
          {project.archived ? "보관됨" : "실시간 기록"}
        </Status>
      </div>
      <div className="tabs">
        {tabs.map(([k, n]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {n}
          </button>
        ))}
      </div>
      <ErrorBox error={error || pe || re || ce} />
      {tab === "progress" ? (
        <ProgressTable
          p={project}
          participants={participants}
          records={records}
          open={(s) => {
            setSelected(s);
            setTab("timeline");
          }}
        />
      ) : tab === "timeline" ? (
        <Timeline
          p={project}
          participants={participants}
          records={records}
          codings={codings}
          selected={selected}
          setSelected={setSelected}
        />
      ) : tab === "cards" ? (
        <AccessCards p={project} participants={participants} />
      ) : tab === "export" ? (
        <Exports
          p={project}
          participants={participants}
          records={records}
          codings={codings}
        />
      ) : tab === "settings" ? (
        <>
          <ProjectForm original={project} onSaved={() => setTab("progress")} />
          <ProjectActions p={project} />
        </>
      ) : tab === "charts" ? (
        <Charts p={project} records={records} codings={codings} />
      ) : (
        <Validity p={project} />
      )}
    </>
  );
}
function ProgressTable({ p, participants, records, open }) {
  const [missing, setMissing] = useState(false);
  const submitted = records.filter((r) => r.status === "submitted");
  const active = participants.filter((s) => s.active),
    complete = active.filter((s) =>
      tasksFor(p, s.id, records).every((t) => t.done),
    ).length;
  return (
    <>
      <div className="stat-grid">
        <Metric label="참여 학생" value={active.length} unit="명" />
        <Metric label="제출된 기록" value={submitted.length} unit="건" />
        <Metric label="전체 기록 완료" value={complete} unit="명" />
      </div>
      <div className="section-heading">
        <h2>학생별 진행 상황</h2>
        <label className="check-label">
          <input
            type="checkbox"
            checked={missing}
            onChange={(e) => setMissing(e.target.checked)}
          />{" "}
          미제출 학생만
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>학생</th>
              {p.enabled.PRE && <th>사전</th>}
              {Array.from({ length: p.sessionCount }, (_, i) => (
                <th key={i}>{i + 1}차시</th>
              ))}
              {p.enabled.POST && <th>사후</th>}
              {p.enabled.DELAYED && <th>지연</th>}
              <th>완료율</th>
            </tr>
          </thead>
          <tbody>
            {participants
              .filter(
                (s) =>
                  !missing || tasksFor(p, s.id, records).some((t) => !t.done),
              )
              .map((s) => {
                const tasks = tasksFor(p, s.id, records),
                  has = (k, u) =>
                    tasks.find((t) => t.kind === k && t.unit === String(u))
                      ?.done;
                return (
                  <tr key={s.id}>
                    <td>
                      <button
                        className="student-link"
                        onClick={() => open(s.id)}
                      >
                        {s.id}
                        <small>
                          {s.displayName}
                          {!s.active ? " · 비활성" : ""}
                        </small>
                      </button>
                    </td>
                    {p.enabled.PRE && (
                      <td>{has("survey", "PRE") ? "✓ 완료" : "—"}</td>
                    )}
                    {Array.from({ length: p.sessionCount }, (_, i) => (
                      <td key={i}>
                        <span
                          className={has("journal", i + 1) ? "done-text" : ""}
                        >
                          {p.enabled.journal
                            ? has("journal", i + 1)
                              ? "✓ J"
                              : "— J"
                            : ""}
                        </span>{" "}
                        <span
                          className={has("prompt", i + 1) ? "done-text" : ""}
                        >
                          {p.enabled.prompt
                            ? has("prompt", i + 1)
                              ? "✓ P"
                              : "— P"
                            : ""}
                        </span>
                      </td>
                    ))}
                    {p.enabled.POST && (
                      <td>{has("survey", "POST") ? "✓ 완료" : "—"}</td>
                    )}
                    {p.enabled.DELAYED && (
                      <td>{has("survey", "DELAYED") ? "✓ 완료" : "—"}</td>
                    )}
                    <td>
                      {tasks.length
                        ? Math.round(
                            (tasks.filter((t) => t.done).length /
                              tasks.length) *
                              100,
                          )
                        : 0}
                      %
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        J 성찰저널 · P AI 대화 기록 · 학생 번호를 누르면 원자료를 볼 수
        있습니다.
      </p>
      {!records.length && <Empty />}
    </>
  );
}
function Timeline({
  p,
  participants,
  records,
  codings,
  selected,
  setSelected,
}) {
  const sid = selected || participants[0]?.id;
  const [detail, setDetail] = useState(null);
  const list = records
    .filter((r) => r.participant_id === sid)
    .sort((a, b) => {
      const rank = (r) =>
        r.phase === "PRE"
          ? 0
          : r.phase === "POST"
            ? 100
            : r.phase === "DELAYED"
              ? 101
              : r.session_id * 2 + (r.kind === "prompt" ? 1 : 0);
      return rank(a) - rank(b);
    });
  const r = list.find((r) => r.id === detail) || list[0];
  return (
    <>
      <Field label="학생 선택">
        <select
          value={sid || ""}
          onChange={(e) => {
            setSelected(e.target.value);
            setDetail(null);
          }}
        >
          {participants.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.displayName}
            </option>
          ))}
        </select>
      </Field>
      <div className="timeline-layout">
        <div className="timeline-list">
          {list.map((x) => (
            <button
              key={x.id}
              className={r?.id === x.id ? "active" : ""}
              onClick={() => setDetail(x.id)}
            >
              <span>
                {x.phase
                  ? phaseNames[x.phase]
                  : `${x.session_id}차시 ${x.kind === "journal" ? "성찰저널" : "AI 대화"}`}
              </span>
              <small>
                {x.status === "submitted" ? "✓ 제출 완료" : "작성 중"} · v
                {x.revision}
              </small>
            </button>
          ))}
        </div>
        {r ? (
          <section className="card">
            <div className="row between">
              <h2>
                {r.phase
                  ? phaseNames[r.phase]
                  : `${r.session_id}차시 ${r.kind === "journal" ? "성찰저널" : "AI 대화"}`}
              </h2>
              <Status>{r.participant_id}</Status>
            </div>
            {r.kind === "survey" && (
              <div className="score-grid">
                {Object.entries(scoreSurvey(r.data.raw))
                  .filter(([k]) => k.endsWith("_mean"))
                  .map(([k, v]) => (
                    <div key={k}>
                      <span>{k[0]} 영역</span>
                      <strong>{v?.toFixed(2) || "—"}</strong>
                    </div>
                  ))}
              </div>
            )}
            <details open={r.kind !== "prompt"}>
              <summary>학생 원자료 보기</summary>
              <RecordText kind={r.kind} data={r.data} />
            </details>
            {r.kind !== "survey" && r.status === "submitted" && (
              <Coding
                key={`${r.id}-${codings[r.id]?.revision || 0}`}
                p={p}
                r={r}
                coding={codings[r.id]}
              />
            )}
            <Reopen p={p} r={r} />
          </section>
        ) : (
          <Empty title="이 학생의 기록이 아직 없습니다" />
        )}
      </div>
    </>
  );
}
function Reopen({ p, r }) {
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  return r.status === "submitted" ? (
    <div className="reopen">
      <p>
        학생이 내용을 보완해야 하나요? 현재 원문을 이력에 남긴 후 다시 열 수
        있습니다.
      </p>
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await store.reopen(p.id, r);
            setMsg("다시 열었습니다.");
          } catch (e) {
            setMsg(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        학생 수정 다시 열기
      </Button>
      <small role="status">{msg}</small>
    </div>
  ) : null;
}
function Coding({ p, r, coding }) {
  const [value, setValue] = useState(
      coding || {
        codes: {},
        rubric: {},
        valence: null,
        verify: null,
        meta: null,
        memo: "",
      },
    ),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setValue((c) => ({ ...c, [k]: v }));
  return (
    <div className="coding-panel">
      <h3>교사 코딩·평정</h3>
      <p className="muted">
        자동값은 초안입니다. 직접 선택한 값만 교사 확정값으로 저장합니다.
      </p>
      {r.kind === "prompt" ? (
        <>
          {r.data.turns.map((t) => (
            <div className={`turn ${t.speaker}`} key={t.turn_no}>
              <Status>{t.speaker === "student" ? "학생" : "AI"}</Status>
              <div className="turn-body">
                <p>{t.raw_text}</p>
                {t.speaker === "student" && (
                  <>
                    <small>자동분류: {t.auto_code}</small>
                    <Field label={`${t.turn_no}번 발화 교사확정`}>
                      <select
                        value={value.codes?.[t.turn_no] || ""}
                        onChange={(e) =>
                          set("codes", {
                            ...value.codes,
                            [t.turn_no]: e.target.value || null,
                          })
                        }
                      >
                        <option value="">미확정 · 자동값 사용</option>
                        {CODES.map((c) => (
                          <option key={c.k} value={c.k}>
                            {c.k} · {c.n}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </div>
          ))}
          <h3>대화 전체 루브릭</h3>
          {RUBRIC.map((x) => (
            <Field
              key={x.k}
              label={x.n}
              hint={`자동 초안: ${r.data.rubricDraft?.[x.k] ?? "—"}점`}
            >
              <select
                value={value.rubric?.[x.k] || ""}
                onChange={(e) =>
                  set("rubric", {
                    ...value.rubric,
                    [x.k]: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">교사 미확정</option>
                {x.lv.map((l, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} · {l}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </>
      ) : (
        <>
          <div className="notice">
            자동 추정 · 정서 {r.data.auto?.valence} / 검증 수준{" "}
            {r.data.auto?.verify}
          </div>
          {[
            [
              "valence",
              "정서",
              [
                [-1, "부정"],
                [0, "중립"],
                [1, "긍정"],
              ],
            ],
            [
              "verify",
              "검증 수준",
              [
                [0, "무기록"],
                [1, "단순 기록"],
                [2, "교차검증 기록"],
              ],
            ],
            [
              "meta",
              "메타인지",
              [
                [1, "막연한 서술"],
                [2, "부분적 전략"],
                [3, "구체적 전략 진술"],
              ],
            ],
          ].map(([k, n, opts]) => (
            <Field key={k} label={n}>
              <select
                value={value[k] ?? ""}
                onChange={(e) =>
                  set(k, e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">교사 미확정</option>
                {opts.map(([v, t]) => (
                  <option key={v} value={v}>
                    {v} · {t}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </>
      )}
      <Field label="교사 메모">
        <textarea
          rows={3}
          value={value.memo}
          onChange={(e) => set("memo", e.target.value)}
        />
      </Field>
      <div className="row between">
        <small role="status">{msg}</small>
        <Button
          primary
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await store.saveCoding(p.id, r.id, value);
              setMsg("교사 코딩을 저장했습니다.");
            } catch (e) {
              setMsg(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          코딩·평정 저장
        </Button>
      </div>
    </div>
  );
}
function AccessCards({ p, participants }) {
  const [roster, setRoster] = useState({}),
    [qr, setQr] = useState({}),
    [showNames, setShowNames] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const link = location.href.split("#")[0];
  async function refresh() {
    try {
      const r = await store.getRoster(p.id);
      setRoster(r);
      const q = {};
      for (const s of participants)
        if (r[s.id]?.code)
          q[s.id] = await QRCode.toDataURL(
            `${link}#/?code=${encodeURIComponent(r[s.id].code)}`,
            { width: 160, margin: 1 },
          );
      setQr(q);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, [p.id, participants]);
  return (
    <>
      <div className="no-print">
        <div className="section-heading">
          <div>
            <h2>학생 접속카드</h2>
            <p>개인코드는 해당 학생에게만 배부하세요.</p>
          </div>
          <Button onClick={() => window.print()}>
            <Printer size={18} /> 카드 인쇄
          </Button>
        </div>
        <div className="row wrap">
          <Button
            onClick={() =>
              navigator.clipboard
                .writeText(`${link}#/?project=${p.id}`)
                .then(() => setError("프로젝트 링크를 복사했습니다."))
                .catch(() =>
                  setError(
                    "복사하지 못했습니다. 주소 표시줄의 링크를 복사해 주세요.",
                  ),
                )
            }
          >
            <Copy size={16} /> 프로젝트 링크 복사
          </Button>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showNames}
              onChange={(e) => setShowNames(e.target.checked)}
            />{" "}
            관리자용 카드에 실명 표시
          </label>
        </div>
        <ErrorBox error={error} />
        <section className="card">
          <div className="row wrap">
            <Field label="학생 추가 (이름 선택사항)">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="비워 두면 익명으로 생성"
              />
            </Field>
            <Button
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await store.addStudent(p.id, name);
                  setName("");
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Plus size={17} /> 학생 추가
            </Button>
          </div>
        </section>
      </div>
      <div className="access-grid">
        {participants.map((s) => (
          <section className="access-card" key={s.id}>
            <span className="eyebrow">AI-ON 탐구 기록장</span>
            <h3>
              {showNames && roster[s.id]?.name
                ? roster[s.id].name
                : s.displayName}{" "}
              <small>{s.id}</small>
            </h3>
            <p>{p.name}</p>
            {qr[s.id] && (
              <img
                width="160"
                height="160"
                alt={`${s.displayName} 접속 QR`}
                src={qr[s.id]}
              />
            )}
            <strong className="access-code">
              {roster[s.id]?.code || "코드 준비 중"}
            </strong>
            <small>QR을 찍거나 개인코드를 입력해요.</small>
            <div className="row wrap no-print">
              <Button
                onClick={async () => {
                  try {
                    await store.rotateCode(p.id, s.id);
                    await refresh();
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                코드 재발급
              </Button>
              <Button
                onClick={() =>
                  store
                    .changeStudent(p.id, s.id, { active: !s.active })
                    .catch((e) => setError(e.message))
                }
              >
                {s.active ? "비활성화" : "활성화"}
              </Button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
function Exports({ p, participants, records, codings }) {
  const [names, setNames] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  async function output(kind) {
    setBusy(true);
    setMsg("");
    try {
      if (kind === "backup") {
        download(
          `${p.id}_전체연구백업.json`,
          JSON.stringify(await store.backup(p.id), null, 2),
          "application/json",
        );
        setMsg(
          "원자료·수정이력을 포함한 연구 백업을 내려받았습니다. 접속코드와 실명 매핑은 포함하지 않습니다.",
        );
      } else {
        const roster = names ? await store.getRoster(p.id) : {};
        download(
          `${p.id}_${kind}.csv`,
          csv(
            exportRows(kind, p, participants, records, codings, roster, names),
          ),
          "text/csv;charset=utf-8",
        );
        setMsg("CSV를 내려받았습니다.");
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>연구자료 내보내기</h2>
      <p>프로젝트 ID와 학생 연구번호로 모든 시점의 자료가 연결됩니다.</p>
      <section className="card">
        <label className="check-label">
          <input
            type="checkbox"
            checked={names}
            onChange={(e) => setNames(e.target.checked)}
          />{" "}
          분석자료에 실명 포함 (기본값: 제외)
        </label>
        <p className="muted">
          익명 내보내기는 실명 매핑을 제외합니다. 학생이 자유서술에 직접 적은
          이름·연락처는 원문 보존을 위해 자동 변경하지 않으므로 공유 전
          점검하세요.
        </p>
      </section>
      <div className="export-grid">
        {[
          ["survey", "검사 원자료", "PRE · POST · DELAYED / 원응답과 역채점"],
          ["journal", "성찰저널", "7개 항목과 자동·교사 코딩"],
          ["prompt", "프롬프트 발화 코딩", "원문 · 자동 · 교사 · 최종 코드"],
          ["rubric", "프롬프트 루브릭", "5개 차원의 초안과 교사 평정"],
          ["progress", "학생 진행현황", "학생별 완료 기록과 제출률"],
          [
            "backup",
            "전체 연구 백업 JSON",
            "원자료 · 코딩 · 수정이력 · 연구도구",
          ],
        ].map(([k, t, d]) => (
          <button
            disabled={busy}
            className="export-card"
            key={k}
            onClick={() => output(k)}
          >
            <Download size={24} />
            <h3>{t}</h3>
            <p>{d}</p>
            <span>{k === "backup" ? "JSON" : "CSV"} 내려받기 →</span>
          </button>
        ))}
      </div>
      <p role="status">{msg}</p>
    </>
  );
}
function ProjectActions({ p }) {
  const [msg, setMsg] = useState(""),
    [count, setCount] = useState(20);
  const nav = useNavigate();
  return (
    <section className="card narrow">
      <h2>운영 설정</h2>
      {[
        ["postOpen", "사후검사 지금 열기"],
        ["delayedOpen", "지연검사 열기"],
      ].map(([k, l]) => (
        <label key={k} className="setting-option">
          <input
            type="checkbox"
            checked={p[k]}
            onChange={(e) =>
              store
                .updateProject(p.id, { [k]: e.target.checked })
                .catch((e) => setMsg(e.message))
            }
          />
          {l}
        </label>
      ))}
      <Button
        onClick={() =>
          store
            .updateProject(p.id, { archived: !p.archived })
            .catch((e) => setMsg(e.message))
        }
      >
        <Archive size={17} />
        {p.archived ? "프로젝트 다시 열기" : "프로젝트 보관"}
      </Button>
      <h3>다음 학급에 같은 구조 사용하기</h3>
      <Field label="새 학급 학생 수">
        <input
          type="number"
          min="1"
          max="500"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </Field>
      <Button
        onClick={async () => {
          try {
            const {
              name,
              teacher,
              group,
              topic,
              startDate,
              sessionCount,
              enabled,
            } = p;
            const id = await store.createProject({
              name: name + " (복제)",
              teacher,
              group,
              topic,
              startDate,
              sessionCount,
              enabled,
              count,
              names: "",
            });
            nav(`/admin/project/${id}`);
          } catch (e) {
            setMsg(e.message);
          }
        }}
      >
        <Copy size={16} /> 설정만 복제
      </Button>
      <p>기존 학생과 연구자료는 복사하지 않습니다.</p>
      <p role="status">{msg}</p>
    </section>
  );
}
function Charts({ p, records, codings }) {
  const [session, setSession] = useState("all"),
    [sid, setSid] = useState("all");
  const ids = [...new Set(records.map((r) => r.participant_id))].sort();
  const list = records.filter(
    (r) =>
      r.status === "submitted" &&
      (sid === "all" || r.participant_id === sid) &&
      (session === "all" || r.session_id === Number(session)),
  );
  const journals = list.filter((r) => r.kind === "journal"),
    turns = list
      .filter((r) => r.kind === "prompt")
      .flatMap((r) =>
        r.data.turns
          .filter((t) => t.speaker === "student")
          .map((t) => codings[r.id]?.codes?.[t.turn_no] ?? t.auto_code),
      );
  const avg = journals.length
    ? journals.reduce((a, r) => a + r.data.challenge, 0) / journals.length
    : null;
  return (
    <>
      <div className="row wrap">
        <Field label="학생">
          <select value={sid} onChange={(e) => setSid(e.target.value)}>
            <option value="all">전체 학생</option>
            {ids.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </Field>
        <Field label="차시">
          <select value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="all">전체 차시</option>
            {Array.from({ length: p.sessionCount }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}차시
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="stat-grid">
        <Metric label="평균 도전 점수" value={avg?.toFixed(2) || "—"} />
        <Metric
          label="검증·의심 발화 비율"
          value={
            turns.length
              ? Math.round(
                  (turns.filter((c) => c === "Q-VERIFY").length /
                    turns.length) *
                    100,
                )
              : "—"
          }
          unit="%"
        />
        <Metric label="성찰 기록" value={journals.length} unit="건" />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>차시별 도전 점수</h3>
          {Array.from({ length: p.sessionCount }, (_, i) => {
            const j = journals.filter((r) => r.session_id === i + 1),
              v = j.length
                ? j.reduce((a, r) => a + r.data.challenge, 0) / j.length
                : 0;
            return (
              <div className="bar-row" key={i}>
                <span>{i + 1}차시</span>
                <div className="bar-track">
                  <i style={{ width: `${v * 20}%` }} />
                </div>
                <strong>{v ? v.toFixed(1) : "—"}</strong>
                <small>n={j.length}</small>
              </div>
            );
          })}
        </section>
        <section className="card">
          <h3>프롬프트 유형</h3>
          {CODES.map((c) => {
            const n = turns.filter((t) => t === c.k).length;
            return (
              <div className="bar-row" key={c.k}>
                <span>{c.n}</span>
                <div className="bar-track">
                  <i
                    style={{
                      width: `${turns.length ? (n / turns.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{n}</strong>
              </div>
            );
          })}
        </section>
      </div>
      <section className="card">
        <h3>차시별 정서와 검증 기록</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>차시</th>
                <th>긍정</th>
                <th>중립</th>
                <th>부정</th>
                <th>검증 기록</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: p.sessionCount }, (_, i) => {
                const j = journals.filter((r) => r.session_id === i + 1);
                return (
                  <tr key={i}>
                    <td>{i + 1}차시</td>
                    {[1, 0, -1].map((v) => (
                      <td key={v}>
                        {
                          j.filter(
                            (r) =>
                              (codings[r.id]?.valence ??
                                r.data.auto?.valence) === v,
                          ).length
                        }
                      </td>
                    ))}
                    <td>
                      {
                        j.filter(
                          (r) =>
                            (codings[r.id]?.verify ?? r.data.auto?.verify) > 0,
                        ).length
                      }{" "}
                      / {j.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted">
        교사 확정값을 우선하며, 미확정 항목에는 자동 초안을 사용합니다.
        기술통계이며 프로그램 효과나 유의성을 자동 판단하지 않습니다.
      </p>
    </>
  );
}
function Members({ user }) {
  const [members, setMembers] = useState([]),
    [email, setEmail] = useState(""),
    [msg, setMsg] = useState("");
  const load = () =>
    store
      .listAdmins()
      .then(setMembers)
      .catch((e) => setMsg(e.message));
  useEffect(() => {
    if (user.role === "SUPER_ADMIN") load();
  }, []);
  if (user.role !== "SUPER_ADMIN")
    return <ErrorBox error="총괄관리자만 회원 권한을 관리할 수 있습니다." />;
  return (
    <div className="narrow">
      <h1>연구회원 관리</h1>
      <section className="card">
        <Field label="등록할 Google 이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button
          primary
          onClick={async () => {
            try {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                throw Error("이메일을 확인해 주세요.");
              await store.setAdmin(email, true);
              setEmail("");
              load();
            } catch (e) {
              setMsg(e.message);
            }
          }}
        >
          연구회원 등록
        </Button>
      </section>
      {members.map((m) => (
        <section className="card row between" key={m.email}>
          <div>
            <strong>{m.email}</strong>
            <p>
              {m.role} · {m.active ? "활성" : "비활성"}
            </p>
          </div>
          {m.role !== "SUPER_ADMIN" && (
            <Button
              onClick={async () => {
                await store.setAdmin(m.email, !m.active);
                load();
              }}
            >
              {m.active ? "비활성화" : "활성화"}
            </Button>
          )}
        </section>
      ))}
      <p role="status">{msg}</p>
    </div>
  );
}
