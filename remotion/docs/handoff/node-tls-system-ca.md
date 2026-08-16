---
name: node-tls-system-ca
description: npm/npx/remotion fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE unless NODE_OPTIONS=--use-system-ca is set
metadata: 
  node_type: memory
  type: project
  originSessionId: 5702661f-bc49-4c77-a3a9-b742acda489d
---

On this machine, npm/npx/node network operations fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (TLS cert can't be verified against npm's bundled CA — likely a corporate/MITM proxy intercepting HTTPS).

**Why:** The registry/download certs are signed by a CA in the OS trust store, not in Node's bundled bundle.

**How to apply:** Prefix Node/npm/npx/remotion commands with `NODE_OPTIONS="--use-system-ca"` (Node 24+). This also fixed Remotion's Chromium headless-shell download during `npx remotion compositions`/render. Without it, even `npx create-video --help` errors out.
