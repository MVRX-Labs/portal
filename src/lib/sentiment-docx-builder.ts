import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ShadingType,
  BorderStyle,
  PageBreak,
  LevelFormat,
  VerticalAlign,
  TableLayoutType,
  ExternalHyperlink,
} from "docx";

const FONT = "Arial";

const C = {
  brandBlue: "4A6CF7",
  darkNavy: "1A1A2E",
  body: "444444",
  meta: "888888",
  white: "FFFFFF",
  green: "2ECC71",
  orange: "F39C12",
  red: "E74C3C",
  tableBorder: "DDDDDD",
} as const;

const S = {
  brand: 40,
  docTitle: 32,
  productName: 36,
  company: 24,
  meta: 20,
  sectionH: 28,
  subH: 22,
  body: 20,
  tableCell: 19,
  scoreLabel: 26,
  scoreValue: 28,
  signoffBrand: 28,
  signoffTag: 22,
  signoffSmall: 16,
} as const;

const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1200;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

const BULLET_REF = "sentiment-bullets";

function tr(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; color?: string; break?: number }
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? S.body,
    color: opts?.color ?? C.body,
    bold: opts?.bold,
    italics: opts?.italics,
    break: opts?.break,
  });
}

function emptyPara(): Paragraph {
  return new Paragraph({ children: [] });
}

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  left: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
  right: { style: BorderStyle.SINGLE, size: 1, color: C.tableBorder },
};

function sentimentColor(score: number): string {
  if (score >= 7) return C.green;
  if (score >= 5) return C.orange;
  return C.red;
}

function sentimentLabel(sentiment: string): string {
  if (sentiment === "positive") return "Positive";
  if (sentiment === "negative") return "Negative";
  return "Mixed";
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 400, after: 120 },
    children: [tr(text, { bold: true, size: S.sectionH, color: C.darkNavy })],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    children: [tr(text, { bold: true, size: S.subH, color: C.brandBlue })],
  });
}

function bodyPara(text: string, opts?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120 },
    children: [tr(text, opts)],
  });
}

function bulletItem(text: string, opts?: { bold?: boolean }): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_REF, level: 0 },
    spacing: { after: 60 },
    children: [tr(text, { bold: opts?.bold })],
  });
}

function labeledPara(label: string, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [tr(label + " ", { bold: true }), tr(text)],
  });
}

function colWidth(pct: number): { size: number; type: typeof WidthType.DXA } {
  return { size: Math.round((CONTENT_WIDTH * pct) / 100), type: WidthType.DXA };
}

function headerCell(text: string, widthPct?: number): TableCell {
  return new TableCell({
    shading: { fill: C.brandBlue, type: ShadingType.CLEAR, color: "auto" },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(widthPct ? { width: colWidth(widthPct) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: true, size: S.tableCell, color: C.white })],
      }),
    ],
  });
}

function bodyCell(text: string, opts?: { bold?: boolean; color?: string; widthPct?: number }): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    ...(opts?.widthPct ? { width: colWidth(opts.widthPct) } : {}),
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [tr(text, { bold: opts?.bold, size: S.tableCell, color: opts?.color })],
      }),
    ],
  });
}

export interface SentimentAnalysisContent {
  productName: string;
  companyName: string;
  preparedDate: string;
  executiveSummary: {
    overallScore: number;
    distribution: { positive: number; neutral: number; negative: number };
    summary: string[];
    keyFindings: string[];
  };
  platformBreakdown: Array<{
    platform: string;
    sentimentScore: number;
    sampleSize: number;
    summary: string;
    topPositive: string[];
    topNegative: string[];
  }>;
  themeAnalysis: Array<{
    theme: string;
    sentiment: "positive" | "mixed" | "negative";
    score: number;
    mentionCount: number;
    summary: string;
    representativeQuotes: Array<{
      quote: string;
      source: string;
      sentiment: "positive" | "neutral" | "negative";
    }>;
  }>;
  topQuotes: {
    positive: Array<{ quote: string; source: string; context: string }>;
    negative: Array<{ quote: string; source: string; context: string }>;
  };
  competitiveContext: {
    competitorMentions: Array<{
      competitor: string;
      mentionCount: number;
      context: string;
    }>;
    competitivePosition: string;
  };
  recommendations: Array<{
    priority: "high" | "medium" | "low";
    area: string;
    recommendation: string;
    supportingEvidence: string;
  }>;
  sourceAppendix: Array<{
    platform: string;
    url?: string;
    description: string;
    itemsAnalysed: number;
  }>;
}

