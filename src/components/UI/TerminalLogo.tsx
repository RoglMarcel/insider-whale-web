import logo from '@/terminal-logo.png';

/** The supplied transparent mark is intentionally presented without a wordmark. */
export function TerminalLogo() {
  return <img className="terminal-logo" src={logo} alt="Insider & Whale Terminal" width="64" height="64" decoding="async" draggable={false} />;
}
