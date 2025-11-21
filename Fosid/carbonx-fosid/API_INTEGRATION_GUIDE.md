# Settings Tabs - Backend API Integration Guide

## Overview
This guide shows how to connect the Notifications and Security tabs to a backend API.

## API Endpoints Reference

### Notification Management Endpoints

#### Get User Notification Preferences
```
GET /api/notifications/preferences
Content-Type: application/json
Authorization: Bearer {token}

Response (200 OK):
{
  "preferences": [
    {
      "id": "email-emissions-alerts",
      "type": "email",
      "category": "Emissions Alerts",
      "description": "Get notified when emissions exceed thresholds",
      "enabled": true,
      "frequency": "immediate"
    },
    ...
  ]
}
```

#### Update Notification Preferences
```
PUT /api/notifications/preferences
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "preferences": [
    {
      "id": "email-emissions-alerts",
      "enabled": true,
      "frequency": "daily"
    },
    ...
  ]
}

Response (200 OK):
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

#### Get Notification History
```
GET /api/notifications/history?limit=20&offset=0
Content-Type: application/json
Authorization: Bearer {token}

Response (200 OK):
{
  "notifications": [
    {
      "id": "notif-001",
      "title": "Emissions Alert",
      "message": "Scope 2 emissions exceeded threshold",
      "type": "alert",
      "timestamp": "2024-11-13T14:30:00Z",
      "read": false
    },
    ...
  ],
  "total": 45,
  "hasMore": true
}
```

### Security Endpoints

#### Change Password
```
POST /api/security/password/change
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456",
  "confirmPassword": "newPassword456"
}

Response (200 OK):
{
  "success": true,
  "message": "Password changed successfully"
}

Response (400 Bad Request):
{
  "error": "Passwords do not match"
}

Response (401 Unauthorized):
{
  "error": "Current password is incorrect"
}
```

#### Setup 2FA
```
POST /api/security/2fa/setup
Content-Type: application/json
Authorization: Bearer {token}

Response (200 OK):
{
  "qrCode": "data:image/png;base64,...",
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "backupCodes": [
    "ABC123DEF456",
    "GHI789JKL012",
    ...
  ]
}
```

#### Verify 2FA
```
POST /api/security/2fa/verify
Content-Type: application/json
Authorization: Bearer {token}

Request:
{
  "code": "123456",
  "backupCodes": ["ABC123DEF456", ...]
}

Response (200 OK):
{
  "success": true,
  "message": "2FA enabled successfully"
}
```

#### Get Active Sessions
```
GET /api/security/sessions
Content-Type: application/json
Authorization: Bearer {token}

Response (200 OK):
{
  "sessions": [
    {
      "id": "sess-001",
      "device": "MacBook Pro (Safari)",
      "location": "San Francisco, CA",
      "lastActive": "2024-11-13T09:30:00Z",
      "loginTime": "2024-11-13T09:30:00Z",
      "ipAddress": "192.168.1.100",
      "isCurrent": true
    },
    ...
  ]
}
```

#### Logout Session
```
DELETE /api/security/sessions/{sessionId}
Authorization: Bearer {token}

Response (200 OK):
{
  "success": true,
  "message": "Session logged out successfully"
}
```

#### Logout All Other Sessions
```
DELETE /api/security/sessions/all-except-current
Authorization: Bearer {token}

Response (200 OK):
{
  "success": true,
  "message": "All other sessions have been logged out"
}
```

#### Get Security Audit Log
```
GET /api/security/audit-log?limit=20&offset=0
Content-Type: application/json
Authorization: Bearer {token}

Response (200 OK):
{
  "logs": [
    {
      "id": "log-001",
      "action": "Login",
      "timestamp": "2024-11-13T09:30:00Z",
      "details": "Successful login from new device",
      "status": "success",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    },
    ...
  ],
  "total": 156
}
```

#### Disable 2FA
```
DELETE /api/security/2fa
Authorization: Bearer {token}

Request:
{
  "password": "currentPassword123"
}

