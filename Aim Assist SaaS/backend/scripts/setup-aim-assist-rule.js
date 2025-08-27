#!/usr/bin/env node

/**
 * Setup script for AIM_ASSIST auto-text rule
 * Creates the rule configuration in the database
 */

require('dotenv').config();
const { supabase } = require('../src/config/supabase');

// Configuration for AIM_ASSIST auto-text rule
const AIM_ASSIST_RULE = {
  name: 'AIM_ASSIST Auto Outreach',
  description: 'Automatically text leads tagged with AIM_ASSIST',
  is_active: true,
  priority: 1, // High priority
  trigger_type: 'tag_added',
  trigger_conditions: {
    enable_ai: true,
    required_tags: ['AIM_ASSIST']
  },
  delay_minutes: 1, // Send 1 minute after detection
  send_window_start: '09:00:00',
  send_window_end: '20:00:00',
  timezone: 'America/New_York',
  lead_sources: [], // Apply to all sources
  lead_tags: ['AIM_ASSIST'], // Required tag
  excluded_tags: ['DO_NOT_TEXT', 'VIP', 'MANUAL_ONLY', 'TEST'],
  message_template: `Hi {firstName}! I saw you were interested in learning more about available properties in the area. I'm here to help you find exactly what you're looking for. What specific features are most important to you in your next home?`,
  max_sends_per_lead: 1, // Only send once per lead
  max_sends_per_day: 100, // Safety limit
  stop_on_response: true, // Don't send more if lead responds
  metadata: {
    created_by: 'setup_script',
    purpose: 'initial_outreach',
    campaign: 'aim_assist'
  }
};

async function createAutoTextRule(tenantId) {
  try {
    console.log(`📝 Creating AIM_ASSIST auto-text rule for tenant ${tenantId}...`);
    
    // Check if rule already exists
    const { data: existingRule } = await supabase
      .from('auto_text_rules')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('name', AIM_ASSIST_RULE.name)
      .single();
    
    if (existingRule) {
      console.log(`⚠️  Rule "${AIM_ASSIST_RULE.name}" already exists (ID: ${existingRule.id})`);
      
      // Update existing rule
      const { data: updated, error: updateError } = await supabase
        .from('auto_text_rules')
        .update({
          ...AIM_ASSIST_RULE,
          updated_at: new Date()
        })
        .eq('id', existingRule.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      
      console.log('✅ Rule updated successfully');
      return updated;
    }
    
    // Create new rule
    const { data: rule, error } = await supabase
      .from('auto_text_rules')
      .insert({
        tenant_id: tenantId,
        ...AIM_ASSIST_RULE,
        sends_count: 0,
        responses_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    console.log(`✅ Rule created successfully (ID: ${rule.id})`);
    return rule;
    
  } catch (error) {
    console.error('❌ Error creating auto-text rule:', error);
    throw error;
  }
}

async function setupForAllTenants() {
  try {
    console.log('🚀 Setting up AIM_ASSIST auto-text rules...\n');
    
    // Get all active tenants
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, name, organization_id')
      .eq('is_active', true);
    
    if (error) throw error;
    
    if (!tenants || tenants.length === 0) {
      console.log('⚠️  No active tenants found');
      
      // Try to get demo tenant
      const { data: demoTenant } = await supabase
        .from('tenants')
        .select('id, name, organization_id')
        .eq('id', 1)
        .single();
      
      if (demoTenant) {
        console.log(`\nSetting up for demo tenant: ${demoTenant.name || 'Tenant 1'}`);
        await createAutoTextRule(demoTenant.id);
      }
      return;
    }
    
    console.log(`Found ${tenants.length} active tenant(s)\n`);
    
    // Create rule for each tenant
    for (const tenant of tenants) {
      console.log(`\n📍 Tenant: ${tenant.name || `Tenant ${tenant.id}`}`);
      console.log(`   Organization ID: ${tenant.organization_id}`);
      
      try {
        await createAutoTextRule(tenant.id);
      } catch (error) {
        console.error(`   Failed: ${error.message}`);
      }
    }
    
    console.log('\n✨ Setup complete!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

async function main() {
  // Check if specific tenant ID provided
  const tenantId = process.argv[2];
  
  if (tenantId) {
    console.log(`Setting up for tenant ID: ${tenantId}\n`);
    await createAutoTextRule(parseInt(tenantId));
  } else {
    await setupForAllTenants();
  }
  
  console.log('\n📌 Rule Configuration:');
  console.log('   Trigger: Leads tagged with "AIM_ASSIST"');
  console.log('   Delay: 1 minute after detection');
  console.log('   Hours: 9am - 8pm ET');
  console.log('   AI: Enabled after first message');
  console.log('   Limit: 1 message per lead, max 100/day');
}

// Run the setup
main().catch(console.error);