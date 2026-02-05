# Lurniva RAG System Architecture

## Overview

Lurniva RAG is a microservice that processes PDF documents, extracts text, generates vector embeddings, and stores them for semantic search. It's designed to be called from external applications (dashboards, backends) via REST API.

## System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Dashboard/Backend                       │
│                              (Your Application)                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     │ HTTP Requests
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Lurniva RAG Microservice                          │
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │   Express    │   │  PDF Parser  │   │  Embedding   │                 │
│  │   Server     │───│  (pdf-parse  │───│   Model      │                 │
│  │              │   │   pdf2json)  │   │ (MiniLM-L6)  │                 │
│  └──────────────┘   └──────────────┘   └──────────────┘                 │
│         │                                      │                         │
│         │                                      │                         │
│         ▼                                      ▼                         │
│  ┌──────────────────────────────────────────────────┐                   │
│  │              Vector Store                         │                   │
│  │   ┌────────────────┐  ┌────────────────────┐     │                   │
│  │   │   In-Memory    │  │      Qdrant        │     │                   │
│  │   │   (Fallback)   │  │   (Production)     │     │                   │
│  │   └────────────────┘  └────────────────────┘     │                   │
│  └──────────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ JSON Response
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            MySQL Database                                │
│                         (Your Responsibility)                            │
│                                                                          │
│  Store: book_id, file_name, chunk_count, page_count, created_at, etc.   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Processing Pipeline

### 1. PDF Upload

When a PDF is uploaded:

```
PDF File → Text Extraction → Chunking → Embedding → Vector Storage
```

**Text Extraction** (2 fallback methods):
1. `pdf-parse` - Fast, handles most PDFs
2. `pdf2json` - Robust for complex layouts

**Chunking**:
- Default chunk size: 600 characters
- Overlap: 100 characters
- Sentence-aware splitting (preserves sentence boundaries)

**Embedding**:
- Model: `all-MiniLM-L6-v2` (Xenova/Transformers.js)
- Vector dimensions: 384
- Mean pooling with L2 normalization

### 2. Vector Storage

Each chunk is stored as a vector point:

```javascript
{
  id: "book_1737158400000_a1b2c3d4_chunk_0",
  vector: [0.123, -0.456, ...],  // 384 dimensions
  payload: {
    book_id: "book_1737158400000_a1b2c3d4",
    text: "chunk content...",
    chunk_index: 0,
    total_chunks: 150,
    file_name: "example.pdf",
    created_at: "2026-01-17T12:00:00.000Z"
  }
}
```

### 3. Semantic Search

Search converts your query to a vector and finds similar chunks:

```
Query → Embedding → Cosine Similarity → Top K Results
```

**Cosine Similarity Formula:**
```
similarity = (A · B) / (||A|| × ||B||)
```

Where A is query vector and B is document chunk vector.

## Storage Architecture

### Vector Database (Qdrant)

- **Collection**: `books` (single collection for all documents)
- **Distance Metric**: Cosine similarity
- **Batch Size**: 100 vectors per request
- **Unique IDs**: `{book_id}_chunk_{index}`

### What's Stored Where

| Data Type | Storage Location | Notes |
|-----------|------------------|-------|
| Vector embeddings | Qdrant | 384-dim vectors |
| Chunk text | Qdrant payload | For search results |
| book_id | Qdrant payload | For filtering |
| Metadata | Your MySQL | Store API response data |
| File content | Temporary | Deleted after processing |

### Hybrid Storage Pattern

The microservice returns all metadata needed for your MySQL database:

```json
{
  "book_id": "book_1737158400000_a1b2c3d4",
  "file_name": "example.pdf",
  "chunk_count": 150,
  "page_count": 45,
  "text_length": 125000,
  "word_count": 18500,
  "created_at": "2026-01-17T12:00:00.000Z"
}
```

**You store in MySQL:**
- `book_id` (primary key for linking)
- `user_id` (your user system)
- `file_name`, `file_size`, `page_count`
- `chunk_count`, `text_length`
- Custom metadata (title, author, category, etc.)

**Qdrant stores:**
- Vector embeddings
- Chunk text (for returning search results)
- `book_id` (for filtering)

## Book ID System

### Structure
```
book_{timestamp}_{random8chars}

Example: book_1737158400000_a1b2c3d4
```

### Benefits
- Guaranteed unique across all uploads
- Contains timestamp for debugging
- Random suffix prevents collisions
- URL-safe format

### Chunk IDs
```
{book_id}_chunk_{index}

Example: book_1737158400000_a1b2c3d4_chunk_0
```

## Error Handling

All errors return structured JSON:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| NO_FILE | 400 | No PDF file in request |
| MODEL_NOT_READY | 503 | Model still loading |
| EXTRACTION_FAILED | 400 | Could not read PDF text |
| NO_CHUNKS | 400 | No valid text to process |
| NOT_FOUND | 404 | Book doesn't exist |
| PROCESSING_ERROR | 500 | General processing failure |

## Performance Characteristics

### Typical Processing Times

| Document Size | Chunks | Processing Time |
|---------------|--------|-----------------|
| Small (< 1MB) | 10-50 | 2-5 seconds |
| Medium (1-10MB) | 50-500 | 10-60 seconds |
| Large (10-50MB) | 500-2000 | 1-5 minutes |

### Bottlenecks
1. **Embedding generation** - Sequential, ~50ms per chunk
2. **PDF parsing** - Depends on PDF complexity
3. **Network latency** - Qdrant upload batches

### Scaling Tips
- Deploy Qdrant with replicas for read scaling
- Use batch uploads (handled automatically)
- Consider async processing for very large files

## Deployment Recommendations

### Environment Variables

```env
PORT=3000
QDRANT_URL=https://your-qdrant-instance.com
COLLECTION_NAME=books
```

### Resource Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 2GB | 4GB+ |
| CPU | 2 cores | 4 cores+ |
| Disk | 1GB | 10GB+ (for cache) |

### Health Monitoring

Check `/api/v1/health` endpoint:
- `embedding_model_loaded`: true when ready
- `storage_backend`: "qdrant" or "in-memory"

## Security Considerations

1. **No authentication built-in** - Implement in your API gateway
2. **File validation** - Only PDFs accepted
3. **Temp file cleanup** - Files deleted after processing
4. **No persistent storage** - Only vectors in Qdrant

## Integration Pattern

```
┌──────────────────┐
│  Your Dashboard  │
│    (Frontend)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌──────────────────┐
│  Your Backend    │─────▶│  Lurniva RAG     │
│  (Node/Python)   │      │  Microservice    │
└────────┬─────────┘      └──────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐
│     MySQL        │      │     Qdrant       │
│  (Your Metadata) │      │   (Vectors)      │
└──────────────────┘      └──────────────────┘
```

1. User uploads PDF through your dashboard
2. Your backend sends to RAG microservice
3. RAG returns book_id and metadata
4. You store metadata in your MySQL
5. User searches → Your backend calls RAG search API
6. RAG returns matching chunks with book_id
7. You join with MySQL for full book info
