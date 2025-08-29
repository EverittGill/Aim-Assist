const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// Get current tenant for authenticated user
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    
    // First, try to find tenant where user is the owner
    const { data: ownerTenant, error: ownerError } = await supabase
      .from('organizations')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (ownerTenant) {
      return res.json(ownerTenant);
    }
    
    // If not an owner, check if user exists in users table with a tenant
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('*, tenant:tenants(*)')
      .eq('auth_id', userId)
      .single();
    
    if (userRecord && userRecord.tenant) {
      return res.json(userRecord.tenant);
    }
    
    // No tenant found for this user
    return res.json({ tenant: null });
    
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tenant',
      details: error.message 
    });
  }
});

// Create new tenant
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id;
    const userEmail = req.user.email;
    const {
      name,
      email,
      phone,
      twilioPhone,
      notificationPhone,
      crmConfig,
      leadTags,
      settings
    } = req.body;

    // Check if tenant already exists for this user
    const { data: existingTenant } = await supabase
      .from('organizations')
      .select('id')
      .eq('user_id', userId)
      .single();
    
    if (existingTenant) {
      return res.status(400).json({ 
        error: 'Tenant already exists for this user' 
      });
    }

    // Generate a slug from the name
    const slug = (name || email).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `tenant-${Date.now()}`;
    
    // Create tenant with user_id for ownership
    const { data: tenant, error: tenantError } = await supabase
      .from('organizations')
      .insert({
        user_id: userId,  // Link to Supabase auth user
        name: name || email,
        slug: slug,  // Required field
        email: email || userEmail,
        phone,
        twilio_phone: twilioPhone,
        notification_phone: notificationPhone,
        lead_tags: leadTags || ['Direct Connect', 'PPC'],
        settings: settings || {},
        type: 'individual',
        status: 'active',
        subdomain: name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-') : `tenant-${Date.now()}`
      })
      .select()
      .single();

    if (tenantError) {
      throw tenantError;
    }
    
    // Also create a user record in the users table for multi-user support
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .insert({
        organization_id: tenant.id,
        auth_id: userId,
        email: email || userEmail,
        first_name: name ? name.split(' ')[0] : null,
        last_name: name ? name.split(' ').slice(1).join(' ') : null,
        phone,
        role: 'owner',
        is_active: true
      })
      .select()
      .single();
    
    if (userError) {
      console.error('Failed to create user record:', userError);
      // Don't fail the request, tenant was created
    }

    // CRITICAL: Register Twilio phone number for multi-tenant SMS routing
    if (twilioPhone) {
      const { error: phoneError } = await supabase
        .from('phone_numbers')
        .insert({
          organization_id: tenant.id,
          phone_number: twilioPhone,
          provider: 'twilio',
          type: twilioPhone.startsWith('+1866') || twilioPhone.startsWith('+1855') || twilioPhone.startsWith('+1844') || twilioPhone.startsWith('+1833') ? 'toll_free' : 'local',
          capabilities: {
            sms: true,
            mms: true,
            voice: true
          },
          is_primary: true,
          is_active: true,
          purpose: 'general'
        });
      
      if (phoneError) {
        console.error('Failed to register phone number:', phoneError);
        // Don't fail the request, but log the error
      } else {
        console.log(`✅ Registered phone ${twilioPhone} for tenant ${tenant.id}`);
      }
    }

    // If CRM config provided, create integration
    if (crmConfig && crmConfig.type === 'followupboss' && crmConfig.apiKey) {
      const { error: crmError } = await supabase
        .from('crm_integrations')
        .insert({
          organization_id: tenant.id,
          type: 'followupboss',
          config: {
            apiKey: crmConfig.apiKey,
            xSystem: crmConfig.xSystem,
            xSystemKey: crmConfig.xSystemKey,
            userId: crmConfig.userId
          },
          is_active: true
        });

      if (crmError) {
        console.error('Failed to create CRM integration:', crmError);
        // Don't fail the whole request, tenant was created
      }
    }

    res.json({ 
      success: true,
      tenant 
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ 
      error: 'Failed to create tenant',
      details: error.message 
    });
  }
});

