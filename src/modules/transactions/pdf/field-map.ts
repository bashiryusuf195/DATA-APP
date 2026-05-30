/**
 * Centralized PDF field coordinate map.
 *
 * All coordinates are expressed as fractions [0.0–1.0] of the page dimensions,
 * measured in image-space (origin = top-left, y increases downward).
 *
 * At render time they are converted to PDF-space (origin = bottom-left):
 *   pdf_x      = field.x * W
 *   pdf_y_top  = H - field.y * H
 *   pdf_y_bot  = H - (field.y + field.h) * H  (where text bottom sits)
 *   pdf_width  = field.w * W
 *   pdf_height = field.h * H
 *
 * Calibration: set PDF_COORD_DEBUG=true in your environment to draw red
 * rectangles around every field area and blue rectangles around photo/QR zones.
 */

// ── Field types ───────────────────────────────────────────────────────────────

export interface FieldDef {
  /** Left edge as fraction of page width (0..1) */
  x: number;
  /** Top edge as fraction of page height, image-space (0..1) */
  y: number;
  /** Width as fraction of page width (0..1) */
  w: number;
  /** Height as fraction of page height (0..1) */
  h: number;
  /** Font size in pt (default: 9) */
  size?: number;
  /** Use HelveticaBold instead of Helvetica */
  bold?: boolean;
  /** Wrap text to multiple lines within the box */
  wrap?: boolean;
  /** Horizontal alignment (default: 'left') */
  align?: "left" | "center";
  /**
   * Override text color as [r, g, b] floats 0..1.
   * Omit for default black. Use [1, 1, 1] for fields on dark backgrounds.
   */
  color?: [number, number, number];
}

/** Rectangular area for the passport photo */
export interface PhotoDef {
  x: number; y: number; w: number; h: number;
}

/**
 * Square zone for the QR code.
 * Physical size in pt = qr.w * pageWidth (same for height — always square).
 * PDF bottom-left y = H - qr.y * H - (qr.w * W)
 */
export interface QrDef {
  x: number;  // left edge, 0..1
  y: number;  // top edge in image-space, 0..1
  w: number;  // size fraction of W; height = w * W pt (square)
}

export interface TemplateMap {
  /** Canonical page width in pt */
  W: number;
  /** Canonical page height in pt */
  H: number;
  /** PNG filename under src/modules/transactions/pdf/templates/ */
  templateFile: string;
  /** Passport photo overlay zone (optional) */
  photo?: PhotoDef;
  /** QR code overlay zone (optional) */
  qr?: QrDef;
  /**
   * Named field areas.
   * Keys beginning with _ are internal (e.g. _reference for the footer line).
   * All other keys correspond to report_data field names passed to the renderer.
   */
  fields: Record<string, FieldDef>;
}

// ── Coordinate map ────────────────────────────────────────────────────────────
//
// Coordinates were derived from the programmatic layout that matches each PNG.
// Use PDF_COORD_DEBUG=true to visually verify and adjust fractions as needed.
//
// The percentages below were calculated as:
//   x_pct = pdf_x / W
//   y_pct = (H - pdf_y_top) / H   where pdf_y_top = pdf_baseline + font_size
//   h_pct = box_height / H

