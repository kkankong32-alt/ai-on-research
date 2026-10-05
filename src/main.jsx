import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/app.css";
class AppBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main><h1>화면을 불러오지 못했습니다</h1><p role="alert">{this.state.error.message}</p><button onClick={() => location.reload()}>다시 열기</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(
  <AppBoundary>
  <HashRouter>
    <App />
  </HashRouter>
  </AppBoundary>
);
