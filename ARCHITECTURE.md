# 🏗️ Lurniva RAG - System Architecture & How It Works

## 📍 **Where Are Your Chunks Stored?**

### **Current Configuration: IN-MEMORY (RAM)**

Your chunks are currently stored **IN YOUR COMPUTER'S MEMORY (RAM)**, NOT in a database or on disk.

```javascript
const USE_IN_MEMORY = true; // This is set in server.js
let inMemoryVectorStore = []; // Array in RAM
```

**What This Means:**

✅ **Advantages:**
- ⚡ **Super fast** - no network or disk I/O
- 🆓 **No database required** - works immediately
- 🔧 **Easy to setup** - no external dependencies

❌ **Disadvantages:**
- 💾 **Lost on restart** - when you stop the server, all data is gone
- 📊 **Limited by RAM** - can't store massive amounts of data
- 🚫 **Not persistent** - need to re-upload PDFs every restart

### **Alternative: Qdrant Database (Disabled)**

You CAN switch to Qdrant for **persistent storage**:

```javascript
const USE_IN_MEMORY = false; // Change this to use Qdrant
```

**With Qdrant:**
- ✅ Data persists across restarts
- ✅ Can handle millions of vectors
- ✅ Optimized for similarity search
- ❌ Requires external database setup

---

## 🏛️ **System Architecture**

### **High-Level Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                      USER BROWSER                            │
│  (index.html - Upload PDFs, Search, Manage Documents)       │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP Requests
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXPRESS SERVER                             │
│                   (server.js - Port 3000)                    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Upload     │  │   Search     │  │   Manage     │     │
│  │   Endpoint   │  │   Endpoint   │  │   Docs       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────┐          ┌──────────────────┐
│  PDF Parser  │          │  Embedding Model │
│  (pdf-parse, │          │  (all-MiniLM-L6) │
│   pdf2json)  │          │  384 dimensions  │
└──────────────┘          └──────────────────┘
        │                         │
        └────────────┬────────────┘
                     ▼
        ┌────────────────────────┐
        │   VECTOR STORAGE       │
        │  (In-Memory Array)     │
        │  OR                    │
        │  (Qdrant Database)     │
        └────────────────────────┘
```

---

## 🔄 **Complete Data Flow**

### **1. PDF Upload Process**

```
USER                    SERVER                          STORAGE
  │                       │                               │
  │  Upload PDF           │                               │
  ├──────────────────────>│                               │
  │                       │                               │
  │                       │ 1. Save to ./uploads/         │
  │                       │    (temporary)                │
  │                       │                               │
  │                       │ 2. Extract Text               │
  │                       │    Method 1: pdf-parse        │
  │                       │    Method 2: pdf2json         │
  │                       │    Method 3: fallback         │
  │                       │                               │
  │                       │ 3. Smart Chunking             │
  │                       │    - 600 chars per chunk      │
  │                       │    - 100 char overlap         │
  │                       │    - Sentence-aware           │
  │                       │                               │
  │                       │ 4. Generate Embeddings        │
  │                       │    For each chunk:            │
  │                       │    Text -> 384D vector        │
  │                       │                               │
  │                       │ 5. Store Vectors              │
  │                       ├──────────────────────────────>│
  │                       │    {                          │
  │                       │      id: timestamp,           │
  │                       │      vector: [0.23, ...],     │
  │                       │      payload: {               │
  │                       │        text: "...",           │
  │                       │        fileName: "doc.pdf",   │
  │                       │        chunkIndex: 0          │
  │                       │      }                        │
  │                       │    }                          │
  │                       │                               │
  │                       │ 6. Delete temp file           │
  │                       │                               │
  │  Success Response     │                               │
  │<──────────────────────┤                               │
  │  {chunksUploaded: 42} │                               │
