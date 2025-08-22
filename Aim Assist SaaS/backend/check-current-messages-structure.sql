-- Check current structure of messages table
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;