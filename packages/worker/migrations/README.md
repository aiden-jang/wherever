# D1 migrations

SQL files define the production schema history. Drizzle metadata records how new
migrations are generated; commit it together with generated SQL.

From the repository root:

```bash
pnpm --filter @wherever/worker run db:generate
pnpm --filter @wherever/worker run db:migrate:local
```

Inspect generated SQL before applying it. Do not rewrite an already-applied
migration to change historical behavior. Worker integration tests read this
migration directory and apply it to isolated D1.

The Worker delivery script applies pending remote migrations before shipping code.
See [hosting guidance](../../../DEPLOY.md) for that deliberate production operation.