```

**Where is data stored at each step:**

| Step | Location | Persistent? |
|------|----------|-------------|
| PDF Upload | `./uploads/` folder | ❌ Deleted after processing |
| Text Extraction | RAM (variable) | ❌ Temporary |
| Chunks | RAM (array) | ❌ Temporary |
| Embeddings | RAM during generation | ❌ Temporary |
| **Final Vectors** | **RAM (`inMemoryVectorStore`)** | **❌ Lost on restart** |
| Document Metadata | **RAM (`documentsMetadata`)** | **❌ Lost on restart** |

---

### **2. Search Process**

```
USER                    SERVER                          STORAGE
  │                       │                               │
  │  Search Query         │                               │
  │  "What is AI?"        │                               │
  ├──────────────────────>│                               │
  │                       │                               │
  │                       │ 1. Generate Query Embedding   │
  │                       │    "What is AI?"              │
  │                       │         ↓                     │
  │                       │    [0.12, 0.45, -0.23, ...]   │
  │                       │    (384D vector)              │
  │                       │                               │
  │                       │ 2. Search Vectors             │
  │                       ├──────────────────────────────>│
  │                       │    Calculate similarity       │
  │                       │    with ALL stored vectors    │
  │                       │                               │
  │                       │<──────────────────────────────┤
  │                       │    Top 5 most similar         │
  │                       │                               │
  │                       │ 3. Rank by Cosine Similarity  │
  │                       │    Result 1: 0.87 (87% match) │
  │                       │    Result 2: 0.73 (73% match) │
  │                       │    ...                        │
  │                       │                               │
  │  Search Results       │                               │
  │<──────────────────────┤                               │
  │  [{text, score, ...}] │                               │
```

**How Similarity Search Works:**

```javascript
// For EACH vector in storage:
similarity = cosineSimilarity(queryVector, storedVector)

// Cosine Similarity Formula:
// similarity = (A · B) / (||A|| × ||B||)
//            = dot_product / (magnitude_A × magnitude_B)

// Example:
Query:    [0.5, 0.3, 0.2]
Chunk 1:  [0.6, 0.2, 0.3] → Similarity: 0.92 (High match!)
Chunk 2:  [0.1, 0.9, 0.1] → Similarity: 0.45 (Low match)
```

---

### **3. Document Management**

```
┌─────────────────────────────────────────┐
│     Document Management Operations      │
└─────────────────────────────────────────┘

📋 LIST DOCUMENTS (GET /documents)
   └─> Returns: documentsMetadata[]
       [
         {
           id: "1768589172148",
           fileName: "report.pdf",
           chunksCount: 42,
           uploadDate: "2026-01-17..."
         }
       ]

👁️ PREVIEW (GET /documents/:id)
   └─> Filter chunks by fileName
   └─> Returns: Full document with all chunks

🗑️ DELETE (DELETE /documents/:id)
   └─> Remove from inMemoryVectorStore
   └─> Remove from documentsMetadata
   └─> Update stats

🔄 UPDATE (PUT /documents/:id)
   └─> Delete old chunks
   └─> Upload new PDF
   └─> Process and store new chunks
   └─> Keep same document ID
```

---

## 💾 **Detailed Storage Structure**

### **In-Memory Vector Store**

```javascript
inMemoryVectorStore = [
  {
    id: 1768589172148,                    // Unique chunk ID
    vector: [                              // 384-dimensional embedding
      0.23423, -0.12334, 0.45234, ...     // (384 numbers total)
    ],
    payload: {                             // Metadata
      text: "Artificial Intelligence is...", // Original text
      fileName: "ai-guide.pdf",           // Source document
      chunkIndex: 0,                       // Position in document
      uploadDate: "2026-01-17T10:30:00Z"  // When uploaded
    }
  },
  {
    id: 1768589172149,
    vector: [ ... ],
    payload: { ... }
  },
  // ... thousands more chunks
]
```

### **Documents Metadata**

```javascript
documentsMetadata = [
  {
    id: "1768589172148",           // Document ID
    fileName: "ai-guide.pdf",      // Original filename
    fileSize: 524288,              // Size in bytes
    uploadDate: "2026-01-17...",   // Upload timestamp
    chunksCount: 42,               // Number of chunks
    textLength: 25000,             // Total characters
    firstChunkId: 1768589172148    // Reference to first chunk
  },
  // ... more documents
]
```

---

## 🧠 **How the Embedding Model Works**

### **Model: all-MiniLM-L6-v2**

```
Input Text: "Artificial Intelligence is amazing"
     │
     ▼
