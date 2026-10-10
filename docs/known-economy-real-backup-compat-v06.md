# Known Economy v0.6 — Cross-registry compatibility and privacy-safe backup auditing

## Background
A real Player State v7 export revealed a structural issue in the audit and economy bridge: `knownEntities` is not restricted to `Master.entities`. It may contain previously encountered mushrooms, cooking outputs, animal processed goods, and legacy IDs for outputs which are represented in `windmill_items` through the **fixed** `LEGACY_ECONOMY_PROCESS_CROSSWALK`.

The v0.5 aggregate audit was therefore overly pessimistic: it could classify already-recognized, previously discovered goods as unrecognized. This change corrects the **audit**, not the saved data, and never guesses a new item by its display name.

## Source-of-truth resolution
- Use exact IDs across already supported domains: `entities`, `resource_items`, `animal_products`, `animal_processed_goods`, `mushrooms`, `mushroom_spores`, `windmill_items`, `cooking_recipes`, `flowers`.
- Legacy output IDs are recognized only if their **pinned** crosswalk recipe exists and its output reference resolves to the same Master item. This does **not** grant a learned recipe to a player who learned only the product.
- Some older mushroom crop IDs exist in both `entities` and `mushrooms`. Three reviewed, fixed IDs (`common_mushroom`, `shiitake_mushroom`, `shimeji_mushroom`) now resolve to the latter only when both records exist and their ID, type and name agree. **No global fuzzy/name-based joins.**
- Exact duplicate IDs across multiple registry domains that do not have a verified relationship are flagged as ambiguous rather than classified as discovered.
- An unexplained legacy ID remains unlinked even if there is a Japanese title that looks identical. A human-reviewed crosswalk and unit tests are required before adding an alias.
- User-created objects remain distinct from global Master registry objects.

## v0.6 read-only audit result
`auditPlayerBackup(raw,{master})` returns a redacted `master_linkage_counts` with:
- `known_entities_in_master` (all exact/pinned matches, not only `Master.entities`)
- `known_entities_in_other_domains` and `known_entities_via_pinned_process_alias` (subsets of recognized entries)
- `known_entities_ambiguous`, `custom_entities_not_in_master` and `known_entities_unmapped`
- `known_recipes_in_master`, `known_process_links`, `known_facts_in_master`, `known_requests_in_master` and their unmapped counts.

The `processing_rows_excluded` metric counts processing **status rows**, including rows whose seed quantity was not recorded. `seed_quantity_untracked` remains an independent counter. `stored_seed_rows_pending_master_mapping` counts tracked seed/seedling/spore rows stored at the warehouse, **not harvested crops**.

These numbers do not reproduce item IDs, notes, goal titles, or individual quantities.

## User data boundaries
- Personal JSON backups stay local, and **must never be committed** to the public GitHub repo or CI artifacts.
- A valid backup is a structural check, not proof that the game inventory matches its contents.
- The app's `index.html`, `release.json`, Player State v7 schema, and PWA runtime load process are unchanged.
- No incomplete sale quotes or unknown item quantities are silently replaced with 0.
- Only known, explicitly selected routes qualify for the bounded price comparison. Weather, quality, market capacity and future hidden facts remain outside the comparison.

## Acceptance and tests
`node --test tests/*.test.mjs` and the Request/Bazaar registries must pass. Tests use **synthetic** Player State fixtures; a user's original JSON is never used as a GitHub Actions test input.

An App-side version of this report should be available only on demand, not during startup, because the full Master is approximately 1 MB while the app intentionally uses a smaller startup projection.
