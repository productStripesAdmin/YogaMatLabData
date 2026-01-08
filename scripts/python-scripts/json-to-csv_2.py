import pandas as pd
import json
import glob
import re
import os

# 1. Set your folder variables
input_folder = "./data/raw/latest"
output_folder = "./data/raw/latest-to-csv"

# Create output folder if it doesn't exist
if not os.path.exists(output_folder):
    os.makedirs(output_folder)

# Function to strip HTML and preserve basic spacing
def clean_html(text):
    if not isinstance(text, str):
        return text
    # Replace block tags with newlines to keep the description readable
    text = re.sub(r'<(br|p|li|ul|div)[^>]*>', '\n', text, flags=re.IGNORECASE)
    # Strip all remaining HTML tags
    text = re.sub(r'<[^>]*>', '', text)
    # Clean up excess whitespace/newlines
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n\n', text).strip()
    return text

# 2. Process all JSON files in the input folder
search_path = os.path.join(input_folder, "*.json")

for file_path in glob.glob(search_path):
    file_name = os.path.basename(file_path)
    
    with open(file_path, 'r') as f:
        data = json.load(f)

    # Flatten products and variants (Each variant becomes its own row)
    df = pd.json_normalize(
        data['products'], 
        record_path=['variants'], 
        meta=['title', 'vendor', 'handle', 'body_html'],
        record_prefix='variant_'
    )

    # Clean the HTML from 'body_html' and rename to 'description'
    df['description'] = df['body_html'].apply(clean_html)
    df = df.drop(columns=['body_html'])

    # Organize columns to match your exact sample output schema
    column_order = [
        'variant_id', 'variant_title', 'variant_option1', 'variant_option2', 'variant_option3',
        'variant_sku', 'variant_requires_shipping', 'variant_taxable', 'variant_featured_image',
        'variant_available', 'variant_price', 'variant_grams', 'variant_compare_at_price',
        'variant_position', 'variant_product_id', 'variant_created_at', 'variant_updated_at',
        'title', 'vendor', 'handle', 'description'
    ]
    
    # Ensure all columns exist (fill with empty if missing) and reorder
    for col in column_order:
        if col not in df.columns:
            df[col] = ""
    
    df = df[column_order]

    # 3. Save to output folder
    output_name = file_name.replace(".json", "_cleaned.csv")
    output_path = os.path.join(output_folder, output_name)
    
    df.to_csv(output_path, index=False)
    print(f"Converted: {file_name} -> {output_path}")