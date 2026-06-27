import { Component } from 'react';

/**
 * ScreenErrorBoundary — per-panel error boundary for the command screens.
 *
 * Wrap each major panel (dispatch feed, maps, accountability, unit status,
 * TV sections) in its own boundary so one panel crashing — e.g. on a
 * malformed API response mid-incident — leaves the rest of the screen alive.
 * The app-global boundary in main.jsx still catches anything outside these.
 *
 * Healthy path is a pure passthrough: renders children directly with no
 * wrapper element, so it never changes layout.
 *
 * Props: { label, children } — label names the panel in the fallback + log.
 */
export default class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(
      `[ScreenErrorBoundary] "${this.props.label || 'panel'}" crashed:`,
      error,
      info?.componentStack || ''
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-xl p-4">
          <p className="text-xs font-bold text-red-800 dark:text-red-300">
            {this.props.label ? `${this.props.label}: ` : ''}This panel hit an error — the rest of the screen is unaffected.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
