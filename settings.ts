export type ThemeSetting = 'auto' | 'light' | 'dark';
export type LanguageSetting = 'en' | 'zh';

export type NavigatorSettings = {
  theme: ThemeSetting;
  language: LanguageSetting;
};

export const DEFAULT_SETTINGS: NavigatorSettings = {
  theme: 'auto',
  language: 'en',
};

export function normalizeSettings(value: Partial<NavigatorSettings>): NavigatorSettings {
  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'auto',
    language: value.language === 'zh' ? 'zh' : 'en',
  };
}
