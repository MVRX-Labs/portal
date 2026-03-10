import { Paragraph, Table, TableRow } from "docx";
import type { GrowthReportContent } from "../schema";
import { sectionH, subH, bullet, bodyP, emptyPara, pageBreak, makeTable, bCell, altFill, signOff } from "../styles";

export function caseStudiesSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    pageBreak(),
    sectionH("Case Studies: MVRX Labs SEO Results"),
    bodyP("Selected examples of SEO work delivered by MVRX Labs for high-growth technology companies."),
  ];

  for (const cs of c.caseStudies) {
    out.push(emptyPara(), subH(cs.title), bodyP(cs.subtitle));
    out.push(
      makeTable(
        [25, 75],
        ["", "DETAIL"],
        cs.details.map(
          (d, i) =>
            new TableRow({
              children: [bCell(d.label, { bold: true, fill: altFill(i) }), bCell(d.value, { fill: altFill(i) })],
            })
        )
      )
    );
    if (cs.screenshotCaption) {
      out.push(emptyPara(), bodyP(cs.screenshotCaption, { italics: true }));
    }
  }
  return out;
}

export function sowSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const s = c.statementOfWork;
  return [
    pageBreak(),
    sectionH("Statement of Work"),
    bodyP(s.scopeDescription),
    emptyPara(),
    subH("Scope of Engagement"),
    ...s.workstreams.map((w) => bullet(w)),
    emptyPara(),
    subH("Deliverables"),
    makeTable(
      [35, 25, 40],
      ["DELIVERABLE", "FREQUENCY", "FORMAT"],
      s.deliverables.map(
        (d, i) =>
          new TableRow({
            children: [
              bCell(d.deliverable, { bold: true, fill: altFill(i) }),
              bCell(d.frequency, { fill: altFill(i) }),
              bCell(d.format, { fill: altFill(i) }),
            ],
          })
      )
    ),
    emptyPara(),
    subH("Timeline"),
    makeTable(
      [22, 18, 60],
      ["PHASE", "TIMING", "KEY MILESTONES"],
      s.timeline.map(
        (t, i) =>
          new TableRow({
            children: [
              bCell(t.phase, { bold: true, fill: altFill(i) }),
              bCell(t.timing, { fill: altFill(i) }),
              bCell(t.milestones, { fill: altFill(i) }),
            ],
          })
      )
    ),
  ];
}

export function pricingSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const p = c.pricing;
  const out: (Paragraph | Table)[] = [pageBreak(), sectionH("Pricing Proposal"), bodyP(p.introduction)];

  for (const opt of p.options) {
    out.push(emptyPara(), subH(opt.name), bodyP(opt.description));
    out.push(
      makeTable(
        [30, 40, 15],
        ["COMPONENT", "DETAIL", "MONTHLY"],
        [
          ...opt.components.map(
            (comp, i) =>
              new TableRow({
                children: [
                  bCell(comp.component, { bold: true, fill: altFill(i) }),
                  bCell(comp.detail, { fill: altFill(i) }),
                  bCell(comp.monthly, { fill: altFill(i) }),
                ],
              })
          ),
          new TableRow({ children: [bCell("TOTAL", { bold: true }), bCell("", {}), bCell(opt.total, { bold: true })] }),
        ]
      )
    );
    if (opt.note) out.push(bodyP(opt.note, { italics: true }));
  }

  if (p.exclusions.length) {
    out.push(emptyPara(), subH("What's Not Included"));
    for (const ex of p.exclusions) out.push(bullet(ex));
  }

  return out;
}

export function signOffSection(): (Paragraph | Table)[] {
  return [pageBreak(), ...signOff()];
}
