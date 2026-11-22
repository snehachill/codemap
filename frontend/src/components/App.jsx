import { Component, useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Workspace from './components/Workspace.jsx';

const parseRoute = () => {
  const m = location.hash.match(/^#\/repo\/([^/]+)\/(.+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
};

// If any component crashes, show a message instead of a blank page.
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" style={{ minHeight: '100vh' }}>
        <div>
          <h2>Something went wrong on this page</h2>
          <p className="error">{String(this.state.error.message || this.state.error)}</p>
          <p><a href="#/" onClick={() => this.setState({ error: null })}>Back to home</a></p>
        </div>
      </div>
    );
  }
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <ErrorBoundary key={route ? `${route.owner}/${route.repo}` : 'home'}>
      {route ? <Workspace key={`${route.owner}/${route.repo}`} {...route} /> : <Home />}
    </ErrorBoundary>
  );
}
