import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import AccessGate, { AccessLoading } from './components/Access/AccessGate';
import './styles/globals.css';
import { MotionConfig } from 'motion/react';
import './styles/terminal-design.css';

// App mounts only after a server-verified session; no terminal fetch runs behind the lock.
const App = lazy(() => import('./App'));
const shell = <Suspense fallback={<AccessLoading />}><App /></Suspense>;
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
    {import.meta.env.VITE_TARGET === 'web' ? <AccessGate>{shell}</AccessGate> : shell}
    </MotionConfig>
  </React.StrictMode>,
);
