/**
 * Setup demo tenant with proper UUID
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function setupDemoTenant() {
  console.log('🚀 Setting up demo tenant...\n');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  // Check for existing demo tenant
  const { data: existing, error: checkError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'demo-tenant')
    .single();
  
  if (existing) {
    console.log('✅ Demo tenant already exists:');
    console.log('   ID:', existing.id);
    console.log('   Name:', existing.name);
    console.log('   Slug:', existing.slug);
    console.log('\n📝 Use this tenant ID in your code:', existing.id);
    
    // Update the webhook to use this ID
    console.log('\n🔧 Update the getTenantFromPhone function to return:', existing.id);
    
    return existing.id;
  }
  
  // Create new demo tenant
  const { data: newTenant, error: createError } = await supabase
    .from('tenants')
    .insert({
      name: 'Demo Company',
      slug: 'demo-tenant',
      subscription_tier: 'trial',
      subscription_status: 'active',
      max_leads: 1000,
      max_messages_per_month: 10000,
      settings: {
        agency_name: 'Demo Realty',
        primary_phone: '+18662981158'
      }
    })
    .select()
    .single();
  
  if (createError) {
    console.error('❌ Error creating tenant:', createError);
    return null;
  }
  
  console.log('✅ Demo tenant created:');
  console.log('   ID:', newTenant.id);
  console.log('   Name:', newTenant.name);
  console.log('   Slug:', newTenant.slug);
  
  // Also create demo CRM integration
  const { data: integration, error: intError } = await supabase
    .from('crm_integrations')
    .insert({
      tenant_id: newTenant.id,
      crm_type: 'followupboss',
      is_active: true,
      is_primary: true,
      credentials: {
        api_key: process.env.DEMO_FUB_API_KEY,
        x_system: process.env.DEMO_FUB_X_SYSTEM,
        x_system_key: process.env.DEMO_FUB_X_SYSTEM_KEY
      },
      field_mappings: {
        talking_status: 'customEugeniaTalkingStatus',
        conversation_link: 'customAimAssist'
      }
    })
    .select()
    .single();
  
  if (intError) {
    console.error('⚠️ Error creating CRM integration:', intError);
  } else {
    console.log('\n✅ CRM integration created');
  }
  
  console.log('\n📝 Use this tenant ID in your code:', newTenant.id);
  console.log('🔧 Update the getTenantFromPhone function to return:', newTenant.id);
  
  return newTenant.id;
}

setupDemoTenant()
  .then(tenantId => {
    if (tenantId) {
      console.log('\n✅ Setup complete!');
      console.log('Tenant ID:', tenantId);
    }
    process.exit(0);
  })
  .catch(console.error);