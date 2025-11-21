# Settings Page Tabs - Visual Guide

## Tab Navigation Structure

```
Settings Page
├── User Profile
├── Company Profile
├── Locations
├── Emissions Factors
├── Notifications (NEW) ✨
└── Security (NEW) ✨
```

## Notifications Tab Layout

```
┌─ Notification Preferences ─────────────────────────────┐
│ Control how and when you receive notifications...      │
├─────────────────────────────────────────────────────────┤
│
│ ┌─ Email Notifications ──────────────────────────────┐ │
│ │ ✉️ Manage email alerts about emissions and reports  │ │
│ ├──────────────────────────────────────────────────── │ │
│ │                                                      │ │
│ │ [📈] Emissions Alerts                         [✓]  │ │
│ │     Get notified when emissions exceed...          │ │
│ │     Frequency: [Immediately ▼]                    │ │
│ │                                                      │ │
│ │ [✉️] Report Generation                        [✓]  │ │
│ │     Receive notifications when reports...         │ │
│ │     Frequency: [Weekly Digest ▼]                 │ │
│ │                                                      │ │
│ │ [🏠] Location Updates                         [ ]  │ │
│ │     Get notified about location data...           │ │
│ │                                                      │ │
│ └──────────────────────────────────────────────────── │ │
│
│ ┌─ In-App Notifications ────────────────────────────┐ │
│ │ 🔔 Manage notifications displayed within...       │ │
│ ├─────────────────────────────────────────────────── │ │
│ │                                                    │ │
│ │ [✓] Goals & Targets                         [✓]  │ │
│ │     In-app notifications when targets...         │ │
│ │     Frequency: [Immediately ▼]                  │ │
│ │                                                    │ │
│ │ [⚙️] System Updates                          [✓]  │ │
│ │     In-app notifications for new features...    │ │
│ │     Frequency: [Weekly Digest ▼]               │ │
│ │                                                    │ │
│ └─────────────────────────────────────────────────── │ │
│
│ ┌─ SMS Notifications ───────────────────────────────┐ │
│ │ 📱 Emergency alerts via SMS (requires phone...)    │ │
│ ├─────────────────────────────────────────────────── │ │
│ │                                                    │ │
│ │ [📞] Critical Alerts                         [ ]  │ │
│ │     SMS notifications for critical breaches...   │ │
│ │     Note: SMS requires verified phone number    │ │
│ │                                                    │ │
│ └─────────────────────────────────────────────────── │ │
│
│ ┌─ Recent Notifications ────────────────────────────┐ │
│ │ 🕐 Notification History                           │ │
│ ├─────────────────────────────────────────────────── │ │
│ │                                                    │ │
│ │ [⚠️] Emissions Alert (2 hours ago)                │ │
│ │     Scope 2 emissions exceeded threshold         │ │
│ │                                                    │ │
│ │ [📄] Report Ready (1 day ago)                     │ │
│ │     Monthly emissions report is ready            │ │
│ │                                                    │ │
│ │ [✓] Goal Achieved (3 days ago)                    │ │
│ │     Congratulations! 25% reduction target       │ │
│ │                                                    │ │
│ └─────────────────────────────────────────────────── │ │
│
│                    [💾 Save Preferences]
│
└─────────────────────────────────────────────────────────┘
```

## Security Tab Layout

