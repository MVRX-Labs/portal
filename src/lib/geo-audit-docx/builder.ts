import { Document, Packer, Paragraph, Table, Header, Footer, AlignmentType } from "docx";
import type { GeoAuditContent } from "./schema";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  COVER_MARGIN,
  BODY_MARGIN_TB,
  BODY_MARGIN_LR,
  FONT,
  SZ,
  C,
  numbering,
  sectionH,
  tr,
} from "./styles";
import {
  coverPage,
  staticToc,
  executiveSummary,
  scoreBreakdown,
  criticalIssues,
  categorySection,
  quickWins,
  actionPlan,
  signOff,
} from "./sections";

function headerContent(domain: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          tr("MVRX LABS", { bold: true, size: SZ.headerFooter, color: C.brand }),
          tr("    |    ", { size: SZ.headerFooter, color: C.gray }),
          tr(`GEO Audit - ${domain}`, { size: SZ.headerFooter, color: C.gray }),
        ],
      }),
    ],
  });
}

function footerContent(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [tr("Confidential - MVRX Labs", { size: SZ.headerFooter, color: C.gray })],
      }),
    ],
  });
}

export async function buildGeoAuditDocx(content: GeoAuditContent): Promise<Buffer> {
  const cover = coverPage(content);

  const body: (Paragraph | Table)[] = [];

  // Static TOC (works in Google Docs unlike auto-generated TOC fields)
  body.push(...staticToc());

  // Executive Summary — sectionH has pageBreakBefore
  body.push(sectionH("Executive Summary"), ...executiveSummary(content));

  // Score Breakdown — own page
  body.push(sectionH("Score Breakdown"), ...scoreBreakdown(content));

  // Critical Issues — own page
  body.push(sectionH("Critical Issues"), ...criticalIssues(content));

  // Each category gets its own page via sectionH
  const keys = Object.keys(content.scores) as (keyof typeof content.scores)[];
  for (const key of keys) {
    body.push(...categorySection(key, content.scores[key]));
  }

  // Quick Wins — own page
  body.push(sectionH("Quick Wins"), ...quickWins(content));

  // 30-Day Action Plan — own page
  body.push(sectionH("30-Day Action Plan"), ...actionPlan(content));

  // Sign off
  body.push(...signOff());

  const hostname = (() => {
    try {
      const url = content.url.startsWith("http") ? content.url : `https://${content.url}`;
      return new URL(url).hostname;
    } catch {
      return content.url;
    }
  })();

  const doc = new Document({
    numbering: numbering(),
    styles: {
      default: {
        heading1: {
          run: { font: FONT, size: SZ.sectionH, color: C.brand, bold: true },
          paragraph: { spacing: { before: 100, after: 200 } },
        },
        heading2: {
          run: { font: FONT, size: SZ.subH, color: C.dark, bold: true },
          paragraph: { spacing: { before: 300, after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: COVER_MARGIN, right: COVER_MARGIN, bottom: COVER_MARGIN, left: COVER_MARGIN },
          },
        },
        children: cover,
      },
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: BODY_MARGIN_TB, right: BODY_MARGIN_LR, bottom: BODY_MARGIN_TB, left: BODY_MARGIN_LR },
          },
        },
        headers: { default: headerContent(hostname) },
        footers: { default: footerContent() },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export type { GeoAuditContent } from "./schema";
