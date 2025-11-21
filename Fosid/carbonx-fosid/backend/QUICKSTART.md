# CarbonX - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 2: Set Up Supabase Database

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Copy and paste the contents of `backend/database/schema.sql`
4. Click "Run" to execute the schema

### Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-super-secret-key-min-32-characters
FRONTEND_URL=http://localhost:3000
```

### Step 4: Start the Backend Server

```bash
npm run start:dev
```

The backend will run on `http://localhost:3001`

### Step 5: Test the API

Visit: `http://localhost:3001/api/docs` for interactive API documentation

## 📋 Testing the Flow

### 1. Create Admin Account (Signup)

```bash
POST http://localhost:3001/auth/signup
Content-Type: application/json

{
  "email": "admin@acme.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "Acme Corporation",
  "industry": "Technology",
  "companySize": "medium",
  "country": "United States",
  "city": "San Francisco"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@acme.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "admin",
    "organizationId": "uuid"
  }
}
```

### 2. Login

```bash
POST http://localhost:3001/auth/login
Content-Type: application/json

{
  "email": "admin@acme.com",
  "password": "SecurePass123!"
}
```

### 3. Get My Profile

```bash
GET http://localhost:3001/users/me
Authorization: Bearer YOUR_JWT_TOKEN
```

### 4. Invite a User

```bash
POST http://localhost:3001/invitations
Authorization: Bearer YOUR_ADMIN_JWT_TOKEN
Content-Type: application/json

{
  "email": "user@acme.com",
  "role": "user"
}
```

**Response will include invitation token in console:**
```
Invitation link for user@acme.com: http://localhost:3000/accept-invitation?token=xxx-xxx-xxx
```

### 5. Accept Invitation

```bash
POST http://localhost:3001/auth/accept-invitation
Content-Type: application/json

{
  "token": "the-invitation-token",
  "password": "UserPass123!",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

## 🎯 User Roles & Permissions

| Action | Admin | Auditor | User |
|--------|-------|---------|------|
| View organization | ✅ | ✅ | ✅ |
| Update organization | ✅ | ❌ | ❌ |
| Invite users | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View emissions | ✅ | ✅ | ✅ |
| Create emissions | ✅ | ❌ | ✅ |
| Generate reports | ✅ | ✅ | ❌ |

## 🔐 Authentication Headers

All protected endpoints require JWT token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📚 API Documentation

Interactive API docs: `http://localhost:3001/api/docs`

## 🛠️ Troubleshooting

### Error: "Cannot find module @nestjs/swagger"

Run:
```bash
npm install
```

### Error: "Supabase connection failed"

Check your `.env` file has correct Supabase credentials.

### Error: "JWT must be provided"

Make sure you're sending the `Authorization: Bearer TOKEN` header.

### Port already in use

Change the `PORT` in `.env`:
```env
PORT=3002
```

## 🔄 Next Steps

1. ✅ Backend is running
2. Set up frontend to consume these APIs
3. Update frontend auth flow to use backend
4. Remove Supabase client from frontend (use API calls instead)

## 📞 Need Help?

- Check the main `README.md` for detailed documentation
- View API docs at `/api/docs`
- Check the database schema in `database/schema.sql`
