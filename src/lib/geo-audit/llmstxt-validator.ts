export interface LlmsTxtValidation {
  url: string;
  exists: boolean;
  formatValid: boolean;
  hasTitle: boolean;
  hasDescription: boolean;
  hasSections: boolean;
  hasLinks: boolean;
  sectionCount: number;
  linkCount: number;
  content: string;
  issues: string[];
  suggestions: string[];
  fullVersion: { url: string; exists: boolean };
}

export async function validateLlmsTxt(url: string): Promise<LlmsTxtValidation> {
  const parsed = new URL(url);
  const base = `${parsed.protocol}//${parsed.hostname}`;
  const llmsUrl = `${base}/llms.txt`;
  const llmsFullUrl = `${base}/llms-full.txt`;

  const result: LlmsTxtValidation = {
    url: llmsUrl,
    exists: false,
    formatValid: false,
    hasTitle: false,
    hasDescription: false,
    hasSections: false,
    hasLinks: false,
    sectionCount: 0,
    linkCount: 0,
    content: "",
    issues: [],
    suggestions: [],
    fullVersion: { url: llmsFullUrl, exists: false },
  };

  try {
    const resp = await fetch(llmsUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 200) {
      result.exists = true;
      result.content = await resp.text();
      const lines = result.content.trim().split("\n");

      // Title check
      if (lines.length > 0 && lines[0].startsWith("# ")) {
        result.hasTitle = true;
      } else {
        result.issues.push("Missing title (should start with '# Site Name')");
      }

      // Description check
      result.hasDescription = lines.some((l) => l.startsWith("> "));
      if (!result.hasDescription) {
        result.issues.push("Missing description (use '> Brief description')");
      }

      // Sections check
      const sections = lines.filter((l) => l.startsWith("## "));
      result.sectionCount = sections.length;
      result.hasSections = sections.length > 0;
      if (!result.hasSections) {
        result.issues.push("No sections found (use '## Section Name')");
      }

      // Links check
      const links = result.content.match(/- \[.+\]\(.+\)/g) || [];
      result.linkCount = links.length;
      result.hasLinks = links.length > 0;
      if (!result.hasLinks) {
        result.issues.push("No page links found (use '- [Page Title](url): Description')");
      }

      result.formatValid = result.hasTitle && result.hasDescription && result.hasSections && result.hasLinks;

      if (result.linkCount < 5) result.suggestions.push("Consider adding more key pages (aim for 10-20)");
      if (result.sectionCount < 2) result.suggestions.push("Add more sections to organize content types");
      if (!result.content.toLowerCase().includes("contact"))
        result.suggestions.push("Add a Contact section with email and location");
    } else {
      result.issues.push(`llms.txt returned status ${resp.status}`);
    }
  } catch (err) {
    result.issues.push(`Error fetching llms.txt: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Check llms-full.txt
  try {
    const resp = await fetch(llmsFullUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (resp.status === 200) result.fullVersion.exists = true;
  } catch {
    // non-critical
  }

  return result;
}
