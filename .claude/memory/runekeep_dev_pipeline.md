---
name: runekeep-dev-pipeline
description: RuneKeep feature workflow the owner wants followed for every implementation task
metadata: 
  node_type: memory
  type: feedback
  originSessionId: acb28104-ca4b-4066-8505-2926f6e9a5d0
---

For [[project-runekeep-overview]], the owner's required pipeline for implementing a task:
1. `/to-prd` the current task first.
2. Make a **local branch** (NOT a worktree), push it to the repo.
3. Implement + test until done.
4. Push changes, then **auto-merge the branch to `main`**.

**Why:** The owner wants a consistent PRD → branch → implement → merge flow with traceable history; explicitly no git worktrees.

**How to apply:** Don't develop features directly on `main`. Bootstrap/scaffold went straight to `main`; everything after follows the pipeline above. Keep work runnable in Expo Go while iterating.
