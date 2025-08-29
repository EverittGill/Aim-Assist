-- Users belong to tenants (companies)
-- Linked to Supabase Auth for authentication
-- Roles determine what users can do in the system

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_id UUID UNIQUE NOT NULL, -- Links to Supabase auth.users table
  
  -- User info
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  
  -- Role-based access control
  role VARCHAR(50) DEFAULT 'member',
  -- Roles: owner, admin, member, viewer
  
  -- Permissions stored as array for flexibility
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Ensure unique email per tenant
  CONSTRAINT unique_email_per_tenant UNIQUE(tenant_id, email)
);

-- Create indexes for common queries
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(tenant_id, is_active) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see users in their tenant
CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- RLS Policy: Users can update their own profile
CREATE POLICY users_self_update ON users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create user on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- For initial development, create a default tenant if needed
  -- In production, tenant should be created during signup flow
  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    -- Insert user with specified tenant
    INSERT INTO public.users (auth_id, email, tenant_id, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      (NEW.raw_user_meta_data->>'tenant_id')::UUID,
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user record on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add comments for documentation
COMMENT ON TABLE users IS 'Users belonging to tenant organizations';
COMMENT ON COLUMN users.auth_id IS 'References Supabase auth.users.id for authentication';
COMMENT ON COLUMN users.role IS 'User role within tenant: owner, admin, member, viewer';
COMMENT ON COLUMN users.permissions IS 'Additional granular permissions beyond role';