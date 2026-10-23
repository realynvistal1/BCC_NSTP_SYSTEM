-- Safe upgrade for the prior FacultyEval MySQL database, not PostgreSQL.
-- Back up/export the faculty_evaluation database in phpMyAdmin first.
-- Run this ONCE if your users table already exists from the older ZIP.
USE faculty_evaluation;
ALTER TABLE users
 ADD COLUMN first_name VARCHAR(65) DEFAULT NULL,
 ADD COLUMN middle_name VARCHAR(65) DEFAULT NULL,
 ADD COLUMN last_name VARCHAR(65) DEFAULT NULL,
 ADD COLUMN suffix VARCHAR(20) DEFAULT NULL,
 ADD COLUMN employee_id VARCHAR(40) UNIQUE DEFAULT NULL,
 ADD COLUMN designation VARCHAR(90) DEFAULT NULL,
 ADD COLUMN employment_status VARCHAR(40) DEFAULT NULL,
 ADD COLUMN contact_number VARCHAR(25) DEFAULT NULL,
 ADD COLUMN office_location VARCHAR(120) DEFAULT NULL,
 ADD COLUMN highest_education VARCHAR(150) DEFAULT NULL,
 ADD COLUMN specialization VARCHAR(200) DEFAULT NULL,
 ADD COLUMN bio VARCHAR(600) DEFAULT NULL,
 ADD COLUMN photo_data MEDIUMBLOB DEFAULT NULL,
 ADD COLUMN photo_mime VARCHAR(30) DEFAULT NULL;
-- All existing users, ratings, and evaluation links remain in the original tables.
