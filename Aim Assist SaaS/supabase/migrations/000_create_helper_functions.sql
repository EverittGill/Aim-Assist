-- Create helper functions that other migrations depend on

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to set app configuration (for RLS)
CREATE OR REPLACE FUNCTION set_config(parameter text, value text)
RETURNS void AS $$
BEGIN
  PERFORM set_config(parameter, value, false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column IS 'Trigger function to automatically update updated_at timestamp on row changes';
COMMENT ON FUNCTION set_config IS 'Helper function to set session configuration for RLS policies';