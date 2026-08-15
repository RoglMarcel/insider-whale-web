import { useTheme } from '@/hooks/useTheme';
import { SunIcon, MoonIcon } from './icons';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      className="icon-btn"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  );
}
