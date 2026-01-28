# Lurniva RAG API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api/v1`  
**Live Features:** 🎨 **AI Visual Generation** | 📚 **Smart Lectures** | 🤖 **Context-Aware Tutoring** | 📝 **Educational Assessment**

---

## 🚀 Overview

Lurniva RAG is a **production-ready microservice** for PDF document processing, semantic search, and AI-powered educational content generation. Built for **dashboard integration** with complete JSON responses suitable for MySQL storage.

### Key Capabilities
- **📄 PDF Processing**: Multi-method text extraction with fallbacks
- **🔍 Semantic Search**: Vector similarity search with Qdrant/in-memory storage
- **🎨 Visual Generation**: DALL-E 3 integration for educational images
- **📊 Smart Charts**: AI-generated educational data visualizations
- **🤖 AI Tutoring**: Context-aware educational responses
- **📚 Lecture Creation**: Complete structured lectures with visuals
- **📝 Assignment Generation**: Document-based assignment creation
- **🧪 Quiz Generation**: Multi-type quiz creation (MCQ, T/F, Short Answer)
- **✅ Assignment Checking**: AI-powered grading with file upload
- **🎯 Quiz Checking**: Automated grading for multiple question types
- **🔐 Session Auth**: Built-in authentication for admin console

---

## ⚡ Quick Start

### Prerequisites
```bash
# Required: Node.js 18+
node --version

# Required: OpenAI API Key for AI features
echo $OPENAI_API_KEY
```

### Installation & Setup
```bash
# 1. Clone and install
git clone <repository>
cd Lurniva-RAG
npm install

# 2. Environment configuration
cp .env.example .env
# Edit .env with your keys:
```

**.env Configuration:**
```bash
# Server
PORT=3000

# Vector Database (Choose one)
QDRANT_URL=https://your-qdrant-instance.com  # Production
# QDRANT_URL=http://localhost:6333           # Local Qdrant
COLLECTION_NAME=books

# AI Features (Required for tutoring/lecture generation)
OPENAI_API_KEY=sk-your-openai-key-here

# Admin Console Access
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password
SESSION_SECRET=your-random-secret-key
```

### Start the Server
```bash
# Development
npm run dev

# Production
npm start

# Expected output:
# ✓ RAG Microservice ready on port 3000
# Base URL: http://localhost:3000/api/v1
```

### Test the API
```bash
# Health check
curl http://localhost:3000/api/v1/health

# Upload your first PDF
curl -X POST http://localhost:3000/api/v1/books/upload \
  -F "file=@./your-document.pdf"

# Generate a lecture with AI visuals
curl -X POST http://localhost:3000/api/v1/lecture/generate \
  -H "Content-Type: application/json" \
  -d '{"book_id":"YOUR_BOOK_ID","class_no":"10","board":"CBSE","subject":"Physics"}'
```

### Admin Console
Access the built-in test console at `http://localhost:3000/` (requires login)

---

## 🏗️ System Architecture

### Dual Storage System
```
┌─────────────────┐    ┌─────────────────┐
│   Qdrant DB     │ OR │   In-Memory     │
│ (Production)    │    │   (Fallback)    │
│ • Persistent    │    │ • Development   │
│ • Scalable      │    │ • No setup      │
│ • Cloud ready   │    │ • Temporary     │
└─────────────────┘    └─────────────────┘
```

### Embedding Pipeline
```
PDF → Text Extract → Chunking → Embeddings → Vector Store
      (2 methods)   (600 chars)  (384-dim)    (Qdrant/Memory)
```

### AI Integration
```
OpenAI GPT-4 ←→ Lurniva RAG ←→ DALL-E 3
   (Tutoring)      (Core API)     (Images)
```

---

## 📋 Response Format

All API responses follow a consistent structure:

### Success Response
```json
{
  "success": true,
  "data": {
    // Actual response data
    "book_id": "uuid",
    "metadata": { /* processing info */ }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable description"
  }
}
```

---

## 🔐 Authentication

The system includes **session-based authentication** for the admin console:

