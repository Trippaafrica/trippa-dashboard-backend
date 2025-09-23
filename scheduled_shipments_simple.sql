-- =====================================================
-- Scheduled Shipments Table for Trippa Backend
-- This matches your existing 'order' table structure exactly
-- with additional scheduling fields
-- =====================================================

-- Create the scheduled_shipments table
CREATE TABLE scheduled_shipments (
    -- Core fields (same as 'order' table)
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id UUID NOT NULL,
    partner_id INTEGER NOT NULL, -- Changed from UUID to INTEGER to match logistics_partner table
    delivery_cost JSONB NOT NULL,
    order_data JSONB NOT NULL,
    partner_response JSONB,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_id TEXT,
    
    -- Scheduling-specific fields
    scheduled_date TIMESTAMPTZ NOT NULL,
    quote_data JSONB NOT NULL,
    payment_processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints
ALTER TABLE scheduled_shipments 
ADD CONSTRAINT fk_scheduled_shipments_business_id 
FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE;

ALTER TABLE scheduled_shipments 
ADD CONSTRAINT fk_scheduled_shipments_partner_id 
FOREIGN KEY (partner_id) REFERENCES logistics_partner(id) ON DELETE RESTRICT;

-- Add status constraint
ALTER TABLE scheduled_shipments 
ADD CONSTRAINT chk_scheduled_shipments_status 
CHECK (status IN ('scheduled', 'processing', 'completed', 'failed', 'cancelled'));

-- Create indexes for performance
CREATE INDEX idx_scheduled_shipments_business_id ON scheduled_shipments(business_id);
CREATE INDEX idx_scheduled_shipments_partner_id ON scheduled_shipments(partner_id);
CREATE INDEX idx_scheduled_shipments_status ON scheduled_shipments(status);
CREATE INDEX idx_scheduled_shipments_scheduled_date ON scheduled_shipments(scheduled_date);
CREATE INDEX idx_scheduled_shipments_created_at ON scheduled_shipments(created_at);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_scheduled_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER trigger_update_scheduled_shipments_updated_at
    BEFORE UPDATE ON scheduled_shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_shipments_updated_at();
