import { buildAuditDocx } from "../lib/audit-docx-builder.js";
import type { LinkedInAuditContent } from "../lib/audit-schema.js";
import { extractJSON, extractJSONFromSessionDir } from "../lib/job-utils.js";
import { findOrCreateFolder, uploadFile, type UploadResult } from "../lib/gdrive.js";

export interface BuildAndUploadAuditInput {
  claudeOutput: string;
  accountName?: string;
}

export async function buildAndUploadAuditDocx(
  input: BuildAndUploadAuditInput,
): Promise<UploadResult> {
  const json = extractJSON(input.claudeOutput);
  const content: LinkedInAuditContent = JSON.parse(json);

  console.log(`[docx] Building audit DOCX for ${content.personName}...`);
  const buf = await buildAuditDocx(content);
  console.log(`[docx] DOCX built (${(buf.length / 1024).toFixed(0)} KB)`);

  const rootFolderId = process.env.GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error("Missing GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID");
  }

  let targetFolderId = rootFolderId;
  if (input.accountName) {
    targetFolderId = await findOrCreateFolder(input.accountName, rootFolderId);
  }

  const filename = `MVRX | ${content.personName} | LinkedIn Audit.docx`;
  console.log(`[docx] Uploading "${filename}" to Google Drive...`);
  const result = await uploadFile(filename, buf, targetFolderId);
  console.log(`[docx] Uploaded: ${result.webViewLink}`);

  return result;
}