┌─────────────────────────────────────┐
│   Transformers.js (Local Model)    │
│   - Tokenization                   │
│   - Neural Network Processing      │
│   - Mean Pooling                   │
│   - Normalization                  │
└─────────────────────────────────────┘
     │
     ▼
Output: [0.234, -0.123, 0.456, ..., 0.789]
        └─── 384 numbers ───┘

Model stored in: ./.cache/
Size: ~90MB
Downloaded: First run only
```

**What is an Embedding?**

An embedding is a **mathematical representation** of text in a high-dimensional space:

- Each word/phrase → Point in 384-dimensional space
- Similar meanings → Close points
- Different meanings → Far points

```
"dog" → [0.5, 0.3, 0.8, ...]
"puppy" → [0.52, 0.29, 0.81, ...] ← Close to "dog"
"car" → [-0.2, 0.9, -0.5, ...] ← Far from "dog"
```

---

## 🔍 **Cosine Similarity Explained**

**How we find relevant chunks:**

```javascript
function cosineSimilarity(vectorA, vectorB) {
  // 1. Dot Product (how aligned are the vectors?)
  const dotProduct = vectorA.reduce(
    (sum, a, i) => sum + a * vectorB[i], 
    0
  );
  
  // 2. Magnitude of each vector
  const magA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));
  
  // 3. Cosine similarity (ranges from -1 to 1)
  return dotProduct / (magA * magB);
}

// Result interpretation:
// 1.0  = Identical
// 0.8+ = Very similar
// 0.5-0.7 = Somewhat similar
// < 0.3 = Not similar
```

**Visual Example:**

```
Query: "machine learning"

Vector Space (simplified 2D):

        "ML"
         ↑ \
         |  \ 0.95 similarity
         |   \
         |    "AI algorithms"
         |
         |    
         |        "cooking recipes" ← 0.1 similarity
         └─────────────>
```

---

## 📂 **File System Structure**

```
Lurniva-RAG/
├── server.js           ← Main application logic
├── package.json        ← Dependencies
├── public/
│   └── index.html      ← User interface
├── uploads/            ← Temporary PDF storage (auto-deleted)
│   └── [empty after processing]
├── .cache/             ← Embedding model cache
│   └── models/
│       └── Xenova/
│           └── all-MiniLM-L6-v2/  (~90MB)
├── node_modules/       ← NPM packages
└── ARCHITECTURE.md     ← This file
```

**What's Persistent vs Temporary:**

| Location | Persistent? | Contents |
|----------|-------------|----------|
| `./uploads/` | ❌ Temporary | PDFs deleted after processing |
| `./.cache/` | ✅ Persistent | Embedding model (reused) |
| `inMemoryVectorStore` | ❌ RAM only | Lost on restart |
| `documentsMetadata` | ❌ RAM only | Lost on restart |

---

## 🔄 **Data Lifecycle**

### **Upload to Shutdown**

```
1. SERVER START
   ├─> Load embedding model from .cache/
   ├─> Initialize empty arrays:
   │   ├─> inMemoryVectorStore = []
   │   └─> documentsMetadata = []
   └─> Server ready ✓

2. UPLOAD PDF "report.pdf"
   ├─> Save to ./uploads/1768589-report.pdf
   ├─> Extract text (25,000 characters)
   ├─> Create 42 chunks
   ├─> Generate 42 embeddings
   ├─> Store in inMemoryVectorStore (RAM)
   │   [chunk1, chunk2, ..., chunk42]
   ├─> Add to documentsMetadata (RAM)
   └─> Delete ./uploads/1768589-report.pdf

