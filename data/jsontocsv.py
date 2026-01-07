# https://grok.com/share/bGVnYWN5_04ff83c8-7c95-4656-aa2d-b706e3a0db43
 
import json
import pandas as pd
import os

# Folder containing your JSON files (change this path)
input_folder = "./raw/latest"  # current directory, or e.g., "path/to/json/files"
output_folder = "./raw/latest-to-csv"  # where to save CSVs

for filename in os.listdir(input_folder):
    if filename.endswith(".json"):
        json_path = os.path.join(input_folder, filename)
        
        # Read JSON
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Convert to DataFrame (handles list of dicts, or nested)
        df = pd.json_normalize(data)  # Great for flattening nested JSON
        
        # If it's not a list, wrap it
        # if isinstance(data, dict):
        #     df = pd.json_normalize([data])
        
        # Save to CSV
        csv_path = os.path.join(output_folder, filename.replace(".json", ".csv"))
        df.to_csv(csv_path, index=False, encoding="utf-8")
        
        print(f"Converted {filename} → {os.path.basename(csv_path)}")