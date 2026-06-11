import { chromium, type Browser, type BrowserContext, type Page, type Download } from 'playwright';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';

export type PortalIdType = 'nin_information' | 'nin_standard' | 'nin_premium' | 'bvn_basic';

// Maps our internal product tier to the label shown in the portal's slip-type selector.
const SLIP_TYPE_LABEL: Record<PortalIdType, string> = {
  nin_information: 'Information Slip',
  nin_standard:    'Standard Slip',
  nin_premium:     'Premium Slip',
  bvn_basic:       'Basic Slip',
};

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
        current_url: afterNavUrl,
        page_title:  afterNavTitle,
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

      // ── Step 5: wait for redirect to dashboard ────────────────────────────
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
    const base        = this.cfg.url.replace(/\/$/, '');
    const lookupUrl   = `${base}${this.getLookupPath(idType)}`;
    const slipLabel   = SLIP_TYPE_LABEL[idType];
    let step          = 'navigate_to_verification';

    try {
      // ── Step 1: navigate to the verification page ─────────────────────────
      logger.info('[SIDV-PORTAL] lookup step: navigate', { id_type: idType, url: lookupUrl });
      await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      let afterNavUrl   = page.url();
      let afterNavTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] lookup step: after_navigate', {
        current_url: afterNavUrl,
        page_title:  afterNavTitle,
        id_type:     idType,
      });

      // Session expiry: redirected back to login.
      if (afterNavUrl.toLowerCase().includes('login')) {
        logger.info('[SIDV-PORTAL] lookup step: session_expired_relogin', { current_url: afterNavUrl });
        this.loggedIn = false;
        step = 'relogin';
        await this.ensureLoggedIn();
        step = 'navigate_to_verification_after_relogin';
        await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        afterNavUrl   = page.url();
        afterNavTitle = await page.title().catch(() => '(title_error)');
        logger.info('[SIDV-PORTAL] lookup step: after_relogin_navigate', {
          current_url: afterNavUrl,
          page_title:  afterNavTitle,
        });
      }

      // ── Step 2: close welcome modal if present ────────────────────────────
      step = 'dismiss_modal';
      const modalClosed = await this.dismissModal(page);
      logger.info('[SIDV-PORTAL] modal_closed', { was_present: modalClosed });

      // ── Step 3: fill the NIN / BVN input ─────────────────────────────────
      step = 'fill_id_number';
      const idSelectors = [
        'input[name="nin"]',
        'input[name="bvn"]',
        'input[name="id_number"]',
        'input[name="idNumber"]',
        'input[placeholder*="NIN" i]',
        'input[placeholder*="BVN" i]',
        'input[placeholder*="number" i]',
        'input[type="text"]',
      ];
      const foundIdField = await this.findFirstSelector(page, idSelectors);
      logger.info('[SIDV-PORTAL] lookup step: id_field', {
        id_type:     idType,
        found:       foundIdField !== null,
        selector:    foundIdField,
        current_url: page.url(),
      });
      if (!foundIdField) {
        throw new Error(`portal_fill_no_match: id field — tried ${idSelectors.join(', ')}`);
      }
      await page.locator(foundIdField).first().fill(idNumber);

      // ── Step 4: select slip type ──────────────────────────────────────────
      step = 'select_slip_type';
      await this.selectSlipType(page, slipLabel);
      logger.info('[SIDV-PORTAL] lookup step: slip_type_selected', {
        id_type:    idType,
        slip_label: slipLabel,
      });

      // ── Step 5: tick consent checkbox ─────────────────────────────────────
      step = 'tick_consent';
      await this.tickConsent(page);
      logger.info('[SIDV-PORTAL] consent_checked');

      // ── Step 6: click VERIFY & GET THE INFO ──────────────────────────────
      step = 'click_verify';
      const verifySelectors = [
        'button:has-text("VERIFY & GET THE INFO")',
        'button:has-text("Verify & Get The Info")',
        'button:has-text("Verify")',
        'input[value*="VERIFY" i]',
        'button[type="submit"]',
      ];
      const foundVerify = await this.findFirstSelector(page, verifySelectors);
      logger.info('[SIDV-PORTAL] lookup step: verify_button', {
        found:    foundVerify !== null,
        selector: foundVerify,
      });
      if (!foundVerify) {
        throw new Error(`portal_click_no_match: verify button — tried ${verifySelectors.join(', ')}`);
      }
      await page.locator(foundVerify).first().click();
      logger.info('[SIDV-PORTAL] verification_submitted', { id_type: idType });

      // ── Step 7: wait for verification to complete ─────────────────────────
      step = 'wait_for_verification_complete';
      await this.waitForVerificationComplete(page);
      logger.info('[SIDV-PORTAL] verification_completed', { id_type: idType });

      // ── Step 8: navigate to the verifications list ────────────────────────
      step = 'navigate_to_verifications_list';
      const verificationsUrl = `${base}/user/verifications`;
      await page.goto(verificationsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const listUrl   = page.url();
      const listTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] verifications_page_loaded', {
        current_url: listUrl,
        page_title:  listTitle,
      });

      // ── Step 9: download the PDF for the newest matching verification ──────
      step = 'download_pdf';
      const pdfBase64 = await this.downloadNewestVerificationPdf(page, idNumber, idType);
      logger.info('[SIDV-PORTAL] pdf_downloaded', { id_type: idType, size_bytes: pdfBase64.length });
      return pdfBase64;

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

  // ── Sub-tasks ───────────────────────────────────────────────────────────────

  /** Closes the welcome modal if one appears within 5 seconds. Returns true if a modal was dismissed. */
  private async dismissModal(page: Page): Promise<boolean> {
    const closeSelectors = [
      'button:has-text("Close")',
      'button:has-text("close")',
      '[aria-label="Close"]',
      '[aria-label="close"]',
      '.modal button.close',
      '.modal-close',
      'button.btn-close',
    ];
    for (const sel of closeSelectors) {
      const loc = page.locator(sel).first();
      const visible = await loc.isVisible({ timeout: 5_000 }).catch(() => false);
      if (visible) {
        await loc.click();
        // Wait for the modal to disappear.
        await loc.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        return true;
      }
    }
    return false;
  }

  /** Clicks the slip-type radio button / option that matches slipLabel. */
  private async selectSlipType(page: Page, slipLabel: string): Promise<void> {
    // Try radio button or clickable label with matching text first.
    const byText = page.locator(`label:has-text("${slipLabel}"), button:has-text("${slipLabel}"), li:has-text("${slipLabel}")`).first();
    if (await byText.count() > 0) {
      await byText.click();
      return;
    }

    // Fallback: find an <option> in a <select> and select it.
    const selectEl = page.locator('select').first();
    if (await selectEl.count() > 0) {
      await selectEl.selectOption({ label: slipLabel });
      return;
    }

    throw new Error(`portal_slip_type_not_found: "${slipLabel}" — no matching label, button, li, or select option`);
  }

  /** Ticks the first unchecked consent checkbox on the page. */
  private async tickConsent(page: Page): Promise<void> {
    const consentSelectors = [
      'input[type="checkbox"][name*="consent" i]',
      'input[type="checkbox"][id*="consent" i]',
      'label:has-text("consent") input[type="checkbox"]',
      'label:has-text("agree") input[type="checkbox"]',
      // Fallback: first checkbox on the page.
      'input[type="checkbox"]',
    ];
    for (const sel of consentSelectors) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        const checked = await loc.isChecked().catch(() => false);
        if (!checked) await loc.click();
        return;
      }
    }
    throw new Error('portal_consent_checkbox_not_found');
  }

  /**
   * Waits for verification to finish.  Tries several heuristics:
   * 1. A success toast / alert with "success" text.
   * 2. A spinner / loading indicator disappearing.
   * 3. Fixed 10-second settle wait as a last resort.
   */
  private async waitForVerificationComplete(page: Page): Promise<void> {
    // Heuristic 1: success message appears.
    const successAppeared = await page
      .waitForSelector(
        '[class*="success"], .alert-success, .toast-success, [role="alert"]:has-text("success"), [role="alert"]:has-text("complet"), [role="status"]:has-text("success")',
        { timeout: 90_000 },
      )
      .then(() => true)
      .catch(() => false);

    if (successAppeared) return;

    // Heuristic 2: any spinner / loader disappears.
    await page
      .waitForSelector(
        '[class*="spinner"], [class*="loading"], [class*="loader"]',
        { state: 'hidden', timeout: 90_000 },
      )
      .catch(() => {});

    // Heuristic 3: fixed settle wait.
    await page.waitForTimeout(10_000);
  }

  /**
   * Navigates the verifications list, finds the row for the newest verification
   * matching idNumber (best-effort), and downloads its PDF.
   */
  private async downloadNewestVerificationPdf(
    page: Page,
    idNumber: string,
    idType: PortalIdType,
  ): Promise<string> {
    // Wait for the table / list to load.
    await page
      .waitForSelector('table, [class*="verification"], [class*="list"]', { timeout: 30_000 })
      .catch(() => {});

    // Try to find a row containing the submitted ID number.
    // If not found (masked), fall back to the first/newest row.
    const rowSelector = `tr:has-text("${idNumber}"), [class*="row"]:has-text("${idNumber}"), li:has-text("${idNumber}")`;
    const hasIdRow    = await page.locator(rowSelector).count() > 0;

    const targetRow = hasIdRow
      ? page.locator(rowSelector).first()
      : page.locator('table tbody tr, [class*="verification-item"], [class*="list-item"]').first();

    logger.info('[SIDV-PORTAL] lookup step: verifications_row', {
      id_type:      idType,
      matched_by_id: hasIdRow,
    });

    // Click the download / PDF button within that row, intercepting the download.
    const dlButtonSelectors = [
      'a:has-text("Download")',
      'a:has-text("PDF")',
      'button:has-text("Download")',
      'button:has-text("PDF")',
      'a[href*=".pdf"]',
      'a[href*="download"]',
      '[title*="Download" i]',
    ];

    for (const sel of dlButtonSelectors) {
      const btn = targetRow.locator(sel).first();
      if (await btn.count() > 0) {
        const dl = await Promise.race([
          page.waitForEvent('download', { timeout: 30_000 }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('download_event_timeout')), 30_000)),
        ]);
        await btn.click();
        return this.readDownload(dl, idType);
      }
    }

    // Fallback: page.pdf() of the verifications page itself.
    logger.info('[SIDV-PORTAL] lookup step: verifications_pdf_fallback', { id_type: idType });
    const pdfBuf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuf).toString('base64');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Maps our PortalIdType to the actual SecureIDVerify portal route. */
  private getLookupPath(idType: PortalIdType): string {
    switch (idType) {
      case 'nin_information':
      case 'nin_standard':
      case 'nin_premium':
        return '/user/service/nin-verification';
      case 'bvn_basic':
        return '/user/service/bvn-verification';
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
