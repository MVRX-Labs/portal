## This is a collection of notes of mistakes and wrong-turns made during the every-day development work on the project.

### Silent catch blocks hiding real errors (2026-03-08)

~30 `catch { // ignore }` blocks across UI components meant that when `apiFetch` threw (e.g. due to Zod schema mismatch), the error was completely invisible. The accounts page showed "No accounts found" with no error message, even though the API returned data — the Zod parse failed because two fields (`engagementSlackChannel`, `analyticsSlackChannel`) were missing from the API select but required by the schema. Fixed by adding auto-toast in `apiFetch` so errors surface regardless of how callers handle them. Going forward: never add a bare `catch { // ignore }` for `apiFetch` calls — the toast will handle visibility, but swallowing errors still means the UI shows empty/stale state.
