import fs from 'fs';
import path from 'path';
import { chromium, type Browser, type BrowserContext, type Page, type Download } from 'playwright';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';

export type PortalIdType = 'nin_information' | 'nin_standard' | 'nin_premium' | 'bvn_basic';

const SLIP_TYPE_LABEL: Record<PortalIdType, string> = {
  nin_information: 'Information Slip',
  nin_standard:    'Standard Slip',
  nin_premium:     'Raw Slip',
  bvn_basic:       'Basic Slip',
};

// ── Browser singleton ─────────────────────────────────────────────────────────

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
      return result;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async shutdown(): Promise<void> {
    if (this.browser) await this.browser.close().catch(() => {});
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    this.context  = await this.browser.newContext({ acceptDownloads: true });
    this.loggedIn = false;
    logger.info('portal_browser_started');
  }

  private async ensureLoggedIn(): Promise<void> {
    if (this.loggedIn) return;
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
      logger.info('[SIDV-PORTAL] login step: navigate', { url: this.cfg.url });
      await page.goto(this.cfg.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const afterNavUrl   = page.url();
      const afterNavTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] login step: after_navigate', { current_url: afterNavUrl, page_title: afterNavTitle });

      step = 'find_username';
      const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', 'input[id*="user"]', 'input[id*="email"]'];
      const foundUsername = await this.findFirstSelector(page, usernameSelectors);
      logger.info('[SIDV-PORTAL] login step: username_field', { found: foundUsername !== null, selector: foundUsername, current_url: page.url() });
      if (!foundUsername) throw new Error(`portal_fill_no_match: username — tried ${usernameSelectors.join(', ')}`);
      await page.locator(foundUsername).first().fill(this.cfg.username);

      step = 'find_password';
      const passwordSelectors = ['input[name="password"]', 'input[type="password"]'];
      const foundPassword = await this.findFirstSelector(page, passwordSelectors);
      logger.info('[SIDV-PORTAL] login step: password_field', { found: foundPassword !== null, selector: foundPassword });
      if (!foundPassword) throw new Error(`portal_fill_no_match: password — tried ${passwordSelectors.join(', ')}`);
      await page.locator(foundPassword).first().fill(this.cfg.password);

      step = 'click_login_button';
      const buttonSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign in")', 'button:has-text("Log in")'];
      const foundButton = await this.findFirstSelector(page, buttonSelectors);
      logger.info('[SIDV-PORTAL] login step: login_button', { found: foundButton !== null, selector: foundButton });
      if (!foundButton) throw new Error(`portal_click_no_match: login button — tried ${buttonSelectors.join(', ')}`);
      await page.locator(foundButton).first().click();

      step = 'wait_for_post_login_redirect';
      await page.waitForURL((url) => !url.href.toLowerCase().includes('login'), { timeout: 30_000 });

      const postLoginUrl   = page.url();
      const postLoginTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] login step: post_login', { current_url: postLoginUrl, page_title: postLoginTitle });

      this.loggedIn = true;
      logger.info('[SIDV-PORTAL] login success');
    } catch (err) {
      const e = err as Error;
      logger.error('[SIDV-PORTAL-ERROR]', { step, message: e.message, stack: e.stack ?? null, current_url: page.url() });
      throw err;
    } finally {
      await page.close().catch(() => {});
    }
  }

  // ── Main lookup flow ────────────────────────────────────────────────────────

  private async lookupAndDownloadPdf(page: Page, idType: PortalIdType, idNumber: string): Promise<string> {
    const base      = this.cfg.url.replace(/\/$/, '');
    const lookupUrl = `${base}${this.getLookupPath(idType)}`;
    const slipLabel = SLIP_TYPE_LABEL[idType];
    let step        = 'navigate_to_verification';

    try {
      // ── 1. Navigate to the verification form ──────────────────────────────
      logger.info('[SIDV-PORTAL] lookup step: navigate', { id_type: idType, url: lookupUrl });
      await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const afterNavUrl   = page.url();
      const afterNavTitle = await page.title().catch(() => '(title_error)');
      logger.info('[SIDV-PORTAL] lookup step: after_navigate', {
        current_url: afterNavUrl,
        page_title:  afterNavTitle,
        id_type:     idType,
      });

      // ── 2. Session-expiry check ───────────────────────────────────────────
      // Expired ONLY when the URL is an auth/login path OR a password field is
      // present on the page.  Do NOT treat the NIN/BVN form page as expired
      // just because it doesn't have a password field.
      step = 'session_check';
      const isLoginUrl     = /\/(auth\/login|login)(\?|#|$)/i.test(afterNavUrl);
      const hasPasswordFld = await page.locator('input[type="password"]').count() > 0;
      const isExpired      = isLoginUrl || hasPasswordFld;

      logger.info('[SIDV-PORTAL] lookup step: session_check', {
        current_url:     afterNavUrl,
        page_title:      afterNavTitle,
        is_login_url:    isLoginUrl,
        has_password:    hasPasswordFld,
        session_expired: isExpired,
      });

      if (isExpired) {
        logger.info('[SIDV-PORTAL] lookup step: session_expired_relogin', { current_url: afterNavUrl });
        this.loggedIn = false;
        step = 'relogin';
        await this.ensureLoggedIn();
        step = 'navigate_to_verification_after_relogin';
        await page.goto(lookupUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        logger.info('[SIDV-PORTAL] lookup step: after_relogin_navigate', {
          current_url: page.url(),
          page_title:  await page.title().catch(() => '(title_error)'),
        });
      }

      // ── 3. Close alert modal if present ───────────────────────────────────
      step = 'dismiss_modal_on_form';
      const modalClosedOnForm = await this.dismissModal(page);

      // ── Page diagnostics ─────────────────────────────────────────────────
      logger.info('[SIDV-PORTAL] page_url',   { url:   page.url() });
      logger.info('[SIDV-PORTAL] page_title', { title: await page.title().catch(() => '(error)') });

      const bodyPreview = await page.evaluate(() =>
        (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400)
      ).catch(() => '(eval_error)');
      logger.info('[SIDV-PORTAL] body_text_preview', { text: bodyPreview });

      // Audit all inputs via a single DOM evaluation — captures every attribute
      // in one round-trip. Values are never read or logged.
      const inputAudit = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input')).map((el) => ({
          tag:         el.tagName.toLowerCase(),
          type:        el.type        || null,
          name:        el.name        || null,
          id:          el.id          || null,
          class:       el.className   || null,
          placeholder: el.placeholder || null,
          aria_label:  el.getAttribute('aria-label') || null,
          role:        el.getAttribute('role')       || null,
          visible:     !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          disabled:    el.disabled,
          readonly:    el.readOnly,
        }))
      ).catch(() => [] as unknown[]);
      logger.info('[SIDV-PORTAL] form_inputs_found', {
        id_type: idType,
        count:   (inputAudit as unknown[]).length,
        inputs:  inputAudit,
      });

      logger.info('[SIDV-PORTAL] form_page_loaded', { id_type: idType, current_url: page.url() });
      logger.info('[SIDV-PORTAL] alert_modal_closed', { page: 'form', was_present: modalClosedOnForm });

      // ── 4. Fill NIN / BVN ─────────────────────────────────────────────────
      step = 'fill_id_number';
      await this.fillIdentifier(page, idNumber, idType);

      // ── 5. Select slip type ───────────────────────────────────────────────
      step = 'select_slip_type';
      await this.selectSlipType(page, slipLabel);
      logger.info('[SIDV-PORTAL] slip_selected', { id_type: idType, slip_label: slipLabel });

      // ── 6. Tick consent checkbox ──────────────────────────────────────────
      step = 'tick_consent';
      await this.tickConsent(page);
      logger.info('[SIDV-PORTAL] consent_checked');

      // ── 7. Click VERIFY & GET THE INFO ────────────────────────────────────
      step = 'click_verify';
      const verifySelectors = [
        'button:has-text("VERIFY & GET THE INFO")',
        'button:has-text("Verify & Get The Info")',
        'button:has-text("Verify")',
        'input[value*="VERIFY" i]',
        'button[type="submit"]',
      ];
      const foundVerify = await this.findFirstSelector(page, verifySelectors);
      logger.info('[SIDV-PORTAL] lookup step: verify_button', { found: foundVerify !== null, selector: foundVerify });
      if (!foundVerify) throw new Error(`portal_click_no_match: verify button — tried ${verifySelectors.join(', ')}`);
      await page.locator(foundVerify).first().click();
      logger.info('[SIDV-PORTAL] verification_submitted', { id_type: idType });

      // ── 8. Wait for redirect to /user/verifications/{id} ─────────────────
      step = 'wait_for_detail_redirect';
      const detailPageUrl = await this.waitForVerificationDetailPage(page);
      logger.info('[SIDV-PORTAL] detail_page_loaded', { id_type: idType, detail_url: detailPageUrl });

      // ── 9. Close alert modal on detail page ───────────────────────────────
      step = 'dismiss_modal_on_detail';
      const modalClosedOnDetail = await this.dismissModal(page);
      logger.info('[SIDV-PORTAL] alert_modal_closed', { page: 'detail', was_present: modalClosedOnDetail });

      // ── 10. Click DOWNLOAD SLIP ───────────────────────────────────────────
      step = 'click_download_slip';
      const pdf = await this.clickDownloadSlip(page, idType);
      if (pdf) return pdf;

      // ── Fallback: /user/verifications list ────────────────────────────────
      step = 'fallback_to_verifications_list';
      logger.info('[SIDV-PORTAL] fallback_to_verifications_list', {
        id_type: idType,
        reason:  'DOWNLOAD SLIP button not found or download event not captured on detail page',
      });
      return await this.downloadFromVerificationsList(page, base, idNumber, idType, slipLabel);

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

  // ── Wait for detail page redirect ───────────────────────────────────────────

  private async waitForVerificationDetailPage(page: Page): Promise<string> {
    // After clicking Verify, the portal processes and redirects to
    // /user/verifications/{verificationId}.  Allow up to 90s for this.
    await page.waitForURL(
      (url) => {
        const p = url.pathname;
        return p.startsWith('/user/verifications/') && p.length > '/user/verifications/'.length;
      },
      { timeout: 90_000 },
    );
    return page.url();
  }

  // ── Click DOWNLOAD SLIP on detail page ─────────────────────────────────────

  private async clickDownloadSlip(page: Page, idType: PortalIdType): Promise<string | null> {
    const downloadSelectors = [
      'button:has-text("DOWNLOAD SLIP")',
      'a:has-text("DOWNLOAD SLIP")',
      'button:has-text("Download Slip")',
      'a:has-text("Download Slip")',
      'button:has-text("Download")',
      'a:has-text("Download")',
      'a[href*="download"]',
      'a[href*=".pdf"]',
    ];

    const found = await this.findFirstSelector(page, downloadSelectors);
    logger.info('[SIDV-PORTAL] download_slip_clicked', { found: found !== null, selector: found });
    if (!found) return null;

    const dlPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.locator(found).first().click();
    const dl = await dlPromise.catch(() => null);
    if (!dl) return null;

    return this.readDownload(dl, idType);
  }

  // ── Fallback: navigate to list and find matching row ────────────────────────

  private async downloadFromVerificationsList(
    page: Page,
    base: string,
    idNumber: string,
    idType: PortalIdType,
    slipLabel: string,
  ): Promise<string> {
    const listUrl = `${base}/user/verifications`;
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('table, [class*="verification"], [class*="list"]', { timeout: 30_000 }).catch(() => {});

    logger.info('[SIDV-PORTAL] fallback_to_verifications_list', {
      id_type:     idType,
      slip_label:  slipLabel,
      current_url: page.url(),
    });

    // Priority: row matching submitted ID → row matching slip type → newest row.
    const byIdSelector   = `tr:has-text("${idNumber}"), [class*="row"]:has-text("${idNumber}"), li:has-text("${idNumber}")`;
    const byTypeSelector = `tr:has-text("${slipLabel}"), [class*="row"]:has-text("${slipLabel}"), li:has-text("${slipLabel}")`;
    const firstRowSel    = 'table tbody tr:first-child, [class*="verification-item"]:first-child, [class*="list-item"]:first-child';

    const matchedById   = await page.locator(byIdSelector).count() > 0;
    const matchedByType = !matchedById && await page.locator(byTypeSelector).count() > 0;

    const targetRow = matchedById   ? page.locator(byIdSelector).first()
                    : matchedByType ? page.locator(byTypeSelector).first()
                    :                 page.locator(firstRowSel).first();

    const dlSelectors = [
      'button:has-text("DOWNLOAD SLIP")', 'a:has-text("DOWNLOAD SLIP")',
      'button:has-text("Download Slip")', 'a:has-text("Download Slip")',
      'button:has-text("Download")',      'a:has-text("Download")',
      'a[href*=".pdf"]',                  'a[href*="download"]',
      '[title*="Download" i]',
    ];

    for (const sel of dlSelectors) {
      const btn = targetRow.locator(sel).first();
      if (await btn.count() > 0) {
        const dlPromise = page.waitForEvent('download', { timeout: 30_000 });
        await btn.click();
        const dl = await dlPromise.catch(() => null);
        if (dl) return this.readDownload(dl, idType);
      }
    }

    // Last resort: page.pdf() of whatever is visible.
    const pdfBuf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuf).toString('base64');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Closes alert/welcome modal if one appears within 3 s. Returns true if dismissed. */
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
      const visible = await loc.isVisible({ timeout: 3_000 }).catch(() => false);
      if (visible) {
        await loc.click();
        await loc.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
        return true;
      }
    }
    return false;
  }

  /** Clicks the label/button/option that matches slipLabel. */
  private async selectSlipType(page: Page, slipLabel: string): Promise<void> {
    const byText = page.locator(
      `label:has-text("${slipLabel}"), button:has-text("${slipLabel}"), li:has-text("${slipLabel}")`
    ).first();
    if (await byText.count() > 0) { await byText.click(); return; }

    const selectEl = page.locator('select').first();
    if (await selectEl.count() > 0) { await selectEl.selectOption({ label: slipLabel }); return; }

    throw new Error(`portal_slip_type_not_found: "${slipLabel}"`);
  }

  /** Finds and ticks the first unchecked consent checkbox. */
  private async tickConsent(page: Page): Promise<void> {
    const selectors = [
      'input[type="checkbox"][name*="consent" i]',
      'input[type="checkbox"][id*="consent" i]',
      'label:has-text("consent") input[type="checkbox"]',
      'label:has-text("agree") input[type="checkbox"]',
      'input[type="checkbox"]',
    ];
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0) {
        if (!(await loc.isChecked().catch(() => false))) await loc.click();
        return;
      }
    }
    throw new Error('portal_consent_checkbox_not_found');
  }

  /**
   * Multi-strategy NIN/BVN fill.
   * Tries Playwright locators first, falls back to DOM eval.
   * Saves debug screenshot + HTML if nothing works.
   */
  private async fillIdentifier(page: Page, idNumber: string, idType: PortalIdType): Promise<void> {
    const strategies: Array<{ label: string; locator: () => ReturnType<Page['locator']> }> = [
      {
        label: 'getByLabel',
        locator: () => page.getByLabel(/National Identification Number|NIN|Bank Verification Number|BVN/i),
      },
      {
        label: 'getByPlaceholder',
        locator: () => page.getByPlaceholder(/11-digit|NIN|BVN|Enter/i),
      },
      {
        label: 'input_first',
        locator: () => page.locator('input').first(),
      },
    ];

    for (const { label, locator } of strategies) {
      try {
        const loc   = locator();
        const count = await loc.count().catch(() => 0);
        if (!count) {
          logger.info('[SIDV-PORTAL] fill_strategy_skip', { strategy: label, reason: 'not_found' });
          continue;
        }
        await loc.fill(idNumber);
        const filled = await loc.inputValue().catch(() => '');
        if (filled.includes(idNumber)) {
          logger.info('[SIDV-PORTAL] identifier_filled', { id_type: idType, strategy: label });
          return;
        }
        logger.info('[SIDV-PORTAL] fill_strategy_skip', { strategy: label, reason: 'value_not_set_after_fill' });
      } catch (e) {
        logger.info('[SIDV-PORTAL] fill_strategy_skip', { strategy: label, reason: (e as Error).message });
      }
    }

    // DOM eval fallback — find the first visible, enabled text-like input and
    // set its value via native event dispatch for React controlled inputs.
    logger.info('[SIDV-PORTAL] fill_dom_eval_fallback', { id_type: idType });
    const domResult = await page.evaluate((val: string) => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const target = inputs.find((el) => {
        const t = (el.type || 'text').toLowerCase();
        if (['checkbox', 'radio', 'hidden', 'password', 'submit', 'button', 'file', 'image', 'reset'].includes(t)) return false;
        if (el.disabled || el.readOnly) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!target) return { success: false, reason: 'no_eligible_input_found' };
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) nativeInputValueSetter.call(target, val);
      else target.value = val;
      target.dispatchEvent(new Event('input',  { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.dispatchEvent(new Event('blur',   { bubbles: true }));
      return { success: true, filled: target.value === val, type: target.type, name: target.name, id: target.id };
    }, idNumber);

    logger.info('[SIDV-PORTAL] fill_dom_eval_result', { id_type: idType, result: domResult });

    if ((domResult as { success: boolean; filled?: boolean }).success &&
        (domResult as { success: boolean; filled?: boolean }).filled) {
      logger.info('[SIDV-PORTAL] identifier_filled', { id_type: idType, strategy: 'dom_eval' });
      return;
    }

    // All strategies failed — save debug artifacts and throw.
    try {
      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      await page.screenshot({ path: path.join(tmpDir, 'secureidverify-form-debug.png'), fullPage: true });
      fs.writeFileSync(path.join(tmpDir, 'secureidverify-form-debug.html'), await page.content());
      logger.info('[SIDV-PORTAL] debug_artifacts_saved', { dir: tmpDir });
    } catch (saveErr) {
      logger.warn('[SIDV-PORTAL] debug_artifacts_save_failed', { error: (saveErr as Error).message });
    }

    throw new Error(`portal_fill_no_match: id field — all fill strategies exhausted for ${idType}`);
  }

  /** Returns the first selector that matches at least one element, or null. */
  private async findFirstSelector(page: Page, selectors: string[]): Promise<string | null> {
    for (const sel of selectors) {
      if (await page.locator(sel).count() > 0) return sel;
    }
    return null;
  }

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

  private async readDownload(dl: Download, idType: PortalIdType): Promise<string> {
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const buf = Buffer.concat(chunks);
    logger.info('[SIDV-PORTAL] pdf_downloaded', { id_type: idType, size_bytes: buf.length });
    return buf.toString('base64');
  }

  private timeout(reason: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(reason)), this.cfg.timeoutMs),
    );
  }
}

export const secureidverifyPortalService = new SecureIDVerifyPortalService();

logger.info('[SIDV-PORTAL-CONFIG]', {
  has_url:      !!config.secureidverifyPortal.url,
  has_username: !!config.secureidverifyPortal.username,
  has_password: !!config.secureidverifyPortal.password,
  timeout_ms:   config.secureidverifyPortal.timeoutMs,
});
