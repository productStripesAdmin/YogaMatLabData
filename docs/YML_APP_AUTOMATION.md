# YML_app Automation (YogaMatLabData → YML_app)

This repo keeps generated pipeline outputs in the `data` branch. Production should consume YogaMatLabData via a submodule that tracks that branch.

Two things must happen for production to stay in sync:

1) YogaMatLabData must keep `config/**` mirrored onto the `data` branch (so submodule consumers always have the latest config).
2) YML_app must periodically (or event-driven) update its submodule pointer to the latest `data` branch commit.

## 1) Configure the submodule to track the `data` branch

In `YML_app`, add the submodule (recommended):

```bash
git submodule add -b data https://github.com/productStripesAdmin/YogaMatLabData.git data/external
git commit -m "chore: add YogaMatLabData submodule (data branch)"
```

If you already have the submodule, set it to track `data`:

```bash
git submodule set-branch --branch data data/external
git add .gitmodules
git commit -m "chore: track YogaMatLabData data branch"
```

## 2) Add a workflow in YML_app to update the submodule on dispatch

YogaMatLabData dispatches repository events to YML_app when its `data` branch changes (config updates or weekly pipeline runs).

Create this in `YML_app`:

```yaml
# YML_app/.github/workflows/sync-yogamatlabdata.yml
name: Sync YogaMatLabData submodule

on:
  repository_dispatch:
    types:
      - yml-config-updated
      - yml-data-updated
      - yml-repo-updated
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: sync-yogamatlabdata
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: true

      - name: Update submodule to latest data branch
        run: |
          set -euo pipefail
          git submodule sync --recursive
          git submodule update --init --remote data/external

          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git add data/external
          if git diff --staged --quiet; then
            echo "No submodule update needed."
            exit 0
          fi

          git commit -m "chore: update YogaMatLabData submodule"
          git push

      # Optional: run your existing brand/series sync jobs after submodule update.
      # Replace these with the real commands used in your app repo.
      # - name: Sync brands/series to Convex
      #   run: npm ci && npm run sync-brands && npm run sync-series
```

If your `main` branch is protected and blocks pushes from GitHub Actions, use a PR flow instead (e.g. `peter-evans/create-pull-request`) or allow GitHub Actions to push to `main`.

## 3) Configure YogaMatLabData to dispatch to YML_app

In **YogaMatLabData** repo settings:

- Add secret `YML_APP_DISPATCH_TOKEN` (classic PAT with `repo` scope, or a fine-grained token with access to the YML_app repo).
- Optionally set variables:
  - `YML_APP_OWNER` (defaults to this repo owner)
  - `YML_APP_REPO` (defaults to `YML_app`)

YogaMatLabData workflow responsible for dispatching: `.github/workflows/notify-yml-app.yml`.

## Notes

- Config location for production via submodule: `data/external/config/*.json`
- Aggregated data location via submodule: `data/external/data/aggregated/latest/*.json`
