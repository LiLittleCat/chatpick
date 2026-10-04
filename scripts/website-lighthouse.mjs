import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.output/lighthouse');
const binary = process.env.CHATPICK_LIGHTHOUSE_BIN || 'lighthouse';
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
const metricIds = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  speedIndex: 'speed-index',
};
const cases = [
  { locale: 'en', device: 'mobile', theme: 'light' },
  { locale: 'zh-CN', device: 'mobile', theme: 'dark' },
  { locale: 'en', device: 'desktop', theme: 'dark' },
  { locale: 'zh-CN', device: 'desktop', theme: 'light' },
];

function auditBase() {
  const url = new URL(process.env.CHATPICK_AUDIT_URL || 'http://127.0.0.1:4173/');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('CHATPICK_AUDIT_URL must be an HTTP or HTTPS URL without credentials');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.hash = '';
  return url;
}

function targetUrl(base, { locale, theme }) {
  const url = new URL(locale === 'zh-CN' ? 'zh-CN/' : './', base);
  url.search = base.search;
  url.searchParams.set('lang', locale);
  url.searchParams.set('theme', theme);
  return url.href;
}

function errorText(error) {
  const details = error.stderr?.trim() || error.stdout?.trim();
  return details ? `${error.message}\n${details}` : error.message;
}

async function audit(base, configuration) {
  const name = `${configuration.locale}-${configuration.device}`;
  const prefix = path.join(output, name);
  const jsonPath = `${prefix}.report.json`;
  const htmlPath = `${prefix}.report.html`;
  const url = targetUrl(base, configuration);
  // Remove earlier reports so a failed invocation cannot reuse a stale result.
  await Promise.all([jsonPath, htmlPath].map(filename => fs.rm(filename, { force: true })));
  const argumentsList = [
    url,
    '--quiet',
    '--chrome-flags=--headless --disable-extensions',
    `--only-categories=${categories.join(',')}`,
    '--output=html',
    '--output=json',
    `--output-path=${prefix}`,
  ];
  if (configuration.device === 'desktop') argumentsList.push('--preset=desktop');

  console.log(`Auditing ${configuration.locale} ${configuration.device} (${configuration.theme})…`);
  let commandError;
  try {
    // execFile passes arguments directly; CHROME_PATH and other environment values are inherited.
    await runFile(binary, argumentsList, {
      cwd: root,
      timeout: 240_000,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
  } catch (error) {
    commandError = errorText(error);
  }

  let report;
  try {
    report = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  } catch (error) {
    if (!commandError) commandError = `Unable to read Lighthouse JSON report: ${error.message}`;
  }
  const auditErrors = Object.entries(report?.audits || {})
    .filter(([, result]) => result.scoreDisplayMode === 'error')
    .map(([id, result]) => ({ id, message: result.errorMessage || result.description || 'Audit failed' }));
  const failed = Boolean(commandError || report?.runtimeError || auditErrors.length);
  const scores = Object.fromEntries(categories.map(id => [id,
    typeof report?.categories?.[id]?.score === 'number'
      ? Math.round(report.categories[id].score * 100)
      : null,
  ]));
  const metrics = Object.fromEntries(Object.entries(metricIds).map(([name, id]) => {
    const result = report?.audits?.[id];
    return [name, {
      value: result?.numericValue ?? null,
      unit: result?.numericUnit ?? null,
      display: result?.displayValue ?? null,
    }];
  }));
  const summary = {
    ...configuration,
    requestedUrl: url,
    finalUrl: report?.finalDisplayedUrl || report?.finalUrl || null,
    status: failed ? 'error' : 'complete',
    lighthouseVersion: report?.lighthouseVersion || null,
    scores,
    metrics,
    reports: { html: htmlPath, json: jsonPath },
    warnings: report?.runWarnings || [],
    commandError: commandError || null,
    runtimeError: report?.runtimeError || null,
    auditErrors,
  };
  if (failed) {
    console.error(`${name}: audit failed`);
    if (commandError) console.error(commandError);
    if (report?.runtimeError) console.error(`Runtime error: ${JSON.stringify(report.runtimeError)}`);
    for (const error of auditErrors) console.error(`${error.id}: ${error.message}`);
  } else {
    console.log(`${name}: ${categories.map(id => `${id} ${scores[id] ?? 'unavailable'}`).join(' | ')}`);
    console.log(`  ${Object.entries(metrics).map(([name, metric]) => `${name} ${metric.display || 'unavailable'}`).join(' | ')}`);
  }
  for (const warning of summary.warnings) console.warn(`${name}: ${warning}`);
  return summary;
}

async function main() {
  const base = auditBase();
  await fs.mkdir(output, { recursive: true });
  const notes = [
    'Local preview scores do not verify the unpublished production site; rerun against deployed HTTPS pages after launch.',
    'Scores vary with browser version and machine conditions. No score thresholds or audit exclusions are applied.',
  ];
  console.log(`Lighthouse target: ${base.href}`);
  for (const note of notes) console.log(note);
  const runs = [];
  for (const configuration of cases) runs.push(await audit(base, configuration));
  const filename = path.join(output, 'summary.json');
  await fs.writeFile(filename, `${JSON.stringify({ generatedAt: new Date().toISOString(), target: base.href, notes, runs }, null, 2)}\n`);
  console.log(`Reports and summary: ${output}`);
  if (runs.some(run => run.status === 'error')) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
