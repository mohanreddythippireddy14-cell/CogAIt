# UI Archive Instructions

## Overview

This document explains how to create a complete archive of all UI-related files from the Google Classroom redesign.

**Total Files:** 83 files across 7 categories
**Archive Size:** ~2-3 MB (compressed)

---

## Quick Start

### Option 1: Using Node.js (Recommended)

```bash
# Install archiver package (one-time setup)
npm install archiver

# Create the archive
node scripts/create-ui-archive.js

# Output: ui-components_YYYYMMDD.zip
```

### Option 2: Using Bash Script

```bash
# Make the script executable
chmod +x scripts/create-ui-archive.sh

# Run it
./scripts/create-ui-archive.sh

# Output: ui-components_YYYYMMDD.zip
```

### Option 3: Manual ZIP (macOS/Linux)

```bash
# Create archive with all UI files
zip -r ui-components.zip \
  app/globals.css app/layout.tsx \
  src/ \
  components/ui/ components/theme-provider.tsx \
  hooks/ lib/ styles/ \
  components.json postcss.config.mjs next.config.mjs tsconfig.json \
  GOOGLE_CLASSROOM_REDESIGN.md IMPLEMENTATION_SUMMARY.md \
  BEFORE_AND_AFTER.md QUICK_REFERENCE.md CHANGELOG.md UI_FILES_MANIFEST.md
```

### Option 4: Manual ZIP (Windows)

Using Windows Compressed Folders:
1. Create new folder: `ui-components`
2. Copy these folders into it:
   - `app/`
   - `src/`
   - `components/`
   - `hooks/`
   - `lib/`
3. Copy these files:
   - All `.tsx`, `.ts`, `.json`, `.mjs` config files
   - All `.md` documentation files
4. Right-click folder → "Send to" → "Compressed (zipped) folder"

---

## What Gets Archived

### Core Application (15 files)
- Main app entry points (`App.tsx`, `main.tsx`)
- Authentication forms (`SignInForm.tsx`, `SignUpForm.tsx`)
- Dashboard components (`StudentDashboard.tsx`, `LecturerDashboard.tsx`)
- Layout and styling (`globals.css`, `layout.tsx`)

### UI Component Library (50 files)
Complete shadcn/ui component library including:
- Form inputs (button, input, checkbox, etc)
- Navigation (sidebar, dropdown, breadcrumb, etc)
- Dialogs & modals (dialog, sheet, popover, etc)
- Data display (table, tabs, accordion, etc)
- And 20+ more specialized components

### Utilities & Hooks (3 files)
- `hooks/use-mobile.ts` - Mobile detection
- `hooks/use-toast.ts` - Toast notifications
- `lib/utils.ts` - Utility functions

### Configuration (4 files)
- `components.json` - shadcn/ui config
- `postcss.config.mjs` - PostCSS setup
- `next.config.mjs` - Next.js config
- `tsconfig.json` - TypeScript config

### Documentation (5 files)
- `GOOGLE_CLASSROOM_REDESIGN.md` - Design system
- `IMPLEMENTATION_SUMMARY.md` - Implementation guide
- `BEFORE_AND_AFTER.md` - Visual comparison
- `QUICK_REFERENCE.md` - Quick help
- `CHANGELOG.md` - Change log

---

## File Statistics

| Category | Count | Examples |
|----------|-------|----------|
| Styles | 3 | globals.css, layout.tsx |
| Main App | 5 | App.tsx, SignInForm.tsx |
| Custom Components | 7 | Dashboard, Logo, ErrorBoundary |
| UI Library | 50 | button, card, dialog, etc |
| Hooks & Utils | 3 | use-mobile, use-toast, utils |
| Config | 4 | components.json, tsconfig.json |
| Documentation | 5 | .md files |
| **TOTAL** | **83** | |

---

## Verification Checklist

After creating the archive, verify it contains:

- [ ] `app/` directory with styles and layout
- [ ] `src/` directory with all components
- [ ] `components/ui/` directory with 50+ UI components
- [ ] `hooks/` directory with utility hooks
- [ ] `lib/` directory with utilities
- [ ] `components.json` configuration
- [ ] All `.md` documentation files
- [ ] No `node_modules/` directory
- [ ] No `.git/` directory
- [ ] No `.next/` build directory

---

## Common Issues & Solutions

### Issue: "archiver not found" (Node.js method)
**Solution:** Install it first
```bash
npm install archiver
```

### Issue: Archive is too large (>10 MB)
**Solution:** Check if `node_modules` is included (remove it)
```bash
# Verify node_modules is NOT in archive
unzip -l archive.zip | grep node_modules
```

### Issue: Missing files in archive
**Solution:** Use Option 3 (Manual ZIP) to verify files are copied
```bash
# Check what's in the archive
unzip -l ui-components.zip | head -20
```

### Issue: "Permission denied" on macOS/Linux
**Solution:** Make script executable
```bash
chmod +x scripts/create-ui-archive.sh
```

---

## Distribution

### Recommended Archive Structure

The final archive should have this structure:

```
ui-components.zip
├── app/
│   ├── globals.css
│   └── layout.tsx
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── SignInForm.tsx
│   ├── ProfileMenu.tsx
│   └── components/
│       ├── AppLogo.tsx
│       ├── SignUpForm.tsx
│       ├── StudentDashboard.tsx
│       ├── LecturerDashboard.tsx
│       └── ...
├── components/
│   ├── theme-provider.tsx
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       └── (50+ more)
├── hooks/
│   ├── use-mobile.ts
│   └── use-toast.ts
├── lib/
│   └── utils.ts
├── components.json
├── postcss.config.mjs
├── next.config.mjs
├── tsconfig.json
├── GOOGLE_CLASSROOM_REDESIGN.md
├── IMPLEMENTATION_SUMMARY.md
├── BEFORE_AND_AFTER.md
├── QUICK_REFERENCE.md
├── CHANGELOG.md
└── UI_FILES_MANIFEST.md
```

---

## Integration Instructions

To use the archived files in another project:

### 1. Extract the archive
```bash
unzip ui-components.zip -d /path/to/project
```

### 2. Install dependencies
```bash
npm install
# or
pnpm install
```

### 3. Copy components to your project
```bash
# Copy UI library
cp -r components/ui/ /your-project/components/

# Copy hooks
cp -r hooks/ /your-project/

# Copy utilities
cp -r lib/ /your-project/

# Copy app files
cp -r src/ /your-project/src-new/
```

### 4. Update imports in your files
Adjust imports based on your project structure.

---

## Support

For issues or questions:
1. Check `UI_FILES_MANIFEST.md` for complete file list
2. Review `IMPLEMENTATION_SUMMARY.md` for technical details
3. Consult `QUICK_REFERENCE.md` for quick answers

---

**Last Updated:** 2026-04-14
**Archive Version:** 1.0
**Status:** Ready for distribution
