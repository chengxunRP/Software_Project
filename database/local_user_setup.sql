-- =============================================================================
-- CommunityConnect — Local MySQL application user setup
-- =============================================================================
--
-- IMPORTANT INSTRUCTIONS
-- ----------------------
-- 1. Run this script only after database/community_event_manager.sql has been
--    executed successfully (the community_event_manager database must exist).
-- 2. Connect to MySQL Workbench using a root / admin account that can create
--    users and grant privileges.
-- 3. BEFORE running, replace BOTH occurrences of:
--       CHANGE_TO_YOUR_OWN_PASSWORD
--    with a strong password of your own. Do not commit a real password here.
-- 4. Use the same password in your local .env file as DB_PASSWORD.
--
-- This script creates:
--   communityconnect_user@localhost
--   communityconnect_user@127.0.0.1
-- with caching_sha2_password authentication and ALL PRIVILEGES on
-- community_event_manager.* only.
-- =============================================================================

DROP USER IF EXISTS 'communityconnect_user'@'localhost';
DROP USER IF EXISTS 'communityconnect_user'@'127.0.0.1';

CREATE USER 'communityconnect_user'@'localhost'
IDENTIFIED WITH caching_sha2_password
BY 'CHANGE_TO_YOUR_OWN_PASSWORD';

CREATE USER 'communityconnect_user'@'127.0.0.1'
IDENTIFIED WITH caching_sha2_password
BY 'CHANGE_TO_YOUR_OWN_PASSWORD';

GRANT ALL PRIVILEGES
ON community_event_manager.*
TO 'communityconnect_user'@'localhost';

GRANT ALL PRIVILEGES
ON community_event_manager.*
TO 'communityconnect_user'@'127.0.0.1';

FLUSH PRIVILEGES;

-- Verify the application user was created with the expected auth plugin
SELECT user, host, plugin
FROM mysql.user
WHERE user = 'communityconnect_user'
ORDER BY host;
