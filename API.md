# Lurniva RAG API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api/v1`

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Qdrant URL

# 3. Start the server
npm start

# 4. Wait for "RAG Microservice ready" message

# 5. Upload a book
curl -X POST http://localhost:3000/api/v1/books/upload \
  -F "file=@./mybook.pdf"
```

---

## Test Console

A built-in test console is available at `http://localhost:3000/` for testing all API endpoints with a user-friendly interface.

---

## Authentication

This microservice does not include built-in authentication. Implement authentication in your API gateway or reverse proxy.

---

## Response Format

All responses follow this structure:

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

## Endpoints

### Upload Book (PDF)

Upload and process a PDF file. The file is stored in the `uploads/` folder.

```
POST /api/v1/books/upload
Content-Type: multipart/form-data
```

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | PDF file to upload |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/books/upload \
  -F "file=@/path/to/book.pdf"
```

#### JavaScript Example

```javascript
const formData = new FormData();
formData.append('file', pdfFile);

const response = await fetch('http://localhost:3000/api/v1/books/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result.data.book_id); // Store this in MySQL
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "file_name": "example.pdf",
    "file_path": "./uploads/550e8400-e29b-41d4-a716-446655440000_example.pdf",
    "stored_file_name": "550e8400-e29b-41d4-a716-446655440000_example.pdf",
    "file_size_bytes": 2560000,
    "file_size_mb": 2.44,
    "page_count": 45,
    "text_length": 125000,
    "word_count": 18500,
    "chunk_count": 150,
    "chunk_size": 600,
    "chunk_overlap": 100,
    "first_chunk_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "last_chunk_id": "z9y8x7w6-v5u4-3210-zyxw-vu0987654321",
    "extraction_method": "pdf-parse",
    "embedding_model": "all-MiniLM-L6-v2",
    "vector_dimension": 384,
    "storage_backend": "qdrant",
    "created_at": "2026-01-17T12:00:00.000Z",
    "processing_time_ms": 15234
  }
}
```

---

### Ingest Text

Ingest raw text content directly (alternative to PDF upload). Useful when sending text from backend systems.

```
POST /api/v1/books/text
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| text | string | Yes | - | Text content to ingest |
| title | string | No | "Untitled Document" | Document title |
| chunk_size | number | No | 600 | Maximum characters per chunk |
| chunk_overlap | number | No | 100 | Characters overlapping between chunks |

#### Parameter Guide

- **Chunk Size**: Maximum characters per chunk (recommended: 400-800). Larger chunks provide more context but may reduce search precision.
- **Chunk Overlap**: Characters shared between consecutive chunks (recommended: 50-150). Helps maintain context across chunk boundaries.

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/books/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Machine learning is a subset of AI...",
    "title": "ML Introduction",
    "chunk_size": 600,
    "chunk_overlap": 100
  }'
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "ML Introduction",
    "text_length": 5000,
    "word_count": 850,
    "chunk_count": 10,
    "storage_backend": "qdrant",
    "created_at": "2026-01-17T12:00:00.000Z",
    "processing_time_ms": 1234
  }
}
```

---

### Search

Search for relevant content across all books or a specific book.

```
POST /api/v1/search
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| query | string | Yes | - | Search query text |
| book_id | string | No | null | Filter to specific book (UUID) |
| limit | number | No | 5 | Max results (max: 20) |

#### Parameter Guide

- **Top K (limit)**: Maximum number of results to return. Higher values return more results but may include less relevant matches. Recommended: 3-10.
- **Min Score**: (Client-side filtering) Similarity threshold (0-1). Results below this score should be filtered out. 0.3 = loose match, 0.7 = strict match. Recommended: 0.3-0.5.

#### cURL Example

```bash
# Search all books
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning algorithms", "limit": 5}'

# Search specific book
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "neural networks",
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 10
  }'
```

#### JavaScript Example

```javascript
const response = await fetch('http://localhost:3000/api/v1/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'machine learning algorithms',
    book_id: '550e8400-e29b-41d4-a716-446655440000',  // optional
    limit: 5
  })
});

const result = await response.json();
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "query": "machine learning algorithms",
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "result_count": 5,
    "results": [
      {
        "chunk_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "book_id": "550e8400-e29b-41d4-a716-446655440000",
        "text": "Machine learning algorithms can be categorized into supervised, unsupervised, and reinforcement learning...",
        "score": 0.8542,
        "chunk_index": 42,
        "file_name": "ml_handbook.pdf"
      }
    ]
  }
}
```

