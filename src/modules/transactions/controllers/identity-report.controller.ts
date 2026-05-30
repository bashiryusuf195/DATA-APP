import type { Request, Response, NextFunction } from "express";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../lib/errors";
import { logger } from "../../../lib/logger";
import {
  renderNinInformationSlip,
  renderNinStandardSlip,
  renderNinPremiumSlip,
  renderBvnSlip,
  s,
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
    // Source 1: metadata.report_data         — unmasked fields + photo (preferred)
    // Source 2: metadata.provider_response.data — masked (name/dob/gender unmasked)
    // Source 3: metadata.execution.provider_response.data — alternate path
    // Source 4: metadata.provider_response directly — older integrations

    const meta     = (tx.metadata ?? {}) as Record<string, unknown>;
    const rd       = (meta.report_data     ?? {}) as Record<string, unknown>;
    const provResp = (meta.provider_response ?? {}) as Record<string, unknown>;
    const pd       = (provResp.data ?? {})         as Record<string, unknown>;
    const execMeta = (meta.execution       ?? {}) as Record<string, unknown>;
    const execResp = (execMeta.provider_response ?? {}) as Record<string, unknown>;
    const pd2      = (execResp.data ?? {})         as Record<string, unknown>;
    const pd3      = (typeof provResp === "object" && !provResp.data) ? provResp : {};

    // Getter: tries unmasked report_data first, then each fallback in order.
    const g = (key: string): string =>
      s(rd[key] ?? pd[key] ?? pd2[key] ?? pd3[key]);

    const variationCode = s(meta.variation_code ?? "");
    const idTypeRaw     = s(rd.id_type);
    const idType        = idTypeRaw || (variationCode.startsWith("bvn-") ? "bvn" : "nin");

    // ── Logging ──────────────────────────────────────────────────────────────
    const dataSource =
      Object.keys(rd).length  > 0 ? "report_data"       :
      Object.keys(pd).length  > 0 ||
      Object.keys(pd2).length > 0 ? "provider_response"  : "none";

    logger.info(
      dataSource === "report_data"       ? "report_generated"     :
      dataSource === "provider_response" ? "report_restored"      : "report_missing_data",
      { reference, variation_code: variationCode, id_type: idType, source: dataSource },
    );

    // ── Photo diagnostic log ─────────────────────────────────────────────────
    const photoVal = g("photo");
    logger.info("report_photo_field", {
      reference,
      in_report_data:   "photo" in rd,
      rd_photo_type:    typeof rd["photo"],
      photo_length:     photoVal.length,
      photo_prefix:     photoVal.slice(0, 40) || "(empty)",
      data_source:      dataSource,
    });

    // ── Generate PDF from template ───────────────────────────────────────────
    let pdfBuffer: Buffer;

    if (variationCode === "nin-standard") {
      pdfBuffer = await renderNinStandardSlip(g, reference);
    } else if (variationCode === "nin-premium") {
      pdfBuffer = await renderNinPremiumSlip(g, tx, reference);
    } else if (variationCode.startsWith("bvn-") || idType === "bvn") {
      pdfBuffer = await renderBvnSlip(g, reference);
    } else {
      // Covers nin-information, any future nin-* variants, and records where
      // variation_code was not stored (defaults to NIN information slip).
      pdfBuffer = await renderNinInformationSlip(g, reference);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="verification-${reference}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (err) {
    next(err);
  }
}
