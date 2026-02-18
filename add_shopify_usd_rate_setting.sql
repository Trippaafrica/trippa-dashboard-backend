-- Stores configurable system settings, including Shopify USD -> NGN rate.
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default Shopify conversion rate if missing.
INSERT INTO system_settings (key, value, description)
VALUES (
  'shopify_usd_to_ngn_rate',
  '1600',
  'Shopify USD to NGN wallet top-up conversion rate'
)
ON CONFLICT (key) DO NOTHING;

-- Keep updated_at fresh on updates.
CREATE OR REPLACE FUNCTION set_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON system_settings;
CREATE TRIGGER trg_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION set_system_settings_updated_at();
