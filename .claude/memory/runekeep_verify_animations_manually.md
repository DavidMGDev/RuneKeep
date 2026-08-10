---
name: runekeep_verify_animations_manually
description: "RuneKeep — don't screenshot-verify animations/loaders; ask the owner to test them on device"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: acb28104-ca4b-4066-8505-2926f6e9a5d0
---

For RuneKeep, do NOT try to verify animations, transitions, or loading screens with web-render screenshots. They can't be exercised headlessly (no interaction; virtual-time strands exit/entrance anims) and the attempts waste time.

**Why:** Owner explicitly said (2026-06-12): "Don't check animations and loaders with screenshots, ask me to do it manually." He tests on a Samsung A54 via Expo Go.

**How to apply:** Still run `npx tsc --noEmit` + `npx jest`, and still web-render STATIC layout (positions, text, sizing, collisions) to verify those. But for anything motion/loader/flip/transition related, finish the code, state plainly it's construction-verified, and ask the owner to confirm the feel on device. See [[runekeep_dev_pipeline]] and [[project_runekeep_overview]].
