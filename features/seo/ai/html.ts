/**
 * Minimal HTML inspection helpers. Owner: Pranay.
 *
 * These are regular expressions over raw markup, not a parser, and the checks
 * built on them are written to survive that: every one of them can answer
 * "found" or "not found", and callers treat "not found" as *not checked* rather
 * than as a failure wherever a real parser could plausibly disagree.
 *
 * No dependency is added for this on purpose. A DOM parser in a React Native
 * bundle is a large amount of weight for a handful of substring questions, and
 * the honest reporting model means a false negative costs an `uncheckedAreas`
 * entry rather than a wrong accusation.
 */

/** One fetch of one page, plus the robots.txt that governs it. */
export interface PageSnapshot {
  readonly requestedUrl: string;
  /** After redirects. Differs from `requestedUrl` when the site redirected. */
  readonly finalUrl: string;
  readonly httpStatus: number;
  /** Response headers with lower-cased names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly html: string;
  /**
   * The site's robots.txt.
   *
   * `null` means we could not read it — which is NOT the same as an empty
   * robots.txt (`''`), which means the site permits everything. Checks that
   * depend on it report "not checked" when this is null.
   */
  readonly robotsTxt: string | null;
  readonly fetchedAt: string;
}

export interface Heading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
}

/** Lower-case every header name so lookups are predictable. */
export function normaliseHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name.toLowerCase()] = value;
  }
  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'");
}

/** Remove `<script>` and `<style>` blocks, then all tags, then collapse space. */
export function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return decodeEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Total bytes of `<script>` content, used for the "needs JavaScript" signal. */
export function scriptContentLength(html: string): number {
  let total = 0;
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    total += (match[1] ?? '').length;
    match = pattern.exec(html);
  }
  return total;
}

/** `content` values of every `<meta name="robots">` / `<meta name="googlebot">`. */
export function metaRobotsDirectives(html: string): string[] {
  const directives: string[] = [];
  const pattern = /<meta\b[^>]*>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const tag = match[0];
    const nameMatch = /\bname\s*=\s*["']?([a-z-]+)["']?/i.exec(tag);
    const name = (nameMatch?.[1] ?? '').toLowerCase();
    if (name === 'robots' || name === 'googlebot' || name.endsWith('bot')) {
      const contentMatch = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag);
      const content = contentMatch?.[1];
      if (typeof content === 'string') {
        for (const part of content.split(',')) {
          const token = part.trim().toLowerCase();
          if (token.length > 0) directives.push(token);
        }
      }
    }
    match = pattern.exec(html);
  }
  return directives;
}

/** Same directives, taken from the `X-Robots-Tag` response header. */
export function headerRobotsDirectives(headers: Readonly<Record<string, string>>): string[] {
  const raw = normaliseHeaders(headers)['x-robots-tag'];
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

/** Raw bodies of every `<script type="application/ld+json">` block. */
export function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const body = (match[1] ?? '').trim();
    if (body.length > 0) blocks.push(body);
    match = pattern.exec(html);
  }
  return blocks;
}

export function headings(html: string): Heading[] {
  const found: Heading[] = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const levelText = match[1] ?? '1';
    const level = Number(levelText);
    if (level >= 1 && level <= 6) {
      found.push({
        level: level as Heading['level'],
        text: extractVisibleText(match[2] ?? ''),
      });
    }
    match = pattern.exec(html);
  }
  return found;
}

export function anchorHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const href = match[1];
    if (typeof href === 'string') hrefs.push(href.trim());
    match = pattern.exec(html);
  }
  return hrefs;
}

export function hasTelLink(html: string): boolean {
  return anchorHrefs(html).some((href) => href.toLowerCase().startsWith('tel:'));
}

/** Paragraph-ish blocks, used to measure passage length for readability. */
export function paragraphTexts(html: string): string[] {
  const paragraphs: string[] = [];
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const text = extractVisibleText(match[1] ?? '');
    if (text.length > 0) paragraphs.push(text);
    match = pattern.exec(html);
  }
  return paragraphs;
}

export function hasListOrTable(html: string): boolean {
  return /<(ul|ol|table)\b/i.test(html);
}

/**
 * True when the body looks like an empty single-page-app shell: a mount node
 * with effectively nothing inside it. This is a signal, not proof — a page can
 * be server-rendered into a differently named element.
 */
export function looksLikeEmptyAppShell(html: string): boolean {
  const pattern = /<(div|main)\b[^>]*\bid\s*=\s*["'](root|app|__next|___gatsby)["'][^>]*>([\s\S]*?)<\/\1>/i;
  const match = pattern.exec(html);
  if (match === null) return false;
  return extractVisibleText(match[3] ?? '').length < 40;
}

export function pageTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match === null) return null;
  const text = extractVisibleText(match[1] ?? '');
  return text.length > 0 ? text : null;
}

/**
 * Indian phone numbers written as visible text.
 *
 * Deliberately loose: it answers "is there a phone number on this page at all",
 * and a false positive costs nothing while a false negative only downgrades the
 * check to "not checked".
 */
export function containsPhoneText(text: string): boolean {
  const compact = text.replace(/[ ]/g, ' ');
  return /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(compact) || /\b0\d{2,4}[\s-]?\d{6,8}\b/.test(compact);
}
