# SQL Migration Fixes Applied

## ✅ Fixed 6 Syntax Errors

### 1. **Conversations Table** (Line 369)
**Error**: PostgreSQL doesn't support `WHERE` clause in `CONSTRAINT UNIQUE`
```sql
-- ❌ WRONG:
CONSTRAINT unique_active_conversation UNIQUE(lead_id, status) WHERE status = 'active'

-- ✅ FIXED:
CREATE UNIQUE INDEX unique_active_conversation ON conversations(lead_id, status) WHERE status = 'active';
```

### 2. **AI Prompts Table** (Line 595)
**Error**: Same partial unique constraint issue
```sql
-- ❌ WRONG:
CONSTRAINT unique_default_prompt UNIQUE(organization_id, prompt_type, is_default) WHERE is_default = true

-- ✅ FIXED:
CREATE UNIQUE INDEX unique_default_prompt ON ai_prompts(organization_id, prompt_type, is_default) WHERE is_default = true;
```

### 3. **CRM Configs Table** (Line 1082)
**Error**: Same partial unique constraint issue
```sql
-- ❌ WRONG:
CONSTRAINT one_primary_crm UNIQUE(organization_id, is_primary) WHERE is_primary = true

-- ✅ FIXED:
CREATE UNIQUE INDEX one_primary_crm ON crm_configs(organization_id, is_primary) WHERE is_primary = true;
```

## 📝 What You Need to Do

1. **Run the Fixed Migration**:
   - Go to: https://supabase.com/dashboard/project/oortuqnectzpqpboywfq/sql/new
   - Copy the entire contents of `BALANCED_MIGRATIONS.sql` (now fixed)
   - Paste and click "Run"

2. **Verify Success**:
   - You should see "Query completed successfully" 
   - No errors should appear

3. **Test Everything**:
   ```bash
   cd "Aim Assist SaaS"
   node test-balanced-migrations.js
   ```

### 4. **Conversations Table** (Line 366)
**Error**: Trailing comma after last column before closing parenthesis
```sql
-- ❌ WRONG:
updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One active conversation per lead
);

-- ✅ FIXED:
updated_at TIMESTAMPTZ DEFAULT NOW()
  
  -- One active conversation per lead
);
```

### 5. **Usage Events Table RLS** (Line 1377)
**Error**: INSERT policies must use `WITH CHECK`, not `USING`
```sql
-- ❌ WRONG:
CREATE POLICY "Service role can insert usage" ON usage_events
  FOR INSERT USING (true);

-- ✅ FIXED:
CREATE POLICY "Service role can insert usage" ON usage_events
  FOR INSERT WITH CHECK (true);
```

### 6. **Webhook Logs Table RLS** (Line 1406)
**Error**: Same INSERT policy issue
```sql
-- ❌ WRONG:
CREATE POLICY "Service role can insert webhook logs" ON webhook_logs
  FOR INSERT USING (true);

-- ✅ FIXED:
CREATE POLICY "Service role can insert webhook logs" ON webhook_logs
  FOR INSERT WITH CHECK (true);
```

## 🎯 Why These Errors Happened

1. **Partial Unique Constraints**: PostgreSQL doesn't support WHERE clauses in CONSTRAINT definitions - must use partial indexes
2. **Trailing Commas**: When removing constraints, left trailing commas before closing parentheses
3. **RLS Policy Syntax**: INSERT policies require `WITH CHECK` not `USING` (USING is for SELECT/UPDATE/DELETE)

The fixed version will now run successfully in Supabase!