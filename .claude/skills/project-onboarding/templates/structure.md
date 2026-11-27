# Project Structure

## Layout

```
<tree of top 2-3 levels, annotated>
```

## Placement rules

Reviewers reject files placed outside these rules.

| Kind of file | Location | Naming | Test location |
|---|---|---|---|
| e.g. HTTP route/controller | `src/api/routes/` | `<resource>.routes.ts` | `tests/api/<resource>.test.ts` |
| Business logic / service | | | |
| Data access / repository | | | |
| Domain model / entity | | | |
| DTO / schema / validation | | | |
| UI component | | | |
| Shared utility | | | |
| Config | | | |
| Migration | | | |

## Layering / dependency rules

- e.g. "routes -> services -> repositories; never routes -> repositories"
- e.g. "domain must not import from infrastructure"

## Do not touch

- Generated code:
- Vendored code:
