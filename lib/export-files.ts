import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { createPdfFontkit } from './pdf-font';
import { marked, type Token, type Tokens } from 'marked';
import { transcriptMarkdown, type Transcript } from './conversation-export';

export const exportFilename = (chat: Transcript, extension: string) => `${(chat.title || chat.provider).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'conversation'}-${chat.exportedAt.slice(0, 10)}.${extension}`;

const ink = rgb(.12, .14, .18), muted = rgb(.40, .44, .49), paper = rgb(.95, .96, .97);
const width = 595.28, height = 841.89, margin = 48, usable = width - margin * 2;

// No HTML renderer or remote assets: Markdown is parsed as data and drawn as searchable text.
export async function transcriptPdf(chat: Transcript, fontBytes: ArrayBuffer | Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(createPdfFontkit());
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const characters = new Set(font.getCharacterSet());
  const clean = (text: string) => Array.from(text.replace(/\t/g, '    ')).map(c => c === '\n' || characters.has(c.codePointAt(0)!) ? c : `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join('');
  let page: PDFPage, y = 0, count = 0;
  const check = () => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  function newPage() {
    check(); page = pdf.addPage([width, height]); y = height - margin;
    page.drawText('ChatPick  /  ' + clean(chat.provider), { x: margin, y: 24, size: 8, font, color: muted });
    page.drawText(String(++count), { x: width - margin - 18, y: 24, size: 8, font, color: muted });
  }
  function room(amount: number) { if (y - amount < margin) newPage(); }
  async function wrap(raw: string, size: number, available: number, face: PDFFont): Promise<string[]> {
    const text = clean(raw), lines: string[] = [];
    for (const line of text.split('\n')) {
      let current = '';
      for (const word of line.match(/\S+\s*|\s+/g) || []) {
        if (face.widthOfTextAtSize(current + word, size) <= available) { current += word; continue; }
        if (current.trim()) { lines.push(current.trimEnd()); current = ''; }
        // Long words, CJK text, code and URLs can always wrap at a character boundary.
        let visited = 0;
        for (const char of word) {
          if (++visited % 500 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); check(); }
          if (current && face.widthOfTextAtSize(current + char, size) > available) { lines.push(current.trimEnd()); current = ''; }
          current += char;
        }
      }
      lines.push(current.trimEnd());
    }
    return lines;
  }
  async function paragraph(text: string, size = 10.5, indent = 0, code = false, color = ink) {
    const face = code && /^[\x00-\x7f]*$/.test(text) ? mono : font;
    const leading = size * 1.6;
    let drawn = 0;
    for (const line of await wrap(text, size, usable - indent - (code ? 16 : 0), face)) {
      if (++drawn % 40 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); check(); }
      room(leading);
      if (code) page.drawRectangle({ x: margin + indent, y: y - leading + 3, width: usable - indent, height: leading + 1, color: paper });
      if (line) page.drawText(line, { x: margin + indent + (code ? 8 : 0), y: y - size, size, font: face, color });
      y -= leading;
    }
    y -= code ? 10 : 7;
  }
  function inline(tokens?: Token[], fallback = ''): string {
    if (!tokens) return fallback;
    return tokens.map(token => {
      const t = token as Token & { text?: string; tokens?: Token[]; href?: string };
      if (t.type === 'link') { const label = inline(t.tokens, t.text); return label + (t.href && t.href !== label ? ` (${t.href})` : ''); }
      if (t.type === 'image') return `[Image: ${t.text || 'attachment'}; image content is not included]`;
      if (t.type === 'br') return '\n';
      if (t.type === 'html') return t.raw.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '');
      return t.tokens ? inline(t.tokens) : t.text || '';
    }).join('').replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]!));
  }
  async function table(token: Tokens.Table, indent: number) {
    const columns = token.header.length;
    if (!columns) return;
    if (columns > 12 || (usable - indent) / columns < 60) {
      for (const row of token.rows) for (const [i, cell] of row.entries()) await paragraph(inline(token.header[i]?.tokens) + ": " + inline(cell.tokens, cell.text || ""), 9, indent);
      return;
    }
    const cellWidth = (usable - indent) / columns, size = Math.max(7, Math.min(9, cellWidth / 9)), leading = size * 1.55;
    const header = await Promise.all(token.header.map(cell => wrap(inline(cell.tokens, cell.text || ''), size, cellWidth - 12, font)));
    const rowHeight = (cells: string[][]) => Math.max(...cells.map(cell => cell.length)) * leading + 10;
    function drawCells(cells: string[][], start: number, count: number, heading: boolean) {
      const cellHeight = count * leading + 10;
      cells.forEach((cell, col) => {
        const x = margin + indent + col * cellWidth;
        page.drawRectangle({ x, y: y - cellHeight, width: cellWidth, height: cellHeight, color: heading ? rgb(.91, .93, .95) : rgb(1, 1, 1), borderColor: rgb(.83, .85, .88), borderWidth: .5 });
        for (let line = 0; line < count; line++) {
          const content = cell[start + line];
          if (content) page.drawText(content, { x: x + 6, y: y - size - 5 - line * leading, size, font, color: ink });
        }
      });
      y -= cellHeight;
    }
    const headerLines = Math.max(...header.map(cell => cell.length));
    // A normal header repeats on new pages. Unusually tall headers are split safely.
    const repeatHeader = headerLines <= 8;
    const rows = [token.header, ...token.rows];
    for (const [rowIndex, row] of rows.entries()) {
      const cells = rowIndex === 0 ? header : await Promise.all(row.map(cell => wrap(inline(cell.tokens, cell.text || ''), size, cellWidth - 12, font)));
      const lines = Math.max(...cells.map(cell => cell.length));
      const wholeRow = rowHeight(cells);
      if (y - wholeRow < margin && wholeRow + (repeatHeader ? rowHeight(header) : 0) < height - margin * 2) {
        newPage();
        if (rowIndex > 0 && repeatHeader) drawCells(header, 0, headerLines, true);
      }
      for (let start = 0; start < lines;) {
        let available = Math.floor((y - margin - 10) / leading);
        if (available <= 0) {
          newPage();
          if (rowIndex > 0 && repeatHeader) drawCells(header, 0, headerLines, true);
          available = Math.floor((y - margin - 10) / leading);
        }
        const count = Math.min(lines - start, available);
        drawCells(cells, start, count, rowIndex === 0);
        start += count;
        await new Promise(resolve => setTimeout(resolve, 0)); check();
      }
    }
    y -= 12;
  }
  async function blocks(tokens: Token[], indent = 0) {
    indent = Math.min(indent, usable - 80);
    for (const token of tokens) {
      check();
      switch (token.type) {
        case 'heading': room(64); await paragraph(inline(token.tokens, token.text), Math.max(11, 21 - token.depth * 2), indent); break;
        case 'paragraph': case 'text': await paragraph(inline(token.tokens, token.text), 10.5, indent); break;
        case 'code': await paragraph(token.text, 9, indent, true); break;
        case 'blockquote': await blocks((token as Tokens.Blockquote).tokens, indent + 16); break;
        case 'list': for (const [i, item] of (token as Tokens.List).items.entries()) {
          room(32); const prefix = token.ordered ? `${Number(token.start) + i}.` : '-';
          page.drawText(prefix, { x: margin + indent, y: y - 10.5, size: 10.5, font, color: muted });
          await blocks(item.tokens, indent + 20);
        } break;
        case 'table': await table(token as Tokens.Table, indent); break;
        case 'hr': room(20); page.drawLine({ start: { x: margin + indent, y: y - 4 }, end: { x: width - margin, y: y - 4 }, thickness: .5, color: rgb(.8, .82, .85) }); y -= 18; break;
        case 'html': await paragraph(inline([token]), 10.5, indent); break;
      }
    }
  }
  newPage();
  await paragraph(chat.title, 22);
  await paragraph(`${chat.provider} · ${chat.exportedAt}\n${chat.source}`, 8.5, 0, false, muted);
  if (chat.partial) await paragraph('Partial export: only loaded content, or a response still in progress. Earlier messages may be missing.', 9.5, 0, false, muted);
  for (let i = 0; i < chat.messages.length; i++) {
    check(); room(72);
    const m = chat.messages[i]!;
    await paragraph(`${i + 1}. ${m.role === 'user' ? 'You' : chat.provider}`, 12, 0, false, muted);
    await blocks(marked.lexer(m.markdown));
    // Yield between messages so navigation/cancellation can run during long exports.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  pdf.setTitle(chat.title); pdf.setAuthor('ChatPick'); pdf.setCreator('ChatPick');
  check(); return pdf.save();
}

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
    const bytes = await transcriptPdf(chat, await response.arrayBuffer(), signal);
    blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  }
  if (signal.aborted || chat.source !== location.origin + location.pathname) return;
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = exportFilename(chat, format === 'markdown' ? 'md' : 'pdf');
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
