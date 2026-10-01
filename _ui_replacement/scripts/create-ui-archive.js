#!/usr/bin/env node

/**
 * Google Classroom UI - Archive Creator
 * Creates a complete ZIP archive with all UI-related files (83 total)
 * 
 * Usage: node scripts/create-ui-archive.js
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PROJECT_ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(PROJECT_ROOT, 'ui-components');
const TIMESTAMP = new Date().toISOString().split('T')[0].replace(/-/g, '');
const ARCHIVE_NAME = `ui-components_${TIMESTAMP}.zip`;
const OUTPUT_PATH = path.join(PROJECT_ROOT, ARCHIVE_NAME);

// List of all files to include in the archive
const filesToArchive = [
  // Styles
  'app/globals.css',
  'app/layout.tsx',
  'styles/globals.css',
  
  // Main App
  'src/App.tsx',
  'src/main.tsx',
  'src/SignInForm.tsx',
  'src/ProfileMenu.tsx',
  
  // Components
  'src/components/AppLogo.tsx',
  'src/components/AppErrorBoundary.tsx',
  'src/components/SignUpForm.tsx',
  'src/components/StudentDashboard.tsx',
  'src/components/LecturerDashboard.tsx',
  'src/components/stubs.tsx',
  'src/components/index.ts',
  
  // shadcn/ui
  'components/ui/accordion.tsx',
  'components/ui/alert-dialog.tsx',
  'components/ui/alert.tsx',
  'components/ui/aspect-ratio.tsx',
  'components/ui/avatar.tsx',
  'components/ui/badge.tsx',
  'components/ui/breadcrumb.tsx',
  'components/ui/button-group.tsx',
  'components/ui/button.tsx',
  'components/ui/calendar.tsx',
  'components/ui/card.tsx',
  'components/ui/carousel.tsx',
  'components/ui/chart.tsx',
  'components/ui/checkbox.tsx',
  'components/ui/collapsible.tsx',
  'components/ui/command.tsx',
  'components/ui/context-menu.tsx',
  'components/ui/dialog.tsx',
  'components/ui/drawer.tsx',
  'components/ui/dropdown-menu.tsx',
  'components/ui/empty.tsx',
  'components/ui/field.tsx',
  'components/ui/form.tsx',
  'components/ui/hover-card.tsx',
  'components/ui/input-group.tsx',
  'components/ui/input-otp.tsx',
  'components/ui/input.tsx',
  'components/ui/item.tsx',
  'components/ui/kbd.tsx',
  'components/ui/label.tsx',
  'components/ui/menubar.tsx',
  'components/ui/navigation-menu.tsx',
  'components/ui/pagination.tsx',
  'components/ui/popover.tsx',
  'components/ui/progress.tsx',
  'components/ui/radio-group.tsx',
  'components/ui/resizable.tsx',
  'components/ui/scroll-area.tsx',
  'components/ui/select.tsx',
  'components/ui/separator.tsx',
  'components/ui/sheet.tsx',
  'components/ui/sidebar.tsx',
  'components/ui/skeleton.tsx',
  'components/ui/slider.tsx',
  'components/ui/sonner.tsx',
  'components/ui/spinner.tsx',
  'components/ui/switch.tsx',
  'components/ui/table.tsx',
  'components/ui/tabs.tsx',
  'components/ui/textarea.tsx',
  'components/ui/toast.tsx',
  'components/ui/toaster.tsx',
  'components/ui/toggle-group.tsx',
  'components/ui/toggle.tsx',
  'components/ui/tooltip.tsx',
  'components/ui/use-mobile.tsx',
  'components/ui/use-toast.ts',
  
  // Theme
  'components/theme-provider.tsx',
  
  // Hooks & Utils
  'hooks/use-mobile.ts',
  'hooks/use-toast.ts',
  'lib/utils.ts',
  
  // Config
  'components.json',
  'postcss.config.mjs',
  'next.config.mjs',
  'tsconfig.json',
  
  // Docs
  'GOOGLE_CLASSROOM_REDESIGN.md',
  'IMPLEMENTATION_SUMMARY.md',
  'BEFORE_AND_AFTER.md',
  'QUICK_REFERENCE.md',
  'CHANGELOG.md',
  'UI_FILES_MANIFEST.md',
];

async function createArchive() {
  console.log('=========================================');
  console.log('Google Classroom UI - Archive Creator');
  console.log('=========================================\n');

  // Check if archiver is installed
  let archiver_module;
  try {
    archiver_module = require('archiver');
  } catch (err) {
    console.error('✗ Error: archiver package not found');
    console.error('Please install it with: npm install archiver');
    process.exit(1);
  }

  // Create output stream
  const output = fs.createWriteStream(OUTPUT_PATH);
  const archive = archiver_module('zip', { zlib: { level: 6 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const stats = fs.statSync(OUTPUT_PATH);
      const sizeKB = (stats.size / 1024).toFixed(2);
      
      console.log('\n✓ Archive created successfully!\n');
      console.log('Archive Details:');
      console.log(`  Name: ${ARCHIVE_NAME}`);
      console.log(`  Size: ${sizeKB} KB`);
      console.log(`  Location: ${OUTPUT_PATH}`);
      console.log(`  Total files: ${filesToArchive.filter(f => {
        const filePath = path.join(PROJECT_ROOT, f);
        return fs.existsSync(filePath);
      }).length}`);
      
      console.log('\n=========================================');
      console.log('Archive ready for distribution!');
      console.log('=========================================\n');
      
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);

    let addedCount = 0;
    let missingCount = 0;

    console.log('Collecting files...\n');

    filesToArchive.forEach(file => {
      const filePath = path.join(PROJECT_ROOT, file);
      
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
        addedCount++;
        console.log(`  ✓ ${file}`);
      } else {
        missingCount++;
        console.log(`  ⚠ ${file} (not found)`);
      }
    });

    console.log(`\nTotal: ${addedCount} files added, ${missingCount} missing\n`);
    
    archive.finalize();
  });
}

// Run the archive creator
createArchive()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Error creating archive:', err);
    process.exit(1);
  });
