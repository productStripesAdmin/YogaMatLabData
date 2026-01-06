# TODOS

## Data Pipeline

- [ ] Rename all-mats.json to all-products.json (as it can contain more that yoga mats). Filter on the front-end.
- [ ] Get clear on the dev vs prod workflows. E.g. One should not commit dev data to prod. Is it possible to exclude local data update from commits to remote? But remote commits (from GitHub actions must include this data)
- [ ] Automate a daily summary from GitHub Actions (email or commit or something else)
- [ ] Handle for Alo Yoga: HTTP 403: Forbidden: [1]
- [ ] How to handle sites with no products.json
- [ ] Can product extract to weekly (from daily)
- [ ] Address google search console

[1] If you're trying to fetch this for personal use or development, you can often get it to work by:

Using a real browser (e.g., open the URL directly in Chrome).
Adding browser-like headers (User-Agent, Accept, etc.) in your fetch code.
Using libraries/tools that better mimic browsers (e.g., Playwright, Puppeteer, or requests with cloudscraper/flaresolverr for Cloudflare bypass).