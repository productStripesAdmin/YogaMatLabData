# QUEUED PROMPTS

## Prompt 1 - DONE

I want to rename all-products.json to all-products.json. Can you please help with this. I will make the corresponding changes in YogaMatLabApp.

## Prompt 2

https://github.com/productStripesAdmin/YogaMatLabData/actions Daily Product Extraction

I want to update the GitHub Action "Daily Product Extraction" to run weekly on Wednesday mornings (8AM US Pacific time). Plus rename it to "Fetch products from product.json files"

**Considerations:**

- Paginate efficiently — Use ?limit=250 (max) and loop pages until empty
- Add delays/politeness — Sleep 1-2 seconds between stores. "In your case (low-volume, weekly runs on a niche like yoga mats), starting with 1-2 second delays and a pool of 5-10 realistic User-Agents is plenty."
- Store hashes/timestamps — An excellent and efficient way to detect changes in your fetched products.json data [1]
- Monitor for endpoint changes — Some brands disable or protect products.json over time. This should be captured in the Execution Summary.

[1] Practical Implementation Tips

**What to hash:** Concatenate all paginated responses in order and hash the full string, or Normalize the JSON slightly (sort keys, consistent formatting) if you're worried about irrelevant whitespace changes (rare on Shopify).

**Recommended hash function:** SHA-256 (stronger, collision-resistant): hashlib.sha256(data.encode('utf-8')).hexdigest()

MD5 is faster and sufficient for this non-security use case.

**Storage:**

{
  "lululemon": {
    "last_hash": "a1b2c3d4...",
    "last_fetched": "2026-01-01T10:00:00Z",
    "last_changed": "2025-12-10T15:30:00Z"
  },
  "manduka": { ... }
}

## Prompt 3

Alo Yoga (https://www.aloyoga.com) blocks fetching their products.json endpoint (HTTP 403: Forbidden). Can you suggest a workaround? Should we consider adding browser-like headers (User-Agent, Accept, etc.) in your fetch code OR using libraries/tools that better mimic browsers (e.g., Playwright, Puppeteer, or requests with cloudscraper/flaresolverr for Cloudflare bypass). Or manually updating their products.json?

## Prompt 4

The following stores don't have a products.json endpoint. Can you help me to define a data pipeline approach for each?

https://www.lululemon.com
https://www.huggermugger.com/

## Prompt 5 - DONE

Given the existing data pipeline and GitHub Action (to fetch and extract products) , I want to careful not to overwrite "production data" in the remote repo (main branch) with local data. This would mess up the diffs, etc. I think /data/* should be included in gitignore from a local standpoint, however, it must be included in gitignore on the remote repo because committing is part of workflow (fetch data, process, commit).

How should I go about setting this up?