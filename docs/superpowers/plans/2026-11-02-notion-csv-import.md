# Notion and TradingView CSV import

## Intent and limits

Add a safe CSV import flow for separate Backtesting, Real, and Demo histories. Preserve source values and existing trades. Do not change financial formulas, storage keys, database schema, or backup JSON shape. No real CSV import, migration, merge, or deployment.

## Approach

1. Extend the legacy parser in place: smallest diff, but it keeps parsing, validation, environment assignment, and persistence coupled and cannot provide a reliable review preview.
2. Add a pure import service and a focused client wizard: separates detection, mapping, validation, duplicate/conflict review, and commit; preserves the legacy API for existing callers. **Selected** because it gives the requested preview and safe save boundary without changing financial calculations or persisted schema.
3. Add a third-party CSV dependency: useful for larger CSV dialect coverage, but unnecessary for the supported RFC 4180 formats and would add runtime weight.

## Data flow

The wizard reads one file, detects delimiter/known columns, requires an explicit environment, and lets the user map unmatched headers to trade fields. The pure service returns rows, counts, warnings, duplicates, and environment conflicts. Rows with missing required identity/result data or unresolved conflicts cannot be saved. Explicit per-row conflict review allows a user to accept the selected environment. The context performs a functional merge with its latest trades and rechecks deduplication before appending. Existing JSON restore and legacy parser entry points remain compatible.

The importer does not derive P&L from prices or set capital. It preserves explicit R/P&L, maps only recognized ICT and psychology literals, marks missing values with existing unrecorded flags/sentinels, and retains unsupported mapped source text in notes with a warning. Date parsing accepts only unambiguous forms; supplied wall-clock time stays unchanged, and timezone-bearing strings receive a visible warning and retain the original timestamp in notes.

## Files and verification

- `src/services/csv-import-service.ts`: CSV document parsing, header detection/mapping, conversion, validation, and preview result.
- `src/components/modals/CsvImportModal.tsx`: required environment, file selection, mappings, conflicts, preview, and explicit commit.
- `src/components/layout/Sidebar.tsx`, `src/components/views/AnalyticsView.tsx`, `src/app/page.tsx`: route both existing CSV entry points through the wizard.
- `src/context/TradingContext.tsx`: atomic append/duplicate recheck while keeping old import and JSON restore APIs.
- `tests/fixtures/csv/*`, `tests/v5-csv-import.test.mjs`, and `package.json`: synthetic format and downstream analytics/AI coverage.

Run new tests red then green, full `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. Inspect the final diff, confirm no financial engine/schema changes, and create an independent PR against `master`.
