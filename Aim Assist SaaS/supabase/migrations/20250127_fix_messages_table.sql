-- Migration: Fix Messages Table Schema
-- Date: 2025-01-27
-- Purpose: Add missing columns for message logging functionality

-- Add missing columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50) DEFAULT 'sms',
ADD COLUMN IF NOT EXISTS sender_type VARCHAR(50) DEFAULT 'lead',
ADD COLUMN IF NOT EXISTS provider_sid TEXT,
ADD COLUMN IF NOT EXISTS from_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS to_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_organization_id ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN messages.message_type IS 'Type of message: text, image, voice, etc';
COMMENT ON COLUMN messages.channel_type IS 'Channel used: sms, whatsapp, email, etc';
COMMENT ON COLUMN messages.sender_type IS 'Who sent it: lead, ai, agent, system';
COMMENT ON COLUMN messages.provider_sid IS 'External provider message ID (e.g., Twilio SID)';
COMMENT ON COLUMN messages.from_phone IS 'Sender phone number';
COMMENT ON COLUMN messages.to_phone IS 'Recipient phone number';
COMMENT ON COLUMN messages.metadata IS 'Additional message metadata as JSON';