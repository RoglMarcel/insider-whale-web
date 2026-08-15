import { useStore } from '@/store/useStore';

export function useTheme() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}
