-- Fresh MySQL 8.0+ / MariaDB 10.6+ schema. Run in phpMyAdmin.
-- This creates the NEW schema; it does NOT import existing PostgreSQL data.
CREATE DATABASE IF NOT EXISTS faculty_evaluation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE faculty_evaluation;

CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(150) NOT NULL,
 first_name VARCHAR(65) DEFAULT NULL,
 middle_name VARCHAR(65) DEFAULT NULL,
 last_name VARCHAR(65) DEFAULT NULL,
 suffix VARCHAR(20) DEFAULT NULL,
 employee_id VARCHAR(40) UNIQUE DEFAULT NULL,
 designation VARCHAR(90) DEFAULT NULL,
 employment_status VARCHAR(40) DEFAULT NULL,
 contact_number VARCHAR(25) DEFAULT NULL,
 office_location VARCHAR(120) DEFAULT NULL,
 highest_education VARCHAR(150) DEFAULT NULL,
 specialization VARCHAR(200) DEFAULT NULL,
 bio VARCHAR(600) DEFAULT NULL,
 photo_data MEDIUMBLOB DEFAULT NULL,
 photo_mime VARCHAR(30) DEFAULT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 department VARCHAR(150) DEFAULT NULL,
 role ENUM('admin','faculty') NOT NULL DEFAULT 'faculty',
 status ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_role_status(role,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS periods (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(150) NOT NULL,
 school_year VARCHAR(20) NOT NULL,
 semester VARCHAR(50) NOT NULL,
 starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL,
 required_students INT UNSIGNED NOT NULL DEFAULT 40,
 status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_status_dates(status,starts_at,ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS questions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 period_id BIGINT UNSIGNED NOT NULL,
 category VARCHAR(80) NOT NULL DEFAULT 'Teaching Effectiveness',
 question_text VARCHAR(500) NOT NULL,
 sort_order INT UNSIGNED NOT NULL,
 FOREIGN KEY(period_id) REFERENCES periods(id) ON DELETE CASCADE,
 UNIQUE KEY uniq_order(period_id,sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty_periods (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 faculty_id BIGINT UNSIGNED NOT NULL,
 period_id BIGINT UNSIGNED NOT NULL,
 accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_faculty_period(faculty_id,period_id),
 FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 faculty_id BIGINT UNSIGNED NOT NULL,
 period_id BIGINT UNSIGNED NOT NULL,
 subject_code VARCHAR(35) NOT NULL,
 subject_name VARCHAR(170) NOT NULL,
 year_level VARCHAR(45) NOT NULL,
 section_name VARCHAR(70) NOT NULL,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 public_token CHAR(48) NOT NULL UNIQUE,
 requires_code TINYINT(1) NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_assignment(faculty_id,period_id,subject_code,year_level,section_name),
 INDEX idx_period_status(period_id,status),
 FOREIGN KEY(faculty_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(period_id) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS access_codes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 assignment_id BIGINT UNSIGNED NOT NULL,
 code_hash CHAR(64) NOT NULL,
 used_at TIMESTAMP NULL DEFAULT NULL,
 UNIQUE KEY uq_code(assignment_id,code_hash),
 FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS evaluations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 assignment_id BIGINT UNSIGNED NOT NULL,
 comment_text TEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_assignment(assignment_id),
 FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS answers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 evaluation_id BIGINT UNSIGNED NOT NULL,
 question_id BIGINT UNSIGNED NOT NULL,
 rating TINYINT UNSIGNED NOT NULL,
 UNIQUE KEY uq_answer(evaluation_id,question_id),
 INDEX idx_question(question_id),
 FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
 FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE RESTRICT,
 CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- Reset requests are admin-assisted: passwords are never mailed or stored in plaintext.
CREATE TABLE IF NOT EXISTS password_reset_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 status ENUM('pending','issued','completed') NOT NULL DEFAULT 'pending',
 requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_reset_status(status,requested_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_reset_user(user_id,used_at)
) ENGINE=InnoDB;
