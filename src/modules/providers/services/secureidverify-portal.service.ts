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
    let step = 'navigate_to_login';
    try {
      // ── Step 1: navigate ──────────────────────────────────────────────────
      logger.info('[SIDV-PORTAL] login step: navigate', { url: this.cfg.url });
      await page.goto(this.cfg.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const afterNavUrl   = page.url();
      const afterNavTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] login step: after_navigate', {
        current_url:   afterNavUrl,
        page_title:    afterNavTitle,
      });

      // ── Step 2: find username field ───────────────────────────────────────
      step = 'find_username';
      const usernameSelectors = [
        'input[name="username"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[id*="user"]',
        'input[id*="email"]',
      ];
      const foundUsername = await this.findFirstSelector(page, usernameSelectors);
      logger.info('[SIDV-PORTAL] login step: username_field', {
        found:    foundUsername !== null,
        selector: foundUsername,
        current_url: page.url(),
      });
      if (!foundUsername) {
        throw new Error(`portal_fill_no_match: username — tried ${usernameSelectors.join(', ')}`);
      }
      await page.locator(foundUsername).first().fill(this.cfg.username);

      // ── Step 3: find password field ───────────────────────────────────────
      step = 'find_password';
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
      ];
      const foundPassword = await this.findFirstSelector(page, passwordSelectors);
      logger.info('[SIDV-PORTAL] login step: password_field', {
        found:    foundPassword !== null,
        selector: foundPassword,
      });
      if (!foundPassword) {
        throw new Error(`portal_fill_no_match: password — tried ${passwordSelectors.join(', ')}`);
      }
      await page.locator(foundPassword).first().fill(this.cfg.password);

      // ── Step 4: find and click login button ───────────────────────────────
      step = 'click_login_button';
      const buttonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
      ];
      const foundButton = await this.findFirstSelector(page, buttonSelectors);
      logger.info('[SIDV-PORTAL] login step: login_button', {
        found:    foundButton !== null,
        selector: foundButton,
      });
      if (!foundButton) {
        throw new Error(`portal_click_no_match: login button — tried ${buttonSelectors.join(', ')}`);
      }
      await page.locator(foundButton).first().click();

      // ── Step 5: wait for redirect away from login ─────────────────────────
      step = 'wait_for_post_login_redirect';
      await page.waitForURL(
        (url) => !url.href.toLowerCase().includes('login'),
        { timeout: 30_000 },
      );

      const postLoginUrl   = page.url();
      const postLoginTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] login step: post_login', {
        current_url: postLoginUrl,
        page_title:  postLoginTitle,
      });

      this.loggedIn = true;
      logger.info('[SIDV-PORTAL] login success');
    } catch (err) {
      const e = err as Error;
      logger.error('[SIDV-PORTAL-ERROR]', {
        step,
        message:     e.message,
        stack:       e.stack ?? null,
        current_url: page.url(),
      });
      throw err;
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
    const lookupUrl = `${this.cfg.url.replace(/\/$/, '')}${this.getLookupPath(idType)}`;
    let step = 'navigate_to_lookup';
    try {
      // ── Step 1: navigate to lookup page ────────────────────────────────────
      logger.info('[SIDV-PORTAL] lookup step: navigate', { id_type: idType, url: lookupUrl });
      await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const afterNavUrl   = page.url();
      const afterNavTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] lookup step: after_navigate', {
        current_url: afterNavUrl,
        page_title:  afterNavTitle,
        id_type:     idType,
      });

      // Detect session expiry — portal redirected us back to login.
      if (afterNavUrl.toLowerCase().includes('login')) {
        logger.info('[SIDV-PORTAL] lookup step: session_expired_relogin', { current_url: afterNavUrl });
        this.loggedIn = false;
        step = 'relogin';
        await this.ensureLoggedIn();
        step = 'navigate_to_lookup_after_relogin';
        await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        logger.info('[SIDV-PORTAL] lookup step: after_relogin_navigate', {
          current_url: page.url(),
          page_title:  await page.title().catch(() => '(title_error)'),
        });
      }

      // ── Step 2: fill ID number field ────────────────────────────────────────
      step = 'find_id_field';
      const idSelectors = [
        'input[name="nin"]',
        'input[name="bvn"]',
        'input[name="id_number"]',
        'input[name="idNumber"]',
        'input[placeholder*="NIN"]',
        'input[placeholder*="BVN"]',
        'input[placeholder*="number" i]',
        'input[type="text"]',
      ];
      const foundIdField = await this.findFirstSelector(page, idSelectors);
      logger.info('[SIDV-PORTAL] lookup step: id_field', {
        id_type:  idType,
        found:    foundIdField !== null,
        selector: foundIdField,
        current_url: page.url(),
      });
      if (!foundIdField) {
        throw new Error(`portal_fill_no_match: id field — tried ${idSelectors.join(', ')}`);
      }
      await page.locator(foundIdField).first().fill(idNumber);

      // ── Step 3: strategy 1 — intercept download event ──────────────────────
      step = 'click_submit_watch_download';
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Search")',
        'button:has-text("Verify")',
        'button:has-text("Submit")',
      ];
      const foundSubmit = await this.findFirstSelector(page, submitSelectors);
      logger.info('[SIDV-PORTAL] lookup step: submit_button', {
        found:    foundSubmit !== null,
        selector: foundSubmit,
      });

      const downloadRace = page
        .waitForEvent('download', { timeout: 90_000 })
        .then((dl) => this.readDownload(dl, idType))
        .catch(() => null);

      if (foundSubmit) {
        await page.locator(foundSubmit).first().click();
      } else {
        throw new Error(`portal_click_no_match: submit button — tried ${submitSelectors.join(', ')}`);
      }

      const downloaded = await downloadRace;
      logger.info('[SIDV-PORTAL] lookup step: strategy1_download', {
        id_type:     idType,
        downloaded:  downloaded !== null,
        current_url: page.url(),
      });
      if (downloaded) return downloaded;

      // ── Step 4: strategy 2 — find download link after result renders ────────
      step = 'find_download_link';
      const dlLinkSelector = 'a[href*=".pdf"], a:has-text("Download"), a:has-text("Print PDF"), button:has-text("Download PDF")';
      const dlLinkHref = await page
        .locator(dlLinkSelector)
        .first()
        .getAttribute('href', { timeout: 60_000 })
        .catch(() => null);

      logger.info('[SIDV-PORTAL] lookup step: strategy2_download_link', {
        id_type:    idType,
        found:      dlLinkHref !== null,
        href:       dlLinkHref,
        current_url: page.url(),
        page_title:  await page.title().catch(() => '(title_error)'),
      });

      if (dlLinkHref !== null) {
        step = 'click_download_link';
        const dl2Race = page.waitForEvent('download', { timeout: 30_000 });
        await page.locator(dlLinkSelector).first().click();
        const dl2 = await dl2Race.catch(() => null);
        logger.info('[SIDV-PORTAL] lookup step: strategy2_click_result', {
          id_type:    idType,
          downloaded: dl2 !== null,
        });
        if (dl2) return this.readDownload(dl2, idType);
      }

      // ── Step 5: strategy 3 — page.pdf() of result page ─────────────────────
      step = 'wait_for_result_selector';
      const resultSelector = '.result, .report, #report, [class*="result"], [class*="report"], [class*="slip"]';
      const resultEl = await page
        .waitForSelector(resultSelector, { timeout: 60_000 })
        .catch(() => null);

      logger.info('[SIDV-PORTAL] lookup step: strategy3_result_element', {
        id_type:     idType,
        found:       resultEl !== null,
        current_url: page.url(),
        page_title:  await page.title().catch(() => '(title_error)'),
      });

      if (!resultEl) {
        throw new Error(`portal_result_not_found: none of "${resultSelector}" appeared within 60s`);
      }

      step = 'page_pdf_render';
      const pdfBuf = await page.pdf({ format: 'A4', printBackground: true });
      const b64 = Buffer.from(pdfBuf).toString('base64');
      logger.info('[SIDV-PORTAL] lookup step: strategy3_pdf_rendered', {
        id_type:    idType,
        size_bytes: pdfBuf.length,
      });
      return b64;

    } catch (err) {
      const e = err as Error;
      logger.error('[SIDV-PORTAL-ERROR]', {
        step,
        message:     e.message,
        stack:       e.stack ?? null,
        current_url: page.url(),
      });
      throw err;
    }
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

  /** Returns the first selector from the list that matches at least one element, or null. */
  private async findFirstSelector(page: Page, selectors: string[]): Promise<string | null> {
    for (const sel of selectors) {
      if (await page.locator(sel).count() > 0) return sel;
    }
    return null;
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
    logger.info('[SIDV-PORTAL] download stream read', { id_type: idType, size_bytes: buf.length });
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
