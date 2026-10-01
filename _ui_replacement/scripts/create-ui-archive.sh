#!/bin/bash

# Script to create a complete UI archive with all components
# This includes all 83 UI files organized by category

set -e

echo "========================================="
echo "Google Classroom UI - Archive Creator"
echo "========================================="
echo ""

# Create archive directory
ARCHIVE_DIR="./ui-archive"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="ui-components_${TIMESTAMP}.zip"

echo "Creating archive: $ARCHIVE_NAME"
echo ""

# Create temporary directory structure
mkdir -p "$ARCHIVE_DIR"

# Copy all UI-related files
echo "Collecting files..."

# Styles
mkdir -p "$ARCHIVE_DIR/app"
cp -v app/globals.css "$ARCHIVE_DIR/app/" 2>/dev/null || echo "  ⚠ app/globals.css not found"
cp -v app/layout.tsx "$ARCHIVE_DIR/app/" 2>/dev/null || echo "  ⚠ app/layout.tsx not found"

if [ -f styles/globals.css ]; then
  mkdir -p "$ARCHIVE_DIR/styles"
  cp -v styles/globals.css "$ARCHIVE_DIR/styles/" 2>/dev/null || true
fi

# Source components
echo "Copying src components..."
if [ -d src ]; then
  cp -rv src "$ARCHIVE_DIR/"
fi

# shadcn/ui components
echo "Copying shadcn/ui library..."
if [ -d components/ui ]; then
  mkdir -p "$ARCHIVE_DIR/components/ui"
  cp -rv components/ui/* "$ARCHIVE_DIR/components/ui/" 2>/dev/null || true
fi

# Theme provider
if [ -f components/theme-provider.tsx ]; then
  cp -v components/theme-provider.tsx "$ARCHIVE_DIR/components/"
fi

# Hooks
echo "Copying hooks..."
if [ -d hooks ]; then
  cp -rv hooks "$ARCHIVE_DIR/"
fi

# Lib utilities
echo "Copying utilities..."
if [ -d lib ]; then
  cp -rv lib "$ARCHIVE_DIR/"
fi

# Configuration files
echo "Copying configuration..."
cp -v components.json "$ARCHIVE_DIR/" 2>/dev/null || echo "  ⚠ components.json not found"
cp -v postcss.config.mjs "$ARCHIVE_DIR/" 2>/dev/null || echo "  ⚠ postcss.config.mjs not found"
cp -v next.config.mjs "$ARCHIVE_DIR/" 2>/dev/null || echo "  ⚠ next.config.mjs not found"
cp -v tsconfig.json "$ARCHIVE_DIR/" 2>/dev/null || echo "  ⚠ tsconfig.json not found"

# Documentation
echo "Copying documentation..."
cp -v GOOGLE_CLASSROOM_REDESIGN.md "$ARCHIVE_DIR/" 2>/dev/null || true
cp -v IMPLEMENTATION_SUMMARY.md "$ARCHIVE_DIR/" 2>/dev/null || true
cp -v BEFORE_AND_AFTER.md "$ARCHIVE_DIR/" 2>/dev/null || true
cp -v QUICK_REFERENCE.md "$ARCHIVE_DIR/" 2>/dev/null || true
cp -v CHANGELOG.md "$ARCHIVE_DIR/" 2>/dev/null || true
cp -v UI_FILES_MANIFEST.md "$ARCHIVE_DIR/" 2>/dev/null || true

echo ""
echo "Creating ZIP archive..."

# Create the ZIP file
if command -v zip &> /dev/null; then
  cd "$ARCHIVE_DIR"
  zip -r "../$ARCHIVE_NAME" . > /dev/null
  cd ..
  
  ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
  
  echo "✓ Archive created successfully!"
  echo ""
  echo "Archive Details:"
  echo "  Name: $ARCHIVE_NAME"
  echo "  Size: $ARCHIVE_SIZE"
  echo "  Location: $(pwd)/$ARCHIVE_NAME"
  echo ""
  
  # Count files
  FILE_COUNT=$(unzip -l "$ARCHIVE_NAME" | tail -1 | awk '{print $2}')
  echo "  Total files: $FILE_COUNT"
else
  echo "✗ Error: 'zip' command not found"
  echo "Please install zip: apt-get install zip (or brew install zip on macOS)"
  exit 1
fi

# Cleanup temporary directory
rm -rf "$ARCHIVE_DIR"

echo ""
echo "========================================="
echo "Archive ready for distribution!"
echo "========================================="
