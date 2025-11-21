-- Migration Script: Copy existing profiles to users table
-- This script migrates users from the old Supabase Auth 'profiles' table to the new 'users' table
-- Run this in your Supabase SQL Editor

-- IMPORTANT: This assumes:
-- 1. You have a 'profiles' table from your old Supabase Auth setup
-- 2. The profiles table has columns: id, email, full_name, role, company_id, etc.
-- 3. Users will need to reset their passwords since we don't have access to the old auth.users password hashes

-- Step 1: Check what columns exist in your profiles table
-- Run this first to see your current structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles';

-- Step 2: Create a default password hash for migrated users
-- Users will need to use "forgot password" to set a new password
-- This is bcrypt hash for "ChangeMe123!" - users MUST change this
DO $$
DECLARE
  default_password_hash TEXT := '$2b$10$rKn7VY6qH9X2nGJZPvQG3.AKxKZ7YPZ7YPZ7YPZ7YPZ7YPZ7YPZ7YPZ'; -- Temporary placeholder
BEGIN
  -- Step 3: Insert users from profiles table (adjust column names based on your schema)
  INSERT INTO users (
    id,
    organization_id,
    email,
    password_hash,
    first_name,
    last_name,
    role,
    phone,
    is_active,
    is_email_verified,
    created_at,
    updated_at
  )
  SELECT 
    p.id,
    p.company_id,  -- Assuming company_id maps to organization_id
    p.email,
    default_password_hash,  -- Temporary password - users must reset
    SPLIT_PART(p.full_name, ' ', 1) as first_name,  -- Split full_name
    SUBSTRING(p.full_name FROM POSITION(' ' IN p.full_name) + 1) as last_name,  -- Rest of name
    COALESCE(p.role, 'user'),  -- Default to 'user' if role is NULL
    NULL as phone,  -- Add phone if it exists in profiles
    true as is_active,
    false as is_email_verified,  -- Set to false, require re-verification
    p.created_at,
    NOW()
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.email = p.email
  );  -- Only insert if user doesn't already exist

END $$;

-- Step 4: Verify the migration
SELECT 
  'Migrated' as status,
  COUNT(*) as user_count,
  string_agg(DISTINCT role, ', ') as roles
FROM users;

-- Step 5: Send password reset emails to all migrated users
-- You'll need to implement this in your backend or manually notify users
SELECT 
  email,
  'Password reset required' as message
FROM users
WHERE password_hash = '$2b$10$rKn7VY6qH9X2nGJZPvQG3.AKxKZ7YPZ7YPZ7YPZ7YPZ7YPZ7YPZ7YPZ';
