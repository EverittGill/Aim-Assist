/**
 * Zod schemas for extraction validation
 * Ensures extracted data matches expected format
 * Provides type safety and automatic validation
 */

const { z } = require('zod');

/**
 * Timeline extraction schema
 */
const TimelineSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional()
});

/**
 * Budget extraction schema
 */
const BudgetSchema = z.object({
  value: z.number().positive().nullable(),
  min: z.number().positive().optional(),
  max: z.number().positive().optional(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional()
});

/**
 * Agent status extraction schema
 */
const AgentStatusSchema = z.object({
  hasAgent: z.boolean(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional()
});

/**
 * Financing extraction schema
 */
const FinancingSchema = z.object({
  status: z.enum(['pre-approved', 'cash', 'needs-financing', 'unknown']),
  amount: z.number().positive().optional(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional()
});

/**
 * Escalation schema
 */
const EscalationSchema = z.object({
  shouldPause: z.boolean(),
  reason: z.enum([
    'human-requested',
    'scheduling-requested', 
    'opt-out',
    'qualified',
    'high-value',
    'complex-question',
    'other'
  ]).optional(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional()
});

/**
 * Main lead extraction schema
 */
const LeadExtractionSchema = z.object({
  timeline: TimelineSchema.optional(),
  budget: BudgetSchema.optional(),
  agentStatus: AgentStatusSchema.optional(),
  financing: FinancingSchema.optional(),
  escalation: EscalationSchema.optional(),
  
  // Additional fields that might be extracted
  location: z.object({
    value: z.string(),
    confidence: z.number().min(0).max(1),
    context: z.string().optional()
  }).optional(),
  
  propertyType: z.object({
    value: z.enum(['house', 'condo', 'townhouse', 'land', 'multi-family', 'commercial', 'other']),
    confidence: z.number().min(0).max(1),
    context: z.string().optional()
  }).optional(),
  
  motivation: z.object({
    value: z.enum(['high', 'medium', 'low']),
    confidence: z.number().min(0).max(1),
    context: z.string().optional()
  }).optional(),
  
  // Metadata
  extractionMethod: z.enum(['claude', 'regex', 'hybrid', 'manual']).optional(),
  extractionTimestamp: z.date().optional(),
  overallConfidence: z.number().min(0).max(1).optional()
});

/**
 * Extraction result schema (includes metadata)
 */
const ExtractionResultSchema = z.object({
  success: z.boolean(),
  extraction: LeadExtractionSchema.optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  processingTime: z.number().optional()
});

/**
 * Validation result schema
 */
const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()),
  suggestions: z.record(z.string()).optional()
});

/**
 * Context schema for extraction
 */
const ExtractionContextSchema = z.object({
  leadId: z.string(),
  tenantId: z.string(),
  conversation: z.array(z.object({
    sender: z.enum(['lead', 'ai', 'agent']),
    content: z.string(),
    timestamp: z.date().optional()
  })),
  currentMessage: z.string(),
  leadProfile: z.object({
    name: z.string().optional(),
    source: z.string().optional(),
    stage: z.string().optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

/**
 * Helper function to validate extraction
 */
function validateExtraction(data) {
  try {
    return {
      success: true,
      data: LeadExtractionSchema.parse(data)
    };
  } catch (error) {
    return {
      success: false,
      errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }
}

/**
 * Helper function to validate partial extraction
 */
function validatePartialExtraction(data) {
  try {
    return {
      success: true,
      data: LeadExtractionSchema.partial().parse(data)
    };
  } catch (error) {
    return {
      success: false,
      errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }
}

/**
 * Calculate overall confidence from extraction
 */
function calculateOverallConfidence(extraction) {
  const confidences = [];
  
  if (extraction.timeline?.confidence) confidences.push(extraction.timeline.confidence);
  if (extraction.budget?.confidence) confidences.push(extraction.budget.confidence);
  if (extraction.agentStatus?.confidence) confidences.push(extraction.agentStatus.confidence);
  if (extraction.financing?.confidence) confidences.push(extraction.financing.confidence);
  if (extraction.escalation?.confidence) confidences.push(extraction.escalation.confidence);
  if (extraction.location?.confidence) confidences.push(extraction.location.confidence);
  if (extraction.propertyType?.confidence) confidences.push(extraction.propertyType.confidence);
  if (extraction.motivation?.confidence) confidences.push(extraction.motivation.confidence);
  
  if (confidences.length === 0) return 0;
  
  return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
}

module.exports = {
  // Schemas
  TimelineSchema,
  BudgetSchema,
  AgentStatusSchema,
  FinancingSchema,
  EscalationSchema,
  LeadExtractionSchema,
  ExtractionResultSchema,
  ValidationResultSchema,
  ExtractionContextSchema,
  
  // Helper functions
  validateExtraction,
  validatePartialExtraction,
  calculateOverallConfidence
};