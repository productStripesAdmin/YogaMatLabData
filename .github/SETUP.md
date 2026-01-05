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

Only needed if you want cross-repo commits (e.g., pushing to YogaMatLabApp).

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

## Testing the Workflow

### Manual Trigger

1. Go to the **Actions** tab in your repository
2. Click on **Daily Product Extraction** workflow
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
- **Daily** at 2:00 AM UTC
- Can be triggered **manually** anytime from Actions tab

To change the schedule, edit `.github/workflows/daily-extraction.yml` and modify the `cron` expression.

## Notifications

If the pipeline fails:
- An **issue** will be automatically created in the repository
- The issue will include:
  - Date of failure
  - Link to workflow run
  - Labels: `pipeline-failure`, `automated`

You can set up GitHub notifications to get emails/alerts for new issues.