```
┌─ Security Settings ────────────────────────────────────┐
│ Manage your password, 2FA, and active sessions         │
├────────────────────────────────────────────────────────┤
│
│ ┌─ Password Management ──────────────────────────────┐ │
│ │ 🔒 Change your password to keep account secure    │ │
│ ├────────────────────────────────────────────────── │ │
│ │                                                    │ │
│ │ Last changed: October 10, 2024                   │ │
│ │                     [🖊️ Change Password]         │ │
│ │                                                    │ │
│ │ 💡 Use strong password with uppercase, numbers  │ │
│ │                                                    │ │
│ └────────────────────────────────────────────────── │ │
│
│ ┌─ Two-Factor Authentication ───────────────────────┐ │
│ │ 🛡️ Add extra layer of security                    │ │
│ ├────────────────────────────────────────────────── │ │
│ │                                                    │ │
│ │ 🟢 Enabled      [✓]                              │ │
│ │ Authenticator App Connected                      │ │
│ │ • Device: Microsoft Authenticator                │ │
│ │ • Backup Codes: 6 generated                      │ │
│ │ [⬇️ Download Backup Codes]                       │ │
│ │                                                    │ │
│ └────────────────────────────────────────────────── │ │
│
│ ┌─ Active Sessions ──────────────────────────────┐ │
│ │ 🌐 Manage devices where you are logged in      │ │
│ ├────────────────────────────────────────────── │ │
│ │                                                │ │
│ │ ┌─────────────────────────────────────────┐  │ │
│ │ │ 📱 MacBook Pro (Safari)      [CURRENT] │  │ │
│ │ │ San Francisco, CA                      │  │ │
│ │ │ Last active: Now                       │  │ │
│ │ │ IP: 192.168.1.100                      │  │ │
│ │ └─────────────────────────────────────────┘  │ │
│ │                                                │ │
│ │ ┌─────────────────────────────────────────┐  │ │
│ │ │ 📱 iPhone 14 Pro (Safari)        [Logout]│ │ │
│ │ │ San Francisco, CA                      │  │ │
│ │ │ Last active: 2 hours ago               │  │ │
│ │ │ IP: 203.0.113.45                       │  │ │
│ │ └─────────────────────────────────────────┘  │ │
│ │                                                │ │
│ │ ┌─────────────────────────────────────────┐  │ │
│ │ │ 💻 Windows Desktop (Chrome)      [Logout]│ │ │
│ │ │ San Jose, CA                           │  │ │
│ │ │ Last active: 1 day ago                 │  │ │
│ │ │ IP: 198.51.100.89                      │  │ │
│ │ └─────────────────────────────────────────┘  │ │
│ │                                                │ │
│ │ [🚪 Logout from All Other Devices]           │ │
│ │                                                │ │
│ └────────────────────────────────────────────── │ │
│
│ ┌─ Security Activity Log ────────────────────────┐ │
│ │ 📊 Recent security events and login attempts  │ │
│ ├────────────────────────────────────────────── │ │
│ │                                                │ │
│ │ ✓ Login                  [Success]            │ │
│ │   Successful login from new device            │ │
│ │   2024-11-13 09:30 AM • IP: 192.168.1.100    │ │
│ │                                                │ │
│ │ ✓ Password Changed       [Success]            │ │
│ │   Password updated successfully               │ │
│ │   2024-11-10 03:45 PM • IP: 203.0.113.45     │ │
│ │                                                │ │
│ │ ✗ Login Attempt         [Failed]              │ │
│ │   Failed login - invalid credentials         │ │
│ │   2024-11-08 11:22 AM • IP: 198.51.100.200  │ │
│ │                                                │ │
│ │ ✓ 2FA Enabled            [Success]            │ │
│ │   Two-factor authentication enabled           │ │
│ │   2024-11-01 02:15 PM • IP: 192.168.1.100    │ │
│ │                                                │ │
│ └────────────────────────────────────────────── │ │
│
│ ┌─ DANGER ZONE ──────────────────────────────────┐ │
│ │ ⚠️ Irreversible actions. Proceed with caution. │ │
│ ├────────────────────────────────────────────── │ │
│ │                                                │ │
│ │ [🗑️ Delete Account & All Data          →]    │ │
│ │ Permanent and cannot be undone. All data will │ │
│ │ be deleted.                                  │ │
│ │                                                │ │
│ └────────────────────────────────────────────── │ │
│
└────────────────────────────────────────────────────────┘
```

## Change Password Modal

```
┌────────────────────────────────────────────┐
│ Change Password                        [✕] │
├────────────────────────────────────────────┤
│                                            │
│ Current Password                           │
│ [••••••••••••••••••]                       │
│                                            │
│ New Password                               │
│ [••••••••••••••••••]                       │
│ Minimum 8 characters                       │
│                                            │
│ Confirm New Password                       │
│ [••••••••••••••••••]                       │
│                                            │
│        [Update Password] [Cancel]          │
│                                            │
└────────────────────────────────────────────┘
```

## Color Coding System

### Headers by Section
- **Email Notifications**: Blue Gradient (#3B82F6)
- **In-App Notifications**: Purple Gradient (#A855F7)
- **SMS Notifications**: Orange Gradient (#F97316)
- **Password Management**: Red Gradient (#DC2626)
- **2FA**: Green Gradient (#16A34A)
- **Active Sessions**: Blue Gradient (#3B82F6)
- **Activity Log**: Gray (#6B7280)

### Status Indicators
- ✓ Success: Green (#10B981)
- ✗ Failed: Red (#EF4444)
- ⚠️ Alert: Red (#EF4444)
- ℹ️ Info: Blue (#3B82F6)
- 🟢 Enabled: Green (#22C55E)
- ⚫ Disabled: Gray (#9CA3AF)

## Responsive Design

All sections are responsive:
- **Mobile**: Single column layout
- **Tablet**: Multi-column with proper spacing
- **Desktop**: Full featured layouts with hover states

## Interactive Elements

### Notifications Tab
- Toggle switches for enable/disable
- Dropdown frequency selectors
- Save preferences button
- Scrollable notification history

### Security Tab
- Password change modal
- 2FA toggle and setup wizard
- Session logout buttons
- Individual session logout
- Bulk "logout all" action
- Scrollable security logs
- Account deletion warning

## Data Management

All components use React hooks for state:
- `useState()`: Managing preferences and settings
- `useRef()`: Managing dropdown references
- `useEffect()`: Event listeners for closing dropdowns

No external API integration by default (uses mock data):
- Can be connected to backend endpoints
- Console logging for development/testing
- Alert notifications for user feedback
