import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { DEFAULT_SETTINGS, normalizeSettings, type LanguageSetting, type NavigatorSettings, type ThemeSetting } from '@/settings';
import './App.css';

const translations = {
  en: {
    settings: 'Settings',
    theme: 'Theme',
    language: 'Language',
    auto: 'Follow ChatGPT',
    light: 'Light',
    dark: 'Dark',
    en: 'English',
    zh: '中文',
  },
  zh: {
    settings: '设置',
    theme: '主题',
    language: '语言',
    auto: '跟随 ChatGPT',
    light: '浅色',
    dark: '深色',
    en: 'English',
    zh: '中文',
  },
};

function App() {
  const [settings, setSettings] = useState<NavigatorSettings>(DEFAULT_SETTINGS);
  const [activeSelect, setActiveSelect] = useState<'theme' | 'language' | null>(null);

  useEffect(() => {
    browser.storage.local.get(DEFAULT_SETTINGS)
      .then((value) => setSettings(normalizeSettings(value)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      if (settings.theme !== 'auto') {
        document.documentElement.classList.toggle('dark', settings.theme === 'dark');
        return;
      }
      // The page navigator already resolves ChatGPT's theme in auto mode.
      browser.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => tab?.id ? browser.tabs.sendMessage(tab.id, { type: 'chatpick:get-theme' }) : null)
        .then((theme) => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && media.matches)))
        .catch(() => document.documentElement.classList.toggle('dark', media.matches));
    };
    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, [settings.theme]);

  const update = (next: Partial<NavigatorSettings>) => {
    const updated = { ...settings, ...next };
    setSettings(updated);
    browser.storage.local.set(next).catch(console.error);
  };
  const t = translations[settings.language];

  return (
    <main className="popup">
      <header className="popup-header">
        <img src="/icon/logo.svg" width="56" height="56" alt="" />
        <div>
          <strong>ChatPick</strong>
          <span>{t.settings}</span>
        </div>
      </header>
      <div className="settings-row" style={{ zIndex: activeSelect === 'theme' ? 2 : 1 }}>
        <label id="theme-label">{t.theme}</label>
        <Select value={settings.theme} onValueChange={(theme) => update({ theme: theme as ThemeSetting })}
          open={activeSelect === 'theme'} onOpenChange={(open) => setActiveSelect(open ? 'theme' : null)}>
          <SelectTrigger className="settings-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t.auto}</SelectItem>
            <SelectItem value="light">{t.light}</SelectItem>
            <SelectItem value="dark">{t.dark}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="settings-row" style={{ zIndex: activeSelect === 'language' ? 2 : 1 }}>
        <label id="language-label">{t.language}</label>
        <Select value={settings.language} onValueChange={(language) => update({ language: language as LanguageSetting })}
          open={activeSelect === 'language'} onOpenChange={(open) => setActiveSelect(open ? 'language' : null)}>
          <SelectTrigger className="settings-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t.en}</SelectItem>
            <SelectItem value="zh">{t.zh}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </main>
  );
}

export default App;
