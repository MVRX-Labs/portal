"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/account-provider";
import { getResourcesResponseSchema } from "@/lib/api-schemas/resources";
import { apiFetch } from "@/lib/api-client";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

const mimeTypeIcons: Record<string, string> = {
  "application/vnd.google-apps.folder": "📁",
  "application/vnd.google-apps.document": "📄",
  "application/vnd.google-apps.presentation": "📊",
  "application/vnd.google-apps.spreadsheet": "📋",
  "application/pdf": "📕",
};

export default function ResourcesPage() {
  const { account } = useAccount();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined;

  const loadFiles = async (folderId?: string) => {
    setLoading(true);
    setError("");
    try {
      const searchParams = new URLSearchParams();
      if (folderId) searchParams.set("folderId", folderId);
      else if (account?.id) searchParams.set("accountId", account.id);
      const params = searchParams.toString() ? `?${searchParams}` : "";
      const data = await apiFetch(`/api/resources${params}`, getResourcesResponseSchema);
      setFiles((data.files || []) as unknown as DriveFile[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFolderStack([]);
  }, [account?.id]);

  useEffect(() => {
    loadFiles(currentFolderId);
  }, [currentFolderId, account?.id]);

  const openFolder = (file: DriveFile) => {
    setFolderStack([...folderStack, { id: file.id, name: file.name }]);
  };

  const navigateBack = (index: number) => {
    setFolderStack(folderStack.slice(0, index));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Resources</h1>
      <p className="text-sm text-(--muted) mb-4">
        {account ? `Resources for ${account.name}` : "Browse generated resources from Google Drive"}
      </p>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4">
        <button onClick={() => navigateBack(0)} className="text-(--accent) hover:underline">
          Root
        </button>
        {folderStack.map((folder, i) => (
          <span key={folder.id} className="flex items-center gap-1">
            <span className="text-(--muted)">/</span>
            <button onClick={() => navigateBack(i + 1)} className="text-(--accent) hover:underline">
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {error ? (
        <div className="card text-(--destructive)">{error}</div>
      ) : loading ? (
        <div className="card text-(--muted)">Loading files...</div>
      ) : files.length === 0 ? (
        <div className="card text-(--muted)">No files found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {files.map((file) => {
            const isFolder = file.mimeType === "application/vnd.google-apps.folder";
            const icon = mimeTypeIcons[file.mimeType] || "📄";

            if (isFolder) {
              return (
                <button
                  key={file.id}
                  onClick={() => openFolder(file)}
                  className="card text-left hover:border-(--accent) transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-(--muted)">{new Date(file.modifiedTime).toLocaleDateString()}</p>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <Link key={file.id} href={`/resources/${file.id}`}>
                <div className="card hover:border-(--accent) transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-(--muted)">{new Date(file.modifiedTime).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 p-4 rounded-lg bg-(--card) border border-(--border) text-sm text-(--muted)">
        <strong className="text-(--foreground)">Tip:</strong> Install{" "}
        <a
          href="https://www.google.com/drive/download/"
          target="_blank"
          rel="noreferrer"
          className="text-(--accent) hover:underline"
        >
          Google Drive for Desktop
        </a>{" "}
        to sync the shared folder locally for easy drag-and-drop into AI tools.
      </div>
    </div>
  );
}
