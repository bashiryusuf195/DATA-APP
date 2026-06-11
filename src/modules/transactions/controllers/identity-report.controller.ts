import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
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
import { FIELD_MAP } from "../pdf/field-map";

const db = getDbInstance();

// Computed once at module load — stable across requests in the same process.
const FIELD_MAP_HASH = createHash('sha256')
  .update(JSON.stringify(FIELD_MAP))
  .digest('hex')
  .slice(0, 16);

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
    // Guards against "[object Object]" strings that may have been stored by an
    // older version of the normalizer before the object-aware str() fix.
    const g = (key: string): string => {
      const val = s(rd[key] ?? pd[key] ?? pd2[key] ?? pd3[key]);
      return val === "[object Object]" ? "" : val;
    };

    const variationCode = s(meta.variation_code ?? "");
    const idTypeRaw     = s(rd.id_type);
    const idType        = idTypeRaw || (variationCode.startsWith("bvn-") ? "bvn" : "nin");

    // ── [REPORT-REQUEST] ─────────────────────────────────────────────────────
    console.log("[REPORT-REQUEST]", JSON.stringify({
      reference,
      tx_id:                  tx.id,
      created_at:             tx.created_at,
      status:                 tx.status,
      variation_code:         variationCode,
      id_type:                idType,
      field_map_hash:         FIELD_MAP_HASH,
      report_data_keys:       Object.keys(rd),
      photo_exists:           "photo" in rd && !!rd["photo"],
      photo_length:           typeof rd["photo"] === "string" ? (rd["photo"] as string).length : 0,
      provider_reference:     s(meta.provider_reference ?? "") || null,
      has_raw_response:       "raw_response" in meta,
      has_provider_response:  Object.keys(provResp).length > 0,
      data_source_preview:    Object.keys(rd).length > 0
        ? "report_data"
        : Object.keys(pd).length > 0 ? "provider_response.data" : "none",
    }, null, 2));

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

    // ── [PHOTO-AFTER-DB] point 4 ────────────────────────────────────────────
    {
      const rdPhoto = rd["photo"];
      console.log("[PHOTO-AFTER-DB]", JSON.stringify({
        report_data_exists: Object.keys(rd).length > 0,
        report_data_keys:   Object.keys(rd),
        photo_exists:       "photo" in rd,
        photo_type:         typeof rdPhoto,
        photo_length:       typeof rdPhoto === "string" ? rdPhoto.length : 0,
        photo_prefix:       typeof rdPhoto === "string" ? rdPhoto.slice(0, 100) : null,
      }, null, 2));
    }

    // ── Serve portal PDF if available (highest priority) ────────────────────
    // When the portal automation downloaded an official PDF slip, serve it
    // directly rather than rendering from the template.
    const portalPdfData = typeof rd["portal_pdf_data"] === "string"
      ? rd["portal_pdf_data"] as string
      : null;

    if (portalPdfData) {
      logger.info("report_served_portal_pdf", { reference });
      const pdfBytes = Buffer.from(portalPdfData, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="verification-${reference}.pdf"`);
      res.setHeader("Content-Length", pdfBytes.length);
      res.end(pdfBytes);
      return;
    }

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
