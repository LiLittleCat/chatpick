export type ThemeSetting = 'auto' | 'light' | 'dark';
export type LanguageSetting = 'auto' | 'en' | 'zh';
export type ColorSetting = 'site' | 'default';

export const SITE_NAMES = {
  chatgpt: 'ChatGPT', claude: 'Claude', deepseek: 'DeepSeek', gemini: 'Gemini',
  grok: 'Grok', perplexity: 'Perplexity', qwen: 'Qwen', qianwen: 'Qianwen',
} as const;
export type SiteId = keyof typeof SITE_NAMES;

export function isSiteId(value: unknown): value is SiteId {
  return typeof value === 'string' && Object.hasOwn(SITE_NAMES, value);
}

export function siteForHost(host: string): SiteId | null {
  switch (host) {
    case 'chatgpt.com': case 'chat.openai.com': return 'chatgpt';
    case 'claude.ai': return 'claude';
    case 'chat.deepseek.com': return 'deepseek';
    case 'gemini.google.com': return 'gemini';
    case 'grok.com': return 'grok';
    case 'www.perplexity.ai': return 'perplexity';
    case 'chat.qwen.ai': return 'qwen';
    case 'www.qianwen.com': case 'qianwen.com': return 'qianwen';
    default: return null;
  }
}

export type NavigatorSettings = {
  theme: ThemeSetting;
  language: LanguageSetting;
  colors: ColorSetting;
  showExport: boolean;
  showJumpButtons: boolean;
  disabledSites: SiteId[];
};

export const DEFAULT_SETTINGS: NavigatorSettings = {
  theme: 'auto',
  language: 'auto',
  colors: 'site',
  showExport: true,
  showJumpButtons: true,
  disabledSites: [],
};

export function normalizeSettings(value: Partial<NavigatorSettings>): NavigatorSettings {
  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'auto',
    language: value.language === 'en' || value.language === 'zh' ? value.language : 'auto',
    colors: value.colors === 'default' ? 'default' : 'site',
    showExport: value.showExport !== false,
    showJumpButtons: value.showJumpButtons !== false,
    disabledSites: Array.isArray(value.disabledSites) ? [...new Set(value.disabledSites.filter(isSiteId))] : [],
  };
}

export function isSiteEnabled(settings: NavigatorSettings, site: SiteId | null): boolean {
  return site !== null && !settings.disabledSites.includes(site);
}

export function resolveLanguage(language: LanguageSetting, pageLanguage: string, fallback = 'en'): 'en' | 'zh' {
  return language === 'auto' ? /^zh(?:[-_]|$)/i.test(pageLanguage.trim() || fallback) ? 'zh' : 'en' : language;
}
