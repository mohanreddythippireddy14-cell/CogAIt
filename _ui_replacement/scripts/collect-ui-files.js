const fs = require('fs');
const path = require('path');

// All UI-related files to be archived
const uiFiles = [
  // Main styles
  'app/globals.css',
  'app/layout.tsx',
  'styles/globals.css',
  
  // Main app files
  'src/App.tsx',
  'src/main.tsx',
  
  // Component files
  'src/components/AppLogo.tsx',
  'src/components/AppErrorBoundary.tsx',
  'src/components/SignUpForm.tsx',
  'src/components/StudentDashboard.tsx',
  'src/components/LecturerDashboard.tsx',
  'src/components/stubs.tsx',
  'src/components/index.ts',
  
  // Auth form files
  'src/SignInForm.tsx',
  'src/ProfileMenu.tsx',
  
  // shadcn/ui component library
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
  
  // Theme provider
  'components/theme-provider.tsx',
  
  // Utilities
  'lib/utils.ts',
  'hooks/use-mobile.ts',
  'hooks/use-toast.ts',
  
  // Configuration files
  'components.json',
  'postcss.config.mjs',
  'next.config.mjs',
  'tsconfig.json',
  
  // Documentation
  'GOOGLE_CLASSROOM_REDESIGN.md',
  'IMPLEMENTATION_SUMMARY.md',
  'BEFORE_AND_AFTER.md',
  'QUICK_REFERENCE.md',
  'CHANGELOG.md',
];

console.log('=== UI FILES MANIFEST ===\n');
console.log('Total files to archive:', uiFiles.length);
console.log('\nCategories:');
console.log('- Styles:', uiFiles.filter(f => f.endsWith('.css')).length);
console.log('- Components:', uiFiles.filter(f => f.includes('components/')).length);
console.log('- Main App:', uiFiles.filter(f => f.includes('src/')).length);
console.log('- Config:', uiFiles.filter(f => f.endsWith('.json') || f.endsWith('.mjs')).length);
console.log('- Documentation:', uiFiles.filter(f => f.endsWith('.md')).length);
console.log('\nFiles to be archived:\n');

uiFiles.forEach((file, idx) => {
  console.log(`${idx + 1}. ${file}`);
});

module.exports = uiFiles;
