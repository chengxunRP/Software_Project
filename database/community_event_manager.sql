-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: community_event_manager
-- ------------------------------------------------------
-- Server version	8.4.6

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `attendance_id` int NOT NULL AUTO_INCREMENT,
  `registration_id` int NOT NULL,
  `attendance_status` enum('Attended','Absent') COLLATE utf8mb4_unicode_ci NOT NULL,
  `check_in_time` datetime DEFAULT NULL,
  `check_out_time` datetime DEFAULT NULL,
  `volunteer_hours` decimal(5,2) NOT NULL DEFAULT '0.00',
  `recorded_by` int NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attendance_id`),
  UNIQUE KEY `registration_id` (`registration_id`),
  KEY `fk_attendance_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_attendance_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_attendance_registration` FOREIGN KEY (`registration_id`) REFERENCES `event_registrations` (`registration_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,2,'Attended','2026-08-15 08:05:00','2026-08-15 11:00:00',3.00,2,'Volunteer hours recorded for Beach Sweeper duty','2026-07-15 13:34:23'),(2,1,'Attended','2026-08-15 08:10:00','2026-08-15 11:00:00',0.00,2,'Participant attendance — volunteer_hours remains 0','2026-07-15 13:34:23');
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_categories`
--

DROP TABLE IF EXISTS `event_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_categories` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_categories`
--

