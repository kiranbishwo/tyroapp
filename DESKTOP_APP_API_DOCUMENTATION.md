# Tyro Desktop App API Documentation

**Version:** 1.0.0  
**Date:** 2025-12-14  
**Base URL:** `/api/vue/backend/v1`

**⚠️ IMPORTANT:** The base URL is `/api/vue/backend/v1` - **NOT** `/api/v11/vue/backend/v1`  
Do **NOT** include `/v11` in the URL path. The correct format is:
- ✅ Correct: `/api/vue/backend/v1/tracking-images/upload`
- ❌ Wrong: `/api/v11/vue/backend/v1/tracking-images/upload`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Projects API](#projects-api)
3. [Tasks API](#tasks-api)
4. [Tracking Data API](#tracking-data-api)
   - [Queue Processing System](#queue-processing-system)
   - [Upload Tracking Data File](#upload-tracking-data-file)
   - [List Tracking Data](#list-tracking-data)
   - [Get Tracking Data by ID](#get-tracking-data-by-id)
5. [Tracking Images API](#tracking-images-api)
   - [Upload Multiple Images](#upload-multiple-images)
   - [Get Images by Batch ID](#get-images-by-batch-id)
   - [List Images by Project and Task](#list-images-by-project-and-task)
   - [Delete Image](#delete-image)
6. [Status Management API](#status-management-api)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)

---

## Authentication

All API endpoints require JWT authentication. Include the JWT token in the `Authorization` header:

```
Authorization: Bearer {your_jwt_token}
```

**Base URL Structure:**
- All desktop app endpoints are under: `/api/vue/backend/v1/`
- Example: `/api/vue/backend/v1/tracking-images/upload`
- **Note:** There is no `/v11` in the path - use `/api/vue/backend/v1/` directly

### Authentication Errors

- **401 Unauthorized**: Missing or invalid JWT token
- **403 Forbidden**: Valid token but insufficient permissions

---

## Projects API

### Get User's Assigned Projects

Retrieve all projects assigned to the authenticated user.

**Endpoint:** `GET /api/vue/backend/v1/projects`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | string | No | Filter by workspace ID |
| `search` | string | No | Search projects by name |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Projects retrieved successfully",
  "data": [
    {
      "id": "1",
      "name": "Web Development",
      "description": "Main web development project",
      "status_id": 24,
      "status": "In Progress",
      "priority": 30,
      "priority_status": "High",
      "progress": 65,
      "start_date": "2025-01-01",
      "end_date": "2025-06-30",
      "workspace_id": "workspace-uuid",
      "workspace_name": "Development Team",
      "created_at": "2025-01-01T00:00:00.000000Z"
    }
  ]
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/projects?workspace_id=workspace-uuid" \
  -H "Authorization: Bearer {jwt_token}"
```

---

## Tasks API

### Get User's Assigned Tasks

Retrieve all tasks assigned to the authenticated user.

**Endpoint:** `GET /api/vue/backend/v1/tasks`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | No | Filter by project ID |
| `workspace_id` | string | No | Filter by workspace ID |
| `search` | string | No | Search tasks by name |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Tasks retrieved successfully",
  "data": [
    {
      "id": "1",
      "name": "Fix login bug",
      "description": "Fix authentication issue in login page",
      "project_id": "1",
      "project_name": "Web Development",
      "status_id": 26,
      "status": "In Progress",
      "priority": 31,
      "priority_status": "Urgent",
      "progress": 50,
      "start_date": "2025-01-15",
      "end_date": "2025-01-25",
      "created_at": "2025-01-10T00:00:00.000000Z"
    }
  ]
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/tasks?project_id=1" \
  -H "Authorization: Bearer {jwt_token}"
```

---

## Tracking Data API

### Queue Processing System

The tracking data upload uses **Laravel Queue System** for asynchronous processing:

- **Upload Response**: Returns `202 Accepted` immediately after queuing
- **Processing**: Happens in background via queue worker
- **Job Retries**: Failed jobs are retried up to 3 times with 60-second delays
- **Verification**: Check if data was processed by querying the tracking data list endpoint

**Queue Configuration:**
- **Max Attempts**: 3 retries
- **Retry Delay**: 60 seconds
- **Timeout**: 5 minutes per job
- **Queue Connection**: Database or Redis (as configured)

**Processing Steps:**
1. JSON file is validated
2. Metadata is extracted (project_id, task_id, dates, summary)
3. Complete JSON is stored in `raw_data` field
4. Summary statistics are extracted and stored in separate columns

**Verifying Successful Processing:**
After uploading, wait a few seconds then check the tracking data list:
```bash
GET /api/vue/backend/v1/tracking-data?project_id=1&task_id=t1
```

If the record appears in the list, processing was successful.

**Handling Failed Jobs:**
- Failed jobs are logged to Laravel logs
- After 3 failed attempts, the job is marked as permanently failed
- Check server logs for error details
- Re-upload the file if processing fails

---

### Upload Tracking Data File

Upload a JSON file containing tracking data. The file is queued for background processing.

**Endpoint:** `POST /api/vue/backend/v1/tracking-files/upload`

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
```

**Request Body (Form Data):**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project ID |
| `task_id` | string | Yes | Task ID |
| `file` | file | Yes | JSON file (max 10MB) |
| `workspace_id` | string | No | Workspace ID |

**Response (202 Accepted):**
```json
{
  "result": true,
  "message": "Tracking data queued for processing"
}
```

**Important Notes:**
- The response `202 Accepted` means the file was **queued**, not immediately processed
- Processing happens asynchronously in the background
- Typical processing time: 5-30 seconds (depending on file size and queue load)
- To verify processing completed, query the tracking data list endpoint after a few seconds
- If the record doesn't appear after 1-2 minutes, check server logs for processing errors

**Error Response (422 Validation Error):**
```json
{
  "result": false,
  "message": "Validation failed",
  "errors": {
    "project_id": ["The project id field is required."],
    "task_id": ["The task id field is required."],
    "file": ["The file field is required."]
  }
}
```

**Example Request:**
```bash
curl -X POST "https://api.example.com/api/vue/backend/v1/tracking-files/upload" \
  -H "Authorization: Bearer {jwt_token}" \
  -F "project_id=1" \
  -F "task_id=t1" \
  -F "workspace_id=workspace-uuid" \
  -F "file=@tracking-data.json"
```

**JSON File Format:**
The uploaded JSON file should follow this structure:
```json
{
  "version": "1.0.0",
  "metadata": {
    "createdAt": "2025-12-11T08:28:07.472Z",
    "lastUpdated": "2025-12-11T12:20:24.693Z",
    "taskId": "t1",
    "projectId": "1",
    "taskName": "Fix login bug",
    "projectName": "Web Development",
    "currentSessionStart": "2025-12-11T12:19:51.866Z"
  },
  "trackingData": {
    "activityLogs": [...],
    "windowTracking": [...],
    "summary": {
      "totalTime": 1544,
      "totalKeystrokes": 1223,
      "totalMouseClicks": 323,
      "totalScreenshots": 34,
      "totalWebcamPhotos": 34,
      "totalUrls": 9,
      "totalActivityLogs": 26,
      "firstActivity": "2025-12-11T08:28:07.472Z",
      "lastActivity": "2025-12-11T12:20:24.693Z"
    }
  }
}
```

---

### List Tracking Data

Get a list of tracking data records for a specific project and task.

**Endpoint:** `GET /api/vue/backend/v1/tracking-data`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project ID |
| `task_id` | string | Yes | Task ID |
| `start_date` | date | No | Filter by start date (YYYY-MM-DD) |
| `end_date` | date | No | Filter by end date (YYYY-MM-DD) |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Tracking data retrieved successfully",
  "data": [
    {
      "id": 1,
      "project_id": "1",
      "task_id": "t1",
      "task_name": "Fix login bug",
      "project_name": "Web Development",
      "version": "1.0.0",
      "date": "2025-12-11",
      "total_time": 1544,
      "total_keystrokes": 1223,
      "total_mouse_clicks": 323,
      "total_screenshots": 34,
      "total_webcam_photos": 34,
      "total_activity_logs": 26,
      "first_activity_at": "2025-12-11T08:28:07.000000Z",
      "last_activity_at": "2025-12-11T12:20:24.000000Z",
      "uploaded_at": "2025-12-11T12:25:00.000000Z",
      "created_at": "2025-12-11T12:25:00.000000Z"
    }
  ]
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-data?project_id=1&task_id=t1&start_date=2025-12-01&end_date=2025-12-31" \
  -H "Authorization: Bearer {jwt_token}"
```

---

### Get Tracking Data by ID

Retrieve complete tracking data including the full JSON content.

**Endpoint:** `GET /api/vue/backend/v1/tracking-data/{id}`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | Tracking data record ID |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Tracking data retrieved successfully",
  "data": {
    "id": 1,
    "project_id": "1",
    "task_id": "t1",
    "task_name": "Fix login bug",
    "project_name": "Web Development",
    "version": "1.0.0",
    "date": "2025-12-11",
    "raw_data": {
      "version": "1.0.0",
      "metadata": {...},
      "trackingData": {
        "activityLogs": [...],
        "windowTracking": [...],
        "summary": {...}
      }
    },
    "total_time": 1544,
    "total_keystrokes": 1223,
    "total_mouse_clicks": 323,
    "total_screenshots": 34,
    "total_webcam_photos": 34,
    "total_activity_logs": 26,
    "first_activity_at": "2025-12-11T08:28:07.000000Z",
    "last_activity_at": "2025-12-11T12:20:24.000000Z",
    "uploaded_at": "2025-12-11T12:25:00.000000Z",
    "created_at": "2025-12-11T12:25:00.000000Z"
  }
}
```

**Error Response (404 Not Found):**
```json
{
  "result": false,
  "message": "Tracking data not found"
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-data/1" \
  -H "Authorization: Bearer {jwt_token}"
```

---

## Tracking Images API

The Tracking Images API allows you to upload, retrieve, and manage images (screenshots, webcam photos, etc.) associated with tracking data. Instead of embedding base64-encoded images in the tracking data JSON, you can upload images separately and reference their URLs in your tracking data.

### Key Features

- **Multiple Image Upload**: Upload multiple images in a single request
- **Queue Processing**: Images are processed asynchronously via Laravel Queue for better performance
- **Batch Tracking**: All images in a single upload request share a batch ID
- **Type Classification**: Support for different image types (screenshot, webcam_photo, image)
- **Tenant-Aware**: All images are stored per tenant
- **Automatic Cleanup**: Images are automatically deleted when records are removed
- **Retry Mechanism**: Failed uploads are automatically retried up to 3 times

### Image Storage

Images are stored in the following directories:
- **General Images**: `allUploads/tracking-images/`
- **Screenshots**: `allUploads/tracking-images/screenshots/`
- **Webcam Photos**: `allUploads/tracking-images/webcam/`

### Workflow

1. **Upload Images First**: Use the upload endpoint to upload all images (images are queued for processing)
2. **Wait for Processing**: Images are processed in the background via queue (typically 5-30 seconds)
3. **Get Image URLs**: Use the batch endpoint to retrieve final URLs once processing is complete
4. **Use URLs in Tracking Data**: Reference these URLs in your tracking data JSON instead of base64
5. **Submit Tracking Data**: Upload your tracking data with image URLs

### Queue Processing System

The image upload uses **Laravel Queue System** for asynchronous processing:

- **Upload Response**: Returns `202 Accepted` immediately after queuing
- **Processing**: Happens in background via queue worker
- **Job Retries**: Failed jobs are retried up to 3 times with 60-second delays
- **Verification**: Check if images were processed by querying the batch endpoint

**Queue Configuration:**
- **Max Attempts**: 3 retries
- **Retry Delay**: 60 seconds
- **Timeout**: 5 minutes per job
- **Queue Connection**: Database or Redis (as configured)

**Verifying Successful Processing:**
After uploading, wait a few seconds then check the batch endpoint:
```bash
GET /api/vue/backend/v1/tracking-images/batch/{batchId}
```

If images appear with `file_url` populated, processing was successful.

---

### Upload Multiple Images

Upload one or more images. Images are queued for background processing and URLs are available after processing completes.

**Endpoint:** `POST /api/vue/backend/v1/tracking-images/upload`

**⚠️ Route Verification:**
- Base URL: `/api/vue/backend/v1`
- Full Endpoint: `/api/vue/backend/v1/tracking-images/upload`
- **DO NOT** use `/api/v11/vue/backend/v1/...` (the `/v11` segment is incorrect)

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: multipart/form-data
```

**Request Body (Form Data):**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `images[]` | file[] | Yes | Array of image files (jpeg, png, jpg, gif, webp) - Max 10MB per image |
| `project_id` | string | No | Project ID to associate with images |
| `task_id` | string | No | Task ID to associate with images |
| `workspace_id` | string | No | Workspace ID |
| `type` | string | No | Image type: `image`, `screenshot`, `webcam_photo` (default: `image`) |
| `metadata` | JSON | No | Additional metadata as JSON object |

**Image File Requirements:**
- **Formats**: JPEG, PNG, JPG, GIF, WEBP
- **Max Size**: 10MB per image
- **Multiple Files**: Send as array `images[]`

**Response (202 Accepted):**
```json
{
  "result": true,
  "message": "3 image(s) queued for processing",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "queued_count": 3,
  "error_count": 0,
  "images": [
    {
      "index": 0,
      "original_name": "screenshot1.jpg",
      "batch_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "queued",
      "message": "Image queued for processing"
    },
    {
      "index": 1,
      "original_name": "screenshot2.png",
      "batch_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "queued",
      "message": "Image queued for processing"
    },
    {
      "index": 2,
      "original_name": "webcam1.jpg",
      "batch_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "queued",
      "message": "Image queued for processing"
    }
  ],
  "errors": [],
  "note": "Images are being processed in the background. Use the batch endpoint to retrieve final URLs once processing is complete."
}
```

**Important Notes:**
- The response `202 Accepted` means the images were **queued**, not immediately processed
- Processing happens asynchronously in the background
- Typical processing time: 5-30 seconds (depending on image size and queue load)
- To get final URLs, query the batch endpoint after a few seconds:
  ```bash
  GET /api/vue/backend/v1/tracking-images/batch/{batchId}
  ```
- If images don't appear after 1-2 minutes, check server logs for processing errors

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `result` | boolean | Success status |
| `message` | string | Response message |
| `batch_id` | string | UUID for grouping all images in this upload - **use this to retrieve final URLs** |
| `queued_count` | integer | Number of successfully queued images |
| `error_count` | integer | Number of failed uploads |
| `images` | array | Array of queued image objects |
| `images[].index` | integer | Original index in the upload array |
| `images[].original_name` | string | Original filename |
| `images[].batch_id` | string | Batch ID for grouping |
| `images[].status` | string | Upload status (always "queued" at this stage) |
| `images[].message` | string | Status message |
| `errors` | array | Array of error objects (if any) |
| `note` | string | Instructions for retrieving final URLs |

**Error Response (422 Validation Error):**
```json
{
  "result": false,
  "message": "Validation failed",
  "errors": {
    "images": ["The images field is required."],
    "images.0": ["The images.0 must be an image."],
    "images.1": ["The images.1 may not be greater than 10240 kilobytes."]
  }
}
```

**Error Response (500 Server Error):**
```json
{
  "result": false,
  "message": "Failed to upload tracking images: {error_message}"
}
```

**Example Request (cURL):**
```bash
curl -X POST "https://api.example.com/api/vue/backend/v1/tracking-images/upload" \
  -H "Authorization: Bearer {jwt_token}" \
  -F "images[]=@/path/to/screenshot1.jpg" \
  -F "images[]=@/path/to/screenshot2.png" \
  -F "images[]=@/path/to/webcam1.jpg" \
  -F "project_id=project-123" \
  -F "task_id=task-456" \
  -F "workspace_id=workspace-789" \
  -F "type=screenshot" \
  -F 'metadata={"timestamp":"2025-12-14T22:15:00Z","activity":"coding"}'
```

**Example Request (JavaScript/Fetch):**
```javascript
const formData = new FormData();
formData.append('images[]', file1);
formData.append('images[]', file2);
formData.append('images[]', file3);
formData.append('project_id', 'project-123');
formData.append('task_id', 'task-456');
formData.append('type', 'screenshot');
formData.append('metadata', JSON.stringify({ timestamp: new Date().toISOString() }));

const response = await fetch('/api/vue/backend/v1/tracking-images/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  },
  body: formData
});

const data = await response.json();
// Images are queued - wait a few seconds then get final URLs
const batchId = data.batch_id;

// Wait for processing (poll or use setTimeout)
setTimeout(async () => {
  const batchResponse = await fetch(`/api/vue/backend/v1/tracking-images/batch/${batchId}`, {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  });
  const batchData = await batchResponse.json();
  // Now use batchData.images[].file_url in your tracking data JSON
}, 5000); // Wait 5 seconds for processing
```

**Example Request (Python/Requests):**
```python
import requests

url = "https://api.example.com/api/vue/backend/v1/tracking-images/upload"
headers = {"Authorization": f"Bearer {jwt_token}"}
files = [
    ('images[]', ('screenshot1.jpg', open('screenshot1.jpg', 'rb'), 'image/jpeg')),
    ('images[]', ('screenshot2.png', open('screenshot2.png', 'rb'), 'image/png')),
]
data = {
    'project_id': 'project-123',
    'task_id': 'task-456',
    'type': 'screenshot'
}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()

# Extract URLs
image_urls = [img['file_url'] for img in result['images']]
```

**Important Notes:**
- Images are processed **synchronously** and URLs are returned immediately
- All images in a single request share the same `batch_id`
- Use the `file_url` from the response in your tracking data JSON
- Images are automatically organized by type in storage directories
- Maximum 10MB per image file
- No limit on number of images per request (within reasonable server limits)

---

### Get Images by Batch ID

Retrieve all images that were uploaded together in a single batch.

**Endpoint:** `GET /api/vue/backend/v1/tracking-images/batch/{batchId}`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `batchId` | string | Yes | Batch ID from upload response |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Images retrieved successfully",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "count": 3,
  "images": [
    {
      "id": 1,
      "file_url": "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/screenshots/20251214_221500_screenshot1.jpg",
      "original_name": "screenshot1.jpg",
      "type": "screenshot",
      "file_size": 245678,
      "uploaded_at": "2025-12-14T22:15:00.000000Z"
    },
    {
      "id": 2,
      "file_url": "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/screenshots/20251214_221501_screenshot2.png",
      "original_name": "screenshot2.png",
      "type": "screenshot",
      "file_size": 189234,
      "uploaded_at": "2025-12-14T22:15:01.000000Z"
    }
  ]
}
```

**Error Response (404 Not Found):**
```json
{
  "result": false,
  "message": "No images found for the specified batch ID"
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-images/batch/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer {jwt_token}"
```

---

### List Images by Project and Task

Retrieve all images associated with a specific project and task.

**Endpoint:** `GET /api/vue/backend/v1/tracking-images`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project ID |
| `task_id` | string | Yes | Task ID |
| `type` | string | No | Filter by type: `image`, `screenshot`, `webcam_photo` |
| `start_date` | date | No | Filter images uploaded after this date (YYYY-MM-DD) |
| `end_date` | date | No | Filter images uploaded before this date (YYYY-MM-DD) |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Images retrieved successfully",
  "count": 15,
  "images": [
    {
      "id": 1,
      "file_url": "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/screenshots/20251214_221500_screenshot1.jpg",
      "original_name": "screenshot1.jpg",
      "type": "screenshot",
      "file_size": 245678,
      "uploaded_at": "2025-12-14T22:15:00.000000Z",
      "created_at": "2025-12-14T22:15:00.000000Z"
    },
    {
      "id": 2,
      "file_url": "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/webcam/20251214_221501_webcam1.jpg",
      "original_name": "webcam1.jpg",
      "type": "webcam_photo",
      "file_size": 156789,
      "uploaded_at": "2025-12-14T22:15:01.000000Z",
      "created_at": "2025-12-14T22:15:01.000000Z"
    }
  ]
}
```

**Example Request:**
```bash
# Get all images for a project and task
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-images?project_id=project-123&task_id=task-456" \
  -H "Authorization: Bearer {jwt_token}"

# Get only screenshots
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-images?project_id=project-123&task_id=task-456&type=screenshot" \
  -H "Authorization: Bearer {jwt_token}"

# Get images within date range
curl -X GET "https://api.example.com/api/vue/backend/v1/tracking-images?project_id=project-123&task_id=task-456&start_date=2025-12-01&end_date=2025-12-31" \
  -H "Authorization: Bearer {jwt_token}"
```

---

### Delete Image

Delete a specific tracking image by ID.

**Endpoint:** `DELETE /api/vue/backend/v1/tracking-images/{id}`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | Image ID |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Image deleted successfully"
}
```

**Error Response (404 Not Found):**
```json
{
  "result": false,
  "message": "Image not found"
}
```

**Example Request:**
```bash
curl -X DELETE "https://api.example.com/api/vue/backend/v1/tracking-images/1" \
  -H "Authorization: Bearer {jwt_token}"
```

**Important Notes:**
- Only the image owner can delete their images
- Deleting an image also removes the physical file from storage
- This action cannot be undone

---

### Using Image URLs in Tracking Data

After uploading images, use the returned URLs in your tracking data JSON:

**Example Tracking Data JSON with Image URLs:**
```json
{
  "version": "1.0",
  "metadata": {
    "createdAt": "2025-12-14T22:15:00Z",
    "projectName": "Web Development",
    "taskName": "Implement Feature X"
  },
  "trackingData": {
    "summary": {
      "totalTime": 3600,
      "totalScreenshots": 3,
      "totalWebcamPhotos": 1
    },
    "activityLogs": [
      {
        "timestamp": "2025-12-14T22:15:00Z",
        "activity": "coding",
        "screenshots": [
          "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/screenshots/20251214_221500_screenshot1.jpg",
          "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/screenshots/20251214_221501_screenshot2.png"
        ],
        "webcamPhotos": [
          "http://kiran.tyrodesk.test:8000/allUploads/tracking-images/webcam/20251214_221502_webcam1.jpg"
        ]
      }
    ]
  }
}
```

**Benefits of Using URLs Instead of Base64:**
- ✅ **Smaller JSON files**: URLs are much smaller than base64-encoded images
- ✅ **Faster uploads**: No 413 errors from large payloads
- ✅ **Better performance**: Images can be loaded on-demand
- ✅ **Easier management**: Images can be deleted or replaced independently
- ✅ **Reduced database size**: Images stored as files, not in database

---

## Status Management API

### Update User Status

Update the current status of the authenticated user.

**Endpoint:** `POST /api/vue/backend/v1/status/update`

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "working",
  "previous_status": "idle",
  "workspace_id": "workspace-uuid",
  "metadata": {
    "task_id": "t1",
    "project_id": "1"
  }
}
```

**Request Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | Yes | Status value: `idle`, `working`, `break`, `meeting`, `away`, `checked_in`, `checked_out` |
| `previous_status` | string | No | Previous status (auto-detected if not provided) |
| `workspace_id` | string | No | Workspace ID |
| `metadata` | object | No | Additional metadata (task_id, project_id, etc.) |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Status updated successfully",
  "data": {
    "id": 1,
    "status": "working",
    "previous_status": "idle",
    "started_at": "2025-12-11T12:30:00.000000Z",
    "metadata": {
      "task_id": "t1",
      "project_id": "1"
    }
  }
}
```

**Error Response (422 Validation Error):**
```json
{
  "result": false,
  "message": "Validation failed",
  "errors": {
    "status": ["The selected status is invalid."]
  }
}
```

**Example Request:**
```bash
curl -X POST "https://api.example.com/api/vue/backend/v1/status/update" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "working",
    "metadata": {
      "task_id": "t1",
      "project_id": "1"
    }
  }'
```

---

### Get Current Status

Get the current active status of the authenticated user.

**Endpoint:** `GET /api/vue/backend/v1/status/current`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response (200 OK - Active Status):**
```json
{
  "result": true,
  "message": "Current status retrieved successfully",
  "data": {
    "id": 1,
    "status": "working",
    "previous_status": "idle",
    "started_at": "2025-12-11T12:30:00.000000Z",
    "duration_seconds": 3600,
    "metadata": {
      "task_id": "t1",
      "project_id": "1"
    }
  }
}
```

**Response (200 OK - No Active Status):**
```json
{
  "result": true,
  "message": "No active status found",
  "data": null
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/status/current" \
  -H "Authorization: Bearer {jwt_token}"
```

---

### Get Status History

Get the status change history for the authenticated user.

**Endpoint:** `GET /api/vue/backend/v1/status/history`

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | No | Filter by start date (YYYY-MM-DD) |
| `end_date` | date | No | Filter by end date (YYYY-MM-DD) |
| `status` | string | No | Filter by status: `idle`, `working`, `break`, `meeting`, `away`, `checked_in`, `checked_out` |

**Response (200 OK):**
```json
{
  "result": true,
  "message": "Status history retrieved successfully",
  "data": [
    {
      "id": 1,
      "status": "working",
      "previous_status": "idle",
      "started_at": "2025-12-11T12:30:00.000000Z",
      "ended_at": "2025-12-11T13:30:00.000000Z",
      "duration_seconds": 3600,
      "metadata": {
        "task_id": "t1",
        "project_id": "1"
      },
      "created_at": "2025-12-11T12:30:00.000000Z"
    }
  ]
}
```

**Example Request:**
```bash
curl -X GET "https://api.example.com/api/vue/backend/v1/status/history?start_date=2025-12-01&end_date=2025-12-31&status=working" \
  -H "Authorization: Bearer {jwt_token}"
```

---

## Error Handling

All API endpoints follow a consistent error response format:

### Error Response Format

```json
{
  "result": false,
  "message": "Error message description",
  "errors": {
    "field_name": ["Error message for this field"]
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 202 | Accepted (request queued) |
| 400 | Bad Request |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |

### Common Error Messages

- **401 Unauthorized**: `"Unauthenticated."`
- **404 Not Found**: `"Resource not found"`
- **422 Validation Error**: `"Validation failed"`
- **500 Server Error**: `"An error occurred while processing your request"`

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Default**: 60 requests per minute per user
- **File Upload**: 10 requests per minute per user
- **Status Updates**: 30 requests per minute per user

### Rate Limit Headers

When rate limits are approached, the following headers are included in the response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded Response

```json
{
  "result": false,
  "message": "Too many requests. Please try again later."
}
```

HTTP Status: **429 Too Many Requests**

---

## Best Practices

### 1. File Upload & Queue Processing

- Upload tracking data files every 10 minutes
- Keep JSON files under 10MB
- Validate JSON structure before uploading
- **Handle 202 Accepted responses** - File is queued, not immediately processed
- **Wait 5-30 seconds** after upload before checking if data was processed
- **Verify processing** by querying the tracking data list endpoint
- **Retry uploads** if data doesn't appear after 1-2 minutes (may indicate processing failure)
- **Monitor queue workers** - Ensure queue workers are running: `php artisan queue:work`
- **Check logs** if uploads consistently fail to process

### 2. Status Updates

- Update status immediately when user status changes
- Don't send duplicate status updates
- Include relevant metadata (task_id, project_id) when available

### 3. Error Handling

- Always check the `result` field in responses
- Handle 202 Accepted responses for file uploads (async processing)
- Implement retry logic for transient errors (5xx status codes)
- Don't retry on 4xx errors (client errors)

### 4. Authentication

- Store JWT tokens securely
- Refresh tokens before expiration
- Handle 401 errors by re-authenticating

### 5. Performance

- Use query parameters to filter results
- Paginate large result sets (if implemented)
- Cache project and task lists when appropriate

---

## Support

For API support, please contact:
- **Email**: support@tyrodesk.com
- **Documentation**: https://docs.tyrodesk.com
- **Status Page**: https://status.tyrodesk.com

---

**Last Updated:** 2025-12-14  
**API Version:** 1.0.0

