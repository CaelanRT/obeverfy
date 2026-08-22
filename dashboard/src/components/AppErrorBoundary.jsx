import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="setup-state" aria-labelledby="runtime-error-title">
          <section className="setup-panel" role="alert">
            <p className="setup-product">Obeverfy</p>
            <h1 id="runtime-error-title">Dashboard could not load</h1>
            <p>
              Reload the dashboard to try again. If the problem continues, confirm
              the Supabase configuration and service status.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload dashboard
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
