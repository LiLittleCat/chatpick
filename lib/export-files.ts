import { transcriptMarkdown, type Transcript } from './conversation-export';

export const exportFilename = (chat: Transcript, extension: string) => `${(chat.title || chat.provider).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'conversation'}-${chat.exportedAt.slice(0, 10)}.${extension}`;

export function validateTranscript(value: unknown): value is Transcript {
  const v = value as Transcript;
  if (!v || typeof v.title !== 'string' || v.title.length > 1000 || typeof v.source !== 'string' || typeof v.provider !== 'string' || typeof v.exportedAt !== 'string' || typeof v.partial !== 'boolean' || !Array.isArray(v.messages) || !v.messages.length) return false;
  if (v.source !== location.origin + location.pathname || !['ChatGPT', 'Claude', 'DeepSeek', 'Gemini', 'Grok', 'Perplexity', 'Qwen', 'Qianwen'].includes(v.provider) || !/^\d{4}-\d\d-\d\dT/.test(v.exportedAt)) return false;
  let total = 0;
  return v.messages.length <= 10000 && v.messages.every(m => m && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant') && typeof m.markdown === 'string' && (total += m.markdown.length) <= 10000000);
}

export async function downloadTranscript(chat: Transcript, format: 'markdown' | 'pdf', signal: AbortSignal) {
  let blob: Blob;
  if (format === 'markdown') blob = new Blob([transcriptMarkdown(chat)], { type: 'text/markdown;charset=utf-8' });
  else {
    const response = await fetch(browser.runtime.getURL('/fonts/NotoSansSC-Regular.ttf'), { signal });
    if (!response.ok) throw new Error('Font unavailable');
    const fontBytes = await response.arrayBuffer();
    if (signal.aborted) return;
    // A fixed bundled module, loaded in the isolated world only after choosing PDF.
    const { default: renderer } = await import(/* @vite-ignore */ browser.runtime.getURL('/pdf-export.js')) as { default: { transcriptPdf: typeof import('./export-pdf').transcriptPdf } };
    if (signal.aborted) return;
    const bytes = await renderer.transcriptPdf(chat, fontBytes, signal);
    blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  }
  if (signal.aborted || chat.source !== location.origin + location.pathname) return;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = exportFilename(chat, format === 'markdown' ? 'md' : 'pdf');
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
