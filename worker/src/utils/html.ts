/**
 * Extract readable plain text from an HTML string.
 * Strips scripts, styles, navigation, and other non-content elements.
 * Returns the best-effort visible text content.
 */
export function extractTextFromHtml(html: string): string {
  // Remove script and style blocks entirely (including their content)
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Replace block-level tags with newlines to preserve paragraph structure
  cleaned = cleaned
    .replace(/<\/?(p|div|section|article|main|header|footer|nav|aside|h[1-6]|li|tr|br)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");

  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#\d+;/g, " ");

  // Normalize whitespace
  cleaned = cleaned
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/** Try to extract a <title> from an HTML document. */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}
