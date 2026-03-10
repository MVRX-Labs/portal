import { Paragraph, Table, TableRow } from "docx";
import type { GrowthReportContent } from "../schema";
import { sectionH, subH, bullet, emptyPara, makeTable, bCell, statRow, C } from "../styles";

function effortColor(e: string): string {
  const l = e.toLowerCase();
  return l === "low" ? C.green : l === "med" || l === "medium" ? C.orange : C.red;
}

export function linkedinStrategySection(c: GrowthReportContent): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [sectionH("LinkedIn Content Strategy")];

  for (const person of c.linkedinStrategy.people) {
    out.push(subH(`${person.name}: ${person.frequency}`));
    for (const t of person.themes) {
      out.push(bullet(`${t.theme} (${t.pct}): ${t.description}`));
    }
    out.push(emptyPara());
  }

  if (c.linkedinStrategy.companyRebalance?.length) {
    out.push(subH("Company Page: Rebalanced Mix"));
    out.push(
      makeTable(
        [25, 20, 20, 20],
        ["THEME", "CURRENT", "TARGET", "CHANGE"],
        c.linkedinStrategy.companyRebalance.map(
          (r) =>
            new TableRow({
              children: [bCell(r.theme), bCell(r.current), bCell(r.target), bCell(r.change)],
            })
        )
      )
    );
  }

  return out;
}

export function masterStrategySection(c: GrowthReportContent): (Paragraph | Table)[] {
  return [
    sectionH(`Master Strategy: ${c.masterStrategy.initiatives.length} Stack-Ranked Initiatives`),
    emptyPara(),
    makeTable(
      [4, 18, 8, 7, 9, 8, 8, 14, 18],
      ["#", "INITIATIVE", "IMPACT", "EFFORT", "TIMELINE", "OWNER", "CAT", "METRIC", "NOTE"],
      c.masterStrategy.initiatives.map(
        (init) =>
          new TableRow({
            children: [
              bCell(`${init.num}`, { bold: true }),
              bCell(init.initiative),
              bCell(init.impact, { bold: true }),
              bCell(init.effort, { bold: true, color: effortColor(init.effort) }),
              bCell(init.timeline),
              bCell(init.owner),
              bCell(init.category),
              bCell(init.metric),
              bCell(init.note),
            ],
          })
      )
    ),
  ];
}

export function measurementSection(c: GrowthReportContent): (Paragraph | Table)[] {
  const m = c.measurementFramework;
  const row1 = m.targets.slice(0, 3);
  const row2 = m.targets.slice(3, 6);
  return [
    sectionH("Measurement Framework"),
    emptyPara(),
    ...(row1.length
      ? [statRow(row1.map((t) => [t.label, t.value, t.status] as [string, string, typeof t.status]))]
      : []),
    ...(row2.length
      ? [emptyPara(), statRow(row2.map((t) => [t.label, t.value, t.status] as [string, string, typeof t.status]))]
      : []),
    emptyPara(),
    subH("Tracking Cadence"),
    ...m.cadence.map((c) => bullet(c)),
  ];
}