### Login (for admin console)
```bash
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

### API Endpoints
- **API Routes** (`/api/v1/*`): No authentication required
- **Admin Console** (`/console`): Requires session authentication
- **Static Files**: Publicly accessible

### Implementation Note
For production API usage, implement authentication in your **API Gateway** or **reverse proxy**. The microservice focuses on processing, not user management.

---

## 📚 Core API Endpoints

### 1. System Status

#### Health Check
```bash
GET /health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "uptime": "2h 15m 30s",
    "memory_usage": "45.2 MB",
    "vector_store": {
      "type": "qdrant|memory",
      "status": "connected|ready",
      "collections": 1
    }
  }
}
```

---

### 2. PDF Document Management

#### Upload PDF Document
```bash
POST /books/upload
Content-Type: multipart/form-data

# Form data:
file: [PDF file]
```

**Processing Flow:**
1. **PDF Validation**: File type and size checks
2. **Text Extraction**: Primary (pdf-parse) + Fallback (pdf2json)
3. **Content Chunking**: Split into 600-character segments
4. **Vector Embedding**: 384-dimensional vectors via transformers
5. **Storage**: Qdrant (production) or in-memory (development)

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "original_filename": "Physics_Class10_NCERT.pdf",
    "file_size": "2.4 MB",
    "processing": {
      "total_pages": 245,
      "total_chunks": 1250,
      "embedding_model": "all-MiniLM-L6-v2",
      "processing_time": "45.2s",
      "vector_dimensions": 384
    },
    "storage": {
      "vector_store": "qdrant",
      "collection": "books",
      "total_vectors": 1250
    }
  }
}
```

**Error Codes:**
- `NO_FILE_UPLOADED`: Missing file in request
- `INVALID_FILE_TYPE`: Non-PDF file provided
- `FILE_TOO_LARGE`: Exceeds size limit
- `PDF_PROCESSING_ERROR`: Extraction failed
- `EMBEDDING_ERROR`: Vector generation failed
- `STORAGE_ERROR`: Database insertion failed

#### List All Books
```bash
GET /books
```

**Response:**
```json
{
  "success": true,
  "data": {
    "books": [
      {
        "book_id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "Physics_Class10_NCERT.pdf",
        "upload_date": "2024-01-15T10:00:00Z",
        "chunks_count": 1250,
        "file_size": "2.4 MB"
      }
    ],
    "total_books": 1,
    "total_chunks": 1250
  }
}
```

#### Delete Book
```bash
DELETE /books/:book_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "deleted_chunks": 1250,
    "message": "Book and all associated vectors deleted successfully"
  }
}
```

---

### 3. Semantic Search

#### Search Documents
```bash
POST /search
Content-Type: application/json

{
  "query": "What is Newton's second law of motion?",
  "book_id": "550e8400-e29b-41d4-a716-446655440000",  // Optional
  "limit": 5  // Optional, default: 5, max: 20
}
```

**Search Algorithm:**
1. **Query Embedding**: Convert search term to 384-dim vector
2. **Similarity Calculation**: Cosine similarity with stored vectors
3. **Ranking**: Score-based ordering (0.0 to 1.0)
4. **Filtering**: Book-specific search if `book_id` provided

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "What is Newton's second law of motion?",
    "results": [
      {
        "chunk_id": "chunk_123",
        "book_id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "Physics_Class10_NCERT.pdf",
        "content": "Newton's second law of motion states that the acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass. Mathematically, F = ma, where F is force, m is mass, and a is acceleration.",
        "similarity_score": 0.94,
        "metadata": {
          "page_number": 45,
          "chunk_index": 123
        }
      }
    ],
    "total_results": 5,
    "processing_time": "0.12s",
    "search_params": {
      "embedding_model": "all-MiniLM-L6-v2",
      "similarity_threshold": 0.5,
      "max_results": 5
    }
  }
}
```

---

### 4. AI Tutoring System

#### Ask AI Tutor
```bash
POST /tutor/ask
Content-Type: application/json

{
  "question": "Explain photosynthesis in simple terms",
  "book_id": "550e8400-e29b-41d4-a716-446655440000",  // Optional
  "context_limit": 3  // Optional, default: 3
}
```

**AI Processing:**
1. **Context Retrieval**: Semantic search for relevant content
2. **Prompt Engineering**: Educational template with context
3. **AI Generation**: GPT-4o-mini for educational responses
4. **HTML Formatting**: Clean, displayable format

**Response:**
```json
{
  "success": true,
  "data": {
    "question": "Explain photosynthesis in simple terms",
    "answer": "<h3>Photosynthesis Explained</h3>\n<p>Photosynthesis is like a kitchen where plants make their own food! Here's how it works:</p>\n<ul>\n<li><strong>Ingredients:</strong> Carbon dioxide from air + Water from roots + Sunlight</li>\n<li><strong>Factory:</strong> Green leaves (containing chlorophyll)</li>\n<li><strong>Product:</strong> Glucose (plant food) + Oxygen (released to air)</li></ul>\n<p><em>Simple equation: 6CO₂ + 6H₂O + Light → C₆H₁₂O₆ + 6O₂</em></p>",
    "sources": [
      {
        "book_id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "Biology_Class10_NCERT.pdf",
        "content": "Photosynthesis is the process by which green plants...",
        "similarity_score": 0.92
      }
    ],
    "metadata": {
      "ai_model": "gpt-4o-mini",
      "response_time": "2.3s",
      "context_chunks": 3,
      "total_tokens": 245
    }
  }
}
```

#### Search and Ask (Combined)
```bash
POST /tutor/search-and-ask
Content-Type: application/json

{
  "question": "What are the types of chemical reactions?",
  "search_limit": 5,  // Optional
  "book_id": "550e8400-e29b-41d4-a716-446655440000"  // Optional
}
```

**One-Step Process:**
- Automatically finds relevant content
- Generates educational response
- Returns both search results and AI answer

---

### 5. Lecture Generation with AI Visuals

#### Generate Complete Lecture
```bash
POST /lecture/generate
Content-Type: application/json

{
  "book_id": "550e8400-e29b-41d4-a716-446655440000",
  "class_no": "10",
  "board": "CBSE",
  "subject": "Physics",
  "chapter": "Light - Reflection and Refraction",  // Optional
  "style": "comprehensive",  // Optional: comprehensive|concise|interactive|visual|practical
  "include_visuals": true    // Optional, default: true
}
```

**Lecture Styles:**
- **comprehensive**: Detailed explanations with theory and examples
- **concise**: Key points and summaries
- **interactive**: Quizzes and hands-on activities
- **visual**: Diagram-heavy with minimal text
- **practical**: Real-world applications and experiments

**AI Generation Pipeline:**
1. **Content Analysis**: Semantic search for chapter content
2. **Curriculum Alignment**: Class/board-specific adaptation
3. **Structure Generation**: Educational lesson plan
4. **Visual Creation**: DALL-E 3 images and charts
5. **Interactive Elements**: Quizzes and activities

**Response:**
```json
{
  "success": true,
  "data": {
    "lecture": {
      "title": "Light - Reflection and Refraction",
      "metadata": {
        "class": "10",
        "board": "CBSE",
        "subject": "Physics",
        "duration": "45 minutes",
        "difficulty": "intermediate",
        "style": "comprehensive"
      },
      "content": {
        "introduction": "<h2>What is Light?</h2><p>Light is a form of electromagnetic radiation that makes vision possible...</p>",
        "main_sections": [
          {
            "section_id": 1,
            "title": "Reflection of Light",
            "content": "<h3>Laws of Reflection</h3><p>When light hits a surface, it follows two important laws...</p>",
            "visual_aids": [
              {
                "type": "image",
                "title": "Ray Diagram - Reflection",
                "url": "https://oaidalleapiprodscus.blob.core.windows.net/...",
                "description": "Educational diagram showing incident ray, reflected ray, and normal",
                "alt_text": "Reflection diagram with incident and reflected rays"
              }
            ]
          }
        ],
        "visual_elements": {
          "images": [
            {
              "id": "img_001",
              "url": "https://dalle-generated-image-url.com/reflection-diagram.png",
              "title": "Laws of Reflection Diagram",
              "description": "Clear educational diagram showing incident ray, reflected ray, normal, and angles",
              "placement": "after_section_1",
              "size": "medium"
            }
          ],
          "charts": [
            {
              "id": "chart_001",
              "type": "line",
              "title": "Refractive Index vs Wavelength",
              "data": {
                "labels": ["400nm", "500nm", "600nm", "700nm"],
                "datasets": [
                  {
                    "label": "Glass",
                    "data": [1.52, 1.51, 1.50, 1.49],
                    "borderColor": "blue"
                  }
                ]
              },
              "description": "Shows how refractive index varies with wavelength for glass"
            }
          ]
        },
        "interactive_elements": [
          {
            "type": "quiz",
            "title": "Quick Check - Reflection",
            "questions": [
              {
                "question": "What is the angle of incidence if the angle of reflection is 30°?",
                "options": ["30°", "60°", "90°", "0°"],
                "correct": 0,
                "explanation": "Angle of incidence equals angle of reflection (Law of Reflection)"
              }
            ]
          }
        ],
        "summary": "<h3>Key Takeaways</h3><ul><li>Light follows laws of reflection...</li></ul>",
        "homework": [
          "Draw ray diagrams for reflection from plane mirrors",
          "Solve numerical problems on Snell's law"
        ]
      },
      "generation_metadata": {
        "ai_model": "gpt-4o-mini",
        "image_model": "dall-e-3",
        "total_images": 3,
        "generation_time": "45.2s",
        "content_chunks_used": 8,
        "total_tokens": 2847
      }
    }
  }
}
```

**Visual Generation Features:**
- **DALL-E 3 Integration**: High-quality educational diagrams
- **Smart Chart Data**: AI generates realistic educational datasets
- **Interactive Specifications**: Complete quiz and activity structures
- **Curriculum Alignment**: Visuals match class and subject requirements
- **Fallback Support**: Graceful handling if visual generation fails

**Error Codes:**
- `MISSING_BOOK_ID`: No book specified for lecture generation  
- `BOOK_NOT_FOUND`: Invalid book ID provided
- `INSUFFICIENT_CONTENT`: Not enough content for lecture generation
- `AI_GENERATION_ERROR`: OpenAI API failure
- `IMAGE_GENERATION_ERROR`: DALL-E service unavailable
- `LECTURE_STYLE_INVALID`: Unsupported style parameter

---
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

## 🛠️ Additional API Endpoints

### 6. Advanced Document Management

#### Ingest Text Content
```bash
POST /books/text
Content-Type: application/json

{
  "text": "Machine learning is a subset of artificial intelligence...",
  "title": "ML Introduction",  // Optional
  "chunk_size": 600,  // Optional, default: 600
  "chunk_overlap": 100  // Optional, default: 100
}
```

**Use Cases:**
- Import content from existing databases
- Process scraped web content
- Handle non-PDF text documents
- Bulk content ingestion

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "ML Introduction",
    "text_length": 5000,
    "word_count": 850,
    "chunk_count": 10,
    "processing": {
      "chunk_size": 600,
      "chunk_overlap": 100,
      "embedding_model": "all-MiniLM-L6-v2",
      "processing_time": "2.1s"
    }
  }
}
```

#### Get Book Details
```bash
GET /books/:book_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "Physics_Class10_NCERT.pdf",
    "upload_date": "2024-01-15T10:00:00Z",
    "file_size": "2.4 MB",
    "total_chunks": 1250,
    "metadata": {
      "pages": 245,
      "embedding_model": "all-MiniLM-L6-v2",
      "vector_dimensions": 384,
      "processing_method": "pdf-parse"
    }
  }
}
```

---

### 7. System Management

#### Clear All Data
```bash
DELETE /books/all
```

**Warning:** This permanently deletes all uploaded documents and vectors.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted_books": 5,
    "deleted_chunks": 6250,
    "storage_cleared": "qdrant",
    "message": "All data cleared successfully"
  }
}
```

#### System Statistics
```bash
GET /stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "system": {
      "uptime": "5h 23m 15s",
      "memory_usage": "87.3 MB",
      "cpu_usage": "12%",
      "node_version": "v18.17.0"
    },
    "storage": {
      "total_books": 12,
      "total_chunks": 15400,
      "total_vectors": 15400,
      "storage_type": "qdrant",
      "collection_name": "books"
    },
    "ai_features": {
      "openai_configured": true,
      "dalle_available": true,
      "embedding_model": "all-MiniLM-L6-v2",
      "fallback_active": false
    }
  }
}
```

---

## ⚠️ Error Handling

### Global Error Codes

| Code | HTTP Status | Description | Solution |
|------|-------------|-------------|----------|
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error | Check logs, report if persistent |
| `INVALID_REQUEST` | 400 | Malformed request body | Validate JSON structure |
| `MISSING_PARAMETERS` | 400 | Required fields missing | Check API documentation |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Implement request throttling |

### Storage-Specific Errors

| Code | Description | Recovery |
|------|-------------|----------|
| `QDRANT_CONNECTION_ERROR` | Qdrant database unavailable | System falls back to in-memory storage |
| `VECTOR_STORAGE_FAILED` | Cannot store embeddings | Check storage backend health |
| `COLLECTION_NOT_FOUND` | Vector collection missing | System auto-creates collection |

### AI Service Errors

| Code | Description | Impact |
|------|-------------|--------|
| `OPENAI_API_ERROR` | OpenAI service failure | Tutoring/lecture generation fails |
| `DALLE_SERVICE_ERROR` | DALL-E image generation failed | Lectures generated without images |
| `EMBEDDING_MODEL_ERROR` | Local model unavailable | Falls back to OpenAI embeddings |
| `TOKEN_LIMIT_EXCEEDED` | OpenAI token limit reached | Response truncated |

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "BOOK_NOT_FOUND",
    "message": "No book found with ID: 550e8400-e29b-41d4-a716-446655440000",
    "details": {
      "provided_id": "550e8400-e29b-41d4-a716-446655440000",
      "available_books": 5,
      "suggestion": "Use GET /books to list available books"
    }
  },
  "request_id": "req_abc123",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---
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
## 💻 Integration Examples

### Frontend Integration (JavaScript)

#### Upload and Search Flow
```javascript
// 1. Upload PDF
async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/v1/books/upload', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  return result.data.book_id;
}

// 2. Search content
async function searchContent(query, bookId) {
  const response = await fetch('/api/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: query,
      book_id: bookId,
      limit: 5
    })
  });
  
  return await response.json();
}

// 3. Ask AI Tutor
async function askTutor(question, bookId) {
  const response = await fetch('/api/v1/tutor/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: question,
      book_id: bookId
    })
  });
  
  const result = await response.json();
  return result.data.answer; // HTML formatted response
}

// 4. Generate Lecture with Visuals
async function generateLecture(bookId, classNo, subject) {
  const response = await fetch('/api/v1/lecture/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      book_id: bookId,
      class_no: classNo,
      subject: subject,
      board: "CBSE",
      style: "comprehensive",
      include_visuals: true
    })
  });
  
  const result = await response.json();
  return result.data.lecture;
}
```

### Python Integration

#### Complete RAG Workflow
```python
import requests
import json

class LurnivaRAG:
    def __init__(self, base_url="http://localhost:3000/api/v1"):
        self.base_url = base_url
    
    def upload_pdf(self, file_path):
        """Upload PDF and return book_id"""
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(f"{self.base_url}/books/upload", files=files)
        
        return response.json()
    
    def search(self, query, book_id=None, limit=5):
        """Search for similar content"""
        payload = {"query": query, "limit": limit}
        if book_id:
            payload["book_id"] = book_id
            
        response = requests.post(f"{self.base_url}/search", json=payload)
        return response.json()
    
    def ask_tutor(self, question, book_id=None):
        """Get AI tutor response"""
        payload = {"question": question}
        if book_id:
            payload["book_id"] = book_id
            
        response = requests.post(f"{self.base_url}/tutor/ask", json=payload)
        return response.json()
    
    def generate_lecture(self, book_id, class_no, subject, **kwargs):
        """Generate complete lecture with visuals"""
        payload = {
            "book_id": book_id,
            "class_no": str(class_no),
            "subject": subject,
            **kwargs
        }
        
        response = requests.post(f"{self.base_url}/lecture/generate", json=payload)
        return response.json()

# Usage Example
rag = LurnivaRAG()

# Upload document
result = rag.upload_pdf("physics_textbook.pdf")
book_id = result['data']['book_id']
print(f"Uploaded book: {book_id}")

# Search content
search_results = rag.search("Newton's laws of motion", book_id)
print(f"Found {len(search_results['data']['results'])} results")

# Ask AI tutor
tutor_response = rag.ask_tutor("Explain Newton's second law", book_id)
print("AI Tutor Response:", tutor_response['data']['answer'])

# Generate lecture
lecture = rag.generate_lecture(
    book_id=book_id,
    class_no=10,
    subject="Physics",
    board="CBSE",
    style="comprehensive"
)
print(f"Generated lecture: {lecture['data']['lecture']['title']}")
print(f"Images generated: {len(lecture['data']['lecture']['content']['visual_elements']['images'])}")
```

### Dashboard Integration (React)

#### Complete Educational Dashboard Component
```jsx
import React, { useState, useEffect } from 'react';

const EducationalDashboard = () => {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tutorQuestion, setTutorQuestion] = useState('');
  const [results, setResults] = useState(null);
  const [lecture, setLecture] = useState(null);

  // Upload PDF
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/v1/books/upload', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    if (result.success) {
      loadBooks(); // Refresh book list
      alert(`Book uploaded: ${result.data.original_filename}`);
    }
  };

  // Load all books
  const loadBooks = async () => {
    const response = await fetch('/api/v1/books');
    const result = await response.json();
    setBooks(result.data.books);
  };

  // Search content
  const handleSearch = async () => {
    if (!searchQuery) return;
    
    const response = await fetch('/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchQuery,
        book_id: selectedBook,
        limit: 5
      })
    });
    
    const result = await response.json();
    setResults(result.data);
  };

  // Ask AI Tutor
  const handleTutorQuestion = async () => {
    if (!tutorQuestion) return;
    
    const response = await fetch('/api/v1/tutor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: tutorQuestion,
        book_id: selectedBook
      })
    });
    
    const result = await response.json();
    setResults({ tutor_response: result.data });
  };

  // Generate Lecture
  const handleGenerateLecture = async (classNo, subject) => {
    if (!selectedBook) return;
    
    const response = await fetch('/api/v1/lecture/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book_id: selectedBook,
        class_no: classNo,
        subject: subject,
        board: "CBSE",
        style: "comprehensive",
        include_visuals: true
      })
    });
    
    const result = await response.json();
    setLecture(result.data.lecture);
  };

  useEffect(() => {
    loadBooks();
  }, []);

  return (
    <div className="dashboard">
      {/* File Upload */}
      <div className="upload-section">
        <input 
          type="file" 
          accept=".pdf" 
          onChange={(e) => handleUpload(e.target.files[0])} 
        />
      </div>

      {/* Book Selection */}
      <div className="book-selection">
        <select onChange={(e) => setSelectedBook(e.target.value)}>
          <option value="">Select a book...</option>
          {books.map(book => (
            <option key={book.book_id} value={book.book_id}>
              {book.filename}
            </option>
          ))}
        </select>
      </div>

      {/* Search Interface */}
      <div className="search-section">
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search content..."
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      {/* AI Tutor Interface */}
      <div className="tutor-section">
        <input 
          type="text" 
          value={tutorQuestion}
          onChange={(e) => setTutorQuestion(e.target.value)}
          placeholder="Ask AI tutor a question..."
        />
        <button onClick={handleTutorQuestion}>Ask Tutor</button>
      </div>

      {/* Lecture Generation */}
      <div className="lecture-section">
        <button onClick={() => handleGenerateLecture("10", "Physics")}>
          Generate Physics Lecture (Class 10)
        </button>
      </div>

      {/* Results Display */}
      <div className="results">
        {results?.results && (
          <div className="search-results">
            <h3>Search Results:</h3>
            {results.results.map((result, idx) => (
              <div key={idx} className="result-item">
                <p><strong>Score:</strong> {result.similarity_score.toFixed(3)}</p>
                <p>{result.content}</p>
              </div>
            ))}
          </div>
        )}

        {results?.tutor_response && (
          <div className="tutor-response">
            <h3>AI Tutor Response:</h3>
            <div dangerouslySetInnerHTML={{ __html: results.tutor_response.answer }} />
          </div>
        )}
      </div>

      {/* Lecture Display */}
      {lecture && (
        <div className="lecture-display">
          <h2>{lecture.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: lecture.content.introduction }} />
          
          {/* Display generated images */}
          {lecture.content.visual_elements.images.map((img, idx) => (
            <div key={idx} className="lecture-image">
              <img src={img.url} alt={img.alt_text} />
              <p>{img.description}</p>
            </div>
          ))}
          
          {/* Display generated charts */}
          {lecture.content.visual_elements.charts.map((chart, idx) => (
            <div key={idx} className="lecture-chart">
              <h4>{chart.title}</h4>
              <p>{chart.description}</p>
              {/* Render chart using chart.data */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EducationalDashboard;
```

---
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

## 🚀 Production Deployment

### Environment Configuration

#### Production .env
```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Vector Database (Production)
QDRANT_URL=https://your-qdrant-cloud.com
QDRANT_API_KEY=your-qdrant-api-key
COLLECTION_NAME=books_prod

# AI Services
OPENAI_API_KEY=sk-your-production-key
OPENAI_ORG_ID=org-your-organization

# Authentication
AUTH_USERNAME=admin
AUTH_PASSWORD=strong-production-password
SESSION_SECRET=your-cryptographically-secure-secret

# File Upload Limits
MAX_FILE_SIZE=50MB
UPLOAD_PATH=/app/uploads

# Performance
CHUNK_SIZE=600
CHUNK_OVERLAP=100
MAX_SEARCH_RESULTS=20
REQUEST_TIMEOUT=30000
```

### Docker Deployment

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Start application
CMD ["npm", "start"]
```

#### docker-compose.yml
```yaml
version: '3.8'
services:
  lurniva-rag:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped
    depends_on:
      - qdrant
      
  qdrant:
    image: qdrant/qdrant:v1.7.0
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
    restart: unless-stopped

volumes:
  qdrant_data:
```

### Kubernetes Deployment

#### k8s-deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lurniva-rag
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lurniva-rag
  template:
    metadata:
      labels:
        app: lurniva-rag
    spec:
      containers:
      - name: lurniva-rag
        image: lurniva/rag:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: QDRANT_URL
          valueFrom:
            secretKeyRef:
              name: rag-secrets
              key: qdrant-url
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: rag-secrets
              key: openai-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: lurniva-rag-service
spec:
  selector:
    app: lurniva-rag
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Performance Optimization

#### Recommended Production Settings
```javascript
// server.js optimizations for production

// Enable compression
app.use(compression());

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Request timeout
app.use(timeout('30s'));

// Clustering for multi-core support
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Worker process
  app.listen(PORT);
}
```

---

## 📊 Performance & Scaling

### Benchmarks (Production Hardware)

| Operation | Processing Time | Throughput |
|-----------|----------------|------------|
| PDF Upload (10MB) | 15-30 seconds | 2-4 docs/minute |
| Text Search | 50-150ms | 1000+ queries/second |
| AI Tutor Response | 2-5 seconds | 20-50 responses/minute |
| Lecture Generation | 30-60 seconds | 1-2 lectures/minute |
| Image Generation (DALL-E) | 10-20 seconds | 3-6 images/minute |

### Scaling Considerations

#### Horizontal Scaling
- **Stateless Design**: Multiple instances can run simultaneously
- **Load Balancing**: Distribute requests across instances
- **Shared Vector Store**: All instances access same Qdrant cluster

#### Vertical Scaling
- **Memory**: 2GB minimum, 4GB recommended for production
- **CPU**: Multi-core beneficial for PDF processing and embeddings
- **Storage**: SSD recommended for faster file I/O

#### Database Scaling
- **Qdrant Cloud**: Auto-scaling vector database
- **Local Qdrant**: Configure clustering for high availability
- **In-Memory Fallback**: Development only, not for production

### Monitoring & Observability

#### Health Monitoring
```bash
# Monitor system health
curl http://localhost:3000/api/v1/health

# Check system statistics
curl http://localhost:3000/api/v1/stats

# Monitor file uploads
tail -f logs/upload.log

# Monitor AI service usage
grep "OpenAI" logs/app.log | tail -20
```

#### Key Metrics to Track
- **Request Rate**: API calls per minute
- **Response Time**: Average response time per endpoint
- **Error Rate**: Percentage of failed requests
- **Memory Usage**: RAM consumption trends
- **Vector Store Size**: Total embeddings stored
- **AI Token Usage**: OpenAI API consumption

---

## 🔧 Troubleshooting

### Common Issues

#### 1. PDF Processing Fails
```bash
# Error: PDF_PROCESSING_ERROR
# Solution: Check file format and size

# Debug command
curl -X POST http://localhost:3000/api/v1/books/upload \
  -F "file=@problematic.pdf" -v

# Check logs
tail logs/pdf-processing.log
```

#### 2. Embedding Model Not Loading
```bash
# Error: EMBEDDING_MODEL_ERROR  
# Windows users: ONNX runtime issues

# Check fallback activation
curl http://localhost:3000/api/v1/health
# Look for: "embedding_model": "openai-fallback"

# Solution: Ensure OPENAI_API_KEY is set
```

#### 3. Qdrant Connection Issues
```bash
# Error: QDRANT_CONNECTION_ERROR
# Check Qdrant availability

curl http://your-qdrant-url:6333/health
# Expected: {"status":"ok"}

# Verify environment variables
echo $QDRANT_URL
echo $COLLECTION_NAME
```

#### 4. OpenAI API Errors
```bash
# Error: OPENAI_API_ERROR
# Check API key and quota

# Verify key validity
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check usage
# Visit: https://platform.openai.com/usage
```

### Debug Mode

#### Enable Detailed Logging
```bash
# Set environment variable
export DEBUG=lurniva:*

# Or in .env file
DEBUG=lurniva:*

# Start server with debug output
npm run dev
```

#### Test Individual Components
```bash
# Test PDF processing only
curl -X POST http://localhost:3000/api/v1/books/upload \
  -F "file=@test.pdf"

# Test search without AI
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test","limit":1}'

# Test embedding generation
curl -X POST http://localhost:3000/api/v1/debug/embed \
  -H "Content-Type: application/json" \
  -d '{"text":"test embedding"}'
```

---

## 📋 API Reference Summary

### All Endpoints at a Glance

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | System health check | ❌ |
| `GET` | `/stats` | System statistics | ❌ |
| `POST` | `/books/upload` | Upload PDF document | ❌ |
| `POST` | `/books/text` | Ingest text content | ❌ |
| `GET` | `/books` | List all books | ❌ |
| `GET` | `/books/:id` | Get book details | ❌ |
| `DELETE` | `/books/:id` | Delete specific book | ❌ |
| `DELETE` | `/books/all` | Clear all data | ❌ |
| `POST` | `/search` | Semantic search | ❌ |
| `POST` | `/tutor/ask` | AI tutor question | ❌ |
| `POST` | `/tutor/search-and-ask` | Combined search + AI | ❌ |
| `POST` | `/lecture/generate` | Generate lecture with visuals | ❌ |

### Response Status Codes

| Code | Meaning | When |
|------|---------|------|
| `200` | Success | Request processed successfully |
| `201` | Created | Resource created (upload, ingest) |
| `400` | Bad Request | Invalid request parameters |
| `404` | Not Found | Resource not found |
| `429` | Rate Limited | Too many requests |
| `500` | Server Error | Internal processing error |

---

## 📚 Additional Resources

### Official Documentation
- **OpenAI API**: https://platform.openai.com/docs
- **Qdrant Vector DB**: https://qdrant.tech/documentation
- **Transformers.js**: https://huggingface.co/docs/transformers.js

### Educational Applications
- **Student Portals**: Integrate search and AI tutoring
- **Teacher Dashboards**: Use lecture generation features
- **Content Management**: Bulk PDF processing for digital libraries
- **Assessment Tools**: Generate quizzes from lecture content

### Development Tools
- **Admin Console**: `http://localhost:3000/` (built-in testing interface)
- **API Testing**: Postman collection available
- **Monitoring**: Prometheus metrics endpoint at `/metrics`

### Community & Support
- **GitHub Issues**: Report bugs and feature requests
- **Discord Community**: Real-time development support
- **Documentation Wiki**: Extended examples and tutorials

---

**Last Updated**: January 2024  
**API Version**: 1.0.0  
**Compatibility**: Node.js 18+, OpenAI API v4+, Qdrant v1.7+

---

*Built with ❤️ for the education community. Empowering learning through AI.*

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
| POST | `/api/v1/lecture/generate` | Generate lectures with AI-generated visuals |

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
| **MISSING_BOOK_ID** | **400** | **book_id parameter required for lecture generation** |
| **MISSING_METADATA** | **400** | **class_no, board, and subject are required** |
| **OPENAI_NOT_CONFIGURED** | **503** | **OpenAI API key not configured** |
| **INVALID_API_KEY** | **401** | **Invalid OpenAI API key** |
| **RATE_LIMITED** | **429** | **OpenAI API rate limit exceeded** |
| **INVALID_REQUEST** | **400** | **Invalid request to OpenAI API** |
| **OPENAI_ERROR** | **500** | **OpenAI API error** |
| **TUTOR_ERROR** | **500** | **AI tutor processing error** |
| **SEARCH_ASK_ERROR** | **500** | **Search and ask operation failed** |
| **VISUAL_GENERATION_FAILED** | **206** | **Lecture generated but some visuals failed** |
| **IMAGE_GENERATION_ERROR** | **500** | **DALL-E image generation failed** |
| **CHART_GENERATION_ERROR** | **500** | **Chart data generation failed** |

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

### Lecture Generation with AI Visuals

Generate comprehensive, structured lectures from book content with **real AI-generated images, charts, and interactive elements**. This endpoint not only creates educational content but also generates actual visual assets using DALL-E 3 and GPT-4.

```
POST /api/v1/lecture/generate
Content-Type: application/json
```

#### Key Features

🎨 **AI Image Generation** - Real images created via DALL-E 3  
📊 **Smart Charts** - Data-driven charts with realistic educational data  
🎯 **Interactive Elements** - Quiz and exercise specifications  
📚 **Curriculum Aligned** - Content matches specific board and class requirements  
🖼️ **Visual Assets Included** - Complete visual data in API response  

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| book_id | string | Yes | - | UUID of the book to generate lecture from |
| class_no | string | Yes | - | Class/grade number (e.g., "10", "12") |
| board | string | Yes | - | Education board (e.g., "CBSE", "NCERT", "ICSE") |
| subject | string | Yes | - | Subject name (e.g., "Physics", "Biology", "Mathematics") |
| topic | string | No | "Auto-detected" | Specific topic to focus on |
| chunk_limit | number | No | 10 | Number of content chunks to use (1-50) |
| chunk_offset | number | No | 0 | Starting position in book chunks |
| model | string | No | "gpt-4o-mini" | OpenAI model: gpt-4o-mini, gpt-4o, gpt-3.5-turbo |
| max_tokens | number | No | 3000 | Maximum response tokens (2000-6000) |
| include_visuals | boolean | No | true | Generate AI images and charts |
| lecture_style | string | No | "comprehensive" | comprehensive, concise, interactive, visual, practical |

#### Lecture Styles

- **comprehensive**: Detailed explanations with examples and theory
- **concise**: Focused, essential content only  
- **interactive**: Heavy on quizzes, exercises, and student engagement
- **visual**: Emphasis on diagrams, charts, and visual learning
- **practical**: Real-world applications and hands-on examples

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/lecture/generate \
  -H "Content-Type: application/json" \
  -d '{
    "book_id": "550e8400-e29b-41d4-a716-446655440000",
    "class_no": "10",
    "board": "CBSE",
    "subject": "Biology",
    "topic": "Photosynthesis",
    "chunk_limit": 12,
    "chunk_offset": 0,
    "include_visuals": true,
    "lecture_style": "visual"
  }'
```

#### Enhanced Response (201 Created)

```json
{
  "success": true,
  "data": {
    "lecture_content": "<h1>Photosynthesis - The Life Process</h1>\n<div class=\"learning-objectives\">\n<h3>🎯 Learning Objectives</h3>\n<ul><li>Understand the process of photosynthesis</li></ul>\n</div>\n<div class=\"generated-image\" style=\"margin: 20px 0; text-align: center;\">\n<img src=\"https://oaidalleapiprodscus.blob.core.windows.net/private/org-abc123/user-def456/img-xyz789.png?st=2026-01-25T15%3A30%3A00Z&se=2026-01-25T17%3A30%3A00Z&sp=r&sv=2021-08-06&sr=b&rscd=inline&rsct=image/png&skoid=6aaadede-4fb3-4698-a8f6-684d7786b067&sktid=a48ccc7e-e0da-4e9f-8c69-7e62d9e8d432&skt=2026-01-25T09%3A30%3A15Z&ske=2026-01-26T09%3A30%3A15Z&sks=b&skv=2021-08-06&sig=xyz123...\" alt=\"Cross-section diagram of a leaf showing chloroplasts, stomata, and the photosynthesis process\" style=\"max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);\">\n<p class=\"image-caption\" style=\"font-size: 0.9em; color: #666; margin-top: 8px;\">Cross-section diagram of a leaf showing chloroplasts, stomata, and the photosynthesis process</p>\n</div>\n<h2>The Photosynthesis Equation</h2>\n<div class=\"chart-container\" data-chart='{\"type\":\"bar\",\"title\":\"Factors Affecting Photosynthesis Rate\",\"data\":{\"labels\":[\"Light Intensity\",\"CO2 Concentration\",\"Temperature\",\"Water Availability\"],\"datasets\":[{\"label\":\"Effect on Rate (%)\",\"data\":[85,70,60,90],\"backgroundColor\":[\"#FF6384\",\"#36A2EB\",\"#FFCE56\",\"#4BC0C0\"]}]},\"description\":\"This chart shows how different environmental factors influence the rate of photosynthesis in plants.\"}' style=\"margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;\">\n<h4 style=\"margin-bottom: 15px; color: #333;\">Factors Affecting Photosynthesis Rate</h4>\n<div class=\"chart-placeholder\" style=\"height: 300px; background: white; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; color: #666; flex-direction: column;\">\n<div>📊 Factors Affecting Photosynthesis Rate</div>\n<small style=\"margin-top: 10px;\">Chart data available in API response</small>\n</div>\n<p style=\"font-size: 0.9em; color: #666; margin-top: 10px;\">This chart shows how different environmental factors influence the rate of photosynthesis in plants.</p>\n</div>",
    
    "visual_assets": [
      {
        "type": "image",
        "description": "Cross-section diagram of a leaf showing chloroplasts, stomata, and the photosynthesis process",
        "data": {
          "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/org-abc123/user-def456/img-xyz789.png?st=2026-01-25T15%3A30%3A00Z&se=2026-01-25T17%3A30%3A00Z&sp=r&sv=2021-08-06&sr=b&rscd=inline&rsct=image/png&skoid=6aaadede-4fb3-4698-a8f6-684d7786b067&sktid=a48ccc7e-e0da-4e9f-8c69-7e62d9e8d432&skt=2026-01-25T09%3A30%3A15Z&ske=2026-01-26T09%3A30%3A15Z&sks=b&skv=2021-08-06&sig=xyz123...",
          "description": "Cross-section diagram of a leaf showing chloroplasts, stomata, and the photosynthesis process",
          "prompt_used": "Educational illustration for Class 10 Biology: Cross-section diagram of a leaf showing chloroplasts, stomata, and the photosynthesis process. Style: clean, educational, suitable for textbooks, clear labels, appropriate for students aged 15."
        },
        "id": "img_1"
      },
      {
        "type": "chart",
        "description": "Bar chart showing factors affecting photosynthesis rate",
        "data": {
          "type": "bar",
          "title": "Factors Affecting Photosynthesis Rate",
          "data": {
            "labels": ["Light Intensity", "CO2 Concentration", "Temperature", "Water Availability"],
            "datasets": [{
              "label": "Effect on Rate (%)",
              "data": [85, 70, 60, 90],
              "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]
            }]
          },
          "description": "This chart shows how different environmental factors influence the rate of photosynthesis in plants."
        },
        "id": "chart_1"
      },
      {
        "type": "interactive",
        "description": "Quiz on photosynthesis process and factors",
        "data": {
          "activity_type": "quiz",
          "description": "Quiz on photosynthesis process and factors",
          "suggestions": [
            "Create multiple choice questions",
            "Add interactive elements",
            "Include student engagement activities"
          ]
        },
        "id": "interactive_1"
      }
    ],
    
    "metadata": {
      "book_id": "550e8400-e29b-41d4-a716-446655440000",
      "book_title": "biology_class10_cbse.pdf",
      "class_no": "10",
      "board": "CBSE",
      "subject": "Biology",
      "topic": "Photosynthesis",
      "chunks_used": {
        "total_available": 45,
        "used_count": 12,
        "start_index": 1,
        "end_index": 12,
        "offset": 0,
        "limit": 12
      },
      "content_stats": {
        "total_characters": 6850,
        "estimated_reading_time_minutes": 7,
        "sections_covered": 12
      },
      "visual_summary": {
        "total_visual_elements": 3,
        "images_generated": 1,
        "diagrams_generated": 0,
        "charts_created": 1,
        "interactive_elements": 1
      },
      "generation_settings": {
        "model_used": "gpt-4o-mini",
        "max_tokens": 3000,
        "lecture_style": "visual",
        "include_visuals": true,
        "tokens_used": {
          "prompt_tokens": 1450,
          "completion_tokens": 2100,
          "total_tokens": 3550,
          "prompt_tokens_details": {
            "cached_tokens": 0,
            "audio_tokens": 0
          },
          "completion_tokens_details": {
            "reasoning_tokens": 0,
            "audio_tokens": 0,
            "accepted_prediction_tokens": 0,
            "rejected_prediction_tokens": 0
          }
        },
        "response_time_ms": 4750
      },
      "timestamp": "2026-01-25T15:30:45.123Z"
    }
  }
}
```

#### Visual Assets Integration

The API returns complete visual assets that your frontend can use:

**1. AI-Generated Images**
```javascript
// Access generated images
response.data.visual_assets.filter(asset => asset.type === 'image').forEach(image => {
  console.log('Image URL:', image.data.url);
  console.log('Description:', image.description);
  // Use image.data.url directly in your <img> tags
});
```

**2. Chart Data**
```javascript
// Use with Chart.js, D3.js, or other charting libraries
const chartAssets = response.data.visual_assets.filter(asset => asset.type === 'chart');
chartAssets.forEach(chart => {
  new Chart(ctx, {
    type: chart.data.type,
    data: chart.data.data,
    options: { responsive: true }
  });
});
```

**3. Interactive Elements**
```javascript
// Create interactive components
const interactive = response.data.visual_assets.filter(asset => asset.type === 'interactive');
interactive.forEach(element => {
  // Implement based on element.data.activity_type (quiz, exercise, etc.)
});
```

#### Visual Element Types

| Type | Generated Content | Use Case |
|------|------------------|----------|
| **📸 Images** | DALL-E 3 generated educational illustrations | Diagrams, processes, structures |
| **📊 Charts** | AI-generated realistic data for visualization | Statistics, comparisons, trends |
| **📋 Diagrams** | Educational process flows and concept maps | Workflows, relationships, systems |
| **🎯 Interactive** | Quiz and exercise specifications | Student engagement, assessments |

#### Error Handling

Visual generation failures are handled gracefully:

```json
{
  "type": "image",
  "data": {
    "url": null,
    "error": "Rate limit exceeded",
    "fallback_text": "[Image: Cell structure diagram]"
  }
}
```

#### Integration Benefits

✅ **Ready-to-Use Visuals** - No additional image generation needed  
✅ **Educational Quality** - AI-optimized for specific class and subject  
✅ **Complete Data** - Everything needed for frontend implementation  
✅ **Fallback Support** - Graceful handling of generation failures  
✅ **Microservice Ready** - Perfect for dashboard integration  

---

### Tutor API Endpoints

---

## 📝 Educational Assessment APIs

The Lurniva RAG system includes 4 specialized educational APIs for comprehensive assessment and content generation based on document chunks.

### 1. Assignment Generation API

Generate document-based assignment topics from book chunks with essay prompts and discussion topics.

#### Endpoint
```bash
POST /api/v1/assignment/generate
```

#### Request Body
```json
{
  "book_id": "550e8400-e29b-41d4-a716-446655440000",
  "class_no": "10",
  "board": "CBSE",
  "subject": "English Literature",
  "topic": "Character Analysis",
  "assignment_type": "document",
  "deadline_days": 6,
  "total_marks": 20,
  "chunk_limit": 8,
  "chunk_offset": 0,
  "model": "gpt-4o-mini",
  "max_tokens": 3000
}
```

#### Parameters
- **book_id** (required): UUID of the book in the system
- **class_no** (required): Class number (e.g., "10", "12")
- **board** (required): Educational board (e.g., "CBSE", "ICSE")
- **subject** (required): Subject name
- **topic** (optional): Specific topic focus
- **assignment_type**: Always "document" for document-based assignments
- **deadline_days**: Number of days to complete (5-7 recommended)
- **total_marks**: Total marks for the assignment (15-20)
- **chunk_limit**: Number of document chunks to use (1-10)
- **chunk_offset**: Starting offset for chunk selection
- **model**: AI model to use (default: "gpt-4o-mini")
- **max_tokens**: Maximum response tokens

#### Response
```json
{
  "success": true,
  "assignment": {
    "title": "English Literature Assignment - Class 10",
    "assignment_type": "Document-based Essay Assignment",
    "instructions": "Write comprehensive essays addressing each topic. Support your analysis with examples from the provided study material.",
    "total_marks": 20,
    "submission_deadline_days": 6,
    "word_count_per_topic": "400-600 words",
    "topics": [
      {
        "topic_id": 1,
        "topic_statement": "Discuss the character of Mr. Chipping as a teacher",
        "focus_points": [
          "How did he change from his early days at Brookfield to his retirement?",
          "Mention his sense of humor and his relationship with his students",
          "Analyze his teaching methods and their evolution"
        ],
        "objective": "To test the student's grip on character development in the novel",
        "marks": 5,
        "expected_elements": [
          "Introduction with clear thesis",
          "Analysis with examples from the novel",
          "Logical argument development",
          "Conclusion with personal insights"
        ]
      }
    ],
    "evaluation_criteria": [
      "Content knowledge and understanding (40%)",
      "Analysis and critical thinking (30%)",
      "Use of examples from study material (20%)",
      "Writing clarity and organization (10%)"
    ]
  }
}
```

### 2. Quiz Generation API

Generate multi-type quizzes with MCQ, True/False, Short Answer, or Mixed question types.

#### Endpoint
```bash
POST /api/v1/quiz/generate
```

#### Request Body
```json
{
  "book_id": "550e8400-e29b-41d4-a716-446655440000",
  "class_no": "10",
  "board": "CBSE",
  "subject": "Math",
  "topic": "Algebra",
  "quiz_type": "mixed",
  "difficulty": "medium",
  "question_count": 10,
  "chunk_limit": 5,
  "chunk_offset": 0,
  "model": "gpt-4o-mini",
  "max_tokens": 3000
}
```

#### Parameters
- **quiz_type**: Question type options:
  - `"mcq"`: Multiple choice questions only
  - `"true_false"`: True/False questions only
  - `"short_answer"`: Short answer questions only
  - `"mixed"`: Combination of all types
- **difficulty**: "easy", "medium", "hard"
- **question_count**: Number of questions (1-25)

#### Response
```json
{
  "success": true,
  "quiz_title": "Algebra Quiz - Mixed Types",
  "quiz_description": "Comprehensive quiz covering algebraic concepts",
  "questions": [
    {
      "question_id": 1,
      "question": "What is the value of x in 2x + 5 = 13?",
      "type": "mcq",
      "options": ["A) 4", "B) 6", "C) 8", "D) 10"],
      "correct_answer": "A",
      "marks": 2,
      "explanation": "Solve: 2x = 13-5 = 8, so x = 4"
    },
    {
      "question_id": 2,
      "question": "A linear equation always has exactly one solution.",
      "type": "true_false",
      "correct_answer": "false",
      "marks": 1,
      "explanation": "Linear equations can have one, no, or infinite solutions"
    },
    {
      "question_id": 3,
      "question": "Explain the difference between a linear and quadratic equation.",
      "type": "short_answer",
      "correct_answer": "Linear equations have degree 1 (highest power of x is 1), while quadratic equations have degree 2 (highest power of x is 2).",
      "marks": 3,
      "explanation": "Key difference is the highest degree of the variable"
    }
  ],
  "total_marks": 15,
  "time_limit": 30,
  "metadata": {
    "total_questions": 10,
    "mcq_count": 5,
    "true_false_count": 3,
    "short_answer_count": 2
  }
}
```

### 3. Assignment Checking API

Check and grade assignment submissions with file upload support (PDF, Word, Text).

#### Endpoint
```bash
POST /api/v1/assignment/check
```

#### Request (Multipart Form Data)
```bash
Content-Type: multipart/form-data

assignment_title: "Electric Current Research Assignment"
total_marks: "20"
assignment_instructions: "Submit a well-researched document..."
assignment_questions: "1. Explain Ohm's law (5 marks)..."
student_submission: [FILE] (PDF/Word/Text document)
```

#### Parameters
- **assignment_title** (required): Title of the assignment
- **total_marks** (required): Total marks for grading
- **assignment_instructions** (required): Assignment instructions
- **assignment_questions** (required): List of assignment questions
- **student_submission** (required): File upload (PDF, DOC, DOCX, TXT)

#### Response
```json
{
  "success": true,
  "marks_obtained": 16,
  "ai_feedback": "Good understanding of concepts demonstrated. The explanation of Ohm's law is comprehensive and accurate. However, the practical applications section could be more detailed with specific examples.",
  "completion_percent": 80
}
```

### 4. Quiz Checking API

Automated grading for all quiz question types with detailed feedback.

#### Endpoint
```bash
POST /api/v1/quiz/check
```

#### Request Body
```json
{
  "quiz_questions": [
    {
      "question_id": 1,
      "question": "What is 2 + 2?",
      "type": "mcq",
      "options": ["A) 3", "B) 4", "C) 5", "D) 6"],
      "correct_answer": "B",
      "marks": 2,
      "explanation": "Basic addition"
    },
    {
      "question_id": 2,
      "question": "The Earth is flat.",
      "type": "true_false",
      "correct_answer": "false",
      "marks": 1,
      "explanation": "The Earth is spherical"
    }
  ],
  "student_answers": [
    {"question_id": 1, "answer": "B"},
    {"question_id": 2, "answer": "false"}
  ],
  "quiz_title": "Sample Quiz",
  "total_marks": 10
}
```

#### Parameters
- **quiz_questions** (required): Array of questions from quiz generation
- **student_answers** (required): Array of student responses
- **quiz_title** (required): Title of the quiz
- **total_marks** (required): Total possible marks

#### Response
```json
{
  "success": true,
  "marks_obtained": 8,
  "ai_feedback": "You scored 8 out of 10 questions correctly (80%). Good job! You have a solid grasp of the concepts.",
  "completion_percent": 80,
  "detailed_results": {
    "total_questions": 10,
    "correct_answers": 8,
    "grade": "B+",
    "question_results": [
      {
        "question_id": 1,
        "question": "What is 2 + 2?",
        "type": "mcq",
        "correct_answer": "B",
        "student_answer": "B",
        "is_correct": true,
        "marks_awarded": 2,
        "max_marks": 2,
        "explanation": "Basic addition"
      }
    ]
  }
}
```

### Question Type Support

| Type | Description | Answer Format | Grading Method |
|------|-------------|---------------|----------------|
| **MCQ** | Multiple choice with options A, B, C, D | "A", "B", "C", or "D" | Exact match |
| **True/False** | Boolean questions | "true" or "false" | Exact match |
| **Short Answer** | Open-ended text responses | Free text string | Similarity scoring + partial marks |
| **Mixed** | Combination of all types | Based on question type | Type-specific grading |

### Error Handling

All educational APIs return standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "MISSING_BOOK_ID",
    "message": "book_id is required and must be a valid UUID"
  }
}
```

### Common Error Codes
- `MISSING_BOOK_ID`: Book ID not provided or invalid
- `INVALID_CHUNKS`: No content chunks found for the book
- `INVALID_ANSWERS`: Student answers array is malformed
- `FILE_UPLOAD_ERROR`: Issues with file processing
- `AI_GENERATION_ERROR`: AI model response issues
- `JSON_PARSE_ERROR`: Response parsing failures

---

## Support

For issues or questions, check:
1. Health endpoint: `GET /api/v1/health`
2. Server logs for detailed error messages
3. Qdrant connection status in health response
4. Test console at `http://localhost:3000/`
