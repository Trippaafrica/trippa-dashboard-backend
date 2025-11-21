/**
 * Script to migrate users from Supabase Auth (profiles table) to custom auth (users table)
 * 
 * Usage: 
 *   node scripts/migrate-users.js
 * 
 * This will:
 * 1. Copy all companies → organizations
 * 2. Copy all profiles → users
 * 3. Generate temporary passwords for all users
 * 4. Users will need to use "Forgot Password" to set new passwords
 */

const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Temporary password for all migrated users
const TEMP_PASSWORD = 'ChangeMe123!';

async function migrateUsers() {
  console.log('🚀 Starting migration from Supabase Auth to Custom Auth\n');

  try {
    // Step 1: Fetch all companies
    console.log('📊 Step 1: Migrating companies → organizations...');
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*');

    if (companiesError) throw companiesError;

    console.log(`   Found ${companies?.length || 0} companies`);

    // Migrate companies to organizations
    const tempPasswordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
    
    for (const company of companies || []) {
      const { error: orgError } = await supabase
        .from('organizations')
        .upsert({
          id: company.id,
          name: company.name,
          industry: company.industry,
          size: company.size,
          country: company.country,
          website: company.website,
          subscription_plan: 'free',
          subscription_status: company.status === 'suspended' ? 'suspended' : 'active',
          created_at: company.created_at,
          updated_at: company.updated_at,
        }, { onConflict: 'id' });

      if (orgError && !orgError.message.includes('duplicate')) {
        console.error(`   ⚠️  Error migrating company ${company.name}:`, orgError.message);
      }
    }

    console.log('   ✓ Companies migrated\n');

    // Step 2: Fetch all profiles
    console.log('👥 Step 2: Migrating profiles → users...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) throw profilesError;

    console.log(`   Found ${profiles?.length || 0} profiles\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    // Migrate profiles to users
    for (const profile of profiles || []) {
      // Split full_name into first and last name
      const nameParts = (profile.full_name || 'User Name').trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];

      // Map roles
      let role = 'user';
      if (profile.role === 'super_admin' || profile.role === 'company_admin') {
        role = 'admin';
      } else if (profile.role === 'auditor') {
        role = 'auditor';
      }

      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: profile.id,
          organization_id: profile.company_id,
          email: profile.email,
          password_hash: tempPasswordHash,
          first_name: firstName,
          last_name: lastName,
          role: role,
          phone: profile.phone,
          avatar_url: profile.avatar_url,
          is_active: profile.is_active ?? true,
          last_login_at: profile.last_login,
          created_at: profile.created_at,
          updated_at: profile.updated_at || new Date().toISOString(),
        }, { onConflict: 'id' });

      if (userError) {
        if (userError.message.includes('duplicate')) {
          skippedCount++;
          console.log(`   ⏭️  Skipped ${profile.email} (already exists)`);
        } else {
          console.error(`   ❌ Error migrating ${profile.email}:`, userError.message);
        }
      } else {
        migratedCount++;
        console.log(`   ✓ Migrated ${profile.email} (${profile.role} → ${role})`);
      }
    }

    console.log('\n✅ Migration completed!');
    console.log(`   Migrated: ${migratedCount} users`);
    console.log(`   Skipped: ${skippedCount} users (already existed)`);
    console.log(`\n🔐 Temporary password for all migrated users: ${TEMP_PASSWORD}`);
    console.log('\n⚠️  IMPORTANT: All users must reset their password!');
    console.log('   They can use "Forgot Password" at the login page.\n');

    // Step 3: List all migrated users
    console.log('📋 Migrated users:');
    const { data: users } = await supabase
      .from('users')
      .select('email, first_name, last_name, role')
      .order('email');

    console.table(users);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateUsers();
