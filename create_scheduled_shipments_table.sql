-- =====================================================
-- Scheduled Shipments Table Creation Script
-- For Trippa Delivery System
-- 
-- This script creates a scheduled_shipments table that follows
-- the same structure as the existing 'order' table but adds
-- scheduling-specific fields.
-- 
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Drop existing table if it exists (optional - remove if you want to keep existing data)
DROP TABLE IF EXISTS scheduled_shipments CASCADE;

-- Create scheduled_shipments table based on existing 'order' table structure
CREATE TABLE scheduled_shipments (
    -- Core fields matching 'order' table structure
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,
    partner_id UUID NOT NULL,
    delivery_cost JSONB NOT NULL, -- Same structure: {total_delivery_cost, trippa_fee, logistic_delivery_cost}
    order_data JSONB NOT NULL, -- Complete order request data (same as order table)
    partner_response JSONB, -- Will be populated when shipment is actually created
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
    order_id TEXT, -- Will be populated when shipment is actually created
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Scheduling-specific fields (additional to order table)
    scheduled_date TIMESTAMPTZ NOT NULL, -- When shipment should be created
    quote_data JSONB NOT NULL, -- Store the selected quote data for reference
    payment_processed BOOLEAN NOT NULL DEFAULT false, -- Track if payment was deducted
    processed_at TIMESTAMPTZ, -- When shipment was actually processed
    error_message TEXT, -- Error message if processing failed
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraints
    CONSTRAINT fk_scheduled_shipments_business 
        FOREIGN KEY (business_id) 
        REFERENCES business(id) 
        ON DELETE CASCADE,
        
    CONSTRAINT fk_scheduled_shipments_partner 
        FOREIGN KEY (partner_id) 
        REFERENCES logistics_partner(id) 
        ON DELETE RESTRICT
);

-- Create indexes for better performance
CREATE INDEX idx_scheduled_shipments_business_id ON scheduled_shipments(business_id);
CREATE INDEX idx_scheduled_shipments_partner_id ON scheduled_shipments(partner_id);
CREATE INDEX idx_scheduled_shipments_status ON scheduled_shipments(status);
CREATE INDEX idx_scheduled_shipments_scheduled_date ON scheduled_shipments(scheduled_date);
CREATE INDEX idx_scheduled_shipments_created_at ON scheduled_shipments(created_at);
CREATE INDEX idx_scheduled_shipments_payment_processed ON scheduled_shipments(payment_processed);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_scheduled_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_scheduled_shipments_updated_at
  BEFORE UPDATE ON scheduled_shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_shipments_updated_at();

-- Add table and column comments for documentation
COMMENT ON TABLE scheduled_shipments IS 'Stores scheduled shipments that will be processed automatically. Follows same structure as order table with additional scheduling fields.';
COMMENT ON COLUMN scheduled_shipments.business_id IS 'Reference to business table - same as order table';
COMMENT ON COLUMN scheduled_shipments.partner_id IS 'Reference to logistics_partner table - same as order table';
COMMENT ON COLUMN scheduled_shipments.delivery_cost IS 'Cost breakdown JSON - same structure as order table: {total_delivery_cost, trippa_fee, logistic_delivery_cost}';
COMMENT ON COLUMN scheduled_shipments.order_data IS 'Complete order request data - same as order table';
COMMENT ON COLUMN scheduled_shipments.partner_response IS 'Response from logistics partner when order is created - same as order table';
COMMENT ON COLUMN scheduled_shipments.status IS 'Current status of scheduled shipment';
COMMENT ON COLUMN scheduled_shipments.order_id IS 'Generated order ID when shipment is processed - same as order table';
COMMENT ON COLUMN scheduled_shipments.scheduled_date IS 'When the shipment should be automatically created';
COMMENT ON COLUMN scheduled_shipments.quote_data IS 'Selected logistics quote data for reference';
COMMENT ON COLUMN scheduled_shipments.payment_processed IS 'Whether payment has been deducted from wallet';
COMMENT ON COLUMN scheduled_shipments.processed_at IS 'When shipment was actually processed';
COMMENT ON COLUMN scheduled_shipments.error_message IS 'Error message if processing failed';

-- Enable Row Level Security (RLS) if needed
ALTER TABLE scheduled_shipments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your authentication setup)
-- Policy for businesses to only see their own scheduled shipments
CREATE POLICY "Businesses can view own scheduled shipments" ON scheduled_shipments
    FOR SELECT USING (business_id = auth.uid()::text::uuid);

CREATE POLICY "Businesses can insert own scheduled shipments" ON scheduled_shipments
    FOR INSERT WITH CHECK (business_id = auth.uid()::text::uuid);

CREATE POLICY "Businesses can update own scheduled shipments" ON scheduled_shipments
    FOR UPDATE USING (business_id = auth.uid()::text::uuid);

-- Note: Adjust the RLS policies above based on your actual authentication setup
-- You might need to modify the auth.uid() part based on how you handle user authentication

-- Verify table creation
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'scheduled_shipments' 
ORDER BY ordinal_position;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Scheduled shipments table created successfully!';
    RAISE NOTICE 'Table structure matches order table with additional scheduling fields.';
    RAISE NOTICE 'Ready for scheduled shipment creation.';
END $$;
