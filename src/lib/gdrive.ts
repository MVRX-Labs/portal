interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  parents?: string[];
}

interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Google service account credentials not configured");
  }

  // Import the key
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );

  const signInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signInput);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${payload}.${sig}`,
    }),
  });

  const data = await resp.json();
  return data.access_token;
}

async function throwIfNotOk(
  resp: Response,
  prefix = "Drive API"
): Promise<never> {
  const body = await resp.text();
  let detail = "";
  try {
    const err = JSON.parse(body);
    detail = err?.error?.message ? `: ${err.error.message}` : "";
  } catch {
    /* ignore */
  }
  throw new Error(`${prefix} error: ${resp.status}${detail}`);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function getGeneratedMaterialsFolderId(): string {
  const isLocal = process.env.NODE_ENV === "development";
  const folderId = isLocal
    ? process.env.DEV_GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID
    : process.env.GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID;

  if (!folderId) {
    const varName = isLocal
      ? "DEV_GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID"
      : "GOOGLE_DRIVE_GENERATED_MATERIALS_FOLDER_ID";
    throw new Error(`${varName} is not configured`);
  }

  return folderId;
}

export async function createFolder(
  name: string,
  parentFolderId: string
): Promise<string> {
  const token = await getAccessToken();

  const resp = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      }),
    }
  );

  if (!resp.ok) await throwIfNotOk(resp, "Drive API createFolder");

  const data = await resp.json();
  return data.id;
}

export async function findOrCreateFolder(
  name: string,
  parentFolderId: string
): Promise<string> {
  const token = await getAccessToken();

  const query = `name = '${name.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    pageSize: "1",
  });

  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchResp.ok) {
    const data: DriveListResponse = await searchResp.json();
    if (data.files.length > 0) return data.files[0].id;
  }

  return createFolder(name, parentFolderId);
}

export async function listFiles(folderId?: string): Promise<DriveFile[]> {
  const targetFolder = folderId || getGeneratedMaterialsFolderId();

  const token = await getAccessToken();

  const query = `'${targetFolder}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const url = `https://www.googleapis.com/drive/v3/files?${params}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) await throwIfNotOk(resp);

  const data: DriveListResponse = await resp.json();
  return data.files;
}

export async function getFile(fileId: string): Promise<DriveFile> {
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,webViewLink,parents&supportsAllDrives=true`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) await throwIfNotOk(resp);

  return resp.json();
}

export async function exportFileContent(fileId: string): Promise<string> {
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain&supportsAllDrives=true`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) await throwIfNotOk(resp, "Drive API export");

  return resp.text();
}

export async function uploadFile(
  name: string,
  content: Buffer,
  mimeType: string,
  parentFolderId: string,
): Promise<DriveFile> {
  const token = await getAccessToken();

  const boundary = `----trigger${Date.now()}`;
  const metadata = JSON.stringify({
    name,
    parents: [parentFolderId],
  });

  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n`,
    `Content-Transfer-Encoding: base64\r\n\r\n`,
    content.toString("base64"),
    `\r\n--${boundary}--`,
  ];

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyParts.join(""),
    }
  );

  if (!resp.ok) await throwIfNotOk(resp, "Drive API uploadFile");

  return resp.json();
}

export async function createGoogleDoc(
  name: string,
  textContent: string,
  parentFolderId: string,
): Promise<DriveFile> {
  const token = await getAccessToken();

  const boundary = `----trigger${Date.now()}`;
  const fileMetadata = JSON.stringify({
    name,
    parents: [parentFolderId],
    mimeType: "application/vnd.google-apps.document",
  });

  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    fileMetadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n`,
    textContent,
    `\r\n--${boundary}--`,
  ];

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyParts.join(""),
    }
  );

  if (!resp.ok) await throwIfNotOk(resp, "Drive API createGoogleDoc");

  return resp.json();
}

export function getPreviewUrl(fileId: string, mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") {
    return `https://docs.google.com/document/d/${fileId}/preview`;
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    return `https://docs.google.com/presentation/d/${fileId}/preview`;
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
  }
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
