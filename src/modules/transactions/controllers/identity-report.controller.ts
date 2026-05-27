import type { Request, Response, NextFunction } from "express";
import PDFDocument from "pdfkit";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../lib/errors";
import { logger } from "../../../lib/logger";
import {
  renderNinInformationSlip,
  renderNinStandardSlip,
  renderNinPremiumSlip,
  renderBvnSlip,
  s,
  fmtDate,
} from "../pdf/slip-renderers";

const db = getDbInstance();

// Statuses considered verified — covers legacy aliases.
const SUCCESS_STATUSES = new Set(["successful", "success", "completed"]);

// ── GET /transactions/identity-verification/:reference/report ─────────────────

export async function identityReportController(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reference } = req.params;
    const userId = req.user!.id;

    const tx = await db("transactions")
      .where({ reference, user_id: userId })
      .whereIn("type", ["identity_verification"])
      .first();

    if (!tx) {
      logger.warn("report_not_found", { reference, user_id: userId });
      throw new AppError("Report not found", "NOT_FOUND", 404);
    }

    if (!SUCCESS_STATUSES.has(tx.status)) {
      logger.warn("report_not_ready", { reference, user_id: userId, status: tx.status });
      throw new AppError(
        "Report is only available for successful verifications. Check Transaction History for status.",
        "REPORT_NOT_READY",
        422,
      );
    }

    // ── Metadata extraction (layered fallbacks for legacy records) ───────────
    //
    // Source 1: metadata.report_data — unmasked fields + photo (post-deploy records)
    // Source 2: metadata.provider_response.data — masked but has name/DOB/gender
    // Source 3: metadata.execution.provider_response.data — alternate storage path
    // Source 4: metadata.provider_response directly (older integrations)
    //
    // g() merges all sources, preferring Source 1.

    const meta    = (tx.metadata ?? {}) as Record<string, unknown>;
    const rd      = (meta.report_data ?? {}) as Record<string, unknown>;
    const provResp = (meta.provider_response ?? {}) as Record<string, unknown>;
    const pd       = (provResp.data ?? {}) as Record<string, unknown>;
    const execMeta = (meta.execution ?? {}) as Record<string, unknown>;
    const execResp = (execMeta.provider_response ?? {}) as Record<string, unknown>;
    const pd2      = (execResp.data ?? {}) as Record<string, unknown>;
    const pd3      = (typeof provResp === "object" && !provResp.data) ? provResp : {};

    const g = (key: string): string =>
      s(rd[key] ?? pd[key] ?? pd2[key] ?? pd3[key]);

    const variationCode = s(meta.variation_code ?? "");
    const idTypeRaw     = s(rd.id_type);
    const idType        = idTypeRaw || (variationCode.startsWith("bvn-") ? "bvn" : "nin");

    // ── Logging ──────────────────────────────────────────────────────────────
    const dataSource =
      Object.keys(rd).length > 0   ? "report_data"      :
      Object.keys(pd).length > 0 ||
      Object.keys(pd2).length > 0  ? "provider_response" : "none";

    if (dataSource === "report_data") {
      logger.info("report_generated", { reference, variation_code: variationCode, id_type: idType, source: "report_data" });
    } else if (dataSource === "provider_response") {
      logger.info("report_restored", {
        reference, variation_code: variationCode, id_type: idType,
        source: "provider_response",
        note:   "legacy transaction — report_data absent; using masked fallback",
      });
    } else {
      logger.warn("report_missing_data", {
        reference, variation_code: variationCode,
        note: "no verification data in any metadata path; generating minimal slip",
      });
    }

    // ── Stream PDF ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="verification-${reference}.pdf"`);
    doc.pipe(res);

    if (variationCode === "nin-standard") {
      await renderNinStandardSlip(doc, g, reference);
    } else if (variationCode === "nin-premium") {
      await renderNinPremiumSlip(doc, g, tx, reference);
    } else if (variationCode.startsWith("bvn-") || idType === "bvn") {
      await renderBvnSlip(doc, g, reference);
    } else {
      // Covers nin-information, any future nin-* variants, and records where
      // variation_code was not stored (defaults to NIN information slip).
      await renderNinInformationSlip(doc, g, reference);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
}

// Re-export helpers so they're accessible for testing without re-importing
export { s as stringHelper, fmtDate as formatDate };