function coverPage(c: SentimentAnalysisContent): Paragraph[] {
  return [
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [tr("MVRX LABS", { bold: true, size: S.brand, color: C.brandBlue })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [tr("Product Sentiment Analysis", { size: S.docTitle, color: C.darkNavy })],
    }),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(c.productName, { bold: true, size: S.productName, color: C.darkNavy })],
    }),
    new Paragraph({
      children: [tr(c.companyName, { size: S.company, color: C.body })],
    }),
    emptyPara(),
    emptyPara(),
    emptyPara(),
    new Paragraph({
      children: [tr(`Prepared: ${c.preparedDate}`, { size: S.meta, color: C.meta })],
    }),
    new Paragraph({
      children: [tr("Classification: Confidential", { size: S.meta, color: C.meta })],
    }),
  ];
}

function overallScoreTable(score: number, dist: { positive: number; neutral: number; negative: number }): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [0.25, 0.25, 0.25, 0.25].map(() => Math.round(CONTENT_WIDTH / 4)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Overall Score", 25),
          headerCell("Positive", 25),
          headerCell("Neutral", 25),
          headerCell("Negative", 25),
        ],
      }),
      new TableRow({
        children: [
          bodyCell(`${score} / 10`, { bold: true, color: sentimentColor(score), widthPct: 25 }),
          bodyCell(`${dist.positive}%`, { color: C.green, widthPct: 25 }),
          bodyCell(`${dist.neutral}%`, { color: C.orange, widthPct: 25 }),
          bodyCell(`${dist.negative}%`, { color: C.red, widthPct: 25 }),
        ],
      }),
    ],
  });
}

function platformTable(platforms: SentimentAnalysisContent["platformBreakdown"]): Table {
  const cols = [25, 15, 15, 45];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Platform", 25),
          headerCell("Score", 15),
          headerCell("Sample", 15),
          headerCell("Summary", 45),
        ],
      }),
      ...platforms.map(
        (p) =>
          new TableRow({
            children: [
              bodyCell(p.platform, { bold: true }),
              bodyCell(`${p.sentimentScore}/10`, { color: sentimentColor(p.sentimentScore) }),
              bodyCell(`${p.sampleSize}`),
              bodyCell(p.summary),
            ],
          })
      ),
    ],
  });
}

function themeTable(themes: SentimentAnalysisContent["themeAnalysis"]): Table {
  const cols = [20, 12, 12, 12, 44];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Theme", 20),
          headerCell("Sentiment", 12),
          headerCell("Score", 12),
          headerCell("Mentions", 12),
          headerCell("Summary", 44),
        ],
      }),
      ...themes.map(
        (t) =>
          new TableRow({
            children: [
              bodyCell(t.theme, { bold: true }),
              bodyCell(sentimentLabel(t.sentiment), { color: sentimentColor(t.score) }),
              bodyCell(`${t.score}/10`, { color: sentimentColor(t.score) }),
              bodyCell(`${t.mentionCount}`),
              bodyCell(t.summary),
            ],
          })
      ),
    ],
  });
}

function recommendationsTable(recs: SentimentAnalysisContent["recommendations"]): Table {
  const cols = [12, 15, 38, 35];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Priority", 12),
          headerCell("Area", 15),
          headerCell("Recommendation", 38),
          headerCell("Evidence", 35),
        ],
      }),
      ...recs.map((r) => {
        const priorityColor = r.priority === "high" ? C.red : r.priority === "medium" ? C.orange : C.green;
        return new TableRow({
          children: [
            bodyCell(r.priority.toUpperCase(), { bold: true, color: priorityColor }),
            bodyCell(r.area, { bold: true }),
            bodyCell(r.recommendation),
            bodyCell(r.supportingEvidence),
          ],
        });
      }),
    ],
  });
}

function signOff(): Paragraph[] {
  return [
    emptyPara(),
    emptyPara(),
    new Paragraph({
      spacing: { before: 600 },
      children: [tr("MVRX Labs", { bold: true, size: S.signoffBrand, color: C.brandBlue })],
    }),
    new Paragraph({
      children: [tr("Attention, Measured.", { size: S.signoffTag, color: C.meta })],
    }),
    emptyPara(),
    new Paragraph({
      children: [tr("For implementation support and growth programmes:", { size: S.body })],
    }),
    new Paragraph({
      children: [
        new ExternalHyperlink({
          link: "https://cal.com/romil-depala-sabsp0/30min",
          children: [tr("Book a Call", { bold: true, size: S.body, color: C.brandBlue })],
        }),
      ],
    }),
    emptyPara(),
    new Paragraph({
      children: [
        tr("This report was generated by MVRX Labs\u2019 Sentiment Intelligence Platform.", {
          size: S.signoffSmall,
          color: C.meta,
        }),
      ],
    }),
  ];
}

