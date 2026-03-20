import * as cheerio from "cheerio";

interface PassageScore {
  heading: string | null;
  wordCount: number;
  totalScore: number;
  grade: string;
  label: string;
  breakdown: {
    answerBlockQuality: number;
    selfContainment: number;
    structuralReadability: number;
    statisticalDensity: number;
    uniquenessSignals: number;
  };
  preview: string;
}

export interface CitabilityResult {
  url: string;
  totalBlocksAnalyzed: number;
  averageCitabilityScore: number;
  optimalLengthPassages: number;
  gradeDistribution: Record<string, number>;
  top5Citable: PassageScore[];
  bottom5Citable: PassageScore[];
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

function scorePassage(text: string, heading: string | null = null): PassageScore {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // === 1. Answer Block Quality (max 30) ===
  let abq = 0;

  const definitionPatterns = [
    /\b\w+\s+is\s+(?:a|an|the)\s/i,
    /\b\w+\s+refers?\s+to\s/i,
    /\b\w+\s+means?\s/i,
    /\b\w+\s+(?:can be |are )?defined\s+as\s/i,
    /\bin\s+(?:simple|other)\s+(?:terms|words)\s*,/i,
  ];
  if (definitionPatterns.some((p) => p.test(text))) abq += 15;

  const first60 = words.slice(0, 60).join(" ");
  if (
    [/\b(?:is|are|was|were|means?|refers?)\b/i, /\d+%/, /\$[\d,]+/, /\d+\s+(?:million|billion|thousand)/i].some((p) =>
      p.test(first60)
    )
  )
    abq += 15;

  if (heading && heading.endsWith("?")) abq += 10;

  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const shortClear = sentences.filter((s) => {
    const wc = s.trim().split(/\s+/).length;
    return wc >= 5 && wc <= 25;
  }).length;
  if (sentences.length > 0) abq += Math.round((shortClear / sentences.length) * 10);

  if (
    /(?:according to|research shows|studies?\s+(?:show|indicate|suggest|found)|data\s+(?:shows|indicates|suggests))/i.test(
      text
    )
  )
    abq += 10;

  const answerBlockQuality = Math.min(abq, 30);

  // === 2. Self-Containment (max 25) ===
  let sc = 0;

  if (wordCount >= 134 && wordCount <= 167) sc += 10;
  else if (wordCount >= 100 && wordCount <= 200) sc += 7;
  else if (wordCount >= 80 && wordCount <= 250) sc += 4;
  else if (wordCount >= 30 && wordCount <= 400) sc += 2;

  const pronounCount = countMatches(text, /\b(?:it|they|them|their|this|that|these|those|he|she|his|her)\b/gi);
  if (wordCount > 0) {
    const ratio = pronounCount / wordCount;
    if (ratio < 0.02) sc += 8;
    else if (ratio < 0.04) sc += 5;
    else if (ratio < 0.06) sc += 3;
  }

  const properNouns = countMatches(text, /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
  if (properNouns >= 3) sc += 7;
  else if (properNouns >= 1) sc += 4;

  const selfContainment = Math.min(sc, 25);

  // === 3. Structural Readability (max 20) ===
  let sr = 0;

  if (sentences.length > 0) {
    const avg = wordCount / sentences.length;
    if (avg >= 10 && avg <= 20) sr += 8;
    else if (avg >= 8 && avg <= 25) sr += 5;
    else sr += 2;
  }

  if (/(?:first|second|third|finally|additionally|moreover|furthermore)/i.test(text)) sr += 4;
  if (/(?:\d+[.)]\s|\b(?:step|tip|point)\s+\d+)/i.test(text)) sr += 4;
  if (text.includes("\n")) sr += 4;

  const structuralReadability = Math.min(sr, 20);

  // === 4. Statistical Density (max 15) ===
  let sd = 0;

  sd += Math.min(countMatches(text, /\d+(?:\.\d+)?%/g) * 3, 6);
  sd += Math.min(countMatches(text, /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B|K))?/g) * 3, 5);
  sd += Math.min(
    countMatches(
      text,
      /\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:users|customers|pages|sites|companies|businesses|people|percent|times|x)\b/gi
    ) * 2,
    4
  );
  if (/\b20(?:2[3-6]|1\d)\b/.test(text)) sd += 2;

  const sourcePatterns = [
    /(?:according to|per|from|by)\s+[A-Z]/,
    /(?:Gartner|Forrester|McKinsey|Harvard|Stanford|MIT|Google|Microsoft|OpenAI|Anthropic)/,
    /\([A-Z][a-z]+(?:\s+\d{4})?\)/,
  ];
  for (const p of sourcePatterns) if (p.test(text)) sd += 2;

  const statisticalDensity = Math.min(sd, 15);

  // === 5. Uniqueness Signals (max 10) ===
  let us = 0;

  if (
    /(?:our\s+(?:research|study|data|analysis|survey|findings)|we\s+(?:found|discovered|analyzed|surveyed|measured))/i.test(
      text
    )
  )
    us += 5;
  if (/(?:case study|for example|for instance|in practice|real-world|hands-on)/i.test(text)) us += 3;
  if (/(?:using|with|via|through)\s+[A-Z][a-z]+/.test(text)) us += 2;

  const uniquenessSignals = Math.min(us, 10);

  // Total
  const total = answerBlockQuality + selfContainment + structuralReadability + statisticalDensity + uniquenessSignals;

  let grade: string, label: string;
  if (total >= 80) {
    grade = "A";
    label = "Highly Citable";
  } else if (total >= 65) {
    grade = "B";
    label = "Good Citability";
  } else if (total >= 50) {
    grade = "C";
    label = "Moderate Citability";
  } else if (total >= 35) {
    grade = "D";
    label = "Low Citability";
  } else {
    grade = "F";
    label = "Poor Citability";
  }

  return {
    heading,
    wordCount,
    totalScore: total,
    grade,
    label,
    breakdown: {
      answerBlockQuality,
      selfContainment,
      structuralReadability,
      statisticalDensity,
      uniquenessSignals,
    },
    preview: words.slice(0, 30).join(" ") + (wordCount > 30 ? "..." : ""),
  };
}

