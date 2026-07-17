# Coding Standards

Project coding standards. MUST read this file before writing any code. Skill upgrades append missing built-in entries here; do not delete existing entries.

- Comments: state objective facts about the code; do not cite requirement IDs (e.g. FR-XX); do not paste conversation text into comments
- Reuse: when the same logic is needed by multiple call sites, extract a shared unit; prefer existing shared/public components and extend them when needed; do not copy-paste
- Internal calls: anything consumed only inside this repository (APIs, helpers, types, and other call sites, including monorepo cross-package) needs no backward compatibility; update all callers in the same change; do not leave parallel versioned implementations
- Warnings: resolve all warnings in files touched by the change (including pre-existing ones in those files); do not drive large unrelated cleanups
