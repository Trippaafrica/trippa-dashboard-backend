-- ==========================================
-- Database Optimizations for Trippa Backend
-- ==========================================
-- This script optimizes database schema for better performance
-- Run this in Supabase SQL Editor

-- ==========================================
-- 1. Glovo Address Book Map Table
-- ==========================================
-- This table caches Glovo address book IDs globally
-- Prevents duplicate API calls and address book entries

CREATE TABLE IF NOT EXISTS glovo_address_book_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_hash TEXT NOT NULL UNIQUE, -- SHA256 hash of normalized address
    formatted_address TEXT NOT NULL, -- Human-readable address from Google Geocoding
    phone_number TEXT NOT NULL DEFAULT '+2348130926960', -- Default Glovo phone
    glovo_address_book_id TEXT NOT NULL, -- Glovo's UUID for this address
    coordinates JSONB, -- {latitude: number, longitude: number}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usage_count INTEGER NOT NULL DEFAULT 1 -- Track how often address is reused
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_glovo_address_hash 
    ON glovo_address_book_map(address_hash);
    
CREATE INDEX IF NOT EXISTS idx_glovo_address_book_id 
    ON glovo_address_book_map(glovo_address_book_id);
    
CREATE INDEX IF NOT EXISTS idx_glovo_updated_at 
    ON glovo_address_book_map(updated_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_glovo_address_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_glovo_address_map_updated_at 
    ON glovo_address_book_map;
    
CREATE TRIGGER trigger_update_glovo_address_map_updated_at
    BEFORE UPDATE ON glovo_address_book_map
    FOR EACH ROW
    EXECUTE FUNCTION update_glovo_address_map_updated_at();

-- Function to increment usage count when address is reused
CREATE OR REPLACE FUNCTION increment_glovo_address_usage(hash TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE glovo_address_book_map 
    SET usage_count = usage_count + 1, 
        updated_at = NOW()
    WHERE address_hash = hash;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 2. Business Table Optimizations
-- ==========================================
-- Add indexes for faster profile queries

CREATE INDEX IF NOT EXISTS idx_business_pickup_state 
    ON business(pickup_state) 
    WHERE pickup_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_email 
    ON business(email);

CREATE INDEX IF NOT EXISTS idx_business_created_at 
    ON business(created_at);

-- ==========================================
-- 3. Order Table Optimizations
-- ==========================================
-- Assuming you have an 'order' or 'orders' table

CREATE INDEX IF NOT EXISTS idx_orders_business_id_created_at 
    ON "order"(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status 
    ON "order"(status);

CREATE INDEX IF NOT EXISTS idx_orders_partner_id 
    ON "order"(partner_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_business_status_created 
    ON "order"(business_id, status, created_at DESC);

-- ==========================================
-- 4. Wallet Table Optimizations
-- ==========================================
-- Faster balance checks and transaction queries

CREATE INDEX IF NOT EXISTS idx_wallet_business_id 
    ON wallet(business_id);

-- If you have a wallet_transactions table
-- CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id_created 
--     ON wallet_transactions(wallet_id, created_at DESC);

-- ==========================================
-- 5. Analytics Query Optimization
-- ==========================================
-- Materialized view for business analytics (optional, for heavy analytics)

-- CREATE MATERIALIZED VIEW IF NOT EXISTS business_shipment_stats AS
-- SELECT 
--     b.id as business_id,
--     b.business_name,
--     COUNT(o.id) as total_shipments,
--     SUM((o.delivery_cost->>'total_delivery_cost')::numeric) as total_spent,
--     MAX(o.created_at) as last_shipment_date,
--     COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_shipments,
--     COUNT(CASE WHEN o.status = 'failed' THEN 1 END) as failed_shipments
-- FROM business b
-- LEFT JOIN "order" o ON b.id = o.business_id
-- GROUP BY b.id, b.business_name;

-- CREATE INDEX IF NOT EXISTS idx_business_shipment_stats_business_id 
--     ON business_shipment_stats(business_id);

-- Refresh function (call this periodically with a cron job)
-- CREATE OR REPLACE FUNCTION refresh_business_stats()
-- RETURNS VOID AS $$
-- BEGIN
--     REFRESH MATERIALIZED VIEW CONCURRENTLY business_shipment_stats;
-- END;
-- $$ LANGUAGE plpgsql;

-- ==========================================
-- 6. Performance Monitoring Views
-- ==========================================

-- View to monitor Glovo address book cache hit rate
CREATE OR REPLACE VIEW glovo_cache_stats AS
SELECT 
    COUNT(*) as total_cached_addresses,
    COUNT(DISTINCT formatted_address) as unique_addresses,
    SUM(usage_count) as total_reuses,
    AVG(usage_count) as avg_reuse_per_address,
    MAX(usage_count) as max_reuse_count,
    COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as recent_additions,
    COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 1 END) as weekly_additions
FROM glovo_address_book_map;

-- View to monitor address book efficiency
CREATE OR REPLACE VIEW address_book_efficiency AS
SELECT 
    formatted_address,
    usage_count,
    glovo_address_book_id,
    created_at,
    updated_at,
    AGE(NOW(), created_at) as age
FROM glovo_address_book_map
WHERE usage_count > 1
ORDER BY usage_count DESC
LIMIT 50;

-- ==========================================
-- 7. Cleanup Functions
-- ==========================================

-- Function to clean up old, unused address book entries
CREATE OR REPLACE FUNCTION cleanup_old_address_book_entries(days_old INTEGER DEFAULT 90)
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
    rows_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM glovo_address_book_map
        WHERE updated_at < NOW() - (days_old || ' days')::INTERVAL
        AND usage_count <= 1  -- Only delete rarely used addresses
        RETURNING *
    )
    SELECT COUNT(*)::INTEGER INTO rows_deleted FROM deleted;
    
    RETURN QUERY SELECT rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 8. Database Maintenance
-- ==========================================

-- Run VACUUM ANALYZE periodically for optimal performance
-- This should be set up as a cron job or scheduled task
-- Example: Run weekly
-- VACUUM ANALYZE glovo_address_book_map;
-- VACUUM ANALYZE business;
-- VACUUM ANALYZE "order";

-- ==========================================
-- Notes and Best Practices
-- ==========================================
/*
1. GLOVO ADDRESS BOOK STRATEGY:
   - Global address book approach is CORRECT and efficient
   - Hashing prevents duplicates across all users
   - Single phone number is acceptable for quotes (per Glovo API)
   - Cache invalidation: Use updated_at for stale entry cleanup

2. CUSTOM PICKUP ADDRESSES:
   - Treat custom pickups same as default pickups
   - Let getOrCreateGlobalAddressBookId() handle both
   - No need to differentiate in database
   - Reuse is automatic via hash matching

3. PERFORMANCE TIPS:
   - Monitor usage_count to identify frequently used addresses
   - Run cleanup function monthly to remove stale entries
   - Keep address_hash index fresh (PostgreSQL does this automatically)
   - Consider connection pooling if not already implemented

4. RATE LIMITING:
   - Cache hit rate should be >70% for optimal Glovo API usage
   - Monitor glovo_cache_stats view weekly
   - If hit rate drops, investigate why new addresses aren't being cached

5. SCALABILITY:
   - Current design scales to millions of addresses
   - Hash-based lookups are O(1) with proper indexing
   - Consider partitioning glovo_address_book_map by date if >10M rows
*/
