import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches render-time crashes in any page so one bad component can't
 * unmount the entire app into a blank screen. Shows a branded fallback
 * with a way back home instead.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }

  componentDidCatch(error: unknown) {
    // Log for diagnostics; the page stays usable via the fallback UI.
    console.error("[ErrorBoundary]", error);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
    window.location.hash = "#/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            This page hit an unexpected error. Your work is safe — try going back
            to the home page.
          </p>
          {this.state.message ? (
            <p className="text-xs text-muted-foreground/70 break-words">
              {this.state.message}
            </p>
          ) : null}
          <button
            onClick={this.handleReset}
            className="text-sm font-semibold px-6 py-2.5 rounded-md transition-all tracking-wide"
            style={{ background: "hsl(43,85%,52%)", color: "#0a0a0a" }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
}
