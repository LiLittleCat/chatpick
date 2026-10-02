import { create } from 'fontkit';
import type { PDFDocument } from 'pdf-lib';

// pdf-lib expects fontkit's older streaming subset interface. Adapt the current
// browser fontkit API, whose encoder fixes CJK glyph corruption in older versions.
export function createPdfFontkit(): Parameters<PDFDocument['registerFontkit']>[0] {
  return {
    create(bytes: Uint8Array) {
      // The browser entry accepts Uint8Array; DefinitelyTyped only declares Node Buffer.
      const font = (create as (data: Uint8Array) => ReturnType<typeof create>)(bytes);
      if (!('createSubset' in font)) throw new Error('Unsupported font collection');
      const original = font.createSubset.bind(font);
      font.createSubset = () => {
        const subset = original();
        Object.defineProperty(subset, 'encodeStream', { value: () => {
          const listeners = new Map<string, (value?: Uint8Array | Error) => void>();
          queueMicrotask(() => {
            try { listeners.get('data')?.(subset.encode()); listeners.get('end')?.(); }
            catch (error) { listeners.get('error')?.(error instanceof Error ? error : new Error('Font encoding failed')); }
          });
          return { on(event: string, handler: (value?: Uint8Array | Error) => void) { listeners.set(event, handler); return this; } };
        } });
        return subset;
      };
      return font;
    },
  } as unknown as Parameters<PDFDocument['registerFontkit']>[0];
}
