---
name: runekeep-no-em-dashes
description: "Owner rule - no em dashes anywhere the user can read in RuneKeep, and plain language over flavour text"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-28T00:46:18.251Z
---

**Never use an em dash in RuneKeep text the user can read.** Not in labels, button copy, bodies,
placeholders, toasts, error messages, empty states, dialog copy, or GitHub release notes. `--` is not
an acceptable substitute either. Use commas, colons, semicolons, periods or parentheses.

Code comments are exempt: they are not the app.

**Why:** the owner reads em dashes as an AI writing tell and asked for them removed from the entire
app, explicitly saying "remember this". Alongside it: simpler language, less bloat flavour text.
Flavour belongs in the card content, which is the player's, not in the chrome.

**How to apply:** the rule is written into `AGENTS.md` under "Copy rules (non-negotiable)". When
touching any user-visible string, check for `—`. v0.23.0 purged 81 rendered strings across 24
files with a script that walked string literals and JSX text only. Watch placeholders specifically,
they were the ones the owner caught (the experience card editor's text area).

See also [[runekeep-v0230-gotchas]].
