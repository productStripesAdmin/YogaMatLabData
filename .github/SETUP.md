# GitHub Actions Setup Guide

## Required Secrets

Before the automated pipeline can run, you need to configure the following secrets in your GitHub repository:

### 1. Set up CONVEX_URL

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `CONVEX_URL`
5. Value: Your Convex deployment URL (e.g., `https://unique-dachshund-712.convex.cloud`)
6. Click **Add secret**

### 2. (Optional) Set up PAT_TOKEN

Only needed if you want cross-repo GitHub API access (e.g. dispatching to YML_app) or if your repo settings restrict the default `GITHUB_TOKEN`.

1. Create a Personal Access Token:
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click **Generate new token (classic)**
   - Give it a name like "YogaMatLabData Pipeline"
   - Select scopes: `repo` (Full control of private repositories)
   - Click **Generate token**
   - **Copy the token immediately** (you won't see it again)

2. Add to repository:
   - Go to repository Settings → Secrets and variables → Actions
   - Click **New repository secret**
   - Name: `PAT_TOKEN`
   - Value: Your personal access token
   - Click **Add secret**

### 3. (Optional, recommended) Set up YML_APP_DISPATCH_TOKEN

Only needed if you want YogaMatLabData to notify YML_app whenever the `data` branch updates (config changes or weekly data pipeline updates).

This token must have access to the *target repo* (by default `productStripesAdmin/YML_app`).

1. Create a Personal Access Token:
   - Recommended: **Tokens (classic)** with scope `repo` (private repos)
   - Alternative: fine-grained token that has access to the target repo and can trigger workflows / dispatch events

2. Add to this repository:
   - Go to repository Settings → Secrets and variables → Actions
   - Click **New repository secret**
   - Name: `YML_APP_DISPATCH_TOKEN`
   - Value: Your token
   - Click **Add secret**

### 4. (Optional) Configure target repo variables

If the app repo is not `productStripesAdmin/YML_app`, set these repository variables (Settings → Secrets and variables → Actions → **Variables**):

- `YML_APP_OWNER` (defaults to this repo owner)
- `YML_APP_REPO` (defaults to `YML_app`)

## Config Sync to data branch

If your app consumes this repo via a submodule tracking the `data` branch (common for production), the `config/` directory also needs to be kept up to date there.

This repo includes `.github/workflows/sync-config-to-data-branch.yml`, which syncs `config/**` from `main` → `data` on every config change.

## YML_app Notifications

This repo includes `.github/workflows/notify-yml-app.yml`, which sends a `repository_dispatch` event to YML_app after the `data` branch is updated by:

- the weekly pipeline workflow, or
- the config→data sync workflow

To complete the setup, add a receiver workflow in YML_app that updates the YogaMatLabData submodule and runs your brand/series sync. See `docs/YML_APP_AUTOMATION.md`.

## Testing the Workflow

### Manual Trigger

1. Go to the **Actions** tab in your repository
2. Click on **Fetch from products.json endpoints** workflow
3. Click **Run workflow** button
4. Select the branch (usually `main`)
5. Click **Run workflow**

### Monitor Execution

1. The workflow will appear in the Actions tab
2. Click on the running workflow to see real-time logs
3. Each step is collapsible - click to expand and see details
4. Green checkmarks ✅ = success, Red X ❌ = failure

### Viewing Results

After successful execution:

1. **Data files**: Committed to the `data/` directory
2. **Logs**: Available as artifacts (downloadable for 30 days)
3. **Summary**: Visible in the workflow run page
4. **Commit**: Check recent commits for the automated commit with changeset

## Troubleshooting

### Workflow fails with "CONVEX_URL is not set"
- Make sure you added the `CONVEX_URL` secret correctly
- Check spelling and that there are no extra spaces

### Workflow fails with "Failed to fetch brands"
- Verify the `api.brands.getScrapableBrands` query exists in YogaMatLabApp
- Check that brands have `scrapingEnabled: true` and valid `productsJsonUrl`

### No data committed
- Check if there were actually any changes detected
- Look at the workflow logs for "No changes to commit" message

### Rate limiting or 403 errors
- Some brands may block automated requests
- Adjust brand `rateLimit` settings in Convex
- Consider adding user-agent or headers if needed

## Schedule

The workflow runs automatically:
- **Weekly** on Wednesday at 15:00 UTC (7 AM PST / 8 AM PDT)
- Can be triggered **manually** anytime from Actions tab

To change the schedule, edit `.github/workflows/fetch-products.yml` and modify the `cron` expression.

## Notifications

If the pipeline fails:
- An **issue** will be automatically created in the repository
- The issue will include:
  - Date of failure
  - Link to workflow run
  - Labels: `pipeline-failure`, `automated`

You can set up GitHub notifications to get emails/alerts for new issues.
