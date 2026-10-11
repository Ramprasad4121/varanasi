"use client";
// Catches a crash in any screen and shows a plain message with a way back, instead of
// a blank page. Nothing about the person is sent anywhere.
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[varanasi] screen crashed", (error as Error)?.message);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="shell">
        <div className="card warn" role="alert">
          <p className="mid">Something went wrong on this screen. Nothing was taken.</p>
          <p lang="te">ఈ తెరలో సమస్య వచ్చింది. ఏమీ తీసుకోలేదు.</p>
          <button
            className="btn"
            onClick={() => {
              window.location.hash = "home";
              window.location.reload();
            }}
          >
            Go home / హోమ్
          </button>
        </div>
      </main>
    );
  }
}