---

### List All Books

List all books/documents in the collection.

```
GET /api/v1/books
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 100 | Maximum books to return |

#### cURL Example

```bash
curl http://localhost:3000/api/v1/books?limit=50
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "books": [
      {
        "book_id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "ml_handbook.pdf",
        "filename": "ml_handbook.pdf",
        "file_path": "./uploads/550e8400-e29b-41d4-a716-446655440000_ml_handbook.pdf",
        "chunk_count": 150,
        "created_at": "2026-01-17T12:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### Get Book by ID

Retrieve book details and optionally all chunks.

```
GET /api/v1/books/:bookId
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| include_chunks | boolean | false | Include all chunk texts |

#### cURL Example

```bash
# Get book info only
curl http://localhost:3000/api/v1/books/550e8400-e29b-41d4-a716-446655440000

# Get book with all chunks
curl "http://localhost:3000/api/v1/books/550e8400-e29b-41d4-a716-446655440000?include_chunks=true&limit=40&offset=0"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "file_name": "ml_handbook.pdf",
    "file_path": "./uploads/550e8400-e29b-41d4-a716-446655440000_ml_handbook.pdf",
    "chunk_count": 150,
    "total_text_length": 125000,
    "created_at": "2026-01-17T12:00:00.000Z",
    "storage_backend": "qdrant",
    "chunks": [
      {
        "chunk_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "chunk_index": 0,
        "text": "Chapter 1: Introduction to Machine Learning...",
        "text_length": 587
      }
    ]
  }
}
```

---

### Download Book (PDF)

Download the original PDF file.

```
GET /api/v1/books/:bookId/download
```

#### cURL Example

```bash
curl -O http://localhost:3000/api/v1/books/550e8400-e29b-41d4-a716-446655440000/download
```

#### Response

- **200 OK**: Returns the PDF file as download
- **404 Not Found**: Book not found or no file associated (text ingestion)

---

### Delete Book

Delete a book and all its chunks from the vector store.

```
DELETE /api/v1/books/:bookId
```

#### cURL Example

```bash
curl -X DELETE http://localhost:3000/api/v1/books/550e8400-e29b-41d4-a716-446655440000
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "deleted_chunks": 150,
    "deleted_at": "2026-01-17T15:30:00.000Z"
  }
}
```

**Note:** This does not delete the physical file from the uploads folder. Delete from your MySQL database separately.

---

### Health Check

Check if the service is running and ready.

```
GET /api/v1/health
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "api_version": "1.0.0",
    "embedding_model_loaded": true,
    "storage_backend": "qdrant",
    "qdrant_url": "https://qdrant.example.com",
    "collection_name": "books",
    "timestamp": "2026-01-17T12:00:00.000Z"
  }
}
```

---

### Statistics

Get vector store statistics.

```
GET /api/v1/stats
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "total_vectors": 15000,
    "vector_dimension": 384,
    "storage_backend": "qdrant"
  }
}
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/stats` | Collection statistics |
| POST | `/api/v1/books/upload` | Upload PDF file |
| POST | `/api/v1/books/text` | Ingest raw text |
| GET | `/api/v1/books` | List all books |
| GET | `/api/v1/books/:bookId` | Get book by ID |
| GET | `/api/v1/books/:bookId/download` | Download PDF file |
| DELETE | `/api/v1/books/:bookId` | Delete book |
| POST | `/api/v1/search` | Search documents |
| POST | `/api/v1/tutor/ask` | AI Tutor with provided chunks |
| POST | `/api/v1/tutor/search-and-ask` | Search + AI Tutor combined |

---

## MySQL Schema Suggestion

```sql
CREATE TABLE books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id VARCHAR(50) UNIQUE NOT NULL,  -- UUID from API response
  user_id INT,                          -- Your user system
  file_name VARCHAR(255),
  file_path VARCHAR(500),               -- Path to stored PDF
  file_size_bytes INT,
  page_count INT,
  text_length INT,
  word_count INT,
  chunk_count INT,
  title VARCHAR(255),                   -- Custom metadata
  author VARCHAR(255),                  -- Custom metadata
  category VARCHAR(100),                -- Custom metadata
  created_at DATETIME,
  INDEX idx_user_id (user_id),
  INDEX idx_book_id (book_id)
);
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| NO_FILE | 400 | No file in upload request |
| NO_TEXT | 400 | No text content provided |
| MODEL_NOT_READY | 503 | Embedding model still loading |
| EXTRACTION_FAILED | 400 | Could not extract text from PDF |
| NO_CHUNKS | 400 | No valid text chunks created |
| INVALID_QUERY | 400 | Search query is empty |
| NOT_FOUND | 404 | Book not found |
| NO_FILE | 404 | No file associated (text ingestion) |
| FILE_NOT_FOUND | 404 | File no longer exists on server |
| PROCESSING_ERROR | 500 | General processing error |
| SEARCH_ERROR | 500 | Search operation failed |
| DELETE_ERROR | 500 | Delete operation failed |
| DOWNLOAD_ERROR | 500 | Download operation failed |
| FETCH_ERROR | 500 | Failed to fetch data |
| LIST_ERROR | 500 | Failed to list books |
| STATS_ERROR | 500 | Failed to get statistics |
| INTERNAL_ERROR | 500 | Unhandled server error |

