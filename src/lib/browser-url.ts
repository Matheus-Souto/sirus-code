/** Turns typed address-bar text into a loadable URL or a Google search. */
export function normalizeBrowserAddressInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^about:blank$/i.test(value)) return value;
  const hostLike =
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(value) ||
    /^[^\s/?#]+\.[^\s/?#]+/.test(value);
  if (hostLike && !/\s/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

/** Address-bar display value; blank documents render empty. */
export function browserAddressDisplayValue(url: string): string {
  return url === "about:blank" ? "" : url;
}

/**
 * Whether a prompt asks about the page open in the session's browser, so a screenshot of it
 * goes with the turn. Only explicit mentions count: "page" or "print" alone are everyday words
 * in code ("page component", "print statement").
 */
export function promptWantsBrowserCapture(prompt: string): boolean {
  return /\b(browser|navegador|screenshot)\b|captura de tela|\btir[ae] (um )?print\b|\bprint d[aeo] (tela|p[áa]gina|site)|\b(this|current) (web )?page\b|\b[nd]?(ess?a|esta) p[áa]gina|\bveja (o|a) (site|p[áa]gina)/i.test(prompt);
}
