# Repository Guidelines

## Project Structure & Module Organization
- `scripts/` holds the TypeScript pipeline entrypoints; shared helpers live in `scripts/lib/`.
- `config/` contains configuration and mapping files used by normalization.
- `data/` stores generated outputs (`raw/`, `normalized/`, `aggregated/`, `changes/`) and `latest/` symlinks; treat as build artifacts.
- `logs/` stores run logs by date.
- `types/` is for shared TypeScript types.
- `docs/` and `README.md` provide architecture and usage details.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run fetch` pulls brand data from Convex and saves raw extracts.
- `npm run normalize` maps raw data into the unified schema.
- `npm run aggregate` combines brand data into aggregated outputs.
- `npm run detect-changes` computes new/removed/updated products.
- `npm run pipeline` runs the full fetch → normalize → aggregate → detect-changes chain.
- `npm run download-images` downloads images referenced in normalized data.
- `npm run update-symlinks` refreshes `data/**/latest` symlinks.
- Ad-hoc checks: `tsx scripts/test-scrapers.ts` or `tsx scripts/test-hugger-mugger.ts`.

## Coding Style & Naming Conventions
- TypeScript with ESM imports; `tsconfig.json` enforces `strict` and no emit.
- Use 2-space indentation, semicolons, and single quotes to match existing files.
- File names: kebab-case (e.g., `detect-changes.ts`). Types/interfaces: PascalCase. Variables/functions: camelCase.
- No formatter/linter configured; keep changes consistent with nearby code.

## Testing Guidelines
- No formal test runner is set up. Use the `scripts/test-*.ts` utilities for manual verification.
- When adding new test utilities, follow the `test-*.ts` naming pattern and keep them in `scripts/`.

## Commit & Pull Request Guidelines
- Commit messages follow short prefixes like `feat: ...`, `wip: ...`, and data updates use `Data update: YYYY-MM-DD`.
- Keep commits scoped to one concern; include notes if a pipeline run updated `data/`.
- PRs should include a concise summary, affected commands run, and any data-impact notes; link related issues when applicable.

## Security & Configuration Tips
- Use `.env` for secrets; at minimum set `CONVEX_URL`. Do not commit secrets or local `.env` files.
