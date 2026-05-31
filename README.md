# AutoCare - Smart Car Service Management System

A real-time Car Service Management Web Application built using Firebase and Vanilla JavaScript. The system enables customers, service centers, and mechanics to manage the complete vehicle servicing lifecycle through a structured workflow with live tracking, inspection reporting, media uploads, and real-time progress updates.

---

## Project Overview

AutoCare is designed to digitize and automate the traditional car servicing process. Customers can register vehicles and request services, service centers can assign mechanics, and mechanics can perform servicing through a guided workflow while uploading service evidence and updating progress in real time.

The platform uses Firebase Authentication, Firestore Database, Firebase Storage, and Cloud Functions to provide a secure and scalable solution.

---

## Key Features

### Authentication & User Management

* Firebase Authentication
* Role-Based Access Control (RBAC)
* Customer Accounts
* Service Center Accounts
* Mechanic Accounts
* Unique Email Validation System

### Vehicle Management

* Register New Vehicles
* Upload Vehicle Images
* Manage Vehicle Information
* View Registered Vehicles

### Service Request Management

* Create Service Requests
* Select Service Type
* Schedule Service Date & Time
* Cancel Service Requests
* Service History Tracking

### Service Center Workflow

* View Incoming Service Requests
* Assign Services to Mechanics
* Monitor Service Progress
* Review Active Jobs
* Complete Service Approval Process

### Mechanic Workflow

* Accept Assigned Jobs
* Start Work
* Active Service Dashboard
* Real-Time Service Progress Updates
* Guided Stage-Based Workflow

### Service Stages

1. Vehicle Received
2. Service Started
3. Mechanic Inspection
4. Uploading Media
5. Test Drive
6. Service Complete

### Inspection Module

Mechanics can create inspection reports including:

* Issues Found
* Severity Level
* Inspection Notes
* Inspection Timestamp
* Mechanic Information

### Live Tracking System

* Live Tracking Toggle
* Service Progress Monitoring
* Real-Time Updates
* Work Duration Tracking
* Activity Timeline Logging

### Media Management

Upload service media categorized into:

#### Before Service

* Maximum 3 Images

#### During Service

* Maximum 3 Images

#### After Service

* Maximum 3 Images

Additional Features:

* Media Preview
* Media Deletion
* Upload Validation
* Automatic Workflow Validation
* Firebase Storage Integration

### Activity History

Every important action is logged automatically:

* Service Requested
* Service Assigned
* Mechanic Assigned
* Job Accepted
* Work Started
* Stage Advanced
* Inspection Completed
* Media Uploaded
* Service Completed

---

## Workflow Logic

The application follows a structured servicing workflow.

### Service Assignment Flow

Customer → Service Request

↓

Service Center Assignment

↓

Mechanic Assignment

↓

Job Acceptance

↓

Start Work

↓

Live Tracking Enabled

↓

Vehicle Received

↓

Service Started

↓

Inspection

↓

Media Upload

↓

Test Drive

↓

Service Complete

---

## Real-Time Features

* Firestore Real-Time Listeners
* Automatic Dashboard Updates
* Live Service Tracking
* Instant Status Synchronization
* Real-Time Media Updates

---

## Security Features

### Firestore Security Rules

* Customer Data Isolation
* Mechanic Access Restrictions
* Service Center Ownership Validation
* Service Assignment Validation
* Secure Media Access
* Role-Based Permissions

### Data Validation

* Unique Email Lock System
* Service Ownership Checks
* Assignment Verification
* Workflow Validation

---

## Technology Stack

| Layer                   | Technology               |
| ----------------------- | ------------------------ |
| Frontend                | HTML, CSS, JavaScript    |
| Authentication          | Firebase Authentication  |
| Database                | Cloud Firestore          |
| Storage                 | Firebase Storage         |
| Backend Logic           | Firebase Cloud Functions |
| Hosting                 | Firebase Hosting         |


---

## Database Collections

### users

Stores:

* Customer Profiles
* Service Center Profiles
* Mechanic Profiles

### cars

Stores:

* Vehicle Information
* Vehicle Images
* Ownership Information

### services

Stores:

* Service Requests
* Service Workflow Data
* Inspection Reports
* Live Tracking Data
* Service History

### jobCards

Stores:

* Assigned Jobs
* Mechanic Workflow Information
* Service Progress Tracking
* Media Summary

### unique_emails

Stores:

* Email Lock Records
* Duplicate Prevention Data

---

## Current Project Version

**Version:** v0.9.8-active-service-workflow

### Completed Modules

* Authentication System
* Role-Based Access Control
* Vehicle Management
* Service Request System
* Service Center Dashboard
* Mechanic Dashboard
* Job Assignment Workflow
* Active Service Workflow
* Inspection Module
* Live Tracking System
* Media Upload System
* Service History Tracking
* Firestore Security Rules
* Cloud Function Validation

---

## Developer

**Bikash Deka**
Master of Computer Applications (MCA)


### Project Title

**AutoCare: Smart Car Service Management System**
