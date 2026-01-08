import json
import glob
import os
import csv
from datetime import datetime

def collect_structure(data, path="", results=None):
    """Recursively collect all fields with their path, type, and example value."""
    if results is None:
        results = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            new_path = f"{path}/{key}" if path else key
            collect_structure(value, new_path, results)
    
    elif isinstance(data, list):
        if len(data) == 0:
            results.append({"path": path, "type": "list", "length": 0, "example": "[]"})
        else:
            results.append({"path": path, "type": "list", "length": len(data), "example": f"[{len(data)} items]"})
            # Only explore the first item to avoid duplication
            collect_structure(data[0], f"{path}/[0]", results)
    
    else:
        # Primitive value
        example = str(data)
        if len(example) > 100:
            example = example[:97] + "..."
        results.append({
            "path": path,
            "type": type(data).__name__,
            "length": None,
            "example": example
        })
    
    return results

# === CONFIGURATION ===
# Change this path if your JSON files are elsewhere
json_path_pattern = "./data/raw/latest/*.json"

json_files = glob.glob(json_path_pattern)

if not json_files:
    print("No JSON files found!")
    print(f"Looking for: {json_path_pattern}")
    print("Current directory:", os.getcwd())
else:
    print(f"Found {len(json_files)} JSON file(s). Generating structure CSVs...\n")
    
    for file_path in json_files:
        json_filename = os.path.basename(file_path)
        base_name = os.path.splitext(json_filename)[0]  # without .json
        
        print(f"Processing: {json_filename}")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Extract the products list (handles both {"products": [...]} and direct list)
            if isinstance(data, dict) and "products" in data:
                products = data["products"]
            elif isinstance(data, list):
                products = data
            else:
                products = [data]  # fallback
            
            if len(products) == 0:
                print(f"   → No products found in {json_filename}, skipping.\n")
                continue
            
            # Use first product to define structure
            structure_rows = collect_structure(products[0])
            
            # Output filename: includes original name + timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_csv = f"json_structure_{base_name}_{timestamp}.csv"
            
            # Write CSV
            with open(output_csv, "w", newline="", encoding="utf-8") as csvfile:
                fieldnames = ["path", "type", "length", "example"]
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for row in structure_rows:
                    writer.writerow(row)
            
            print(f"   → Saved: {output_csv} ({len(structure_rows)} fields)\n")
        
        except Exception as e:
            print(f"   → Error processing {json_filename}: {e}\n")

    print("All done! Check your folder for the new CSV files.")