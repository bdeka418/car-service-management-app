# Car Service Management Web App

A real-time car service workflow system built using Firebase and Vanilla JavaScript.

---

## Overview

This project allows service centers to manage car servicing using a structured, media-based workflow. The system automatically tracks progress based on uploaded images.

---

## Key Features

* Firebase Authentication with role-based access (customer, service_center)
* Add and manage cars
* Create and manage service requests
* Upload images for each service stage:

  * before
  * during
  * after
* Maximum 3 images per stage
* Real-time updates using Firestore
* Activity logs generated from timestamps

---

## Workflow Logic

The workflow is fully automated and based on uploaded media:

* Users must follow the order:
  `before → during → after`
* Cannot skip or go backward manually
* Uploading next stage updates the service step
* Deleting images automatically rolls back the step
* System always stays consistent with data

---

## Tech Stack

* Frontend: HTML, CSS, JavaScript
* Backend: Firebase Cloud Functions
* Database: Firestore
* Storage: Firebase Storage
* Authentication: Firebase Auth

---

## Architecture

* Media is the source of truth
* Service step (`currentStep`) is derived from media
* Backend controls workflow using Cloud Functions



Bikash Deka
MCA, Royal Global University
