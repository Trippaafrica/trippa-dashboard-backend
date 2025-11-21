-- Quick Test User Creation
-- Run this in your Supabase SQL Editor to create a test user for immediate login

-- This creates a user with:
-- Email: test@carbonx.com
-- Password: Test123456!

-- First, create an organization (if you don't have one)
INSERT INTO organizations (name, industry, size, country)
VALUES ('Test Organization', 'Technology', 'small', 'Nigeria')
ON CONFLICT DO NOTHING
RETURNING id;

-- Note the organization ID from above, then use it below
-- Replace 'YOUR_ORG_ID_HERE' with the actual ID

-- Create a test user
-- Password hash for "Test123456!" (bcrypt)
INSERT INTO users (
  organization_id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  is_active,
  is_email_verified
)
VALUES (
  (SELECT id FROM organizations LIMIT 1),  -- Use first org or specify your org ID
  'test@carbonx.com',
  '$2b$10$YourHashHere',  -- This won't work - see instructions below
  'Test',
  'User',
  'admin',
  true,
  true
)
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- IMPORTANT: The password hash above is a placeholder
-- ========================================
-- To get the correct hash, run this Node.js script:
--
-- const bcrypt = require('bcrypt');
-- bcrypt.hash('Test123456!', 10, (err, hash) => {
--   console.log(hash);
-- });
--
-- Or use the backend signup endpoint to create a user properly!
