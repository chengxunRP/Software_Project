-- Feature 1 (authentication) — additive migration for existing databases.
-- Creates the password_reset_tokens table without touching any other table
-- or data. Run once on a database that already has the users table.
-- New/local databases can simply re-run community_event_manager.sql instead.

USE community_event_manager;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_password_reset_user_id (user_id),
  INDEX idx_password_reset_token_hash (token_hash),
  INDEX idx_password_reset_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
