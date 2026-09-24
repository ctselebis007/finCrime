# FinCrime 3.0 — Synthetic Data Studio

A small Node/Express app that provisions the FinCrime 3.0 collections in MongoDB, seeds them
with synthetic data, and creates the MongoDB Atlas Search indexes that are the equivalent of the
Elasticsearch mappings described in `FinCrime_Elasticsearch_Index_Reference.docx.md`.

## Collections modelled

| Collection | Purpose |
| --- | --- |
| `task_metadata_entity` | Current-state workflow tasks |
| `task_history` | Immutable task revision history |
| `case_entity` | Primary case/investigation records |
| `document_center_entity` | Document/attachment metadata |
| `entity_list` | Screened parties/entities |
| `link_cases` | Case relationship edges |
| `audit-data-service` | Compliance audit log |
| `case_graph` | Case relationship graph topology |
| `data_block_business_keys_entity` | Dedup / idempotency keys |
| `data_block_recycling_request` | Reprocessing queue |

Each collection includes the fixed system fields plus the unbounded, Config-Manager-driven
`ConfigurationColumnEntity`-shaped nested arrays from the reference document.

## Run

```bash
cd fincrime-app
npm install
npm start
```

Then open http://localhost:3000

## Usage

1. **Setup page** — enter your MongoDB URI and database name.
   - **Test connection** to verify.
   - **Create & seed collections** inserts synthetic, referentially-linked documents.
   - **Create indexes** builds the regular b-tree indexes.
   - **Create Atlas Search indexes** builds the Atlas Search indexes (the ES-mapping equivalent).
   - **Inspect** shows document counts and index status per collection.
2. **Search page** — full-text + faceted search over the seeded data (Atlas Search):
   - **All** — federated fuzzy search across cases, entities, documents and tasks, grouped by type with match highlighting.
   - **Cases** — free-text + facets (status, project, workflow) and relevance/newest sort.
   - **Entities** — fuzzy name screening (typo-tolerant) across the display name, business key and nested config columns.
   - **Documents / Tasks / Audit** — focused tabs with their own facets.
   - **Autocomplete** on the search bar (entity names + case IDs) and **Find similar** (More Like This) on case/document cards.

> After changing the data model, re-run **Create & seed collections** and **Create Atlas Search indexes** on the Setup page so the new fields (entity `displayName`, case `createdOnDate`, facets, autocomplete) are indexed.

## Notes

- Atlas Search index creation requires an **Atlas cluster** (M0+) or a **local Atlas** deployment
  with a search node. On a plain `mongod` the search-index step will report an error per collection,
  while seeding and regular indexes still work.
- Atlas Search indexes build asynchronously — allow a minute before they become queryable.
- Seeding clears existing documents first, so the buttons are safe to re-run.
