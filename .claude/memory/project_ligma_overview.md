---
name: project-ligma-overview
description: "Ligma project — what it is, stack, key files, where docs live"
metadata: 
  node_type: memory
  type: project
  originSessionId: 81dbce55-f50a-4beb-a0cc-1285c8ad2a91
---

Ligma is a 5-stage localhost dev tool for transforming UI mockup images into structured, AI-enhanced component assets. Next.js 16 + React 19 frontend (:3000) + Flask/Python backend (:5555). No auth, no DB, single-user.

**Why:** Daggerheart TTRPG companion app asset pipeline.

**Stages:** Visualizer → Cleanroom → Composer → Adapter → Reconstructor.

**Key doc files (agent navigation):**
- `AGENTS.md` — routing guide: what to read before touching each area
- `docs/ARCHITECTURE.md` — full system, Flask routes, localStorage keys, lib modules
- `docs/SPEC.md` — types, algorithms, hooks, design tokens, conventions, tech debt
- `docs/features/01-05-*.md` — per-stage feature specs

**How to apply:** When working on this project, check AGENTS.md first for orientation, then the relevant feature doc and SPEC.md for type/pattern reference.