---

## AI Tutoring Endpoints

### Ask AI Tutor (with provided chunks)

Send chunks and metadata to AI tutor for educational responses.

```
POST /api/v1/tutor/ask
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| question | string | Yes | - | Student's question |
| chunks | array | Yes | - | Array of text chunks or objects with text property |
| class_no | string/number | Yes | - | Student's class number (e.g., "10", "12") |
| board | string | Yes | - | Educational board (e.g., "CBSE", "ICSE", "State Board") |
| subject | string | Yes | - | Subject name (e.g., "Physics", "Mathematics") |
| model | string | No | "gpt-4o-mini" | OpenAI model to use |
| max_tokens | number | No | 1000 | Maximum response tokens |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/tutor/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is photosynthesis?",
    "chunks": [
      "Photosynthesis is the process by which green plants make their own food using sunlight, water, and carbon dioxide.",
      "The chloroplasts in plant cells contain chlorophyll which captures light energy."
    ],
    "class_no": "10",
    "board": "CBSE",
    "subject": "Biology"
  }'
```

#### JavaScript Example

```javascript
const response = await fetch('http://localhost:3000/api/v1/tutor/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: "Explain Newton's first law of motion",
    chunks: [
      "Newton's first law states that an object at rest stays at rest...",
      "This law is also known as the law of inertia..."
    ],
    class_no: "11",
    board: "CBSE",
    subject: "Physics"
  })
});

const result = await response.json();
console.log(result.data.answer); // HTML response
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "question": "What is photosynthesis?",
    "answer": "<h3>Photosynthesis</h3><p>Photosynthesis is the process by which <strong>green plants make their own food</strong> using three main components:</p><ul><li>Sunlight (light energy)</li><li>Water (H₂O)</li><li>Carbon dioxide (CO₂)</li></ul><p>This process takes place in the <strong>chloroplasts</strong> of plant cells, which contain a green pigment called <strong>chlorophyll</strong> that captures light energy from the sun.</p>",
    "metadata": {
      "class_no": "10",
      "board": "CBSE", 
      "subject": "Biology",
      "chunks_count": 2,
      "model_used": "gpt-4o-mini",
      "tokens_used": {
        "prompt_tokens": 245,
        "completion_tokens": 87,
        "total_tokens": 332
      },
      "response_time_ms": 1250,
      "timestamp": "2026-01-25T10:30:00.000Z"
    }
  }
}
```

---

### Search and Ask AI Tutor (combined)

Search for relevant chunks automatically and ask the AI tutor.

