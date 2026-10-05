import React, { useState, useEffect } from "react";
import { ArrowRight, Check, ArrowLeft, LoaderCircle } from "lucide-react";
export function Button({ children, primary = false, busy = false, ...props }) {
  return (
    <button
      className={`btn ${primary ? "primary" : ""}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({ title = "아직 기록이 없습니다", children }) {
  return (
    <div className="empty">
      <div className="empty-icon">✧</div>
      <h3>{title}</h3>
      <p>
        {children ||
          "학생이 첫 기록을 제출하면 이곳에서 바로 확인할 수 있습니다."}
      </p>
    </div>
  );
}
export function Status({ children, type = "" }) {
  return <span className={`badge ${type}`}>{children}</span>;
}
export function ErrorBox({ error }) {
  return error ? (
    <div role="alert" className="notice error">
      {error}
    </div>
  ) : null;
}
export function Scale({
  value,
  onChange,
  max = 5,
  label = "응답",
  ends = true,
}) {
  return (
    <div>
      <div className="scale" role="group" aria-label={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            aria-label={`${label} ${n}점`}
            aria-pressed={value === n}
            key={n}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {ends && (
        <div className="scale-ends">
          <span>1 전혀 그렇지 않다</span>
          <span>5 매우 그렇다</span>
        </div>
      )}
    </div>
  );
}
export function Progress({ value, max }) {
  return (
    <div className="progress-block">
      <div className="row between">
        <span>
          {value} / {max}
        </span>
        <span>{max ? Math.round((value / max) * 100) : 0}%</span>
      </div>
      <progress max={max || 1} value={value} />
    </div>
  );
}
export function useList(subscribe, deps) {
  const [data, setData] = useState([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setData([]);
    setError("");
    setLoaded(false);
    return subscribe(
      (d) => {
        setData(d);
        setLoaded(true);
      },
      (e) =>
        setError(
          "자료를 불러오지 못했습니다. 연결과 접근 권한을 확인해 주세요.",
        ),
    );
  }, deps);
  return [data, error, loaded];
}
export { ArrowRight, Check, ArrowLeft };
