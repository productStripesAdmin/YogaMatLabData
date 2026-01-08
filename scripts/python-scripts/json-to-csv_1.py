# https://grok.com/share/bGVnYWN5_04ff83c8-7c95-4656-aa2d-b706e3a0db43

import json
import pandas as pd
import os
import html  # For unescaping HTML entities like &nbsp;
import re  # Add this line

# Optional: For more aggressive HTML tag removal (fallback if needed)
from bs4 import BeautifulSoup  # Uncomment if you install beautifulsoup4: pip install beautifulsoup4

input_folder = "./data/raw/latest"
output_folder = "./data/raw/latest-to-csv"

print("Current working directory:", os.getcwd())
print("Input folder absolute path:", os.path.abspath(input_folder))
print("Does input folder exist?", os.path.exists(input_folder))
print("Is it a directory?", os.path.isdir(input_folder))

os.makedirs(output_folder, exist_ok=True)

import re
import html

def strip_html(text):
    if not text or not isinstance(text, str):
        return ""

    # 1. Remove the tab navigation block entirely 
    # (Removes the "description" and "benefits" buttons at the top)
    text = re.sub(r'<ul class=["]*tabs["]*.*?>.*?</ul>', '', text, flags=re.DOTALL)

    # 2. Add newlines/spaces before common block tags to prevent words sticking together
    # This ensures "<p>Hello</p><p>World</p>" becomes "Hello World" not "HelloWorld"
    text = re.sub(r'<(p|br|li|div|h1|h2|h3|ul)[^>]*>', ' ', text)

    # 3. Strip all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # 4. Fix HTML entities (like &nbsp; or &amp;)
    text = html.unescape(text)

    # 5. Clean up whitespace: replace multiple spaces/newlines with one space
    text = " ".join(text.split())

    return text.strip()

for filename in os.listdir(input_folder):
    if filename.endswith(".json"):
        json_path = os.path.join(input_folder, filename)
        
        print(f"Processing {filename}...")
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Extract the products list
        if isinstance(data, dict) and "products" in data:
            products = data["products"]
        elif isinstance(data, list):
            products = data
        else:
            print(f"Warning: Unexpected JSON structure in {filename}")
            continue
        
        if not products:
            print(f"No products found in {filename}")
            continue
        
        df = pd.json_normalize(products)
        
        # Clean column names
        df.columns = [col.replace('.', '_') for col in df.columns]
        
        # === NEW: Strip HTML from body_html ===
        if 'body_html' in df.columns:
            df['description_plain'] = df['body_html'].apply(strip_html)
        
        # Add helpful columns
        df['images_count'] = df['images'].apply(lambda x: len(x) if isinstance(x, list) else 0)
        df['variants_count'] = df['variants'].apply(lambda x: len(x) if isinstance(x, list) else 0)
        df['main_price'] = df['variants'].apply(lambda x: x[0]['price'] if isinstance(x, list) and x else None)
        df['main_sku'] = df['variants'].apply(lambda x: x[0]['sku'] if isinstance(x, list) and x else None)
        df['available'] = df['variants'].apply(lambda x: x[0]['available'] if isinstance(x, list) and x else None)
        
        # Optional: Drop the raw body_html if you don't need it anymore
        # df = df.drop(columns=['body_html'])
        
        # Save
        csv_path = os.path.join(output_folder, filename.replace(".json", ".csv"))
        df.to_csv(csv_path, index=False, encoding="utf-8")
        
        print(f"→ Saved {len(df)} products to {os.path.basename(csv_path)}")
        print(f"   New column: description_plain (clean text)\n")