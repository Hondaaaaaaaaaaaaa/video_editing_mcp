---
name: repo-collaboration-fork
description: "dahshury owns the VEMCP repo; collaborator Mostafa (GitHub \"Hondaaaaaaaaaaaaa\") works via a fork + PR"
metadata: 
  node_type: memory
  type: project
  originSessionId: f2defde1-5fdc-4375-8a0b-fcadf995cd2d
---

The GitHub repo `video_editing_mcp` is owned by **dahshury** (dahshury@gmail.com — the primary user). A collaborator, **Mostafa**, works from his own GitHub account **Hondaaaaaaaaaaaaa** via a fork, contributing the captions feature back through Pull Requests rather than pushing directly to the origin.

Notes from onboarding (2026-06-04):
- Mostafa's local copy started as a GitHub **ZIP download** (no `.git`), so it was `git init`'d locally and later pointed at his fork. The chosen model is fork → work on `feature/captions-remotion` → PR into dahshury's repo.
- `git config user.email` must match the pushing GitHub account for commits to attribute correctly.

**Why:** explains who contributes what and why a fork/PR flow (not direct push) is expected for the captions branch. Part of [[vemcp-saas-goal]].
