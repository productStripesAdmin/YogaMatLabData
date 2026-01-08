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
            # Add structure from first item only
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

# Find JSON files
json_files = glob.glob("./data/raw/latest/*.json")

if not json_files:
    print("No JSON files found in ./data/raw/latest/")
    print("Current directory:", os.getcwd())
else:
    file_path = json_files[0]
    json_filename = os.path.basename(file_path)  # e.g., all-products.json
    base_name = os.path.splitext(json_filename)[0]  # without .json
    
    print(f"Generating structure CSV from: {json_filename}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Extract products list
    if isinstance(data, dict) and "products" in data:
        products = data["products"]
    elif isinstance(data, list):
        products = data
    else:
        products = [data]
    
    # Use first product for structure
    structure_rows = collect_structure(products[0])
    
    # Create output filename with original JSON name + timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_csv = f"json_structure_{base_name}_{timestamp}.csv"
    
    # Write to CSV
    with open(output_csv, "w", newline="", encoding="utf-8") as csvfile:
        fieldnames = ["path", "type", "length", "example"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for row in structure_rows:
            writer.writerow(row)
    
    print(f"\nStructure saved to: {output_csv}")
    print(f"   → {len(structure_rows)} fields mapped")
    print("   → Filename includes original JSON name for easy reference!")