export const FIELD_MAP: Record<string, TemplateMap> = {

  // ── NIN Information Slip ─────────────────────────────────────────────────
  // Page: 612 × 1008 pt  (US Legal landscape)
  nin_information: {
    W: 612,
    H: 1008,
    templateFile: "NIN Information.png",

    // Photo box: right column, blank area above disclaimer text (disclaimer starts y≈0.181)
    photo: { x: 0.689, y: 0.067, w: 0.261, h: 0.112 },

    fields: {
      // ── Personal info rows (value column; labels are on the template) ───
      first_name:      { x: 0.291, y: 0.082, w: 0.375, h: 0.025, size: 10 },
      middle_name:     { x: 0.291, y: 0.112, w: 0.375, h: 0.025, size: 10 },
      last_name:       { x: 0.291, y: 0.142, w: 0.375, h: 0.025, size: 10 },
      date_of_birth:   { x: 0.291, y: 0.172, w: 0.375, h: 0.025, size: 10 },
      gender:          { x: 0.291, y: 0.202, w: 0.375, h: 0.025, size: 10 },

      // ── NIN number — white background, black text ──────────────────────
      id_number:       { x: 0.069, y: 0.267, w: 0.863, h: 0.048, size: 20, bold: true },

      // ── Details grid — left column values ──────────────────────────────
      tracking_id:     { x: 0.270, y: 0.352, w: 0.258, h: 0.022, size: 9 },
      residence_state: { x: 0.270, y: 0.375, w: 0.258, h: 0.022, size: 9 },
      birth_state:     { x: 0.270, y: 0.398, w: 0.258, h: 0.022, size: 9 },

      // ── Details grid — right column values ─────────────────────────────
      phone:           { x: 0.678, y: 0.352, w: 0.253, h: 0.022, size: 9 },
      residence_lga:   { x: 0.678, y: 0.375, w: 0.253, h: 0.022, size: 9 },
      birth_lga:       { x: 0.678, y: 0.398, w: 0.253, h: 0.022, size: 9 },

      // ── Address (wraps to 2 lines) ──────────────────────────────────────
      address:         { x: 0.196, y: 0.421, w: 0.720, h: 0.040, size: 9, wrap: true },

      // ── Footer reference line ───────────────────────────────────────────
      _reference:      { x: 0.065, y: 0.976, w: 0.870, h: 0.018, size: 7 },
    },
  },

  // ── NIN Standard Slip (Improved NIN Slip) ────────────────────────────────
  // Page: 612 × 1008 pt  (US Legal landscape)
  nin_standard: {
    W: 612,
    H: 1008,
    templateFile: "NIN Standard.png",

    // Photo inside card panel (left section)
    photo: { x: 0.108, y: 0.226, w: 0.196, h: 0.159 },

    // QR code in upper-right of card content area
    qr: { x: 0.745, y: 0.214, w: 0.147 },

    fields: {
      // ── Card data fields on near-white card background ─────────────────
      last_name:     { x: 0.327, y: 0.264, w: 0.595, h: 0.025, size: 11, bold: true },
      // given_names = first_name + middle_name, combined by the wrapper
      given_names:   { x: 0.327, y: 0.310, w: 0.595, h: 0.040, size: 11, bold: true, wrap: true },
      date_of_birth: { x: 0.327, y: 0.353, w: 0.370, h: 0.025, size: 11, bold: true },

      // ── NIN — large number on near-white card area (black text) ────────
      id_number:     { x: 0.059, y: 0.404, w: 0.882, h: 0.042, size: 22, bold: true },

      // ── Footer / reference ─────────────────────────────────────────────
      _reference:    { x: 0.059, y: 0.976, w: 0.882, h: 0.018, size: 7 },
    },
  },

  // ── NIN Premium (Digital NIN Slip) ───────────────────────────────────────
  // Page: 595 × 841.9 pt  (A4)
  nin_premium: {
    W: 595,
    H: 841.9,
    templateFile: "NIN Premium.png",

    // Photo inside dark green card panel (left section)
    photo: { x: 0.084, y: 0.157, w: 0.168, h: 0.154 },

    // QR in top-right of card panel
    qr: { x: 0.785, y: 0.128, w: 0.134 },

    fields: {
      // ── Card panel fields on dark green background — white text ────────
      last_name:     { x: 0.279, y: 0.140, w: 0.442, h: 0.025, size: 10, bold: true,  color: [1, 1, 1] },
      // given_names = first_name + middle_name, combined by the wrapper
      given_names:   { x: 0.279, y: 0.190, w: 0.442, h: 0.040, size: 10, bold: true,  wrap: true, color: [1, 1, 1] },

      // DOB / gender / issue date on same row
      date_of_birth: { x: 0.279, y: 0.248, w: 0.180, h: 0.022, size: 8,  bold: true,  color: [1, 1, 1] },
      gender:        { x: 0.447, y: 0.248, w: 0.140, h: 0.022, size: 8,  bold: true,  color: [1, 1, 1] },
      issued_date:   { x: 0.578, y: 0.248, w: 0.180, h: 0.022, size: 8,  bold: true,  color: [1, 1, 1] },

      // ── NIN across full panel width on dark green background ───────────
      id_number:     { x: 0.084, y: 0.270, w: 0.824, h: 0.045, size: 20, bold: true,  color: [1, 1, 1] },

      // ── Footer on white page background ────────────────────────────────
      _reference:    { x: 0.061, y: 0.976, w: 0.882, h: 0.018, size: 7 },
    },
  },

  // ── BVN Basic Slip ───────────────────────────────────────────────────────
  // Page: 595 × 841.9 pt  (A4)
  bvn_basic: {
    W: 595,
    H: 841.9,
    templateFile: "BVN.png",

    // Photo box: center column (PASSPORT PHOTO placeholder)
    photo: { x: 0.405, y: 0.226, w: 0.140, h: 0.201 },

    fields: {
      // ── Personal info rows (value column) ─────────────────────────────
      first_name:             { x: 0.286, y: 0.229, w: 0.412, h: 0.025, size: 10 },
      middle_name:            { x: 0.286, y: 0.273, w: 0.412, h: 0.025, size: 10 },
      last_name:              { x: 0.286, y: 0.320, w: 0.412, h: 0.025, size: 10 },
      date_of_birth:          { x: 0.286, y: 0.367, w: 0.412, h: 0.025, size: 10 },
      gender:                 { x: 0.286, y: 0.414, w: 0.412, h: 0.025, size: 10 },
      marital_status:         { x: 0.286, y: 0.461, w: 0.412, h: 0.025, size: 10 },

      // ── BVN number — light background, black text ──────────────────────
      bvn:                    { x: 0.071, y: 0.468, w: 0.859, h: 0.057, size: 20, bold: true },

      // ── Details grid ────────────────────────────────────────────────────
      phone:                  { x: 0.256, y: 0.525, w: 0.315, h: 0.022, size: 9 },
      nin:                    { x: 0.571, y: 0.525, w: 0.379, h: 0.022, size: 9 },
      enrollment_institution: { x: 0.261, y: 0.589, w: 0.310, h: 0.022, size: 9 },
      enrollment_branch:      { x: 0.647, y: 0.589, w: 0.303, h: 0.022, size: 9 },
      origin_state:           { x: 0.261, y: 0.683, w: 0.310, h: 0.022, size: 9 },
      origin_lga:             { x: 0.618, y: 0.683, w: 0.332, h: 0.022, size: 9 },
      residence_state:        { x: 0.274, y: 0.757, w: 0.297, h: 0.022, size: 9 },
      residence_lga:          { x: 0.618, y: 0.757, w: 0.332, h: 0.022, size: 9 },

      // ── Address (wraps to 2 lines) ──────────────────────────────────────
      address:                { x: 0.202, y: 0.831, w: 0.748, h: 0.040, size: 9, wrap: true },

      // ── Footer ─────────────────────────────────────────────────────────
      _reference:             { x: 0.067, y: 0.976, w: 0.882, h: 0.018, size: 7 },
    },
  },
} as const;
