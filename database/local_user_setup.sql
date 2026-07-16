-- =============================================================================
-- CommunityConnect — Local MySQL application user setup
-- =============================================================================
--
-- Run this file in MySQL Workbench using the root or another MySQL
-- administrator connection.
--
-- Run the main database schema first (database/community_event_manager.sql)
-- so that the community_event_manager database exists.
--
-- Replace the placeholder password CHANGE_TO_YOUR_OWN_PASSWORD before running
-- this script (both CREATE USER statements).
--
-- The password entered here must match DB_PASSWORD inside .env.
--
-- Do not commit a real password to GitHub.
-- =============================================================================

DROP USER IF EXISTS 'communityconnect_user'@'localhost';
DROP USER IF EXISTS 'communityconnect_user'@'127.0.0.1';

CREATE USER 'communityconnect_user'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'CHANGE_TO_YOUR_OWN_PASSWORD';
CREATE USER 'communityconnect_user'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY 'CHANGE_TO_YOUR_OWN_PASSWORD';

GRANT ALL PRIVILEGES ON community_event_manager.* TO 'communityconnect_user'@'localhost';
GRANT ALL PRIVILEGES ON community_event_manager.* TO 'communityconnect_user'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT user, host, plugin
FROM mysql.user
WHERE user = 'communityconnect_user';