```
POST /api/v1/tutor/search-and-ask
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| question | string | Yes | - | Student's question |
| class_no | string/number | Yes | - | Student's class number |
| board | string | Yes | - | Educational board |
| subject | string | Yes | - | Subject name |
| book_id | string | No | null | Filter to specific book (UUID) |
| search_limit | number | No | 5 | Max chunks to retrieve |
| min_score | number | No | 0.3 | Minimum relevance score (0-1) |
| model | string | No | "gpt-4o-mini" | OpenAI model to use |
| max_tokens | number | No | 1000 | Maximum response tokens |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/tutor/search-and-ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How does electric current flow?",
    "class_no": "10", 
    "board": "CBSE",
    "subject": "Physics",
    "search_limit": 3,
    "min_score": 0.4
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "question": "How does electric current flow?",
    "answer": "<h3>Electric Current Flow</h3><p>Electric current is the flow of <strong>electric charge</strong> through a conductor...</p>",
    "metadata": {
      "class_no": "10",
      "board": "CBSE",
      "subject": "Physics", 
      "chunks_found": 3,
      "chunks_used": [
        {
          "file_name": "physics_class10.pdf",
          "chunk_index": 45,
          "relevance_score": 0.8234
        }
      ],
      "search_performed": true,
      "model_used": "gpt-4o-mini",
      "tokens_used": {
        "total_tokens": 456
      },
      "response_time_ms": 1850,
      "timestamp": "2026-01-25T10:30:00.000Z"
    }
  }
}
```

---

## Tutor API Features

### AI Tutor Rules
The AI tutor follows strict educational guidelines:
- **Chunk-only responses**: Only uses provided textbook material
- **Age-appropriate**: Adapts complexity to class level
- **HTML format**: Returns properly formatted HTML (no Markdown)
- **Syllabus-aligned**: Considers board and subject context
- **Fallback handling**: Indicates when topics aren't covered

### Response Format
All tutor responses use clean HTML:
- `<h3>` for main headings
- `<p>` for paragraphs  
- `<ul>`, `<li>` for lists
- `<strong>` for emphasis
- `<iframe>` for video embeds (if links provided)

### Integration Examples

#### With your existing search system:
```javascript
// 1. Search for chunks
const searchResponse = await fetch('/api/v1/search', {
  method: 'POST',
  body: JSON.stringify({ 
    query: studentQuestion,
    limit: 5 
  })
});

const searchData = await searchResponse.json();
const chunks = searchData.data.results.map(r => r.text);

// 2. Ask AI tutor
const tutorResponse = await fetch('/api/v1/tutor/ask', {
  method: 'POST', 
  body: JSON.stringify({
    question: studentQuestion,
    chunks: chunks,
    class_no: "10",
    board: "CBSE", 
    subject: "Physics"
  })
});

const answer = await tutorResponse.json();
// Display answer.data.answer (HTML) to student
```

#### Direct integration (recommended):
```javascript
// One-step: search + ask
const response = await fetch('/api/v1/tutor/search-and-ask', {
  method: 'POST',
  body: JSON.stringify({
    question: "Explain photosynthesis process",
    class_no: "9",
    board: "CBSE",
    subject: "Biology"
  })
});

const result = await response.json();
// Display result.data.answer directly
```

### Node.js (Express Backend)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const RAG_URL = 'http://localhost:3000/api/v1';

// Upload a book
async function uploadBook(filePath, userId) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await axios.post(`${RAG_URL}/books/upload`, form, {
    headers: form.getHeaders()
  });

  const bookData = response.data.data;

  // Store in your MySQL
  await db.query(
    'INSERT INTO books (book_id, user_id, file_name, file_path, chunk_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [bookData.book_id, userId, bookData.file_name, bookData.file_path, bookData.chunk_count, bookData.created_at]
  );

  return bookData;
}

// Ingest text directly
async function ingestText(text, title, userId) {
  const response = await axios.post(`${RAG_URL}/books/text`, {
    text,
    title,
    chunk_size: 600,
    chunk_overlap: 100
  });

  const bookData = response.data.data;

  // Store in your MySQL
  await db.query(
    'INSERT INTO books (book_id, user_id, file_name, chunk_count, created_at) VALUES (?, ?, ?, ?, ?)',
    [bookData.book_id, userId, title, bookData.chunk_count, bookData.created_at]
  );

  return bookData;
}

// Search with book filter
async function searchBook(query, bookId) {
  const response = await axios.post(`${RAG_URL}/search`, {
    query,
    book_id: bookId,  // Search only in this book
    limit: 10
  });

  return response.data.data.results;
}

// Search all books for a user
async function searchUserBooks(query, userId) {
  // Get user's book_ids from MySQL
  const userBooks = await db.query('SELECT book_id FROM books WHERE user_id = ?', [userId]);
  
  // Search in RAG
  const response = await axios.post(`${RAG_URL}/search`, {
    query,
    limit: 20
  });

  // Filter results to user's books
  const results = response.data.data.results.filter(r => 
    userBooks.some(b => b.book_id === r.book_id)
  );

  return results;
}
```

### Python (FastAPI Backend)

```python
import requests
from typing import Optional

