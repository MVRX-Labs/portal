"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderStack, setFolderStack] = useState<
    { id: string; name: string }[]
  >([]);

  const currentFolderId =
    folderStack.length > 0
      ? folderStack[folderStack.length - 1].id
      : undefined;

  const loadFiles = async (folderId?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = folderId ? `?folderId=${folderId}` : "";
      const res = await fetch(`/api/resources${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load files"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(currentFolderId);
  }, [currentFolderId]);

  const openFolder = (file: DriveFile) => {
    setFolderStack([...folderStack, { id: file.id, name: file.name }]);
  };

  const navigateBack = (index: number) => {
    setFolderStack(folderStack.slice(0, index));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Resources</h1>
      <p className="text-sm text-[var(--muted)] mb-4">
        Browse generated resources from Google Drive
      </p>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4">
        <button
          onClick={() => navigateBack(0)}
          className="text-[var(--accent)] hover:underline"
        >
          Root
        </button>
        {folderStack.map((folder, i) => (
          <span key={folder.id} className="flex items-center gap-1">
            <span className="text-[var(--muted)]">/</span>
            <button
              onClick={() => navigateBack(i + 1)}
              className="text-[var(--accent)] hover:underline"
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {error ? (
        <div className="card text-[var(--destructive)]">{error}</div>
      ) : loading ? (
        <div className="card text-[var(--muted)]">Loading files...</div>
      ) : files.length === 0 ? (
        <div className="card text-[var(--muted)]">No files found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {files.map((file) => {
            const isFolder =
              file.mimeType === "application/vnd.google-apps.folder";
            const icon = mimeTypeIcons[file.mimeType] || "📄";

            if (isFolder) {
              return (
                <button
                  key={file.id}
                  onClick={() => openFolder(file)}
                  className="card text-left hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <Link key={file.id} href={`/resources/${file.id}`}>
                <div className="card hover:border-[var(--accent)] transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6 p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">Tip:</strong> Install{" "}
        <a
          href="https://www.google.com/drive/download/"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] hover:underline"
        >
          Google Drive for Desktop
        </a>{" "}
        to sync the shared folder locally for easy drag-and-drop into AI tools.
      </div>
    </div>
  );
}
