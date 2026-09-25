'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export function AppearanceProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="king-foods-appearance">{children}</ThemeProvider>;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dark = ready && theme === 'dark';
  return <div className="theme-toggle">
    <label htmlFor="night-mode">{dark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}<span>{dark ? 'Modo noite' : 'Modo dia'}</span></label>
    <Switch id="night-mode" aria-label="Alternar tema" checked={dark} disabled={!ready} onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')} />
  </div>;
}
