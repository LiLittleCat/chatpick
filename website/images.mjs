// Native 2× website captures, independent of the store promotional cards.
export const previewDimensions = { width: 2264, height: 1220 };
export const previewWidths = [640, 768, 1132, 2264];
export const previewSizes = '(max-width: 620px) calc(100vw - 82px), (max-width: 1184px) calc(100vw - 126px), 1058px';
export const previewFilename = (filename, width) => width === previewDimensions.width
  ? filename
  : filename.replace('.webp', `-${width}.webp`);
