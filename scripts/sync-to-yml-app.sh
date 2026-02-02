#!/bin/bash

# Sync Scoring Data to YML_app
# This script copies the enriched brand-series-index.json to YML_app

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Syncing scoring data to YML_app...${NC}\n"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
YOGAMATLAB_DATA_DIR="$SCRIPT_DIR"

# Try to find YML_app in common locations
YML_APP_DIR=""

if [ -d "$SCRIPT_DIR/../YML_app" ]; then
    YML_APP_DIR="$SCRIPT_DIR/../YML_app"
elif [ -d "$SCRIPT_DIR/../../YML_app" ]; then
    YML_APP_DIR="$SCRIPT_DIR/../../YML_app"
elif [ ! -z "$1" ]; then
    YML_APP_DIR="$1"
else
    echo -e "${RED}❌ Cannot find YML_app directory${NC}"
    echo "Usage: ./sync-to-yml-app.sh [path-to-yml-app]"
    echo "Example: ./sync-to-yml-app.sh ~/projects/YML_app"
    exit 1
fi

echo -e "📂 YogaMatLabData: ${BLUE}$YOGAMATLAB_DATA_DIR${NC}"
echo -e "📂 YML_app: ${BLUE}$YML_APP_DIR${NC}\n"

# Find the latest aggregated data directory
LATEST_DIR=$(ls -t "$YOGAMATLAB_DATA_DIR/data/aggregated" | head -1)
SOURCE_FILE="$YOGAMATLAB_DATA_DIR/data/aggregated/$LATEST_DIR/brand-series-index.json"

echo -e "📊 Using data from: ${BLUE}$LATEST_DIR${NC}\n"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}❌ Source file not found: $SOURCE_FILE${NC}"
    exit 1
fi

# Create directories in YML_app if they don't exist
mkdir -p "$YML_APP_DIR/public/data"
mkdir -p "$YML_APP_DIR/src/types"

# Copy enriched brand-series-index
echo -e "📝 Copying brand-series-index.json..."
cp "$SOURCE_FILE" "$YML_APP_DIR/public/data/brand-series-index.json"
echo -e "${GREEN}✅ Copied brand-series-index.json${NC}"

# Copy TypeScript types
echo -e "\n📝 Copying TypeScript types..."
cp "$YOGAMATLAB_DATA_DIR/config/series-scores.types.ts" \
   "$YML_APP_DIR/src/types/series-scores.types.ts"
echo -e "${GREEN}✅ Copied series-scores.types.ts${NC}"

# Optionally copy raw scores file
if [ "$2" == "--with-raw-scores" ]; then
    echo -e "\n📝 Copying raw series-scores.json..."
    cp "$YOGAMATLAB_DATA_DIR/data/scores/series-scores.json" \
       "$YML_APP_DIR/public/data/series-scores.json"
    echo -e "${GREEN}✅ Copied series-scores.json${NC}"
fi

# Show stats
echo -e "\n📊 Statistics:"
TOTAL=$(cat "$YML_APP_DIR/public/data/brand-series-index.json" | grep -c '"seriesKey"')
REVIEWED=$(cat "$YML_APP_DIR/public/data/brand-series-index.json" | grep -c '"isReviewed": true')

echo -e "   Total series: ${BLUE}$TOTAL${NC}"
echo -e "   Reviewed: ${GREEN}$REVIEWED${NC}"
echo -e "   Pending: $((TOTAL - REVIEWED))"

echo -e "\n${GREEN}✨ Sync complete!${NC}"
echo -e "\n💡 Next steps:"
echo -e "   1. cd $YML_APP_DIR"
echo -e "   2. Start your dev server"
echo -e "   3. Test with a scored series like 'manduka:pro'"