export async function analyzeCitability(url: string): Promise<CitabilityResult> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Strip non-content
  $("script, style, nav, footer, header, aside, form").remove();

  // Extract content blocks grouped by heading
  const blocks: { heading: string; content: string }[] = [];
  let currentHeading = "Introduction";
  let currentParagraphs: string[] = [];

  $("h1, h2, h3, h4, p, ul, ol, table").each((_, el) => {
    const tag = (el as any).tagName as string;
    if (tag.startsWith("h")) {
      if (currentParagraphs.length > 0) {
        const combined = currentParagraphs.join(" ");
        if (combined.split(/\s+/).length >= 20) {
          blocks.push({ heading: currentHeading, content: combined });
        }
      }
      currentHeading = $(el).text().trim();
      currentParagraphs = [];
    } else {
      const text = $(el).text().trim();
      if (text && text.split(/\s+/).length >= 5) {
        currentParagraphs.push(text);
      }
    }
  });

  // Last block
  if (currentParagraphs.length > 0) {
    const combined = currentParagraphs.join(" ");
    if (combined.split(/\s+/).length >= 20) {
      blocks.push({ heading: currentHeading, content: combined });
    }
  }

  const scored = blocks.map((b) => scorePassage(b.content, b.heading));

  const avgScore = scored.length > 0 ? scored.reduce((sum, b) => sum + b.totalScore, 0) / scored.length : 0;

  const gradeDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const b of scored) gradeDist[b.grade]++;

  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore);

  return {
    url,
    totalBlocksAnalyzed: scored.length,
    averageCitabilityScore: Math.round(avgScore * 10) / 10,
    optimalLengthPassages: scored.filter((b) => b.wordCount >= 134 && b.wordCount <= 167).length,
    gradeDistribution: gradeDist,
    top5Citable: sorted.slice(0, 5),
    bottom5Citable: sorted.slice(-5).reverse(),
  };
}
