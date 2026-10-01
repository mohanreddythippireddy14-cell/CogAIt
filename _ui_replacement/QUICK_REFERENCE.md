# Google Classroom Redesign - Quick Reference Guide

## What Changed?

### Visual Design
- **From**: Dark purple/pink theme with glow effects
- **To**: Clean white/blue Google Classroom aesthetic
- **Features**: ALL PRESERVED - nothing removed

## Color Quick Reference

```css
/* Main Colors */
--primary: #1f73e6;           /* Google Blue */
--background: #ffffff;         /* White */
--secondary: #f8f9fa;          /* Light Gray */
--foreground: #202124;         /* Dark Text */
--border: #dadce0;             /* Light Border */
--muted-foreground: #5f6368;   /* Gray Text */

/* Status Colors */
--destructive: #d33b27;        /* Red (Error) */
--success: #34a853;            /* Green */
--warning: #fbbc04;            /* Yellow */
```

## CSS Classes

### Cards
```jsx
<div className="ui-card p-6">
  Content here
</div>
```

### Buttons
```jsx
<button className="ui-button-primary">Primary Action</button>
<button className="ui-button-secondary">Secondary Action</button>
```

### Inputs
```jsx
<input className="ui-input w-full" type="text" />
<select className="ui-input w-full">...</select>
```

### Navigation
```jsx
<div className="app-nav-item">Home</div>
<div className="app-nav-item active">Active Page</div>
```

### Headers
```jsx
<header className="app-shell-header h-16">
  Navigation content
</header>
```

### Badges/Pills
```jsx
<span className="app-pill">Label</span>
```

### Loading States
```jsx
<div className="ui-skeleton h-4 w-2/3" />
```

## Layout Examples

### Dashboard Grid
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="ui-card">...</div>
  <div className="ui-card">...</div>
  <div className="ui-card">...</div>
</div>
```

### Form Layout
```jsx
<div className="space-y-4">
  <div>
    <label className="block text-sm font-medium mb-1">Label</label>
    <input className="ui-input w-full" />
  </div>
</div>
```

### Header with User Menu
```jsx
<header className="app-shell-header h-16 flex justify-between items-center px-4">
  <div className="flex items-center gap-4">Logo & Title</div>
  <div className="flex items-center gap-3">Profile Menu</div>
</header>
```

## Component Usage

### All Features Available
- ✅ StudentDashboard - Student home page
- ✅ LecturerDashboard - Lecturer home page
- ✅ CreateAssignment - Assignment creation
- ✅ CreateAIAssignment - AI-powered assignments
- ✅ EditAssignment - Edit existing assignments
- ✅ QuestionView - Take quiz questions
- ✅ StudentResults - View quiz results
- ✅ AssignmentAnalytics - Analytics dashboard
- ✅ JoinClassPage - Join a class
- ✅ StudentAnalytics - Student performance
- ✅ StudentClassroom - View class materials
- ✅ LiveSessionMonitor - Live monitoring
- ✅ AdminSystemMonitor - System health

## Customization

### Change Primary Color
Edit `/app/globals.css`:
```css
:root {
  --primary: #YOUR_COLOR;
  --primary-foreground: #ffffff;
}
```

### Adjust Spacing
Use Tailwind classes:
```jsx
p-4          /* padding */
m-6          /* margin */
gap-4        /* gap between items */
mb-8         /* margin-bottom */
```

### Add Custom Styling
Create new utility class in `/app/globals.css`:
```css
@layer components {
  .my-custom-component {
    @apply rounded-lg border border-border p-4;
  }
}
```

## File Locations

### Main App Files
- `/src/App.tsx` - Main application
- `/src/main.tsx` - Entry point
- `/app/globals.css` - Theme & styles
- `/app/layout.tsx` - Root layout

### Components
- `/src/components/` - All UI components
- `/src/SignInForm.tsx` - Authentication
- `/src/ProfileMenu.tsx` - User menu

### Documentation
- `/GOOGLE_CLASSROOM_REDESIGN.md` - Full design guide
- `/IMPLEMENTATION_SUMMARY.md` - Technical summary
- `/BEFORE_AND_AFTER.md` - Visual comparison
- `/QUICK_REFERENCE.md` - This file

## Responsive Design

### Breakpoints
```
sm: 640px   (tablets)
md: 768px   (medium)
lg: 1024px  (desktops)
xl: 1280px  (large screens)
```

### Grid Examples
```jsx
/* 1 column on mobile, 2 on tablet, 3 on desktop */
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

/* Hide on mobile, show on desktop */
<div className="hidden md:block">

/* Full width on mobile, limited on desktop */
<div className="w-full lg:w-2/3">
```

## Browser DevTools Tips

### View Dark Mode
```javascript
// In console:
document.documentElement.classList.add('dark');
document.documentElement.classList.remove('dark');
```

### Test Responsive
- Chrome/Firefox: Right-click → Inspect → Device Toolbar
- Safari: Develop → Enter Responsive Design Mode

## Common Tasks

### Add a New Page
1. Create component in `/src/components/`
2. Export from `/src/components/index.ts`
3. Add route in `/src/App.tsx`
4. Use Google Classroom styling

### Update Colors
Edit `/app/globals.css` `:root` section

### Modify Spacing
Use Tailwind scale (p-2, p-4, p-6, p-8)

### Change Button Style
Update `.ui-button-primary` or `.ui-button-secondary` in `/app/globals.css`

### Dark Mode
Automatically handled via `.dark` class in `/app/globals.css`

## Troubleshooting

### Colors Not Changing
- Check CSS variables in `/app/globals.css`
- Clear browser cache
- Restart dev server

### Layout Issues
- Check Tailwind classes spelling
- Verify flexbox/grid setup
- Test responsive breakpoints

### Components Not Showing
- Check imports in `/src/components/index.ts`
- Verify component exports
- Check console for errors

## Performance Tips

1. **Use CSS Classes** - Leverage Tailwind utilities
2. **Lazy Load** - Load components only when needed
3. **Optimize Images** - Use proper sizes
4. **Minimize Effects** - Already done in Google Classroom theme

## Accessibility

### Color Contrast
- All text meets WCAG AA standards
- Blue (#1f73e6) on white (#ffffff) = 4.5:1 ratio
- Proper hover/focus states

### Keyboard Navigation
- All interactive elements are keyboard accessible
- Proper tab order
- Focus indicators visible

### Screen Readers
- Semantic HTML
- Proper ARIA labels
- Meaningful alt text

## Support & Resources

### Google Material Design
- https://material.google.com/

### Tailwind CSS
- https://tailwindcss.com/

### Component Examples
- Check `/src/components/` for examples

---

**Need more help?** Check the full documentation files:
- `GOOGLE_CLASSROOM_REDESIGN.md`
- `IMPLEMENTATION_SUMMARY.md`
- `BEFORE_AND_AFTER.md`
