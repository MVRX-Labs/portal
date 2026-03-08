"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ResourceViewer } from "@/components/resource-viewer";
import type { GetFileResponse } from "@/lib/api-schemas/resources";
import { getFileResponseSchema, exportFileResponseSchema } from "@/lib/api-schemas/resources";
import { apiFetch } from "@/lib/api-client";

interface FileData {
  file: {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
  };
  previewUrl: string;
}

export default function ResourceViewerPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.fileId as string;

  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch(`/api/resources/${fileId}`, getFileResponseSchema)
      .then((data) => setData(data as FileData))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load file"))
      .finally(() => setLoading(false));
  }, [fileId]);

  const handleCopyContent = async () => {
    setCopying(true);
    try {
      const { content } = await apiFetch(`/api/resources/${fileId}?action=export`, exportFileResponseSchema);
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy content");
    } finally {
      setCopying(false);
    }
  };

  if (loading) {
    return <div className="text-(--muted)">Loading...</div>;
  }

  if (error || !data) {
    return <div className="text-(--destructive)">{error || "File not found"}</div>;
  }

  const isGoogleDoc = data.file.mimeType.startsWith("application/vnd.google-apps.");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary">
            Back
          </button>
          <h1 className="text-xl font-bold truncate">{data.file.name}</h1>
        </div>
        <div className="flex gap-2">
          {isGoogleDoc && (
            <button onClick={handleCopyContent} className="btn-secondary" disabled={copying}>
              {copied ? "Copied!" : copying ? "Copying..." : "Copy Content"}
            </button>
          )}
          {data.file.webViewLink && (
            <a href={data.file.webViewLink} target="_blank" rel="noreferrer" className="btn-primary inline-block">
              Open in Drive
            </a>
          )}
        </div>
      </div>

      <ResourceViewer previewUrl={data.previewUrl} fileName={data.file.name} />
    </div>
  );
}
