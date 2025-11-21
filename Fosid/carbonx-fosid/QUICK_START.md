# Quick Start Guide - Notifications & Security Tabs

## 🚀 Getting Started (5 minutes)

### 1. View the Implementation
The new tabs are already integrated into your settings page:

```bash
# Open the settings page
frontend/app/settings/page.tsx
```

### 2. Test in Browser
Navigate to your settings page and click on:
- **Notifications** tab → See email/SMS/in-app preferences
- **Security** tab → See password, 2FA, and sessions management

### 3. Try the Features

**Notifications Tab:**
- Toggle each notification type on/off
- Change frequency (Immediate/Daily/Weekly/Monthly)
- Click "Save Preferences" button
- Scroll through recent notifications

**Security Tab:**
- Click "Change Password" to open modal
- Try changing password (validation shows errors)
- Toggle 2FA on/off
- Click logout on different sessions
- Scroll through security activity log

## 📋 What's in Each Tab

### Notifications Tab Sections
```
✉️ Email Notifications
   - Emissions Alerts (enabled, immediate)
   - Report Generation (enabled, weekly)
   - Location Updates (disabled, daily)

🔔 In-App Notifications
   - Goals & Targets (enabled, immediate)
   - System Updates (enabled, weekly)

📱 SMS Notifications
   - Critical Alerts (disabled, immediate)

🕐 Recent Notifications
   - Scrollable history of past notifications

💾 Save Preferences Button
   - Saves all changes with confirmation
```

### Security Tab Sections
```
🔒 Password Management
   - Last changed date
   - Change Password button
   - Opens modal for password update

🛡️ Two-Factor Authentication
   - Toggle to enable/disable
   - Shows authenticator app status
   - Download backup codes option

🌐 Active Sessions
   - MacBook Pro (current device)
   - iPhone 14 Pro (logout available)
   - Windows Desktop (logout available)
   - Bulk logout option

📊 Security Activity Log
   - Login events
   - Password changes
   - 2FA modifications
   - Failed attempts

⚠️ Danger Zone
   - Delete Account & All Data option
```

## 🎨 How to Customize

### Change Colors
Edit the color classes in the component:

```tsx
// Example: Change email notifications from blue to green
<div className='bg-gradient-to-r from-green-50 to-green-100'>
```

Available Tailwind colors: emerald, green, blue, purple, orange, red, yellow, gray

### Add More Notifications
Edit the notifications array in NotificationsTab:

```tsx
const [notifications, setNotifications] = useState<NotificationPreference[]>([
  // Add new notification here
  {
    id: 'email-new-alert',
    type: 'email',
    category: 'New Alert Type',
    description: 'Description here',
    enabled: true,
    frequency: 'immediate',
    icon: <FiMail className='text-blue-500' />,
  },
  // ... existing notifications
]);
```

### Add More Sessions
Edit the sessions array in SecurityTab:

```tsx
const [sessions, setSessions] = useState<SecuritySession[]>([
  // Add new session here
  {
    id: 'sess-new',
    device: 'iPad (Safari)',
    location: 'New York, NY',
    lastActive: 'Now',
    loginTime: '2024-11-13 10:00 AM',
    ipAddress: '203.0.113.1',
    isCurrent: false,
  },
  // ... existing sessions
]);
```

### Modify Security Log Events
Edit the securityLogs array in SecurityTab:

```tsx
const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([
  // Add new event here
  {
    id: 'log-new',
    action: 'Email Changed',
    timestamp: '2024-11-13 11:00 AM',
    details: 'Email address updated successfully',
    status: 'success',
    ipAddress: '192.168.1.100',
  },
  // ... existing logs
]);
```

## 🔌 Connect to Backend

### Step 1: Import fetch hook (if needed)
Already using fetch API - no additional imports needed

### Step 2: Load Data on Mount
Add to NotificationsTab:

```tsx
useEffect(() => {
  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setNotifications(data.preferences);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };
  
  loadNotifications();
}, [token]);
```

### Step 3: Update Save Handler
Update in NotificationsTab:

```tsx
const handleSaveNotifications = async () => {
  try {
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        preferences: notifications.map(n => ({
          id: n.id,
          enabled: n.enabled,
          frequency: n.frequency
        }))
      })
    });

    if (response.ok) {
      alert('Preferences saved successfully!');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Failed to save preferences');
  }
};
```

### Step 4: Similar Pattern for Security Tab
Apply same pattern to SecurityTab for:
- Password changes
- 2FA setup
- Session management
- Audit logs

