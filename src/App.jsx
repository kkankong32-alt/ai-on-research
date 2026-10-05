import React, { useEffect, useState } from "react";
import {
  useNavigate,
  useLocation,
  Routes,
  Route,
  Link,
} from "react-router-dom";
import {
  Sparkles,
  ArrowUpRight,
  FlaskConical,
  LogOut,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import * as store from "./services/store.js";
import { configured } from "./services/firebase.js";
import {
  Button,
  Field,
  ErrorBox,
  ArrowRight,
  Status,
} from "./components/UI.jsx";
import Student from "./components/Student.jsx";
import Admin from "./components/Admin.jsx";
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const route = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.pathname]);
  useEffect(() => {
    store
      .resume()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function exit() {
    await store.logout();
    setUser(null);
    navigate("/");
  }
  function signed(s) {
    setUser(s);
    navigate(s.role === "student" ? "/student" : "/admin");
  }
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <FlaskConical size={23} />
          </span>
          <strong>
            AI<span>-ON</span>
          </strong>
          <span className="brand-sub">탐구를 켜다</span>
        </Link>
        <div className="row">
          {store.isDemo() && (
            <Status type="warm">미리보기 · 실제 저장 안 됨</Status>
          )}
          {user ? (
            <>
              <span className="user-label">
                {user.displayName || "연구회원"}
              </span>
              <button className="text-button" onClick={exit}>
                <LogOut size={16} />{" "}
                {user.role === "student"
                  ? "다른 학생으로 들어가기"
                  : "로그아웃"}
              </button>
            </>
          ) : (
            <span className="header-note">작은 질문이, 새로운 발견으로</span>
          )}
        </div>
      </header>
      {!configured && !store.isDemo() && (
        <div className="setup-banner">
          연구자료 수집 준비 중 · Firebase 연결 후 사용할 수 있습니다.
        </div>
      )}
      {loading ? (
        <main>
          <p>기록장을 준비하고 있어요…</p>
        </main>
      ) : (
        <Routes>
          <Route path="/" element={<Landing user={user} signed={signed} />} />
          <Route
            path="/student/*"
            element={
              user?.role === "student" ? (
                <Student user={user} />
              ) : (
                <Landing user={user} signed={signed} />
              )
            }
          />
          <Route
            path="/admin/*"
            element={
              user && user.role !== "student" ? (
                <Admin user={user} />
              ) : (
                <Landing user={user} signed={signed} />
              )
            }
          />
          <Route path="*" element={<Landing user={user} signed={signed} />} />
        </Routes>
      )}
      <footer>
        <span>AI-ON 과학탐구 기록장</span>
        <span>질문 · 탐구 · 발견 · 성장</span>
      </footer>
    </>
  );
}
function Landing({ user, signed }) {
  const [code, setCode] = useState(
      () =>
        new URLSearchParams(location.hash.split("?")[1] || "").get("code") ||
        "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const s = await store.studentLogin(code);
      signed(s);
    } catch (e) {
      setError(
        e.message === "Missing or insufficient permissions."
          ? "개인코드를 다시 확인해 주세요."
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function researcher() {
    setBusy(true);
    setError("");
    try {
      signed(await store.adminLogin());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="landing">
      <section className="hero-copy">
        <span className="eyebrow">
          <span className="tiny-dot" /> 나만의 과학 탐구 노트
        </span>
        <h1>
          오늘의 질문이
          <br />
          <em>내일의 발견</em>이 되도록.
        </h1>
        <p className="lead">
          궁금했던 순간, 새롭게 알게 된 것,
          <br />
          AI와 함께한 생각을 차곡차곡 남겨요.
        </p>
        <div className="orbit-art" aria-hidden="true">
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orbit-center">
            <FlaskConical size={48} />
          </div>
          <span className="art-note note-a">
            <Sparkles size={18} /> 왜 그럴까?
          </span>
          <span className="art-note note-b">
            <BookOpen size={18} /> 발견 하나 더!
          </span>
          <i className="orb orb-one" />
          <i className="orb orb-two" />
          <span className="art-caption">EVERY QUESTION COUNTS</span>
        </div>
        <div className="hero-bottom">
          <span>01 질문하고</span>
          <span>02 확인하고</span>
          <span>03 돌아보고</span>
        </div>
      </section>
      <section className="entry-panel">
        <div className="entry-icon">
          <ArrowUpRight size={26} />
        </div>
        <span className="eyebrow">MY EXPLORATION</span>
        <h2>
          오늘의 탐구를
          <br />
          이어가 볼까요?
        </h2>
        <p>선생님께 받은 개인코드를 입력해 주세요.</p>
        {user ? (
          <Button primary onClick={() => signed(user)}>
            {user.displayName || "연구회원"}로 계속하기 <ArrowRight size={18} />
          </Button>
        ) : (
          <form onSubmit={login}>
            <Field label="개인코드" hint="접속카드에 있는 코드를 입력해요.">
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={24}
              />
            </Field>
            <ErrorBox error={error} />
            <Button primary busy={busy} type="submit">
              시작하기 <ArrowRight size={18} />
            </Button>
          </form>
        )}
        <div className="privacy-note">
          <ShieldCheck size={18} />
          <span>
            이 기록은 수업 연구를 위해 저장되며
            <br />
            다른 학생에게 공개되지 않습니다.
          </span>
        </div>
        <div className="entry-divider" />
        <button
          className="text-button research-login"
          onClick={researcher}
          disabled={busy}
        >
          연구자 로그인 <ArrowUpRight size={16} />
        </button>
        {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_PREVIEW === "true" || ["localhost", "127.0.0.1"].includes(location.hostname)) && (
          <details className="preview-links">
            <summary>개발 미리보기</summary>
            <p>
              실제 학생 정보는 입력하지 마세요. 새로고침하면 미리보기 기록이
              사라집니다.
            </p>
            <Button onClick={() => signed(store.preview("student"))}>
              학생 화면 보기
            </Button>
            <Button onClick={() => signed(store.preview())}>
              연구관리 화면 보기
            </Button>
          </details>
        )}
      </section>
    </main>
  );
}

function friendlyError(e) {
  console.warn("AI-ON auth", e.code || e.message);
  const messages = {
    "auth/network-request-failed":
      "로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
    "auth/popup-blocked":
      "로그인 창이 차단됐습니다. 이 사이트의 팝업을 허용해 주세요.",
    "auth/popup-closed-by-user":
      "로그인 창이 닫혔습니다. 다시 로그인할 수 있습니다.",
    "auth/unauthorized-domain":
      "현재 주소의 로그인 연결을 준비 중입니다. 관리자에게 알려 주세요.",
    "permission-denied":
      "접근 권한을 확인해 주세요. 개인코드가 변경됐을 수 있습니다.",
  };
  return messages[e.code] || e.message;
}
