import { transcriptPdf } from '../lib/export-pdf';

// WXT builds this entrypoint as a self-contained ES module for an isolated-world import.
export default defineUnlistedScript(() => ({ transcriptPdf }));
