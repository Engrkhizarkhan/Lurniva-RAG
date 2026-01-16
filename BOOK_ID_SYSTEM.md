# Book ID System Documentation

## Overview
The RAG system now uses a **book_id** system to uniquely identify documents in a single Qdrant collection named "books". This ensures proper document management even when multiple PDFs have the same filename.

## Implementation

### Unique ID Structure
Each document gets a unique `book_id` when uploaded:
```javascript
book_id = `book_${Date.now()}`
```

Each chunk within a document gets a globally unique ID:
```javascript
chunk_id = `${book_id}_chunk_${chunkIndex}`
```

**Example:**
- Book ID: `book_1704067200000`
- Chunk IDs: 
  - `book_1704067200000_chunk_0`
  - `book_1704067200000_chunk_1`
  - `book_1704067200000_chunk_2`
  - etc.

### Vector Payload Structure
Each vector point stored in Qdrant contains:
```javascript
{
  id: "book_1704067200000_chunk_5",
  vector: [0.123, -0.456, ...], // 384-dimensional embedding
  payload: {
    book_id: "book_1704067200000",     // Unique book identifier
    text: "chunk content...",
    fileName: "example.pdf",
    chunkIndex: 5,
    uploadDate: "2024-01-01T00:00:00.000Z",
    totalChunks: 150
  }
}
```

### Metadata Storage
Document metadata is stored in RAM for quick lookups:
```javascript
{
  id: "book_1704067200000",
  book_id: "book_1704067200000",
  fileName: "example.pdf",
  fileSize: 2500000,
  uploadDate: "2024-01-01T00:00:00.000Z",
  chunksCount: 150,
  textLength: 125000,
  firstChunkId: "book_1704067200000_chunk_0"
}
```

## Benefits

### 1. Guaranteed Uniqueness
- Each `book_id` is unique across the entire collection
- Chunk IDs are globally unique (book_id + chunk index)
- No collisions even with same-named files

### 2. Efficient Filtering
All CRUD operations filter by `book_id`:
```javascript
// Delete all chunks for a book
scrollResult.points.filter(point => point.payload.book_id === targetBookId)

// Preview all chunks for a book
chunks = points.filter(point => point.payload.book_id === doc.book_id)
```

### 3. Version Control
When updating a document:
- The `book_id` is **preserved**
- Old chunks are deleted by `book_id`
- New chunks use the same `book_id` with updated content
- Maintains document history through `previousVersion` field

### 4. Single Collection Architecture
- All documents live in one Qdrant collection: **"books"**
- No need to create/manage multiple collections
- Simplified indexing and search
- Easier backup and maintenance

## CRUD Operations

### Create (Upload)
```javascript
POST /upload
- Generates new book_id: `book_${Date.now()}`
- Creates chunks with IDs: `${bookId}_chunk_${i}`
- Stores book_id in both payload and metadata
```

### Read (Preview)
```javascript
GET /documents/:id
- Looks up book_id from metadata
- Scrolls Qdrant and filters by book_id
- Returns all chunks for that book in order
```

### Update
```javascript
PUT /documents/:id
- Preserves the original book_id
- Deletes old chunks using book_id filter
- Uploads new chunks with same book_id
- Maintains document identity across updates
```

### Delete
```javascript
DELETE /documents/:id
- Finds book_id from metadata
- Scrolls Qdrant and filters by book_id
- Batch deletes all matching chunks (100 at a time)
- Removes metadata entry
```

## Search Behavior
Search operates across **all** books in the collection:
```javascript
POST /search
- Generates embedding for query
- Searches entire "books" collection
- Returns top K results regardless of book_id
- Each result includes book_id in payload for tracking
```

## Migration Notes

### Old System
- Used `Date.now() + i` for chunk IDs
- Filtered by `fileName` (collision risk)
- No book-level identifier

### New System
- Uses `book_${timestamp}_chunk_${index}` for IDs
- Filters by unique `book_id` (collision-proof)
- Clear document identity

### Compatibility
If you have existing data:
1. Old chunks can coexist (will have numeric IDs)
2. New uploads use the book_id system
3. Old chunks won't have `book_id` in payload (undefined)
4. Consider re-uploading old documents for consistency

## Examples

### Upload Two PDFs with Same Name
```javascript
// First upload
book_id: "book_1704067200000"
fileName: "report.pdf"
chunks: book_1704067200000_chunk_0 to chunk_99

// Second upload (different file, same name)
book_id: "book_1704067300000"  // Different timestamp
fileName: "report.pdf"
chunks: book_1704067300000_chunk_0 to chunk_150
```

Both PDFs are stored independently and can be managed separately despite having the same filename.

### Update Document
```javascript
// Original
book_id: "book_1704067200000"
fileName: "report.pdf"
chunks: 100

// After update
book_id: "book_1704067200000"  // Same book_id!
fileName: "report_v2.pdf"       // Can have different name
chunks: 120                     // Can have different chunk count
```

The document identity is preserved through updates.

## Best Practices

1. **Always filter by book_id** when performing document-specific operations
2. **Preserve book_id** when updating documents to maintain identity
3. **Use scroll API** with book_id filter for large documents (10,000+ chunks)
4. **Batch operations** when deleting/uploading to avoid request size limits
5. **Store book_id** in both Qdrant payload and RAM metadata for redundancy

## Technical Details

- **Collection**: books
- **Vector Size**: 384 dimensions (all-MiniLM-L6-v2)
- **Similarity Metric**: Cosine
- **Batch Size**: 100 points (upload/delete)
- **Scroll Limit**: 10,000 points per request
- **ID Format**: String (supports prefixes and special chars)
- **Payload Indexing**: Not currently indexed (full scan on filter)

## Future Improvements

1. **Payload Indexing**: Create index on `book_id` field for faster filtering
2. **Book Statistics**: Track view count, search hits per book
3. **Multi-user Support**: Add `user_id` to payload for user isolation
4. **Collection per Tenant**: Alternative architecture for strict data isolation
5. **Metadata in Qdrant**: Store full metadata in payload instead of RAM
