export type ThemeSetting = 'auto' | 'light' | 'dark';
export type LanguageSetting = 'en' | 'zh';
export type ColorSetting = 'site' | 'default';

export type NavigatorSettings = {
  theme: ThemeSetting;
  language: LanguageSetting;
  colors: ColorSetting;
};

export const DEFAULT_SETTINGS: NavigatorSettings = {
  theme: 'auto',
  language: 'en',
  colors: 'site',
};

export function normalizeSettings(value: Partial<NavigatorSettings>): NavigatorSettings {
  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'auto',
    language: value.language === 'zh' ? 'zh' : 'en',
    colors: value.colors === 'default' ? 'default' : 'site',
  };
}
