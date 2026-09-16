-- ============================================================
-- Database: bcc_nstp_system
-- MySQL Schema for BCC ROTC/CWTS 
-- ============================================================

CREATE DATABASE IF NOT EXISTS `bcc_nstp_database`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `bcc_nstp_database`;


CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','director') NOT NULL DEFAULT 'admin',
  `program` ENUM('ROTC','CWTS','BOTH') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_email` (`email`),
  UNIQUE KEY `uk_admin_username` (`username`),
  KEY `idx_admin_role` (`role`),
  KEY `idx_admin_program` (`program`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 1. students (was: account_reservations)
-- ============================================================
CREATE TABLE IF NOT EXISTS `students` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Personal Info
  `student_id` VARCHAR(50) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `middle_name` VARCHAR(100) NOT NULL DEFAULT '',
  `suffix` VARCHAR(20) DEFAULT NULL,
  `religion` VARCHAR(100) NOT NULL DEFAULT '',
  `birthdate` VARCHAR(20) NOT NULL DEFAULT '',
  `sex` ENUM('Male','Female','') NOT NULL DEFAULT '',
  `contact_number` VARCHAR(30) NOT NULL DEFAULT '',
  `place_of_birth` VARCHAR(255) NOT NULL DEFAULT '',
  -- Temporary Address
  `temporary_barangay` VARCHAR(255) NOT NULL DEFAULT '',
  `temporary_municipality` VARCHAR(255) NOT NULL DEFAULT '',
  `temporary_province` VARCHAR(255) NOT NULL DEFAULT '',
  -- Permanent Address
  `permanent_barangay` VARCHAR(255) NOT NULL DEFAULT '',
  `permanent_municipality` VARCHAR(255) NOT NULL DEFAULT '',
  `permanent_province` VARCHAR(255) NOT NULL DEFAULT '',
  -- Parent/Guardian
  `father_name` VARCHAR(255) NOT NULL DEFAULT '',
  `father_occupation` VARCHAR(255) NOT NULL DEFAULT '',
  `mother_name` VARCHAR(255) NOT NULL DEFAULT '',
  `mother_occupation` VARCHAR(255) NOT NULL DEFAULT '',
  -- Emergency Contact
  `emergency_contact_name` VARCHAR(255) NOT NULL DEFAULT '',
  `emergency_contact_address` VARCHAR(500) NOT NULL DEFAULT '',
  `emergency_contact_relationship` VARCHAR(100) NOT NULL DEFAULT '',
  `emergency_contact_contact_number` VARCHAR(30) NOT NULL DEFAULT '',
  `willing_to_take_advance_course` TINYINT(1) NOT NULL DEFAULT 0,
  `willing_to_be_medics` TINYINT(1) NOT NULL DEFAULT 0,
  `willing_to_be_military_police` TINYINT(1) NOT NULL DEFAULT 0,
  -- Academic Info
  `course` VARCHAR(255) NOT NULL DEFAULT '',
  `year_level` ENUM('1st Year','2nd Year','3rd Year','4th Year','') NOT NULL DEFAULT '',
  `nstp_component` ENUM('ROTC','CWTS','') NOT NULL DEFAULT '',
  -- Physical & Health
  `height` VARCHAR(20) NOT NULL DEFAULT '',
  `weight` VARCHAR(20) NOT NULL DEFAULT '',
  `blood_type` ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-','N/A','') NOT NULL DEFAULT '',
  `complexion` VARCHAR(50) NOT NULL DEFAULT '',
  `has_medical_condition` TINYINT(1) DEFAULT NULL,
  `medical_condition` VARCHAR(500) NOT NULL DEFAULT '',
  `medical_certificate` LONGTEXT DEFAULT NULL,
  `xray_file` LONGTEXT DEFAULT NULL,
  -- Account Info
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `photo` LONGTEXT DEFAULT NULL,
  `cor_file` LONGTEXT DEFAULT NULL,
  -- CWTS Assignment
  `company` ENUM('Alpha','Bravo','Charlie','Delta','Echo','Foxtrot') DEFAULT NULL,
  -- ROTC Assignment
  `battalion` TINYINT UNSIGNED DEFAULT NULL,
  `rotc_company` ENUM('Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel') DEFAULT NULL,
  `rotc_platoon` TINYINT UNSIGNED DEFAULT NULL,
  -- Special Unit
  `special_unit` ENUM('Medics','HQ','MP') DEFAULT NULL,
  `platoon` VARCHAR(50) DEFAULT NULL,
  -- Extra
  `grades` DECIMAL(5,2) DEFAULT NULL,
  `serial_number` VARCHAR(100) DEFAULT NULL,
  -- Role
  `role` ENUM('student','admin','officer') NOT NULL DEFAULT 'student',
  -- Timestamps
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`email`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_nstp_component` (`nstp_component`),
  KEY `idx_company` (`company`),
  KEY `idx_rotc_company` (`rotc_company`),
  KEY `idx_battalion` (`battalion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. enrollment_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS `enrollment_schedules` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `ms_level` ENUM('1','2') NOT NULL,
  `year` VARCHAR(20) NOT NULL,
  `open_date` VARCHAR(50) NOT NULL,
  `deadline` VARCHAR(50) NOT NULL,
  `platoons_assigned_at` DATETIME DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_program_ms_year` (`program`, `ms_level`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. student_ms_records
-- ============================================================
CREATE TABLE IF NOT EXISTS `student_ms_records` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `schedule_id` VARCHAR(100) NOT NULL,
  `ms_level` ENUM('1','2') NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT DEFAULT NULL,
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_schedule_id` (`schedule_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_ms_records_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. attendance_sessions (was: create_attendance)
-- ============================================================
CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `ms_level` ENUM('1','2') DEFAULT NULL,
  `is_advance_course` TINYINT(1) DEFAULT NULL,
  `school_year` VARCHAR(20) DEFAULT NULL,
  `mi_number` INT DEFAULT NULL,
  `mi_type` ENUM('in','out') DEFAULT NULL,
  `open_date` VARCHAR(50) NOT NULL,
  `close_date` VARCHAR(50) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `radius_meters` INT NOT NULL DEFAULT 100,
  `status` ENUM('open','closed','scheduled') NOT NULL DEFAULT 'scheduled',
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_program` (`program`),
  KEY `idx_status` (`status`),
  KEY `idx_school_year` (`school_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. attendance_records (was: attendance_list)
-- ============================================================
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `attendance_session_id` INT UNSIGNED NOT NULL,
  `status` ENUM('present','late','absent') NOT NULL,
  `mi_number` INT DEFAULT NULL,
  `mi_type` ENUM('in','out') DEFAULT NULL,
  `latitude` DOUBLE DEFAULT NULL,
  `longitude` DOUBLE DEFAULT NULL,
  `distance_meters` DECIMAL(10,2) DEFAULT NULL,
  `verified_by` VARCHAR(255) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_session_id` (`attendance_session_id`),
  UNIQUE KEY `uk_student_session` (`student_id`, `attendance_session_id`),
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_session` FOREIGN KEY (`attendance_session_id`) REFERENCES `attendance_sessions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. student_grades
-- ============================================================
CREATE TABLE IF NOT EXISTS `student_grades` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `ms_level` ENUM('1','2') NOT NULL,
  `midterm` DECIMAL(5,2) DEFAULT NULL,
  `final_term` DECIMAL(5,2) DEFAULT NULL,
  `grade` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `status` ENUM('Passed','Failed') NOT NULL DEFAULT 'Failed',
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_ms_program` (`student_id`, `ms_level`, `program`),
  CONSTRAINT `fk_grades_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. attendance_offenses
-- ============================================================
CREATE TABLE IF NOT EXISTS `attendance_offenses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `offend` INT NOT NULL DEFAULT 0,
  `settled` TINYINT(1) NOT NULL DEFAULT 0,
  `warning_acknowledged_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_offense` (`student_id`),
  CONSTRAINT `fk_offense_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. serial_numbers
-- ============================================================
CREATE TABLE IF NOT EXISTS `serial_numbers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `serial_number` VARCHAR(100) NOT NULL,
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `signatory_1_name` VARCHAR(255) DEFAULT NULL,
  `signatory_1_position` VARCHAR(255) DEFAULT NULL,
  `signatory_2_name` VARCHAR(255) DEFAULT NULL,
  `signatory_2_position` VARCHAR(255) DEFAULT NULL,
  `signatory_3_name` VARCHAR(255) DEFAULT NULL,
  `signatory_3_position` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_serial` (`student_id`),
  CONSTRAINT `fk_serial_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. serial_number_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS `serial_number_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program` ENUM('ROTC','CWTS') NOT NULL,
  `academic_year` VARCHAR(50) DEFAULT NULL,
  `ceremony_date` VARCHAR(50) DEFAULT NULL,
  `commandant` VARCHAR(255) DEFAULT NULL,
  `school_registrar` VARCHAR(255) DEFAULT NULL,
  `nstp_coordinator` VARCHAR(255) DEFAULT NULL,
  `municipal_mayor` VARCHAR(255) DEFAULT NULL,
  `bcc_president` VARCHAR(255) DEFAULT NULL,
  `commandant_signature` LONGTEXT DEFAULT NULL,
  `school_registrar_signature` LONGTEXT DEFAULT NULL,
  `nstp_coordinator_signature` LONGTEXT DEFAULT NULL,
  `municipal_mayor_signature` LONGTEXT DEFAULT NULL,
  `bcc_president_signature` LONGTEXT DEFAULT NULL,
  `signatory_1_name` VARCHAR(255) DEFAULT NULL,
  `signatory_1_position` VARCHAR(255) DEFAULT NULL,
  `signatory_2_name` VARCHAR(255) DEFAULT NULL,
  `signatory_2_position` VARCHAR(255) DEFAULT NULL,
  `signatory_3_name` VARCHAR(255) DEFAULT NULL,
  `signatory_3_position` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_program` (`program`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. password_reset_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS `password_reset_codes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `verification_code` VARCHAR(20) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_reset` (`student_id`),
  CONSTRAINT `fk_reset_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. advance_course_withdrawals
-- ============================================================
CREATE TABLE IF NOT EXISTS `advance_course_withdrawals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `admin_remarks` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_withdrawal_student` (`student_id`),
  KEY `idx_withdrawal_status` (`status`),
  CONSTRAINT `fk_withdrawal_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
