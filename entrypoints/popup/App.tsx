import { useEffect, useState } from 'react';
import { SettingsSelect } from './SettingsSelect';
import { SettingsToggle } from './SettingsToggle';
import { DEFAULT_SETTINGS, normalizeSettings, resolveLanguage, type ColorSetting, type LanguageSetting, type NavigatorSettings, type ThemeSetting } from '@/settings';
import './App.css';

const translations = {
  en: {
    settings: 'Settings',
    theme: 'Appearance',
    colors: 'Colors',
    siteColors: 'Follow chat colors',
    defaultColors: 'ChatPick default',
    language: 'Language',
    autoLanguage: 'Follow chat language',
    privacy: 'Privacy policy',
    controls: 'Controls',
    showExport: 'Show export button',
    showJumpButtons: 'Show jump buttons',
    auto: 'Follow chat appearance',
    light: 'Light',
    dark: 'Dark',
    en: 'English',
    zh: '中文',
  },
  zh: {
    settings: '设置',
    theme: '明暗',
    colors: '配色',
    siteColors: '跟随网页配色',
    defaultColors: 'ChatPick 默认',
    language: '语言',
    autoLanguage: '跟随网页语言',
    privacy: '隐私政策',
    controls: '按钮显示',
    showExport: '显示导出按钮',
    showJumpButtons: '显示跳转按钮',
    auto: '跟随网页明暗',
    light: '浅色',
    dark: '深色',
    en: 'English',
    zh: '中文',
  },
};

function App() {
  const [settings, setSettings] = useState<NavigatorSettings>(DEFAULT_SETTINGS);
  const [activeSelect, setActiveSelect] = useState<'theme' | 'colors' | 'language' | null>(null);
  const [pageLanguage, setPageLanguage] = useState(() => resolveLanguage('auto', '', navigator.language));

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
      // The page navigator already resolves the chat page's theme in auto mode.
      browser.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => tab?.id ? browser.tabs.sendMessage(tab.id, { type: 'chatpick:get-theme' }) : null)
        .then((theme) => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && media.matches)))
        .catch(() => document.documentElement.classList.toggle('dark', media.matches));
    };
    updateTheme();
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.language !== 'auto') return;
    let active = true;
    browser.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => tab?.id ? browser.tabs.sendMessage(tab.id, { type: 'chatpick:get-language' }) : null)
      .then(language => { if (active) setPageLanguage(resolveLanguage('auto', typeof language === 'string' ? language : '', navigator.language)); })
      .catch(() => { if (active) setPageLanguage(resolveLanguage('auto', '', navigator.language)); });
    return () => { active = false; };
  }, [settings.language]);

  const update = (next: Partial<NavigatorSettings>) => {
    const updated = { ...settings, ...next };
    setSettings(updated);
    browser.storage.local.set(next).catch(console.error);
  };
  const interfaceLanguage = resolveLanguage(settings.language, pageLanguage);
  const t = translations[interfaceLanguage];

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
        <SettingsSelect<ThemeSetting> labelId="theme-label" value={settings.theme}
          options={[{ value: 'auto', label: t.auto }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]}
          onChange={(theme) => update({ theme })}
          open={activeSelect === 'theme'} onOpenChange={(open) => setActiveSelect(open ? 'theme' : null)} />
      </div>
      <div className="settings-row" style={{ zIndex: activeSelect === 'colors' ? 2 : 1 }}>
        <label id="colors-label">{t.colors}</label>
        <SettingsSelect<ColorSetting> labelId="colors-label" value={settings.colors}
          options={[{ value: 'site', label: t.siteColors }, { value: 'default', label: t.defaultColors }]}
          onChange={(colors) => update({ colors })}
          open={activeSelect === 'colors'} onOpenChange={(open) => setActiveSelect(open ? 'colors' : null)} />
      </div>
      <div className="settings-row" style={{ zIndex: activeSelect === 'language' ? 2 : 1 }}>
        <label id="language-label">{t.language}</label>
        <SettingsSelect<LanguageSetting> labelId="language-label" value={settings.language}
          options={[{ value: 'auto', label: t.autoLanguage }, { value: 'en', label: t.en }, { value: 'zh', label: t.zh }]}
          onChange={(language) => update({ language })}
          open={activeSelect === 'language'} onOpenChange={(open) => setActiveSelect(open ? 'language' : null)} />
      </div>
      <section className="settings-toggles" aria-label={t.controls}>
        <SettingsToggle label={t.showExport} checked={settings.showExport}
          onChange={(showExport) => update({ showExport })} />
        <SettingsToggle label={t.showJumpButtons} checked={settings.showJumpButtons}
          onChange={(showJumpButtons) => update({ showJumpButtons })} />
      </section>
      <footer className="popup-footer">
        <a href={browser.runtime.getURL('/privacy.html') + `?lang=${interfaceLanguage}`} target="_blank" rel="noopener noreferrer">
          {t.privacy}
        </a>
      </footer>
    </main>
  );
}

export default App;
