import { NextRequest, NextResponse } from "next/server";
import { addLinkedinProfile } from "@/lib/linkedin-profiles";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Skip header if it looks like one
    const start = lines[0]?.toLowerCase().includes("linkedin") ? 1 : 0;

    const urls: string[] = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const url = cols.find((c) => c.includes("linkedin.com/"));
      if (url) urls.push(url);
    }

    if (urls.length === 0) {
      return NextResponse.json({ error: "No valid LinkedIn URLs found in CSV" }, { status: 400 });
    }

    const profiles = [];
    for (const url of urls) {
      const profile = await addLinkedinProfile(id, url, { outboundEnabled: true });
      profiles.push(profile);
    }
    return NextResponse.json({ profiles, parsed: urls.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
