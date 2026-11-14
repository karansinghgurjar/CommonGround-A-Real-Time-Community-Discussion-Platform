import { Component } from 'react';
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Application rendering failed:', error.name); }
  render() {
    if (this.state.failed) return <main className="container"><section className="card" role="alert"><h1>We couldn’t load this page.</h1><p>Please reload to reconnect to your community.</p><button onClick={() => window.location.reload()}>Reload application</button></section></main>;
    return this.props.children;
  }
}
