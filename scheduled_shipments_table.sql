-- Create scheduled_shipments table based on existing 'order' table structure
-- This follows the same pattern as regular orders but adds scheduling-specific fields
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS scheduled_shipments (
    -- Same core fields as 'order' table
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL,
    partner_id UUID NOT NULL, -- Reference to logistics partner
    delivery_cost JSONB NOT NULL, -- Same structure as order: {total_delivery_cost, trippa_fee, logistic_delivery_cost}
    order_data JSONB NOT NULL, -- Same as order table - complete order request data
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
    
    -- Foreign key constraint
    CONSTRAINT fk_scheduled_shipments_business 
        FOREIGN KEY (business_id) 
        REFERENCES business(id) 
        ON DELETE CASCADE,
        
    CONSTRAINT fk_scheduled_shipments_partner 
        FOREIGN KEY (partner_id) 
        REFERENCES logistics_partner(id) 
        ON DELETE RESTRICT
);
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scheduled_shipments_business_id ON scheduled_shipments(business_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_shipments_status ON scheduled_shipments(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_shipments_scheduled_date ON scheduled_shipments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_shipments_created_at ON scheduled_shipments(created_at);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_scheduled_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at column
CREATE TRIGGER trigger_update_scheduled_shipments_updated_at
    BEFORE UPDATE ON scheduled_shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_shipments_updated_at();

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE scheduled_shipments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own scheduled shipments
CREATE POLICY "Users can view own scheduled shipments" ON scheduled_shipments
    FOR SELECT USING (business_id IN (
        SELECT id FROM business WHERE supabase_user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own scheduled shipments" ON scheduled_shipments
    FOR INSERT WITH CHECK (business_id IN (
        SELECT id FROM business WHERE supabase_user_id = auth.uid()
    ));

CREATE POLICY "Users can update own scheduled shipments" ON scheduled_shipments
    FOR UPDATE USING (business_id IN (
        SELECT id FROM business WHERE supabase_user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own scheduled shipments" ON scheduled_shipments
    FOR DELETE USING (business_id IN (
        SELECT id FROM business WHERE supabase_user_id = auth.uid()
    ));

-- Grant necessary permissions
GRANT ALL ON scheduled_shipments TO authenticated;
GRANT ALL ON scheduled_shipments TO service_role;