Response (200 OK):
{
  "success": true,
  "message": "2FA disabled successfully"
}
```

## Implementation Examples

### Update Notifications Handler
```typescript
const handleSaveNotifications = async () => {
  try {
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        preferences: notifications.map(n => ({
          id: n.id,
          enabled: n.enabled,
          frequency: n.frequency
        }))
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save preferences');
    }

    const data = await response.json();
    console.log('Preferences saved:', data);
    alert('Notification preferences saved successfully!');
  } catch (error) {
    console.error('Error saving preferences:', error);
    alert('Failed to save preferences. Please try again.');
  }
};
```

### Change Password Handler
```typescript
const handleChangePassword = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (passwordData.newPassword !== passwordData.confirmPassword) {
    alert('New passwords do not match!');
    return;
  }
  
  if (passwordData.newPassword.length < 8) {
    alert('Password must be at least 8 characters long!');
    return;
  }

  try {
    const response = await fetch('/api/security/password/change', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        confirmPassword: passwordData.confirmPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Failed to change password');
      return;
    }

    alert('Password updated successfully!');
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowPasswordModal(false);
  } catch (error) {
    console.error('Error changing password:', error);
    alert('An error occurred. Please try again.');
  }
};
```

### Load Notifications on Mount
```typescript
useEffect(() => {
  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/preferences', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load notifications');
      
      const data = await response.json();
      setNotifications(data.preferences);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  loadNotifications();
}, [authToken]);
```

### Load Security Sessions on Mount
```typescript
useEffect(() => {
  const loadSessions = async () => {
    try {
      const response = await fetch('/api/security/sessions', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load sessions');
      
      const data = await response.json();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  loadSessions();
}, [authToken]);
```

### Load Audit Log on Mount
```typescript
useEffect(() => {
  const loadAuditLog = async () => {
    try {
      const response = await fetch('/api/security/audit-log?limit=20', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load audit log');
      
      const data = await response.json();
      setSecurityLogs(data.logs);
    } catch (error) {
      console.error('Error loading audit log:', error);
    }
  };

  loadAuditLog();
}, [authToken]);
```

### Logout Session Handler
```typescript
const handleLogoutSession = async (sessionId: string) => {
  if (!confirm('Are you sure you want to logout this session?')) {
    return;
  }

  try {
    const response = await fetch(`/api/security/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to logout session');
    }

    setSessions(prev => prev.filter(s => s.id !== sessionId));
    alert('Session logged out successfully');
  } catch (error) {
    console.error('Error logging out session:', error);
    alert('Failed to logout session. Please try again.');
  }
};
```

## Error Handling

### Common Error Scenarios

```typescript
interface ApiError {
  error: string;
  code: string;
  statusCode: number;
}

const handleApiError = (error: ApiError) => {
  switch (error.statusCode) {
    case 400:
      alert(`Invalid request: ${error.error}`);
      break;
    case 401:
      alert('Session expired. Please login again.');
      // Redirect to login
      break;
    case 403:
      alert('You do not have permission to perform this action.');
      break;
    case 404:
      alert('Resource not found.');
      break;
    case 500:
      alert('Server error. Please try again later.');
      break;
    default:
      alert(error.error || 'An unexpected error occurred');
  }
};
```

## Security Considerations

### Frontend Security
```typescript
// Don't store sensitive data in localStorage
// Use httpOnly cookies or secure session storage

// Validate password requirements
const validatePassword = (password: string): boolean => {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  
  return minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
};

// Rate limiting for sensitive operations
const [lastPasswordChange, setLastPasswordChange] = useState<Date | null>(null);

const canChangePassword = (): boolean => {
  if (!lastPasswordChange) return true;
  const hoursSince = (new Date().getTime() - lastPasswordChange.getTime()) / (1000 * 60 * 60);
  return hoursSince >= 1; // Allow password change once per hour max
};
```

### Backend Security Checklist
- [ ] Require strong password validation
- [ ] Implement rate limiting on sensitive endpoints
- [ ] Use HTTPS only
- [ ] Implement CSRF token validation
- [ ] Add request signing/verification
- [ ] Log all security-related actions
- [ ] Implement 2FA challenge on password change
- [ ] Require re-authentication for sensitive operations
- [ ] Use JWT with short expiration times
- [ ] Implement refresh token rotation

## Testing the Integration

### Postman Collection Example
```json
{
  "info": {
    "name": "Settings API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Notifications",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer YOUR_TOKEN"
          }
        ],
        "url": {
          "raw": "http://localhost:3000/api/notifications/preferences",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "notifications", "preferences"]
        }
      }
    }
  ]
}
```

## Implementation Timeline

1. **Phase 1**: Mock API responses (current - for UI testing)
2. **Phase 2**: Create backend endpoints
3. **Phase 3**: Implement authentication and authorization
4. **Phase 4**: Add request validation and error handling
5. **Phase 5**: Implement rate limiting and security measures
6. **Phase 6**: Add comprehensive logging and monitoring

---

**Ready for Backend Development**: Yes ✅
**Estimated Implementation Time**: 1-2 weeks
**Frontend Code**: ~750 lines
**Estimated Backend Code**: ~500-800 lines