See `API_INTEGRATION_GUIDE.md` for full examples.

## 🧪 Testing Checklist

- [ ] Click on Notifications tab - should render without errors
- [ ] Click on Security tab - should render without errors
- [ ] Toggle notification switches - should show/hide frequency selectors
- [ ] Change notification frequency - should update dropdown
- [ ] Click Save Preferences - should show success message
- [ ] Click Change Password - should open modal
- [ ] Enter passwords - validation should work
- [ ] Click Cancel - should close modal without saving
- [ ] Toggle 2FA - should enable/disable checkbox
- [ ] Click logout on session - should remove from list
- [ ] Scroll notification history - should work smoothly
- [ ] Scroll activity log - should work smoothly
- [ ] Test on mobile - should be responsive
- [ ] Test on tablet - should be responsive
- [ ] Test on desktop - should be fully featured

## 📱 Responsive Testing

**Mobile (iPhone 375px):**
```
Settings
├── Notifications ← Click here
│   └── Single column layout
│       └── Full-width inputs
│
└── Security ← Or here
    └── Single column layout
        └── Full-width inputs
```

**Tablet (iPad 768px):**
```
Multiple columns where appropriate
Good spacing between elements
Touch-friendly buttons
```

**Desktop (1920px):**
```
Full multi-column layouts
Hover effects on all interactive elements
Optimized keyboard navigation
```

## 🐛 Common Issues & Solutions

### Issue: Tab not showing
**Solution**: Check that tabs array includes:
```tsx
{ id: 'notifications', label: 'Notifications', icon: <FiBell size={18} /> },
{ id: 'security', label: 'Security', icon: <FiShield size={18} /> },
```

### Issue: Modal not appearing
**Solution**: Ensure `showPasswordModal` state is true and check browser console for errors

### Issue: Buttons not working
**Solution**: Check that onClick handlers are properly bound and state setters are called

### Issue: Styles look wrong
**Solution**: 
1. Clear browser cache (Ctrl+Shift+R)
2. Check Tailwind CSS is properly configured
3. Verify class names have no typos

### Issue: Icons not showing
**Solution**: 
1. Check imports: `import { FiMail, FiBell, ... } from 'react-icons/fi'`
2. Ensure all icons are correctly imported

## 📞 Getting Help

### Check Documentation
1. `SETTINGS_TABS_IMPLEMENTATION.md` - Detailed features
2. `API_INTEGRATION_GUIDE.md` - Backend integration
3. `SETTINGS_UI_GUIDE.md` - Visual layouts
4. `IMPLEMENTATION_CHECKLIST.md` - Code structure

### Debug in Browser
1. Open DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Check Network tab for API calls

### Common Console Messages
```
// Success message
"Notification preferences saved: Array(6)"

// Error messages you might see
"Failed to save preferences"
"Failed to change password"
"Error loading notifications"
```

## 🎯 Next Steps

1. **Test the UI** - Make sure everything works
2. **Customize** - Adjust colors, icons, text
3. **Connect Backend** - Use API_INTEGRATION_GUIDE.md
4. **Add Validation** - Enhance error handling
5. **Deploy** - Push to production

## 📊 File Locations Reference

```
Your Project
├── frontend/
│   └── app/
│       └── settings/
│           └── page.tsx ← Main implementation
├── SETTINGS_TABS_IMPLEMENTATION.md
├── API_INTEGRATION_GUIDE.md
├── SETTINGS_UI_GUIDE.md
├── IMPLEMENTATION_CHECKLIST.md
└── PROJECT_SUMMARY.md
```

## ⚡ Performance Tips

- ✅ Notification history is scrollable (doesn't load all at once)
- ✅ Modals render only when needed
- ✅ State updates are efficient
- ✅ No unnecessary re-renders
- ✅ Images are icons (lightweight)

## 🔐 Security Reminders

- Never store passwords in localStorage
- Always use HTTPS for API calls
- Validate input on backend too
- Use secure cookies for sensitive data
- Implement rate limiting
- Log all security actions

## 💾 Save Points

Before making changes, consider:
- Creating a git branch: `git checkout -b feature/notifications-security`
- Backing up the original file
- Testing changes in dev environment first

## 🎓 Learn More

The code demonstrates:
- React Hooks (useState, useRef, useEffect)
- TypeScript interfaces
- Tailwind CSS responsive design
- Form handling & validation
- Modal dialogs
- State management
- Component composition

Perfect for learning React patterns!

---

**Happy Coding! 🚀**

Questions? Refer to the documentation files included in your project.
