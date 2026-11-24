export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a case-insensitive regex matching any whitespace-separated query term. */
export function buildRegexFromQuery(query: string): RegExp | null {
  const source = query.trim().split(/\s+/).map(escapeRegExp).join('|');
  return source ? new RegExp(source, 'gi') : null;
}
