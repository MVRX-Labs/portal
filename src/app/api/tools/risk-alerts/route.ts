import { NextRequest, NextResponse } from "next/server";
import { parseBodyOptional } from "@/lib/api-schemas/common";
import { riskAlertsBodySchema } from "@/lib/api-schemas/risk-alerts";
import {
  getAllAccountRiskProfiles,
  getAccountRiskProfile,
} from "@/lib/account-risk-profiles";

/**
 * POST /api/tools/risk-alerts
 *
 * On-demand risk assessment endpoint. Returns risk profiles as JSON.
 * Accepts optional `accountId` to evaluate a single account, otherwise
 * evaluates all paying accounts.
 *
 * Useful for debugging and ad-hoc checks from the portal.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body } = await parseBodyOptional(request, riskAlertsBodySchema);

  try {
    if (body.accountId) {
      const profile = await getAccountRiskProfile(body.accountId);
      if (!profile) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      return NextResponse.json({
        profiles: [profile],
        evaluatedAt: new Date().toISOString(),
      });
    }

    const profiles = await getAllAccountRiskProfiles();
    return NextResponse.json({
      profiles,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
