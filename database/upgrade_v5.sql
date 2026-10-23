-- Run ONCE for users who already installed Version 3 or 4.
-- Back up your database before upgrading. This does NOT delete existing records.
USE faculty_evaluation;
CREATE TABLE IF NOT EXISTS password_reset_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 status ENUM('pending','issued','completed') NOT NULL DEFAULT 'pending',
 requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX idx_reset_status(status,requested_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS password_resets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL,
 used_at DATETIME NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX idx_reset_user(user_id,used_at)
) ENGINE=InnoDB;
