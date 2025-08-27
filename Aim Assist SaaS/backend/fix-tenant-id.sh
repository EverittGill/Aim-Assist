#!/bin/bash

# Fix tenant_id to organization_id in all service files

echo "Fixing tenant_id references in service files..."

# List of files to fix
files=(
  "src/services/NurturingService.js"
  "src/services/QualificationService.js"
  "src/services/TenantPhoneService.js"
  "src/services/PhoneMatchingService.js"
  "src/services/database/TenantService.js"
  "src/services/database/UserService.js"
  "src/services/TagPollingScheduler.js"
  "src/services/AuditService.js"
  "src/services/CRMSyncService.js"
  "src/services/ConversationService.js"
  "src/services/LeadService.js"
  "src/services/automation/AutoTextService.js"
  "src/services/ai/PromptEngine.js"
  "src/services/ai/PromptManager.js"
  "src/routes/webhooks/twilio.js"
  "src/routes/webhooks/fub.js"
  "src/routes/auto-text.js"
  "src/routes/conversations.js"
  "src/routes/leads.js"
  "src/routes/tenants.js"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    # Use sed to replace tenant_id with organization_id
    sed -i.bak "s/\.eq('tenant_id'/\.eq('organization_id'/g" "$file"
    sed -i.bak "s/tenant_id: tenantId/organization_id: tenantId/g" "$file"
    sed -i.bak "s/tenant_id: this\.tenantId/organization_id: this.tenantId/g" "$file"
    # Remove backup files
    rm "${file}.bak"
  else
    echo "File not found: $file"
  fi
done

echo "Done! Fixed tenant_id references."