3. SEARCH "quarterly revenue"
   ├─> Generate query embedding
   ├─> Compare with ALL 42 chunks in RAM
   ├─> Find top 5 matches
   └─> Return results

4. SERVER SHUTDOWN
   └─> ALL DATA IN RAM IS LOST
       ├─> inMemoryVectorStore = [] (gone)
       ├─> documentsMetadata = [] (gone)
       └─> Need to re-upload PDFs!
```

---

## 🔀 **Switching to Persistent Storage (Qdrant)**

### **Current Setup (In-Memory)**

```javascript
const USE_IN_MEMORY = true;
```

**Data Storage:**
```
RAM (lost on restart)
└─> inMemoryVectorStore array
```

### **Switching to Qdrant**

```javascript
const USE_IN_MEMORY = false;
const QDRANT_URL = "http://localhost:6333";
```

**Data Storage:**
```
Qdrant Database (persistent)
└─> Collection "books"
    └─> Stored on disk
        ✅ Survives restarts
        ✅ Handles millions of vectors
        ✅ Optimized search
```

**How to Setup Qdrant:**

```bash
# Option 1: Docker
docker run -p 6333:6333 qdrant/qdrant

# Option 2: Cloud (qdrant.io)
# Get API URL and update QDRANT_URL
```

---

## ⚡ **Performance Characteristics**

### **In-Memory (Current)**

| Operation | Speed | Limitation |
|-----------|-------|------------|
| Upload | ⚡⚡⚡ Fast | Limited by CPU (embeddings) |
| Search | ⚡⚡⚡ Very Fast | Linear scan (O(n)) |
| Capacity | ~100k chunks | Limited by RAM |
| Restart | ❌ Data lost | Must re-upload |

### **Qdrant (Alternative)**

| Operation | Speed | Limitation |
|-----------|-------|------------|
| Upload | ⚡⚡ Fast | Network + disk I/O |
| Search | ⚡⚡⚡ Fast | Optimized HNSW index |
| Capacity | Millions | Limited by disk space |
| Restart | ✅ Persists | Data remains |

---

## 🎯 **Summary: Where Is Everything?**

### **Your Chunks RIGHT NOW:**

```
┌─────────────────────────────────────┐
│         YOUR COMPUTER'S RAM         │
│                                     │
│  inMemoryVectorStore = [            │
│    { id, vector, payload },         │
│    { id, vector, payload },         │
│    ...                              │
│  ]                                  │
│                                     │
│  ⚠️  LOST when you close the server!│
└─────────────────────────────────────┘
```

### **To Make It Persistent:**

```
Option 1: Change to Qdrant
   └─> Set USE_IN_MEMORY = false
   └─> Setup Qdrant database
   └─> Chunks stored on disk

Option 2: Add file-based storage
   └─> Save to JSON file
   └─> Load on startup
   └─> Simple but less efficient
```

### **Recommendation:**

- **For Development/Testing**: Keep in-memory ✅
- **For Production**: Use Qdrant or similar database ✅

---

## 📚 **Key Concepts Recap**

1. **Chunks** = Small pieces of your PDF text (~600 characters)
2. **Embeddings** = 384 numbers representing the meaning of each chunk
3. **Vector Store** = Where embeddings are kept (currently RAM)
4. **Cosine Similarity** = Math to find similar chunks
5. **In-Memory** = Fast but temporary (RAM)
6. **Qdrant** = Fast and permanent (database)

---

## 🚀 **Next Steps**

If you want **persistent storage**, I can help you:

1. **Setup Qdrant locally** with Docker
2. **Switch to Qdrant Cloud** (free tier available)
3. **Add JSON file backup** (simple alternative)
4. **Implement hybrid storage** (RAM + disk backup)

Let me know which option you prefer! 🎯
