import React from "react";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error("App runtime error:", error);
    this.setState({ message: error.message });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-md w-full ui-card p-6 text-center">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-muted mb-4">
              A runtime error occurred. Refresh the page to continue.
            </p>
            {this.state.message && (
              <p className="text-xs text-[var(--color-danger)] mb-4 break-words">{this.state.message}</p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="ui-button ui-button-primary px-4 py-2"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
