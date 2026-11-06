const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escape text for omnibox suggestion descriptions (parsed as XML by Chrome). */
export function escapeXml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}
