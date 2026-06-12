# Phase 13 — LLM Wiki

**Status:** In Progress
**Started:** 2026-06-10

---

## Goal

Transform Investment OS from a stock dashboard into a personal investment operating system with persistent knowledge.

## Deliverables

- [x] Folder structure (`brain-os/`)
- [x] Schema files (company, theme, decision, daily)
- [x] `wiki-service.ts` — generators + index + log maintenance
- [x] API routes (`/api/wiki/company|theme|daily|decision`)
- [x] Dossier integration — upserts company page on `saveDossier()`
- [x] Radar integration — upserts themes + company pages on radar refresh
- [x] Morning Brief integration — upserts daily note + macro/geo pages
- [x] Initial company pages (NVDA)
- [x] Initial theme pages (AI Infrastructure)
- [x] Log system

## Out of Scope

- Embeddings / vector DB / RAG / semantic search / agents

## Architecture Notes

- Markdown-only, Obsidian-compatible
- Append-never-overwrite for thesis sections
- All integrations are fire-and-forget (failures logged, do not block primary flows)

## Related Pages

[[Portfolio]] [[NVDA]] [[AI-Infrastructure]]