export async function buildSentimentDocx(content: SentimentAnalysisContent): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(...coverPage(content));

  // Executive Summary
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("1. Executive Summary"));
  for (const para of content.executiveSummary.summary) {
    children.push(bodyPara(para));
  }
  children.push(emptyPara());
  children.push(overallScoreTable(content.executiveSummary.overallScore, content.executiveSummary.distribution));
  children.push(emptyPara());
  children.push(subHeading("Key Findings"));
  for (const finding of content.executiveSummary.keyFindings) {
    children.push(bulletItem(finding));
  }

  // Platform Breakdown
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("2. Platform Breakdown"));
  children.push(platformTable(content.platformBreakdown));
  children.push(emptyPara());

  for (const platform of content.platformBreakdown) {
    children.push(subHeading(platform.platform));
    children.push(bodyPara(platform.summary));
    if (platform.topPositive.length > 0) {
      children.push(labeledPara("Top Positive Themes:", ""));
      for (const item of platform.topPositive) {
        children.push(bulletItem(item));
      }
    }
    if (platform.topNegative.length > 0) {
      children.push(labeledPara("Top Negative Themes:", ""));
      for (const item of platform.topNegative) {
        children.push(bulletItem(item));
      }
    }
    children.push(emptyPara());
  }

  // Theme Analysis
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("3. Theme Analysis"));
  children.push(themeTable(content.themeAnalysis));
  children.push(emptyPara());

  for (const theme of content.themeAnalysis) {
    children.push(subHeading(theme.theme));
    children.push(bodyPara(theme.summary));
    if (theme.representativeQuotes.length > 0) {
      for (const q of theme.representativeQuotes) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 400 },
            children: [
              tr(`"${q.quote}"`, { italics: true }),
              tr(` — ${q.source}`, { color: C.meta, size: S.tableCell }),
            ],
          })
        );
      }
    }
    children.push(emptyPara());
  }

  // Top Quotes
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("4. Notable Quotes"));

  children.push(subHeading("Positive Sentiment"));
  for (const q of content.topQuotes.positive) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 400 },
        children: [tr(`"${q.quote}"`, { italics: true })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        indent: { left: 400 },
        children: [
          tr(`— ${q.source}`, { color: C.meta, size: S.tableCell }),
          tr(q.context ? ` (${q.context})` : "", { color: C.meta, size: S.tableCell }),
        ],
      })
    );
  }

  children.push(subHeading("Negative Sentiment"));
  for (const q of content.topQuotes.negative) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 400 },
        children: [tr(`"${q.quote}"`, { italics: true })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        indent: { left: 400 },
        children: [
          tr(`— ${q.source}`, { color: C.meta, size: S.tableCell }),
          tr(q.context ? ` (${q.context})` : "", { color: C.meta, size: S.tableCell }),
        ],
      })
    );
  }

  // Competitive Context
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("5. Competitive Context"));
  children.push(bodyPara(content.competitiveContext.competitivePosition));
  children.push(emptyPara());

  if (content.competitiveContext.competitorMentions.length > 0) {
    const compCols = [25, 15, 60];
    children.push(
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: compCols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [headerCell("Competitor", 25), headerCell("Mentions", 15), headerCell("Context", 60)],
          }),
          ...content.competitiveContext.competitorMentions.map(
            (cm) =>
              new TableRow({
                children: [
                  bodyCell(cm.competitor, { bold: true }),
                  bodyCell(`${cm.mentionCount}`),
                  bodyCell(cm.context),
                ],
              })
          ),
        ],
      })
    );
    children.push(emptyPara());
  }

  // Recommendations
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionHeading("6. Recommendations"));
  children.push(recommendationsTable(content.recommendations));

  // Source Appendix
  children.push(emptyPara());
  children.push(sectionHeading("7. Source Appendix"));
  if (content.sourceAppendix.length > 0) {
    const srcCols = [20, 40, 20, 20];
    children.push(
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: srcCols.map((p) => Math.round((CONTENT_WIDTH * p) / 100)),
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              headerCell("Platform", 20),
              headerCell("Description", 40),
              headerCell("URL", 20),
              headerCell("Items", 20),
            ],
          }),
          ...content.sourceAppendix.map(
            (s) =>
              new TableRow({
                children: [
                  bodyCell(s.platform, { bold: true }),
                  bodyCell(s.description),
                  bodyCell(s.url || "N/A"),
                  bodyCell(`${s.itemsAnalysed}`),
                ],
              })
          ),
        ],
      })
    );
  }

  children.push(...signOff());

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
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
