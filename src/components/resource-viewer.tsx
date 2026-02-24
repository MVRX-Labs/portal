"use client";

interface ResourceViewerProps {
  previewUrl: string;
  fileName: string;
}

export function ResourceViewer({ previewUrl, fileName }: ResourceViewerProps) {
  return (
    <div className="w-full h-[80vh] rounded-lg overflow-hidden border border-[var(--border)]">
      <iframe
        src={previewUrl}
        title={fileName}
        className="w-full h-full"
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
