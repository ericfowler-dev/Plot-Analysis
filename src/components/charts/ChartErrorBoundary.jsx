import React, { Component } from 'react';

/**
 * ChartErrorBoundary
 * Wrap individual chart areas so a single chart failure doesn't unmount the entire app.
 * Usage:
 * <ChartErrorBoundary fallbackHeight="260px">
 *   <ResponsiveContainer ...>...</ResponsiveContainer>
 * </ChartErrorBoundary>
 */
export default class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep console logging so server-side error reporting can pick it up
    console.error('ChartErrorBoundary caught error:', error, info);
    // Optionally: send to analytics / Sentry here
  }

  render() {
    if (this.state.hasError) {
      const heightStyle = this.props.fallbackHeight || '260px';
      return (
        <div
          style={{ minHeight: heightStyle }}
          className="bg-slate-900/30 rounded-lg border border-slate-800 p-4 flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-sm text-slate-400 mb-2">Chart failed to render</div>
            <div className="text-xs text-slate-500 mb-3">{this.state.error?.toString()}</div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1 bg-emerald-500 text-white rounded text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}