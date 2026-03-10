import { Document, Packer, Paragraph, Table } from "docx";
import type { GrowthReportContent } from "./schema";
import { PAGE_WIDTH, PAGE_MARGIN, numbering, sectionH, pageBreak } from "./styles";
import { coverPage, keyMetricCards, executiveSummary } from "./sections/cover";
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

export async function buildGrowthReportDocx(content: GrowthReportContent): Promise<Buffer> {
  const ch: (Paragraph | Table)[] = [];

  ch.push(...coverPage(content));
  ch.push(pageBreak(), ...keyMetricCards(content));
  ch.push(pageBreak(), sectionH("Executive Summary"), ...executiveSummary(content));
  ch.push(...trafficSection(content));
  ch.push(...domainAuthoritySection(content));
  ch.push(...siteAuditSection(content));
  ch.push(...competitiveSection(content));
  ch.push(...contentAuditSection(content));
  ch.push(...linkedinAuditSection(content));
  ch.push(...socialSeoSection(content));
  ch.push(...aiVisibilitySection(content));
  ch.push(...entitySeoSection(content));
  ch.push(...linkedinStrategySection(content));
  ch.push(...masterStrategySection(content));
  ch.push(...measurementSection(content));
  ch.push(...redditSection(content));
  ch.push(...caseStudiesSection(content));
  ch.push(...sowSection(content));
  ch.push(...pricingSection(content));
  ch.push(...signOffSection());

  const doc = new Document({
    numbering: numbering(),
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: 16838 },
            margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
          },
        },
        children: ch,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export type { GrowthReportContent } from "./schema";
