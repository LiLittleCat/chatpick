export type ThemeSetting = 'auto' | 'light' | 'dark';
export type LanguageSetting = 'auto' | 'en' | 'zh';
export type ColorSetting = 'site' | 'default';

export type NavigatorSettings = {
  theme: ThemeSetting;
  language: LanguageSetting;
  colors: ColorSetting;
  showExport: boolean;
  showJumpButtons: boolean;
};

export const DEFAULT_SETTINGS: NavigatorSettings = {
  theme: 'auto',
  language: 'auto',
  colors: 'site',
  showExport: true,
  showJumpButtons: true,
};

export function normalizeSettings(value: Partial<NavigatorSettings>): NavigatorSettings {
  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'auto',
    language: value.language === 'en' || value.language === 'zh' ? value.language : 'auto',
    colors: value.colors === 'default' ? 'default' : 'site',
    showExport: value.showExport !== false,
    showJumpButtons: value.showJumpButtons !== false,
  };
}

export function resolveLanguage(language: LanguageSetting, pageLanguage: string, fallback = 'en'): 'en' | 'zh' {
  return language === 'auto' ? /^zh(?:[-_]|$)/i.test(pageLanguage.trim() || fallback) ? 'zh' : 'en' : language;
}
