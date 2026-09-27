import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium, Browser, BrowserContext, Locator, Page } from 'playwright';
import { Application, ObservationResult, ObservedControl, ObservedTable } from '../../types/automation';
import { describeBrowserError, probeUrl } from './urlProbe';
import { debugLog } from './debugLog';

const OBSERVE_DOM_SCRIPT = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'observeDom.raw.js'),
  'utf8'
);

const CONTROL_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, a[href], [role="button"], [role="textbox"], [role="link"], [role="checkbox"], [role="combobox"], [contenteditable="true"]';

interface LiveSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  applicationId: string;
}

type Extracted = {
  title: string;
  headings: string[];
  snippets: string[];
  controls: unknown[];
  tables: unknown[];
};

function emptyObservation(url: string, title: string, note?: string): ObservationResult {
  return {
    url,
    title: title || url,
    headings: [],
    visibleTextSnippets: note ? [note] : [],
    controls: [],
    tables: [],
    capturedAt: new Date().toISOString(),
    mode: 'LIVE_BROWSER',
  };
}

function isLoopbackHost(hostname: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(hostname);
}

function alternateLoopbackUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.toString();
    }
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

async function tablesFromLocators(page: Page): Promise<ObservedTable[]> {
  const host = page.locator('table, [role="table"], [role="grid"]').first();
  const exists = (await host.count().catch(() => 0)) > 0;
  if (!exists) return [];
  const headerTexts = (await host.locator('thead th, thead td, [role="columnheader"], tr >> nth=0 >> th').allTextContents().catch(() => []))
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const rowLocator = host.locator('tbody tr, [role="row"]');
  const rowCount = Math.min(await rowLocator.count().catch(() => 0), 50);
  const rows: ObservedTable['rows'] = [];
  for (let r = 0; r < rowCount; r++) {
    const row = rowLocator.nth(r);
    if (await row.locator('[role="columnheader"]').count().catch(() => 0)) continue;
    const cellTexts = (await row.locator('th, td, [role="gridcell"], [role="cell"]').allTextContents().catch(() => []))
      .map((t) => t.replace(/\s+/g, ' ').trim());
    if (!cellTexts.length) continue;
    const cells: Record<string, string> = {};
    cellTexts.forEach((text, idx) => {
      cells[headerTexts[idx] || `Column ${idx + 1}`] = text;
    });
    const actionLoc = row.locator(
      'button, a[href], [role="button"], input[type="checkbox"], [role="checkbox"]'
    );
    const actionCount = Math.min(await actionLoc.count().catch(() => 0), 8);
    const actions = [];
    for (let a = 0; a < actionCount; a++) {
      const act = actionLoc.nth(a);
      const label =
        (await act.getAttribute('aria-label').catch(() => '')) ||
        (await act.getAttribute('title').catch(() => '')) ||
        ((await act.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim() ||
        'Row action';
      const id = (await act.getAttribute('id').catch(() => '')) || '';
      const tag = ((await act.evaluate((n) => (n as HTMLElement).tagName).catch(() => '')) || '').toLowerCase();
      const typeAttr = ((await act.getAttribute('type').catch(() => '')) || '').toLowerCase();
      const roleAttr = ((await act.getAttribute('role').catch(() => '')) || '').toLowerCase();
      let kind = 'button';
      if (typeAttr === 'checkbox' || roleAttr === 'checkbox') kind = 'checkbox';
      else if (tag === 'a' || roleAttr === 'link') kind = 'link';
      actions.push({
        id: `t0-r${r}-a${a}`,
        intent: label.slice(0, 80),
        visibleText: label.slice(0, 80),
        role: kind,
        targetId: `t0-r${r}`,
        selectorFallback: id ? `#${id}` : `table >> tbody tr >> nth=${r} >> ${'button, a[href], [role="button"]'} >> nth=${a}`,
        controlType: kind,
      });
    }
    rows.push({
      rowId: (cellTexts[0] || `row-${r + 1}`).slice(0, 40),
      cells,
      actions,
      rawIndex: r,
    });
  }
  if (!rows.length) return [];
  const columns = headerTexts.length ? headerTexts : Object.keys(rows[0].cells);
  return [
    {
      id: 'table-1',
      semanticName: 'Claims table',
      columns,
      rows,
      totalRows: rows.length,
      currentPage: 1,
      hasPagination: false,
    },
  ];
}

async function controlsFromLocators(page: Page): Promise<unknown[]> {
  const locator = page.locator(CONTROL_SELECTOR);
  const count = await locator.count().catch(() => 0);
  const controls: unknown[] = [];
  const limit = Math.min(count, 80);
  for (let i = 0; i < limit; i++) {
    const el = locator.nth(i);
    const visible = await el.isVisible().catch(() => false);
    if (visible) {
      const inTable = await el
        .evaluate((node) => !!(node as HTMLElement).closest?.('table, [role="table"], [role="grid"]'))
        .catch(() => false);
      if (inTable) continue;
    }
    if (!visible) continue;
    const control = await describeControl(el, i);
    if (control) controls.push(control);
  }
  return controls;
}

async function describeControl(el: Locator, index: number): Promise<Record<string, unknown> | null> {
  const id = (await el.getAttribute('id').catch(() => '')) || '';
  const nameAttr = (await el.getAttribute('name').catch(() => '')) || '';
  const typeAttr = ((await el.getAttribute('type').catch(() => '')) || '').toLowerCase();
  const role = (await el.getAttribute('role').catch(() => '')) || '';
  const aria = (await el.getAttribute('aria-label').catch(() => '')) || '';
  const placeholder = (await el.getAttribute('placeholder').catch(() => '')) || '';
  const title = (await el.getAttribute('title').catch(() => '')) || '';
  const href = (await el.getAttribute('href').catch(() => '')) || '';
  let text = '';
  try {
    text = ((await el.innerText({ timeout: 400 })) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  } catch {
    text = '';
  }
  const accessible = (aria || placeholder || title || text || nameAttr || id || `control ${index + 1}`).trim();
  let selector = '';
  if (id) selector = `#${id}`;
  else if (nameAttr) selector = `[name="${nameAttr.replace(/"/g, '\\"')}"]`;
  else if (aria) selector = `[aria-label="${aria.replace(/"/g, '\\"')}"]`;
  else if (placeholder) selector = `[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
  else selector = `${CONTROL_SELECTOR} >> nth=${index}`;

  const blob = `${typeAttr} ${accessible} ${nameAttr} ${id}`.toLowerCase();
  let purpose = 'control';
  if (typeAttr === 'password' || blob.includes('password')) purpose = 'password';
  else if (typeAttr === 'submit' || /sign in|log in|^login$/i.test(accessible)) purpose = 'action';
  else if (blob.includes('email') || blob.includes('user') || nameAttr === 'username' || id === 'username') {
    purpose = 'username';
  } else if (/button|link/.test(role) || href) purpose = href ? 'navigation' : 'action';
  else if (['text', 'email', 'tel', 'number', 'search', 'url', 'textarea'].includes(typeAttr) || placeholder) {
    purpose = 'input';
  }

  return {
    id: `ctrl-${index + 1}`,
    type: typeAttr || (href ? 'a' : 'control'),
    role: role || typeAttr || 'control',
    visibleText: accessible,
    accessibleName: accessible,
    semanticPurpose: purpose,
    pageContext: '',
    headingContext: '',
    attributes: { name: nameAttr, id, href },
    enabled: await el.isEnabled().catch(() => true),
    visible: true,
    selectorFallback: selector,
  };
}

const CDP_PORT = 9333;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
const CDP_FILE = path.join(process.cwd(), 'data', 'browser-cdp.json');

function isIdleTab(page: Page): boolean {
  if (page.isClosed()) return false;
  const url = (page.url() || '').trim();
  if (!url || url === 'about:blank') return true;
  return (
    /^(chrome|edge|about):(\/\/)?(newtab|new-tab-page|new-tab|home|startpage)?\/?$/i.test(url) ||
    url.startsWith('chrome://new-tab-page') ||
    url.startsWith('chrome://newtab') ||
    url.startsWith('edge://newtab')
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeHost(hostname: string) {
  if (hostname === 'localhost' || hostname === '[::1]') return '127.0.0.1';
  return hostname;
}

function urlsLooselyMatch(pageUrl: string, targetUrl: string) {
  try {
    const page = new URL(pageUrl);
    const target = new URL(targetUrl);
    return (
      normalizeHost(page.hostname) === normalizeHost(target.hostname) &&
      (page.port || (page.protocol === 'https:' ? '443' : '80')) ===
        (target.port || (target.protocol === 'https:' ? '443' : '80'))
    );
  } catch {
    return pageUrl.includes(targetUrl) || targetUrl.includes(pageUrl);
  }
}

async function cdpIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_HTTP}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

class BrowserSessionManager {
  private sessions = new Map<string, LiveSession>();
  private shared: Browser | null = null;
  private spawnedPid: number | null = null;

  private persistCdp(applicationId: string, url: string) {
    fs.mkdirSync(path.dirname(CDP_FILE), { recursive: true });
    fs.writeFileSync(
      CDP_FILE,
      JSON.stringify(
        {
          engine: 'chromium',
          port: CDP_PORT,
          endpoint: CDP_HTTP,
          applicationId,
          url,
          pid: this.spawnedPid,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }

  private async connectCdp(): Promise<Browser | null> {
    if (this.shared) {
      try {
        if (this.shared.isConnected()) return this.shared;
      } catch {
        this.shared = null;
      }
    }
    if (!(await cdpIsUp())) return null;
    this.shared = await chromium.connectOverCDP(CDP_HTTP);
    if (!this.spawnedPid) {
      try {
        const stored = JSON.parse(fs.readFileSync(CDP_FILE, 'utf8')) as { pid?: number };
        if (typeof stored.pid === 'number') this.spawnedPid = stored.pid;
      } catch {
        /* no stored pid */
      }
    }
    return this.shared;
  }

  private findMatchingPage(browser: Browser, targetUrl: string): Page | undefined {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        if (urlsLooselyMatch(page.url(), targetUrl)) return page;
      }
    }
    return undefined;
  }

  private allPages(browser: Browser): Page[] {
    return browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.isClosed());
  }

  async findAppForOpenTabs(apps: Application[]): Promise<Application | undefined> {
    const browser = await this.connectCdp();
    if (!browser) return undefined;
    const pages = this.allPages(browser);
    for (const app of apps) {
      const target = app.loginUrl || app.baseUrl;
      if (target && pages.some((page) => urlsLooselyMatch(page.url(), target))) return app;
    }
    const loopbackPage = pages.find((page) => {
      try {
        return isLoopbackHost(new URL(page.url()).hostname);
      } catch {
        return false;
      }
    });
    if (!loopbackPage) return undefined;
    return apps.find((app) => {
      const raw = app.loginUrl || app.baseUrl;
      if (!raw) return false;
      try {
        return isLoopbackHost(new URL(raw).hostname);
      } catch {
        return false;
      }
    });
  }

  private async spawnDetachedChromium(): Promise<void> {
    if (await cdpIsUp()) return;
    const profile = path.join(process.cwd(), 'data', 'agent-chromium-profile');
    fs.mkdirSync(profile, { recursive: true });
    const child = spawn(
      chromium.executablePath(),
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--remote-debugging-address=127.0.0.1`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-session-crashed-bubble',
        '--disable-dev-shm-usage',
        '--allow-insecure-localhost',
        '--disable-features=BlockInsecurePrivateNetworkRequests,IsolateOrigins,site-per-process',
      ],
      { detached: true, stdio: 'ignore', windowsHide: false }
    );
    this.spawnedPid = child.pid ?? null;
    child.unref();
    if (this.spawnedPid) {
      this.persistCdp('chromium', CDP_HTTP);
    }
    debugLog('A', 'sessionManager.ts:spawn', 'spawned headed Playwright Chromium', { port: CDP_PORT, exe: chromium.executablePath() });
    for (let i = 0; i < 30; i++) {
      if (await cdpIsUp()) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  private async ensureBrowser(app: Application): Promise<Browser> {
    const existing = await this.connectCdp();
    if (existing) return existing;

    await this.spawnDetachedChromium();
    const spawned = await this.connectCdp();
    if (spawned) return spawned;

    const viewport = app.browserConfig?.viewport || { width: 1280, height: 800 };
    try {
      this.shared = await chromium.launch({
        headless: false,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        args: [
          `--remote-debugging-port=${CDP_PORT}`,
          '--remote-debugging-address=127.0.0.1',
          '--disable-dev-shm-usage',
          '--allow-insecure-localhost',
          '--disable-features=BlockInsecurePrivateNetworkRequests,IsolateOrigins,site-per-process',
        ],
      });
      const context = this.shared.contexts()[0] || (await this.shared.newContext({ viewport, ignoreHTTPSErrors: true }));
      if (!context.pages().length) await context.newPage();
      debugLog('A', 'sessionManager.ts:launch', 'chromium.launch headed', { port: CDP_PORT });
    } catch (err) {
      const recovered = await this.connectCdp();
      if (recovered) return recovered;
      throw err;
    }
    return this.shared;
  }

  async launch(app: Application): Promise<{ url: string; title: string }> {
    const acquired = await this.acquirePage(app);
    return { url: acquired.url, title: acquired.title };
  }

  async startOrderedFlow(app: Application): Promise<{ url: string; title: string }> {
    const page = await this.ensureOpen(app);
    const targetUrl = app.loginUrl || app.baseUrl;
    let hostname = '';
    try {
      hostname = new URL(targetUrl).hostname;
    } catch {
      hostname = '';
    }
    const loopback = isLoopbackHost(hostname);
    try {
      await page.goto(targetUrl, { waitUntil: loopback ? 'load' : 'domcontentloaded' });
    } catch (err) {
      const alt = loopback ? alternateLoopbackUrl(targetUrl) : null;
      if (!alt) throw new Error(describeBrowserError(err, targetUrl));
      await page.goto(alt, { waitUntil: 'load' }).catch((err2) => {
        throw new Error(describeBrowserError(err2, alt));
      });
    }
    if (loopback) {
      await page.waitForSelector(CONTROL_SELECTOR, { timeout: 8000 }).catch(() => undefined);
    }
    this.persistCdp(app.id, page.url());
    return { url: page.url(), title: await page.title().catch(() => '') };
  }

  async acquirePage(app: Application): Promise<{ url: string; title: string; reused: boolean }> {
    const mem = this.sessions.get(app.id)?.page;
    if (mem && !mem.isClosed()) {
      return { url: mem.url(), title: await mem.title().catch(() => ''), reused: true };
    }
    const targetUrl = app.loginUrl || app.baseUrl;
    const browser = await this.connectCdp();
    const matched = browser ? this.findMatchingPage(browser, targetUrl) : undefined;
    const page = await this.ensureOpen(app);
    return {
      url: page.url(),
      title: await page.title().catch(() => ''),
      reused: !!matched,
    };
  }

  private async killSpawnedBrowser(): Promise<void> {
    let pid = this.spawnedPid;
    this.spawnedPid = null;
    if (!pid) {
      try {
        const stored = JSON.parse(fs.readFileSync(CDP_FILE, 'utf8')) as { pid?: number };
        if (typeof stored.pid === 'number') pid = stored.pid;
      } catch {
        pid = null;
      }
    }
    if (!pid) return;
    if (process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        const done = () => resolve();
        child.once('close', done);
        child.once('error', done);
        setTimeout(done, 4000);
      });
      return;
    }
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
  }

  private async shutdownBrowser(): Promise<void> {
    const browser = this.shared;
    this.shared = null;
    if (browser) {
      await withTimeout(browser.close().catch(() => undefined), 2500);
    }
    await this.killSpawnedBrowser();
    try {
      if (fs.existsSync(CDP_FILE)) fs.unlinkSync(CDP_FILE);
    } catch {
      /* ignore */
    }
  }

  async close(applicationId: string): Promise<void> {
    const live = this.sessions.get(applicationId);
    this.sessions.delete(applicationId);
    if (live?.page && !live.page.isClosed()) {
      await withTimeout(live.page.close({ runBeforeUnload: false }), 1500);
    }
    if (live?.context) {
      for (const extra of live.context.pages()) {
        if (!extra.isClosed()) {
          await withTimeout(extra.close({ runBeforeUnload: false }), 800);
        }
      }
    }
    if (this.sessions.size === 0) {
      await this.shutdownBrowser();
    }
  }

  getPage(applicationId: string): Page | undefined {
    return this.sessions.get(applicationId)?.page;
  }

  openApplicationIds(): string[] {
    const ids: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.page && !session.page.isClosed()) ids.push(id);
    }
    return ids;
  }

  async ensureOpen(app: Application): Promise<Page> {
    const mem = this.sessions.get(app.id)?.page;
    if (mem && !mem.isClosed()) return mem;

    const targetUrl = app.loginUrl || app.baseUrl;
    let hostname = '';
    try {
      hostname = new URL(targetUrl).hostname;
    } catch {
      hostname = '';
    }
    const loopback = isLoopbackHost(hostname);
    if (!loopback) {
      const probe = await probeUrl(targetUrl, 2500);
      if (!probe.reachable) {
        throw new Error(probe.detail);
      }
    }

    const browser = await this.ensureBrowser(app);
    const matched = this.findMatchingPage(browser, targetUrl);
    if (matched) {
      const context = matched.context();
      this.sessions.set(app.id, { browser, context, page: matched, applicationId: app.id });
      this.persistCdp(app.id, matched.url());
      for (const extra of context.pages()) {
        if (extra !== matched && isIdleTab(extra)) {
          await withTimeout(extra.close({ runBeforeUnload: false }), 400);
        }
      }
      debugLog('A', 'sessionManager.ts:ensureOpen', 'reconnected CDP tab', {
        appId: app.id,
        url: matched.url(),
      });
      return matched;
    }

    const viewport = app.browserConfig?.viewport || { width: 1280, height: 800 };
    const timeoutMs = app.browserConfig?.timeoutMs || 30000;
    const context = browser.contexts()[0] || (await browser.newContext({ viewport, ignoreHTTPSErrors: true }));
    const idle = context.pages().find((p) => isIdleTab(p));
    const page = idle || (await context.newPage());
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(Math.min(timeoutMs, 20000));

    try {
      await page.goto(targetUrl, { waitUntil: loopback ? 'load' : 'domcontentloaded' });
    } catch (err) {
      const alt = loopback ? alternateLoopbackUrl(targetUrl) : null;
      if (alt) {
        try {
          await page.goto(alt, { waitUntil: 'load' });
        } catch (err2) {
          debugLog('A', 'sessionManager.ts:launch', 'goto failed', {
            targetUrl,
            alt,
            error: err2 instanceof Error ? err2.message : String(err2),
          });
          throw new Error(describeBrowserError(err2, alt));
        }
      } else {
        throw new Error(describeBrowserError(err, targetUrl));
      }
    }

    if (loopback) {
      await page.waitForSelector(CONTROL_SELECTOR, { timeout: 8000 }).catch(() => undefined);
    }

    for (const extra of context.pages()) {
      if (extra !== page && isIdleTab(extra)) {
        await withTimeout(extra.close({ runBeforeUnload: false }), 400);
      }
    }

    this.sessions.set(app.id, { browser, context, page, applicationId: app.id });
    this.persistCdp(app.id, page.url());
    const launchedUrl = page.url();
    const launchedTitle = await page.title();
    const htmlLen = (await page.content().catch(() => '')).length;
    debugLog('A', 'sessionManager.ts:launch', 'playwright goto finished', {
      targetUrl,
      launchedUrl,
      launchedTitle,
      loopback,
      htmlLen,
    });
    return page;
  }

  async observe(app: Application, opts?: { quick?: boolean }): Promise<ObservationResult> {
    const page = await this.ensureOpen(app);
    let loopback = false;
    try {
      loopback = isLoopbackHost(new URL(page.url()).hostname);
    } catch {
      loopback = false;
    }
    if (loopback && !opts?.quick) {
      await page.waitForSelector(CONTROL_SELECTOR, { timeout: 8000 }).catch(() => undefined);
      await page
        .waitForSelector('table, [role="table"], [role="grid"], tbody tr, [role="row"]', { timeout: 4000 })
        .catch(() => undefined);
    }

    const parts: Extracted[] = [];
    const rawLocatorCount = await page.locator(CONTROL_SELECTOR).count().catch(() => -1);
    const frameUrls = page.frames().map((f) => f.url());
    const htmlLen = (await page.content().catch(() => '')).length;
    debugLog('B', 'sessionManager.ts:observe:start', 'observe page snapshot', { url: page.url(), loopback, rawLocatorCount, frameCount: frameUrls.length, frameUrls: frameUrls.slice(0, 8), htmlLen });

    const locatorControls = await controlsFromLocators(page).catch((err) => {
      debugLog('C', 'sessionManager.ts:observe:locators', 'locator observe failed', { error: err instanceof Error ? err.message : String(err) });
      return [] as unknown[];
    });
    debugLog('C', 'sessionManager.ts:observe:locators', 'locator observe result', { rawLocatorCount, visibleDescribed: locatorControls.length });
    if (locatorControls.length) {
      parts.push({
        title: await page.title().catch(() => ''),
        headings: [],
        snippets: [],
        controls: locatorControls,
        tables: [],
      });
    }

    for (const frame of page.frames()) {
      try {
        const part = (await frame.evaluate(OBSERVE_DOM_SCRIPT)) as Extracted;
        if (part) parts.push(part);
        debugLog('D', 'sessionManager.ts:observe:evaluate', 'frame evaluate ok', { frameUrl: frame.url(), controlCount: (part?.controls || []).length, tableCount: (part?.tables || []).length });
      } catch (err) {
        // #region agent log
        debugLog('D', 'sessionManager.ts:observe:evaluate', 'frame evaluate failed', { frameUrl: frame.url(), error: err instanceof Error ? err.message : String(err) });
        // #endregion
      }
    }

    const url = page.url();
    const title = (parts.find((p) => p.title)?.title || (await page.title().catch(() => ''))) || url;

    if (!parts.length) {
      return emptyObservation(
        url,
        title,
        'Page opened. No readable controls yet — wait for the local UI, then Re-observe.'
      );
    }

    const extracted: Extracted = {
      title,
      headings: parts.flatMap((p) => p.headings || []),
      snippets: parts.flatMap((p) => p.snippets || []),
      controls: [],
      tables: [],
    };
    const seen = new Set<string>();
    let controlIndex = 0;
    let tableIndex = 0;
    for (const part of parts) {
      for (const control of part.controls || []) {
        const rec = control as { selectorFallback?: string; accessibleName?: string };
        const key = `${rec.selectorFallback || ''}|${rec.accessibleName || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        controlIndex += 1;
        extracted.controls.push({ ...rec, id: `ctrl-${controlIndex}` });
      }
      for (const table of part.tables || []) {
        tableIndex += 1;
        extracted.tables.push({ ...(table as object), id: `table-${tableIndex}` });
      }
    }

    if (!extracted.tables.length) {
      const locatorTables = await tablesFromLocators(page).catch(() => [] as ObservedTable[]);
      extracted.tables.push(...locatorTables);
    }

    if (!opts?.quick) {
      const shotDir = path.join(process.cwd(), 'data', 'obs-shots');
      fs.mkdirSync(shotDir, { recursive: true });
      const shotName = `${app.id}.png`;
      await page.screenshot({ path: path.join(shotDir, shotName) }).catch(() => undefined);
      return {
        url,
        title: extracted.title,
        headings: extracted.headings,
        visibleTextSnippets: extracted.snippets,
        controls: extracted.controls as unknown as ObservedControl[],
        tables: extracted.tables as unknown as ObservedTable[],
        screenshotUrl: `/obs-shots/${shotName}?t=${Date.now()}`,
        capturedAt: new Date().toISOString(),
        mode: 'LIVE_BROWSER',
      };
    }

    return {
      url,
      title: extracted.title,
      headings: extracted.headings,
      visibleTextSnippets: extracted.snippets,
      controls: extracted.controls as unknown as ObservedControl[],
      tables: extracted.tables as unknown as ObservedTable[],
      capturedAt: new Date().toISOString(),
      mode: 'LIVE_BROWSER',
    };
  }

  async fill(app: Application, selector: string, value: string, timeoutMs = 2000): Promise<void> {
    if (!String(value ?? '').trim()) return;
    const page = await this.ensureOpen(app);
    await page.locator(selector).first().fill(value, { timeout: timeoutMs });
  }

  async clickByName(app: Application, name: string, selectorFallback?: string): Promise<void> {
    const page = await this.ensureOpen(app);
    if (selectorFallback) {
      try {
        await page.locator(selectorFallback).first().click({ timeout: 2500 });
        return;
      } catch {
        /* fall through to name match */
      }
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'i');
    const roles = ['button', 'link', 'switch', 'menuitem', 'checkbox'] as const;
    for (const role of roles) {
      const loc = page.getByRole(role, { name: pattern });
      const count = await loc.count().catch(() => 0);
      if (count >= 1) {
        await loc.first().click({ timeout: 2500 });
        return;
      }
    }
    const byText = page.getByText(name, { exact: false });
    const textCount = await byText.count().catch(() => 0);
    if (textCount >= 1) {
      await byText.first().click({ timeout: 2500 });
      return;
    }
    throw new Error(`No control named "${name}" on the live page`);
  }

  async click(app: Application, selector: string): Promise<void> {
    const page = await this.ensureOpen(app);
    await page.locator(selector).first().click({ timeout: 2500 });
  }

  async clickByText(app: Application, text: string): Promise<void> {
    await this.clickByName(app, text);
  }

  pageUrl(app: Application): string {
    const page = this.sessions.get(app.id)?.page;
    if (page && !page.isClosed()) return page.url();
    return app.baseUrl;
  }
}

export const browserSessions = new BrowserSessionManager();
