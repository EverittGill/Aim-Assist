-- Cleanup all test data
-- Run this to start fresh

-- Delete test organization (cascades to all related tables)
DELETE FROM organizations WHERE subdomain = 'test-realty';

-- Verify cleanup
SELECT 'Cleanup complete. Organizations remaining: ' || COUNT(*)::TEXT as status
FROM organizations;