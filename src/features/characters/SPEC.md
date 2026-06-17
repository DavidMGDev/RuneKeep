# characters — the roster

**Responsibility:** the character library: list saved characters, create/open/delete, and import/export
character files. Entry: `src/app/characters.tsx` → `RosterScreen`.

## Structure
- `roster-screen.tsx` — the single screen (list + destructive-confirm via the shared `PopupDialog`).

## Data / deps
All persistence via `src/lib/character-store.ts` (`listCharacters`, `getCharacter`, `deleteCharacter`,
`exportCharacter`, `importCharacter`) over the versioned `CharacterFile` schema (`src/lib/character-file.ts`).
Per-character JSON on native (`expo-file-system`) / `localStorage` on web — no database.
