#!/usr/bin/env node
/**
 * Set up auto-text rule for AIM_ASSIST tagged leads
 */

const { supabase } = require('./src/config/supabase');
const AutoTextRulesService = require('./src/services/AutoTextRulesService');

const TENANT_ID = '655cd229-b2e9-4737-843b-7488fe9d33e6';

async function setupAutoTextRule() {
  console.log('Setting up AIM_ASSIST auto-text rule...\n');
  
  try {
    // Create rule for AIM_ASSIST tags
    const rule = await AutoTextRulesService.createRule(TENANT_ID, {
      name: 'AIM_ASSIST Auto Outreach',
      description: 'Automatically text leads tagged with AIM_ASSIST',
      priority: 1,
      trigger_type: 'new_lead',
      trigger_conditions: { 
        enable_ai: true,
        auto_text: true 
      },
      delay_minutes: 0, // Send immediately
      lead_tags: ['AIM_ASSIST'],
      excluded_tags: ['DO_NOT_TEXT', 'TEST_COMPLETE'],
      message_template: 'Hi {firstName}, I noticed you\'re interested in real estate. I\'m Eugenia, your AI assistant. How can I help you find your perfect property today?',
      max_sends_per_lead: 1,
      max_sends_per_day: 100,
      is_active: true // Activate immediately
    });
    
    console.log('✅ Auto-text rule created and activated!');
    console.log('Rule ID:', rule.id);
    console.log('\nWhen a new lead with AIM_ASSIST tag is detected:');
    console.log('  1. Lead will be added to database');
    console.log('  2. Auto-text will be sent immediately');
    console.log('  3. AI will be enabled for conversation');
    
    return rule;
  } catch (error) {
    console.error('❌ Failed to create rule:', error.message);
    
    // Check if rule already exists
    const rules = await AutoTextRulesService.getRules(TENANT_ID);
    const existing = rules.find(r => r.name === 'AIM_ASSIST Auto Outreach');
    
    if (existing) {
      console.log('\n✅ Rule already exists!');
      
      // Ensure it's active
      if (!existing.is_active) {
        console.log('Activating existing rule...');
        await AutoTextRulesService.updateRule(existing.id, { is_active: true });
        console.log('✅ Rule activated!');
      }
      
      return existing;
    }
    
    throw error;
  }
}

async function main() {
  console.log('=====================================');
  console.log('  AIM_ASSIST Auto-Text Setup');
  console.log('=====================================\n');
  
  if (!supabase) {
    console.error('❌ Supabase not configured!');
    console.log('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  
  try {
    await setupAutoTextRule();
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Add a new lead in FUB with AIM_ASSIST tag');
    console.log('  2. Wait up to 5 minutes for the next poll cycle');
    console.log('  3. The system will automatically text the lead');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

if (require.main === module) {
  main();
}