// Create brokerage account
router.post('/brokerage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      name,
      email,
      phone,
      twilioPhone,
      notificationPhone,
      crmConfig,
      leadTags,
      settings,
      agentLimit
    } = req.body;

    // Generate a slug from the name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `brokerage-${Date.now()}`;
    
    // Create brokerage tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('organizations')
      .insert({
        user_id: userId,  // Owner of the brokerage
        name,
        slug: slug,  // Required field
        email,
        phone,
        twilio_phone: twilioPhone,
        notification_phone: notificationPhone,
        lead_tags: leadTags || ['Direct Connect', 'PPC'],
        settings: {
          ...settings,
          agentLimit: agentLimit || 10
        },
        type: 'brokerage',
        status: 'active',
        subdomain: name ? name.toLowerCase().replace(/[^a-z0-9]/g, '-') : `brokerage-${Date.now()}`
      })
      .select()
      .single();

    if (tenantError) {
      throw tenantError;
    }
    
    // Create owner user record
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .insert({
        organization_id: tenant.id,
        auth_id: userId,
        email: email || req.user.email,
        first_name: name ? name.split(' ')[0] : null,
        last_name: name ? name.split(' ').slice(1).join(' ') : null,
        phone,
        role: 'owner',
        is_active: true
      })
      .select()
      .single();
    
    if (userError) {
      console.error('Failed to create user record:', userError);
    }

    // CRITICAL: Register Twilio phone number for multi-tenant SMS routing
    if (twilioPhone) {
      const { error: phoneError } = await supabase
        .from('phone_numbers')
        .insert({
          organization_id: tenant.id,
          phone_number: twilioPhone,
          provider: 'twilio',
          type: twilioPhone.startsWith('+1866') || twilioPhone.startsWith('+1855') || twilioPhone.startsWith('+1844') || twilioPhone.startsWith('+1833') ? 'toll_free' : 'local',
          capabilities: {
            sms: true,
            mms: true,
            voice: true
          },
          is_primary: true,
          is_active: true,
          purpose: 'general'
        });
      
      if (phoneError) {
        console.error('Failed to register phone number:', phoneError);
      } else {
        console.log(`✅ Registered phone ${twilioPhone} for brokerage ${tenant.id}`);
      }
    }

    // Create CRM integration if provided
    if (crmConfig && crmConfig.apiKey) {
      await supabase
        .from('crm_integrations')
        .insert({
          organization_id: tenant.id,
          type: crmConfig.type || 'followupboss',
          config: crmConfig,
          is_active: true
        });
    }

    res.json({ 
      success: true,
      tenant 
    });
  } catch (error) {
    console.error('Error creating brokerage:', error);
    res.status(500).json({ 
      error: 'Failed to create brokerage',
      details: error.message 
    });
  }
});

// Update tenant
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.params.id;
    const userId = req.user.sub;
    
    // Verify tenant belongs to user
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .eq('user_id', userId)
      .single();
    
    if (!existing) {
      return res.status(403).json({ 
        error: 'Access denied' 
      });
    }

    // Extract twilio_phone if being updated
    const { twilio_phone: newTwilioPhone, ...otherUpdates } = req.body;
    
    // Update tenant
    const { data: tenant, error } = await supabase
      .from('organizations')
      .update(req.body)
      .eq('id', organizationId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    
    // If Twilio phone was updated, update phone_numbers table
    if (newTwilioPhone && newTwilioPhone !== existing.twilio_phone) {
      // Deactivate old phone number mapping
      await supabase
        .from('phone_numbers')
        .update({ is_active: false })
        .eq('organization_id', organizationId)
        .eq('is_primary', true);
      
      // Create new phone number mapping
      const { error: phoneError } = await supabase
        .from('phone_numbers')
        .insert({
          organization_id: organizationId,
          phone_number: newTwilioPhone,
          provider: 'twilio',
          type: newTwilioPhone.startsWith('+1866') || newTwilioPhone.startsWith('+1855') || newTwilioPhone.startsWith('+1844') || newTwilioPhone.startsWith('+1833') ? 'toll_free' : 'local',
          capabilities: {
            sms: true,
            mms: true,
            voice: true
          },
          is_primary: true,
          is_active: true,
          purpose: 'general'
        });
      
      if (phoneError) {
        console.error('Failed to update phone number mapping:', phoneError);
      } else {
        console.log(`✅ Updated phone mapping from ${existing.twilio_phone} to ${newTwilioPhone}`);
      }
    }

    res.json({ 
      success: true,
      tenant 
    });
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ 
      error: 'Failed to update tenant',
      details: error.message 
    });
  }
});

// Join existing brokerage
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;
    
    // Find brokerage by code
    const { data: brokerage, error: findError } = await supabase
      .from('organizations')
      .select('*')
      .eq('join_code', code)
      .eq('type', 'brokerage')
      .single();
    
    if (findError || !brokerage) {
      return res.status(404).json({ 
        error: 'Invalid brokerage code' 
      });
    }

    // Generate a slug for the agent
    const agentName = req.body.name || req.user.email;
    const slug = agentName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `agent-${Date.now()}`;
    
    // Create agent tenant under brokerage
    const { data: tenant, error: createError } = await supabase
      .from('organizations')
      .insert({
        user_id: userId,
        parent_organization_id: brokerage.id,
        name: agentName,
        slug: slug,  // Required field
        email: req.user.email,
        phone: req.body.phone,
        notification_phone: req.body.notificationPhone,
        type: 'agent',
        status: 'active',
        // Inherit some settings from brokerage
        lead_tags: brokerage.lead_tags,
        settings: {
          ...brokerage.settings,
          // But keep agent-specific settings
          notificationPhone: req.body.notificationPhone
        }
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    res.json({ 
      success: true,
      tenant,
      brokerage: {
        name: brokerage.name,
        id: brokerage.id
      }
    });
  } catch (error) {
    console.error('Error joining brokerage:', error);
    res.status(500).json({ 
      error: 'Failed to join brokerage',
      details: error.message 
    });
  }
});

module.exports = router;