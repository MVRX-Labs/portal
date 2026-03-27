import { Document, Packer } from "docx";
import type { TwitterAuditContent } from "../audit-schema";
import { PAGE_WIDTH, PAGE_HEIGHT, PAGE_MARGIN, FONT, C, S, numbering } from "./styles";
import { coverPage, executiveSummarySection, scorecardSection, contentSections, signOff } from "./sections";
import { Paragraph, Table, PageBreak } from "docx";

export async function buildTwitterAuditDocx(content: TwitterAuditContent): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(...coverPage(content));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(...executiveSummarySection(content));
  children.push(...scorecardSection(content));
  children.push(...contentSections(content));
  children.push(...signOff());

  const doc = new Document({
    numbering: numbering(),
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: FONT,
            size: S.sectionH,
            bold: true,
            color: C.darkNavy,
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: FONT,
            size: S.subH,
            bold: true,
            color: C.brand,
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
