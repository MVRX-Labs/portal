"use client";

interface NotesFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export function NotesField({ value, onChange, onBlur }: NotesFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-(--muted) mb-1">Notes</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={3}
        placeholder="Internal notes..."
      />
      <p className="text-[11px] text-(--muted) mt-1">
        For internal reference only — not used by any automated processes.
      </p>
    </div>
  );
}