LOCK TABLES `event_categories` WRITE;
/*!40000 ALTER TABLE `event_categories` DISABLE KEYS */;
INSERT INTO `event_categories` VALUES (1,'Environment','Clean-ups, recycling drives and greening projects across Singapore','2026-07-15 13:34:23'),(2,'Food Support','Food packing, distribution and grocery delivery for families in need','2026-07-15 13:34:23'),(3,'Elderly Support','Befriending visits, home check-ins and digital literacy help for seniors','2026-07-15 13:34:23'),(4,'Education','Tutoring, reading programmes and enrichment support for students','2026-07-15 13:34:23');
/*!40000 ALTER TABLE `event_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_registrations`
--

DROP TABLE IF EXISTS `event_registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_registrations` (
  `registration_id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `participation_type` enum('Participant','Volunteer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `preferred_role_id` int DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Confirmed','Waitlisted','Cancelled','Attended','Absent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Confirmed',
  `waiting_position` int DEFAULT NULL,
  `registered_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` datetime DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`registration_id`),
  UNIQUE KEY `uq_registrations_event_user` (`event_id`,`user_id`),
  KEY `fk_registrations_preferred_role` (`preferred_role_id`),
  KEY `idx_registrations_event_id` (`event_id`),
  KEY `idx_registrations_user_id` (`user_id`),
  KEY `idx_registrations_status` (`status`),
  KEY `idx_registrations_participation_type` (`participation_type`),
  KEY `idx_registrations_waiting_position` (`waiting_position`),
  CONSTRAINT `fk_registrations_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_registrations_preferred_role` FOREIGN KEY (`preferred_role_id`) REFERENCES `volunteer_roles` (`role_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_registrations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_registrations`
--

LOCK TABLES `event_registrations` WRITE;
/*!40000 ALTER TABLE `event_registrations` DISABLE KEYS */;
INSERT INTO `event_registrations` VALUES (1,1,3,'Participant',NULL,'Attending with family members','Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(2,1,4,'Volunteer',1,'Happy to bring sunscreen for the team','Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(3,2,5,'Volunteer',4,NULL,'Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 16:17:03'),(4,2,8,'Participant',NULL,'Prefers morning check-in help if available','Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(5,3,6,'Participant',NULL,'Can collect for two households if places open','Waitlisted',1,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(6,3,7,'Volunteer',6,'Available for the full morning shift','Waitlisted',1,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(7,3,3,'Participant',NULL,NULL,'Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(8,4,4,'Volunteer',8,NULL,'Confirmed',NULL,'2026-07-15 13:34:23',NULL,'2026-07-15 13:34:23'),(27,14,15,'Participant',NULL,NULL,'Cancelled',NULL,'2026-07-17 16:21:13','2026-07-18 00:42:19','2026-07-17 16:42:19'),(28,14,16,'Participant',NULL,NULL,'Cancelled',NULL,'2026-07-17 16:27:30','2026-07-18 00:44:51','2026-07-17 16:44:51');
/*!40000 ALTER TABLE `event_registrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `event_id` int NOT NULL AUTO_INCREMENT,
  `organiser_id` int NOT NULL,
  `category_id` int NOT NULL,
  `event_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_datetime` datetime NOT NULL,
  `end_datetime` datetime NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `participant_capacity` int NOT NULL,
  `volunteer_capacity` int NOT NULL,
  `registration_deadline` datetime NOT NULL,
  `status` enum('Draft','Open','Full','Closed','Cancelled','Completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_events_organiser_id` (`organiser_id`),
  KEY `idx_events_category_id` (`category_id`),
  KEY `idx_events_status` (`status`),
  KEY `idx_events_start_datetime` (`start_datetime`),
  CONSTRAINT `fk_events_category` FOREIGN KEY (`category_id`) REFERENCES `event_categories` (`category_id`),
  CONSTRAINT `fk_events_organiser` FOREIGN KEY (`organiser_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `chk_events_participant_capacity` CHECK ((`participant_capacity` > 0)),
  CONSTRAINT `chk_events_volunteer_capacity` CHECK ((`volunteer_capacity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (1,2,1,'East Coast Park Clean-Up','Join a Saturday morning shoreline clean-up along East Coast Park. Community members may attend as participants or assist as volunteers with litter collection and a simple marine waste audit. Gloves, tongs and bags are provided.','2026-08-15 08:00:00','2026-08-15 11:00:00','East Coast Park, Area C',30,12,'2026-08-13 23:59:00','Open',NULL,'2026-07-15 13:34:23','2026-07-15 16:19:21'),(2,2,3,'Elderly Wellness and Social Day','An afternoon of conversation, light activities and companionship for seniors in Tampines. Participants join the social programme; volunteers assist with facilitation and check-ins.','2026-08-22 14:00:00','2026-08-22 17:00:00','Tampines Community Club',50,10,'2026-08-20 23:59:00','Open',NULL,'2026-07-15 13:34:23','2026-07-15 13:34:23'),(3,2,2,'Community Food Distribution','Pack and distribute food parcels to households registered with our partner organisations at Bedok Community Centre. Participants collect support; volunteers help with packing and handover.','2026-09-05 09:00:00','2026-09-05 13:00:00','Bedok Community Centre',80,20,'2026-09-03 23:59:00','Open',NULL,'2026-07-15 13:34:23','2026-07-15 13:34:23'),(4,2,4,'Youth Tutoring Programme','Support Primary 4–6 students with maths revision in small groups at Tampines. Participants are students and caregivers; volunteers tutor and assist in rooms.','2026-09-13 10:00:00','2026-09-13 12:00:00','Tampines Community Club',25,15,'2026-09-11 23:59:00','Open',NULL,'2026-07-15 13:34:23','2026-07-15 13:34:23'),(5,2,1,'Jurong Lake Gardens Conservation Day','Plant herbs and greens with residents at the Jurong Lake Gardens community plot and help with light park conservation tasks.','2026-09-19 08:00:00','2026-09-19 11:00:00','Jurong Lake Gardens',40,20,'2026-09-17 23:59:00','Draft',NULL,'2026-07-15 13:34:23','2026-07-15 13:34:23'),(14,10,3,'Gay dancing','zy leading the dance','2026-07-23 00:06:00','2026-07-24 00:06:00','woodlands',1,1,'2026-07-20 00:07:00','Open',NULL,'2026-07-17 16:07:51','2026-07-17 16:20:51');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `event_id` int DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` enum('Registration','WaitingList','Promotion','EventUpdate','EventCancellation','Attendance','General') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'General',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_id` (`user_id`),
  KEY `idx_notifications_event_id` (`event_id`),
  KEY `idx_notifications_is_read` (`is_read`),
  CONSTRAINT `fk_notifications_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,3,1,'Participant place confirmed','Your Participant place for East Coast Park Clean-Up is confirmed.','Registration',0,'2026-07-15 13:34:23'),(2,4,1,'Volunteer place confirmed','Your Volunteer place for East Coast Park Clean-Up is confirmed (Beach Sweeper).','Registration',0,'2026-07-15 13:34:23'),(3,6,3,'Participant waiting list','You are #1 on the Participant waiting list for Community Food Distribution.','WaitingList',0,'2026-07-15 13:34:23'),(4,7,3,'Volunteer waiting list','You are #1 on the Volunteer waiting list for Community Food Distribution.','WaitingList',0,'2026-07-15 13:34:23'),(21,15,14,'Participant place confirmed','Your Participant place for Gay dancing is confirmed.','Registration',0,'2026-07-17 16:21:13'),(22,16,14,'Participant waiting list','You are #1 on the Participant waiting list for Gay dancing.','WaitingList',0,'2026-07-17 16:27:30'),(23,16,14,'Promoted from waiting list','A Participant place opened for Gay dancing. Your registration is now confirmed.','Promotion',0,'2026-07-17 16:42:19'),(26,3,NULL,'Participant place confirmed','Your Participant place for Feature4 Cap Test 1784307124327 is confirmed.','Registration',0,'2026-07-17 16:52:04'),(27,4,NULL,'Participant waiting list','You are #1 on the Participant waiting list for Feature4 Cap Test 1784307124327.','WaitingList',0,'2026-07-17 16:52:04'),(28,4,NULL,'Promoted from waiting list','A Participant place opened for Feature4 Cap Test 1784307124327. Your registration is now confirmed.','Promotion',0,'2026-07-17 16:52:04'),(29,5,NULL,'Volunteer place confirmed','Your Volunteer place for Feature4 Cap Test 1784307124327 is confirmed.','Registration',0,'2026-07-17 16:52:04'),(30,6,NULL,'Volunteer waiting list','You are #1 on the Volunteer waiting list for Feature4 Cap Test 1784307124327.','WaitingList',0,'2026-07-17 16:52:05'),(31,6,NULL,'Promoted from waiting list','A Volunteer place opened for Feature4 Cap Test 1784307124327. Your registration is now confirmed.','Promotion',0,'2026-07-17 16:52:05'),(32,3,NULL,'Volunteer waiting list','You are #1 on the Volunteer waiting list for Feature4 Cap Test 1784307124327.','WaitingList',0,'2026-07-17 16:52:05');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('community_member','organiser','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'community_member',
  `account_status` enum('Active','Suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Siti Rahman','siti.r@communityconnect.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','admin','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(2,'Marcus Lim','marcus.lim@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','organiser','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(3,'Tan Wei Ling','weiling.tan@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-17 13:49:14'),(4,'Nurul Aisyah','nurul.a@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(5,'David Ong','david.ong@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(6,'Priya Nair','priya.n@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(7,'Rajesh Kumar','rajesh.k@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(8,'Mei Ling Ho','meiling.ho@example.sg','$2b$10$IV9FVftKtNK7pKFCNd5nh.IgDOEK.mVC9r4zCF85DmoWsBu4/xrnG','community_member','Active','2026-07-15 13:34:23','2026-07-15 13:34:23'),(9,'CommunityConnect Admin','admin@communityconnect.sg','$2b$10$b4IWGPA/96GIwhgxckEoc.gZtEkkiaCCV/wtOtzvfZGn.lJG6RLmm','admin','Active','2026-07-17 10:29:55','2026-07-17 11:03:51'),(10,'cx123','yongchengxun27@gmail.com','$2b$10$Hfu8Y8Z/MJwmDqng4HDiA.ToCEDu9NJssUlncHUg2JuBaCDdicizS','organiser','Active','2026-07-17 12:27:33','2026-07-17 16:05:20'),(15,'gayzy','zy@gmail.com','$2b$10$ySU6Ju50H6hZm0cN4BdUDOJkbS.8jOxn.fcKBSS5Nz3LHR7xw6Aei','community_member','Active','2026-07-17 16:11:30','2026-07-17 16:11:30'),(16,'cxdaddy','cx@gmail.com','$2b$10$9jBRnBNNEuhuVl.S9ukUWuFdFIHS1p3.DWHPyfBG9EUtLV7.6WrDG','community_member','Active','2026-07-17 16:27:06','2026-07-17 16:27:06');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `volunteer_assignments`
--

DROP TABLE IF EXISTS `volunteer_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `volunteer_assignments` (
  `assignment_id` int NOT NULL AUTO_INCREMENT,
  `registration_id` int NOT NULL,
  `role_id` int NOT NULL,
  `assigned_by` int NOT NULL,
  `assigned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  UNIQUE KEY `registration_id` (`registration_id`),
  KEY `fk_assignments_role` (`role_id`),
  KEY `fk_assignments_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_assignments_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_assignments_registration` FOREIGN KEY (`registration_id`) REFERENCES `event_registrations` (`registration_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assignments_role` FOREIGN KEY (`role_id`) REFERENCES `volunteer_roles` (`role_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `volunteer_assignments`
--

LOCK TABLES `volunteer_assignments` WRITE;
/*!40000 ALTER TABLE `volunteer_assignments` DISABLE KEYS */;
INSERT INTO `volunteer_assignments` VALUES (1,2,1,2,'2026-07-15 13:34:23'),(2,3,4,2,'2026-07-15 13:34:23'),(3,8,8,2,'2026-07-15 13:34:23');
/*!40000 ALTER TABLE `volunteer_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `volunteer_roles`
--

DROP TABLE IF EXISTS `volunteer_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `volunteer_roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `role_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `required_volunteers` int NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_volunteer_roles_event_name` (`event_id`,`role_name`),
  CONSTRAINT `fk_volunteer_roles_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `volunteer_roles`
--

LOCK TABLES `volunteer_roles` WRITE;
/*!40000 ALTER TABLE `volunteer_roles` DISABLE KEYS */;
INSERT INTO `volunteer_roles` VALUES (1,1,'Beach Sweeper','Collect litter along the assigned shoreline zone',6,'2026-07-15 13:34:23'),(2,1,'Data Recorder','Log litter types for the marine waste audit',4,'2026-07-15 13:34:23'),(3,1,'Team Lead','Guide a team of volunteers (prior experience preferred)',2,'2026-07-15 13:34:23'),(4,2,'Befriender','Support seniors during activities and conversation',7,'2026-07-15 13:34:23'),(5,2,'Coordinator','Help with briefing, seating and debrief',3,'2026-07-15 13:34:23'),(6,3,'Packing Helper','Pack and label food parcels for distribution',12,'2026-07-15 13:34:23'),(7,3,'Handover Helper','Assist families during parcel collection',8,'2026-07-15 13:34:23'),(8,4,'Tutor — Group A','Support Primary 4–5 maths revision',8,'2026-07-15 13:34:23'),(9,4,'Tutor — Group B','Support Primary 6 maths revision',7,'2026-07-15 13:34:23'),(10,5,'Garden Planter','Plant and water community garden plots',12,'2026-07-15 13:34:23'),(11,5,'Conservation Helper','Assist with light park conservation tasks',8,'2026-07-15 13:34:23'),(17,14,'guy that is gay','pretty boy for zy to suck',2,'2026-07-17 16:09:42');
/*!40000 ALTER TABLE `volunteer_roles` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-18  1:02:41
