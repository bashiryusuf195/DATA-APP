import sanitizeHtml from "sanitize-html";
import { getDbInstance } from "../../../db/knex";
import { AppError } from "../../../shared/errors/AppError";

const db = getDbInstance();

// ── In-memory cache (TTL: 5 min) ─────────────────────────────────────────────
interface CacheEntry { data: SitePage; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(slug: string): SitePage | null {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(slug); return null; }
  return entry.data;
}

function cacheSet(slug: string, page: SitePage): void {
  cache.set(slug, { data: page, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidate(slug: string): void {
  cache.delete(slug);
}

// ── HTML sanitization ─────────────────────────────────────────────────────────
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span",
];

const ALLOWED_ATTRS: sanitizeHtml.IOptions["allowedAttributes"] = {
  a:   ["href", "title", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  "*": ["class"],
};

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags:       ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes:    ["https", "http", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SitePage {
  slug:         string;
  title:        string;
  content:      string;
  is_published: boolean;
  version:      number;
  created_by:   string | null;
  updated_by:   string | null;
  created_at:   Date;
  updated_at:   Date;
}

export interface UpsertPageInput {
  title:        string;
  content:      string;
  is_published?: boolean;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listPages(): Promise<SitePage[]> {
  return db("site_pages").orderBy("slug", "asc") as Promise<SitePage[]>;
}

export async function getPage(slug: string): Promise<SitePage> {
  const row = await db("site_pages").where({ slug }).first();
  if (!row) throw new AppError(404, "NOT_FOUND", `Page '${slug}' not found`);
  return row as SitePage;
}

export async function getPublishedPage(slug: string): Promise<SitePage> {
  const cached = cacheGet(slug);
  if (cached) return cached;

  const row = await db("site_pages").where({ slug, is_published: true }).first();
  if (!row) throw new AppError(404, "NOT_FOUND", `Page '${slug}' not found`);
  const page = row as SitePage;
  cacheSet(slug, page);
  return page;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function upsertPage(
  slug:      string,
  input:     UpsertPageInput,
  userId:    string,
): Promise<SitePage> {
  const sanitized = sanitizeContent(input.content);
  const now       = new Date();

  const existing = await db("site_pages").where({ slug }).first();

  if (existing) {
    const [row] = await db("site_pages")
      .where({ slug })
      .update({
        title:        input.title,
        content:      sanitized,
        is_published: input.is_published ?? existing.is_published,
        version:      existing.version + 1,
        updated_by:   userId,
        updated_at:   now,
      })
      .returning("*");
    cacheInvalidate(slug);
    return row as SitePage;
  }

  const [row] = await db("site_pages")
    .insert({
      slug,
      title:        input.title,
      content:      sanitized,
      is_published: input.is_published ?? false,
      version:      1,
      created_by:   userId,
      updated_by:   userId,
      created_at:   now,
      updated_at:   now,
    })
    .returning("*");
  cacheInvalidate(slug);
  return row as SitePage;
}

export async function setPublished(
  slug:      string,
  published: boolean,
  userId:    string,
): Promise<SitePage> {
  const [row] = await db("site_pages")
    .where({ slug })
    .update({ is_published: published, updated_by: userId, updated_at: new Date() })
    .returning("*");
  if (!row) throw new AppError(404, "NOT_FOUND", `Page '${slug}' not found`);
  cacheInvalidate(slug);
  return row as SitePage;
}

export async function deletePage(slug: string): Promise<void> {
  const deleted = await db("site_pages").where({ slug }).delete();
  if (!deleted) throw new AppError(404, "NOT_FOUND", `Page '${slug}' not found`);
  cacheInvalidate(slug);
}