RAG_URL = "http://localhost:3000/api/v1"

def upload_book(file_path: str, user_id: int) -> dict:
    with open(file_path, 'rb') as f:
        response = requests.post(
            f"{RAG_URL}/books/upload",
            files={"file": f}
        )
    
    book_data = response.json()["data"]
    
    # Store in your MySQL
    db.execute(
        "INSERT INTO books (book_id, user_id, file_name, file_path) VALUES (%s, %s, %s, %s)",
        (book_data["book_id"], user_id, book_data["file_name"], book_data["file_path"])
    )
    
    return book_data

def ingest_text(text: str, title: str, chunk_size: int = 600, chunk_overlap: int = 100) -> dict:
    response = requests.post(
        f"{RAG_URL}/books/text",
        json={
            "text": text,
            "title": title,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap
        }
    )
    return response.json()["data"]

def search(query: str, book_id: Optional[str] = None, limit: int = 10) -> list:
    payload = {"query": query, "limit": limit}
    if book_id:
        payload["book_id"] = book_id
    
    response = requests.post(f"{RAG_URL}/search", json=payload)
    return response.json()["data"]["results"]

def list_books(limit: int = 100) -> list:
    response = requests.get(f"{RAG_URL}/books?limit={limit}")
    return response.json()["data"]["books"]

def download_book(book_id: str, save_path: str):
    response = requests.get(f"{RAG_URL}/books/{book_id}/download", stream=True)
    with open(save_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
```

### React Frontend

```jsx
// Upload PDF
async function uploadBook(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/v1/books/upload', {
    method: 'POST',
    body: formData
  });

  return response.json();
}

// Ingest text
async function ingestText(text, title) {
  const response = await fetch('/api/v1/books/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      title,
      chunk_size: 600,
      chunk_overlap: 100
    })
  });

  return response.json();
}

// Search within specific book
async function searchBook(query, bookId = null) {
  const payload = { query, limit: 10 };
  if (bookId) {
    payload.book_id = bookId;
  }

  const response = await fetch('/api/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}

// List all books
async function listBooks() {
  const response = await fetch('/api/v1/books');
  return response.json();
}

// Download book
function downloadBook(bookId) {
  window.open(`/api/v1/books/${bookId}/download`, '_blank');
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| QDRANT_URL | http://localhost:6333 | Qdrant instance URL |
| COLLECTION_NAME | books | Qdrant collection name |

### .env Example

```env
PORT=3000
QDRANT_URL=https://your-qdrant-instance.com
COLLECTION_NAME=books
```

---

## File Storage

Uploaded PDF files are stored in the `uploads/` directory with the following naming convention:

```
uploads/{book_id}_{original_filename}.pdf
```

Example:
```
uploads/550e8400-e29b-41d4-a716-446655440000_ml_handbook.pdf
```

---

## Rate Limits & Performance

### Recommended Limits

| Operation | Suggested Limit | Reason |
|-----------|-----------------|--------|
| Upload | 10/minute | CPU intensive |
| Text Ingest | 20/minute | Embedding generation |
| Search | 100/minute | Relatively fast |
| Get/Delete | 100/minute | Quick operations |

### Processing Times (Approximate)

| File Size | Processing Time |
|-----------|-----------------|
| < 1 MB | 2-5 seconds |
| 1-10 MB | 10-60 seconds |
| 10-50 MB | 1-5 minutes |

---

## Troubleshooting

### Model Not Ready

If you get `MODEL_NOT_READY` error:
- Wait 10-30 seconds after server start
- Check health endpoint for `embedding_model_loaded: true`

### Qdrant Connection Failed

If using in-memory fallback:
1. Check `QDRANT_URL` in .env
2. Verify Qdrant is running
3. Check network/firewall settings

### PDF Extraction Failed

If text extraction fails:
- Ensure PDF is not password-protected
- Check if PDF contains actual text (not just images)
- Try a different PDF to isolate the issue

---

## Support

For issues or questions, check:
1. Health endpoint: `GET /api/v1/health`
2. Server logs for detailed error messages
3. Qdrant connection status in health response
4. Test console at `http://localhost:3000/`
