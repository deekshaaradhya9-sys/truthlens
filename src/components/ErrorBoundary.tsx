import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[TruthLens ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen forensic-grid-bg text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h1 className="font-display text-lg font-bold text-white">
              TruthLens — Workbench Recovery
            </h1>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            A client-side interface error interrupted rendering. Your case records and SHA-256
            custody ledger remain intact on the server.
          </p>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs font-mono text-rose-300 break-words">
            {this.state.message}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reload Workbench</span>
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              Retry Render
            </button>
          </div>
        </div>
      </div>
    );
  }
}
