import { Document, Packer, Paragraph, Table, Header, Footer, TableOfContents, AlignmentType } from "docx";
import type { GrowthReportContent } from "./schema";
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
  pageBreak,
  tr,
} from "./styles";
import { coverPage, executiveSummary } from "./sections/cover";
import {
  trafficSection,
  domainAuthoritySection,
  siteAuditSection,
  competitiveSection,
  contentAuditSection,
} from "./sections/data-analysis";
import {
  linkedinAuditSection,
  socialSeoSection,
  aiVisibilitySection,
  entitySeoSection,
  redditSection,
} from "./sections/social";
import { linkedinStrategySection, masterStrategySection, measurementSection } from "./sections/strategy";
import { caseStudiesSection, sowSection, pricingSection, signOffSection } from "./sections/commercial";

function headerContent(domain: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          tr("MVRX LABS", { bold: true, size: SZ.headerFooter, color: C.brand }),
          tr("    |    ", { size: SZ.headerFooter, color: C.gray }),
          tr(`Complete SEO & Growth Strategy - ${domain}`, { size: SZ.headerFooter, color: C.gray }),
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

export async function buildGrowthReportDocx(content: GrowthReportContent): Promise<Buffer> {
  // --- Cover page children (Section 0) ---
  const coverChildren = coverPage(content);

  // --- Body children (Section 1) ---
  const body: (Paragraph | Table)[] = [];

  // Table of Contents
  body.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [tr("Contents", { bold: true, size: SZ.sectionH, color: C.brand })],
    })
  );
  body.push(
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-2",
    })
  );

  // Executive Summary (includes KPI cards) — sectionH has pageBreakBefore
  body.push(sectionH("Executive Summary"), ...executiveSummary(content));

  // Data analysis sections — each sectionH has pageBreakBefore built in
  body.push(...trafficSection(content));
  body.push(...domainAuthoritySection(content));
  body.push(...siteAuditSection(content));
  body.push(...competitiveSection(content));
  body.push(...contentAuditSection(content));

  // Social & platform sections
  body.push(...linkedinAuditSection(content));
  body.push(...socialSeoSection(content));
  body.push(...aiVisibilitySection(content));
  body.push(...entitySeoSection(content));

  // Strategy sections
  body.push(...linkedinStrategySection(content));
  body.push(...masterStrategySection(content));
  body.push(...measurementSection(content));

  // Optional sections
  body.push(...redditSection(content));

  // Commercial sections
  body.push(...caseStudiesSection(content));
  body.push(...sowSection(content));
  body.push(...pricingSection(content));
  body.push(...signOffSection());

  // Extract domain for header
  const hostname = (() => {
    try {
      const url = content.websiteUrl.startsWith("http") ? content.websiteUrl : `https://${content.websiteUrl}`;
      return new URL(url).hostname;
    } catch {
      return content.websiteUrl;
    }
  })();

  const doc = new Document({
    numbering: numbering(),
    features: { updateFields: true },
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
      // Section 0: Cover page (1" margins, no header/footer)
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: COVER_MARGIN, right: COVER_MARGIN, bottom: COVER_MARGIN, left: COVER_MARGIN },
          },
        },
        children: coverChildren,
      },
      // Section 1: Body (0.83"/0.76" margins, header + footer)
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: BODY_MARGIN_TB,
              right: BODY_MARGIN_LR,
              bottom: BODY_MARGIN_TB,
              left: BODY_MARGIN_LR,
            },
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

export type { GrowthReportContent } from "./schema";
