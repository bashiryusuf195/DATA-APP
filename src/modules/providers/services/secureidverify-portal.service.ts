import { chromium, type Browser, type BrowserContext, type Page, type Download } from 'playwright';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';

export type PortalIdType = 'nin_information' | 'nin_standard' | 'nin_premium' | 'bvn_basic';

// ── Browser singleton ─────────────────────────────────────────────────────────
// One browser + one context per process life-cycle.  The context keeps the
// authenticated session alive so we only log in once per deployment.
// A new Page is created (then closed) for every slip request.

class SecureIDVerifyPortalService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private loggedIn = false;
  private loginPromise: Promise<void> | null = null;

  private get cfg() { return config.secureidverifyPortal; }

  // ── Public API ──────────────────────────────────────────────────────────────

  async getPdfSlip(idType: PortalIdType, idNumber: string): Promise<string> {
    logger.info('[SIDV-PORTAL] attempting portal download', { id_type: idType });
    await this.ensureBrowser();
    await this.ensureLoggedIn();

    const page = await this.context!.newPage();
    try {
      const result = await Promise.race([
        this.lookupAndDownloadPdf(page, idType, idNumber),
        this.timeout('portal_pdf_request_timeout'),
      ]);
      logger.info('[SIDV-PORTAL] pdf downloaded', { id_type: idType, size_bytes: result.length });
      return result;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.browser  = null;
    this.context  = null;
    this.loggedIn = false;
  }

  // ── Browser lifecycle ───────────────────────────────────────────────────────

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected()) return;

    this.browser = await chromium.launch({
      executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.context  = await this.browser.newContext({ acceptDownloads: true });
    this.loggedIn = false;
    logger.info('portal_browser_started');
  }

  private async ensureLoggedIn(): Promise<void> {
    if (this.loggedIn) return;

    // Coalesce concurrent callers onto a single login attempt.
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => { this.loginPromise = null; });
    }
    await this.loginPromise;
  }

  private async login(): Promise<void> {
    logger.info('portal_login_started');

    const page = await this.context!.newPage();
    try {
      await page.goto(this.cfg.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      await this.fillFirst(page, [
        'input[name="username"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[id*="user"]',
        'input[id*="email"]',
      ], this.cfg.username);

      await this.fillFirst(page, [
        'input[name="password"]',
        'input[type="password"]',
      ], this.cfg.password);

      await this.clickFirst(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
      ]);

      // Confirm navigation away from the login page.
      await page.waitForURL(
        (url) => !url.href.toLowerCase().includes('login'),
        { timeout: 30_000 },
      );

      this.loggedIn = true;
      logger.info('[SIDV-PORTAL] login success');
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ── Slip lookup ─────────────────────────────────────────────────────────────

  private async lookupAndDownloadPdf(
    page: Page,
    idType: PortalIdType,
    idNumber: string,
  ): Promise<string> {
    logger.info('portal_slip_request_started', { id_type: idType });

    const lookupUrl = `${this.cfg.url.replace(/\/$/, '')}${this.getLookupPath(idType)}`;
    await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Detect session expiry — portal redirected us back to login.
    if (page.url().toLowerCase().includes('login')) {
      logger.info('portal_session_expired_relogin');
      this.loggedIn = false;
      await this.ensureLoggedIn();
      await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }

    await this.fillFirst(page, [
      'input[name="nin"]',
      'input[name="bvn"]',
      'input[name="id_number"]',
      'input[name="idNumber"]',
      'input[placeholder*="NIN"]',
      'input[placeholder*="BVN"]',
      'input[placeholder*="number" i]',
      'input[type="text"]',
    ], idNumber);

    logger.info('portal_slip_submitted', { id_type: idType });

    // Strategy 1: intercept a file download triggered by the submit button.
    const downloadRace = page
      .waitForEvent('download', { timeout: 90_000 })
      .then((dl) => this.readDownload(dl, idType))
      .catch(() => null);

    await this.clickFirst(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Search")',
      'button:has-text("Verify")',
      'button:has-text("Submit")',
    ]);

    const downloaded = await downloadRace;
    if (downloaded) return downloaded;

    // Strategy 2: wait for a "Download PDF" / "Print" link after the results render.
    const downloadLinkPdf = await page
      .locator('a[href*=".pdf"], a:has-text("Download"), a:has-text("Print PDF"), button:has-text("Download PDF")')
      .first()
      .getAttribute('href', { timeout: 60_000 })
      .catch(() => null);

    if (downloadLinkPdf) {
      const dl2Race = page.waitForEvent('download', { timeout: 30_000 });
      await page.locator(
        'a[href*=".pdf"], a:has-text("Download"), a:has-text("Print PDF"), button:has-text("Download PDF")',
      ).first().click();
      const dl2 = await dl2Race.catch(() => null);
      if (dl2) return this.readDownload(dl2, idType);
    }

    // Strategy 3: page.pdf() fallback — render the result page to PDF via headless Chrome.
    await page.waitForSelector(
      '.result, .report, #report, [class*="result"], [class*="report"], [class*="slip"]',
      { timeout: 60_000 },
    );
    const pdfBuf = await page.pdf({ format: 'A4', printBackground: true });
    const b64 = Buffer.from(pdfBuf).toString('base64');
    logger.info('portal_pdf_generated_fallback', { id_type: idType, size_bytes: pdfBuf.length });
    return b64;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getLookupPath(idType: PortalIdType): string {
    switch (idType) {
      case 'nin_information': return '/nin-information';
      case 'nin_standard':    return '/nin-standard';
      case 'nin_premium':     return '/nin-premium';
      case 'bvn_basic':       return '/bvn-basic';
    }
  }

  private async fillFirst(page: Page, selectors: string[], value: string): Promise<void> {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        await loc.fill(value);
        return;
      }
    }
    throw new Error(`portal_fill_no_match: tried ${selectors.join(', ')}`);
  }

  private async clickFirst(page: Page, selectors: string[]): Promise<void> {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        await loc.click();
        return;
      }
    }
    throw new Error(`portal_click_no_match: tried ${selectors.join(', ')}`);
  }

  private async readDownload(dl: Download, idType: PortalIdType): Promise<string> {
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const buf = Buffer.concat(chunks);
    logger.info('portal_pdf_downloaded', { id_type: idType, size_bytes: buf.length });
    return buf.toString('base64');
  }

  private timeout(reason: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(reason)),
        this.cfg.timeoutMs,
      ),
    );
  }
}

export const secureidverifyPortalService = new SecureIDVerifyPortalService();

// Startup log — fires once when this module is first imported (i.e. at provider registry boot).
// Shows whether the feature flag and credentials are present WITHOUT logging the values.
logger.info('[SIDV-PORTAL-CONFIG]', {
  enabled:      config.secureidverifyPortal.usePdf,
  has_url:      !!config.secureidverifyPortal.url,
  has_username: !!config.secureidverifyPortal.username,
  has_password: !!config.secureidverifyPortal.password,
  timeout_ms:   config.secureidverifyPortal.timeoutMs,
});
