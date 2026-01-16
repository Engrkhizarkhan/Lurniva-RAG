/**
 * Lurniva RAG Microservice API
 * 
 * A stateless API for PDF processing, chunking, embedding, and vector storage.
 * Designed to be called from external dashboards/applications.
 * 
 * All responses include structured data suitable for storing in MySQL.
 */

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import PDFParser from "pdf2json";
import { QdrantClient } from "@qdrant/js-client-rest";
import cors from "cors";
import { pipeline, env } from "@xenova/transformers";
import dotenv from "dotenv";
import crypto from "crypto";

// Load environment variables
dotenv.config();

// Configure Transformers.js cache
env.cacheDir = './.cache';

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = "1.0.0";

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from public folder
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve test.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'test.html'));
});

// --------------------
// Multer Configuration (PDF uploads)
// --------------------
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    // Temporary filename, will be renamed after book_id is generated
    cb(null, `temp_${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`);
  },
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads', { recursive: true });
}

// --------------------
// Vector Storage Configuration
// --------------------
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "books";
const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 output size

let inMemoryVectorStore = [];
let qdrant = null;
let useQdrant = false;

// Initialize Qdrant connection
async function initializeVectorStore() {
  try {
    console.log(`Connecting to Qdrant at ${QDRANT_URL}...`);
    
    const url = new URL(QDRANT_URL);
    const isHttps = url.protocol === 'https:';
    const port = url.port || (isHttps ? 443 : 6333);
    
    qdrant = new QdrantClient({
      url: QDRANT_URL,
      port: port,
      https: isHttps,
      checkCompatibility: false
    });
    
    // Test connection
    await Promise.race([
      qdrant.getCollections(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
    ]);
    
    // Create collection if needed
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" }
      });
      console.log(`✓ Created collection '${COLLECTION_NAME}'`);
    }
    
    console.log(`✓ Connected to Qdrant`);
    useQdrant = true;
  } catch (err) {
    console.log(`⚠ Qdrant unavailable: ${err.message}`);
    console.log(`✓ Using in-memory vector store`);
    useQdrant = false;
  }
}

// --------------------
// Embedding Model
// --------------------
let embeddingModel = null;
let modelLoading = false;

async function loadModel() {
  if (modelLoading) return;
  modelLoading = true;
  
  try {
    console.log("Loading embedding model...");
    embeddingModel = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("✓ Embedding model loaded!");
  } catch (err) {
    console.error("Failed to load embedding model:", err.message);
  }
  
  modelLoading = false;
}

// Initialize on startup
(async () => {
  await loadModel();
  await initializeVectorStore();
  console.log(`\n✓ RAG Microservice ready on port ${PORT}\n`);
})();

// --------------------
// Helper Functions
// --------------------

function generateUUID() {
  return crypto.randomUUID();
}

function generateBookId() {
  // Use UUID for Qdrant compatibility
  return crypto.randomUUID();
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function storeVectors(points) {
  if (useQdrant && qdrant) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await qdrant.upsert(COLLECTION_NAME, { wait: true, points: batch });
    }
  } else {
    inMemoryVectorStore.push(...points);
  }
}

async function searchVectors(queryVector, limit = 5, bookId = null) {
  if (useQdrant && qdrant) {
    const searchParams = {
      vector: queryVector,
      limit: limit,
      with_payload: true,
    };
    
    // Filter by book_id if specified
    if (bookId) {
      searchParams.filter = {
        must: [{ key: "book_id", match: { value: bookId } }]
      };
    }
    
    return await qdrant.search(COLLECTION_NAME, searchParams);
  } else {
    let results = inMemoryVectorStore;
    
    // Filter by book_id if specified
    if (bookId) {
      results = results.filter(p => p.payload.book_id === bookId);
    }
    
    results = results.map(point => ({
      id: point.id,
      score: cosineSimilarity(queryVector, point.vector),
      payload: point.payload
    }));
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

async function deleteBookVectors(bookId) {
  if (useQdrant && qdrant) {
    const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
      limit: 10000,
      with_payload: true,
      with_vector: false
    });
    
    const pointIds = scrollResult.points
      .filter(p => p.payload.book_id === bookId)
      .map(p => p.id);
    
    if (pointIds.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < pointIds.length; i += BATCH_SIZE) {
        const batch = pointIds.slice(i, i + BATCH_SIZE);
        await qdrant.delete(COLLECTION_NAME, { wait: true, points: batch });
      }
    }
    
    return pointIds.length;
  } else {
    const before = inMemoryVectorStore.length;
    inMemoryVectorStore = inMemoryVectorStore.filter(p => p.payload.book_id !== bookId);
    return before - inMemoryVectorStore.length;
  }
}

async function getBookInfo(bookId) {
  if (useQdrant && qdrant) {
    const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
      limit: 10000,
      with_payload: true,
      with_vector: false
    });
    
    const bookPoints = scrollResult.points.filter(p => p.payload.book_id === bookId);
    if (bookPoints.length === 0) return null;
    
    const firstPoint = bookPoints[0];
    return {
      book_id: bookId,
      file_name: firstPoint.payload.file_name,
      file_path: firstPoint.payload.file_path,
      chunk_count: bookPoints.length,
      created_at: firstPoint.payload.created_at
    };
  } else {
    const bookPoints = inMemoryVectorStore.filter(p => p.payload.book_id === bookId);
    if (bookPoints.length === 0) return null;
    
    const firstPoint = bookPoints[0];
    return {
      book_id: bookId,
      file_name: firstPoint.payload.file_name,
      file_path: firstPoint.payload.file_path,
      chunk_count: bookPoints.length,
      created_at: firstPoint.payload.created_at
    };
  }
}

async function getBookChunks(bookId) {
  if (useQdrant && qdrant) {
    const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
      limit: 10000,
      with_payload: true,
      with_vector: false
    });
    
    return scrollResult.points
      .filter(p => p.payload.book_id === bookId)
      .map(p => ({
        chunk_id: p.id,
        chunk_index: p.payload.chunk_index,
        text: p.payload.text,
        text_length: p.payload.text.length
      }))
      .sort((a, b) => a.chunk_index - b.chunk_index);
  } else {
    return inMemoryVectorStore
      .filter(p => p.payload.book_id === bookId)
      .map(p => ({
        chunk_id: p.id,
        chunk_index: p.payload.chunk_index,
        text: p.payload.text,
        text_length: p.payload.text.length
      }))
      .sort((a, b) => a.chunk_index - b.chunk_index);
  }
}

// PDF Text Extraction with fallbacks
async function extractPDFText(filePath) {
  // Method 1: pdf-parse
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer, { max: 0, version: 'default' });
    if (data.text && data.text.trim().length > 50) {
      return { text: data.text, method: 'pdf-parse', pages: data.numpages };
    }
  } catch (err) { /* Continue to next method */ }
  
  // Method 2: pdf2json
  try {
    return await new Promise((resolve, reject) => {
      const parser = new PDFParser(null, 1);
      
      parser.on("pdfParser_dataError", e => reject(e.parserError));
      parser.on("pdfParser_dataReady", data => {
        let text = '';
        let pageCount = 0;
        
        if (data.Pages) {
          pageCount = data.Pages.length;
          data.Pages.forEach(page => {
            if (page.Texts) {
              page.Texts.forEach(item => {
                if (item.R) {
                  item.R.forEach(r => {
                    if (r.T) text += decodeURIComponent(r.T) + ' ';
                  });
                }
              });
            }
            text += '\n';
          });
        }
        
        if (text.trim().length > 50) {
          resolve({ text, method: 'pdf2json', pages: pageCount });
        } else {
          reject(new Error('Insufficient text'));
        }
      });
      
      parser.loadPDF(filePath);
    });
  } catch (err) { /* Continue to next method */ }
  
  throw new Error('Could not extract text from PDF');
}

// Generate embedding
async function generateEmbedding(text) {
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Chunk text
function chunkText(text, chunkSize = 600, overlap = 100) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(' ');
      currentChunk = words.slice(-Math.floor(overlap / 10)).join(' ') + ' ' + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(c => c.length > 10);
}

// --------------------
// API ENDPOINTS
// --------------------

/**
 * POST /api/v1/books/upload
 * Upload and process a PDF book
 */
app.post("/api/v1/books/upload", upload.single("file"), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FILE", message: "No PDF file provided. Use 'file' field in multipart/form-data" }
      });
    }

    if (!embeddingModel) {
      return res.status(503).json({
        success: false,
        error: { code: "MODEL_NOT_READY", message: "Embedding model is still loading. Please retry in a few seconds." }
      });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    // Generate unique book ID
    const bookId = generateBookId();

    // Extract text from PDF
    const extraction = await extractPDFText(filePath);
    const text = extraction.text;
    const pageCount = extraction.pages || 0;

    if (!text || text.trim().length === 0) {
      // Keep the file but return error
      return res.status(400).json({
        success: false,
        error: { code: "EXTRACTION_FAILED", message: "Could not extract text from PDF" }
      });
    }

    // Chunk text
    const chunks = chunkText(text, 600, 100);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_CHUNKS", message: "No valid text chunks could be created" }
      });
    }

    // Generate embeddings and store
    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i]);
      const chunkId = generateUUID(); // UUID for Qdrant compatibility
      
      points.push({
        id: chunkId,
        vector: vector,
        payload: {
          book_id: bookId,
          text: chunks[i],
          chunk_index: i,
          total_chunks: chunks.length,
          file_name: originalName,
          file_path: `./uploads/${bookId}_${originalName}`,
          created_at: new Date().toISOString()
        }
      });
    }

    await storeVectors(points);

    // Rename file to use book_id for easy reference
    const newFileName = `${bookId}_${originalName}`;
    const newFilePath = path.join('./uploads', newFileName);
    fs.renameSync(filePath, newFilePath);

    const processingTime = Date.now() - startTime;

    // Return comprehensive data for MySQL storage
    res.status(201).json({
      success: true,
      data: {
        // Primary identifiers (store these in MySQL)
        book_id: bookId,
        
        // File information
        file_name: originalName,
        file_path: newFilePath,
        stored_file_name: newFileName,
        file_size_bytes: fileSize,
        file_size_mb: parseFloat((fileSize / 1024 / 1024).toFixed(2)),
        
        // Content metrics
        page_count: pageCount,
        text_length: text.length,
        word_count: text.split(/\s+/).length,
        
        // Chunk information
        chunk_count: chunks.length,
        chunk_size: 600,
        chunk_overlap: 100,
        first_chunk_id: points[0].id,
        last_chunk_id: points[points.length - 1].id,
        
        // Processing metadata
        extraction_method: extraction.method,
        embedding_model: "all-MiniLM-L6-v2",
        vector_dimension: VECTOR_SIZE,
        storage_backend: useQdrant ? "qdrant" : "in-memory",
        
        // Timestamps
        created_at: new Date().toISOString(),
        processing_time_ms: processingTime
      }
    });
  } catch (err) {
    console.error("Upload error:", err);
    
    // File is kept in uploads folder even on error for debugging
    
    res.status(500).json({
      success: false,
      error: { code: "PROCESSING_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/search
 * Search across all books or a specific book
 */
app.post("/api/v1/search", async (req, res) => {
  try {
    const { query, book_id, limit = 5 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUERY", message: "Query is required" }
      });
    }

    if (!embeddingModel) {
      return res.status(503).json({
        success: false,
        error: { code: "MODEL_NOT_READY", message: "Embedding model is still loading" }
      });
    }

    const queryVector = await generateEmbedding(query);
    const results = await searchVectors(queryVector, Math.min(limit, 20), book_id);

    res.json({
      success: true,
      data: {
        query: query,
        book_id: book_id || null,
        result_count: results.length,
        results: results.map(r => ({
          chunk_id: r.id,
          book_id: r.payload.book_id,
          text: r.payload.text,
          score: parseFloat(r.score.toFixed(4)),
          chunk_index: r.payload.chunk_index,
          file_name: r.payload.file_name
        }))
      }
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      success: false,
      error: { code: "SEARCH_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/books
 * List all books/documents in the collection
 */
app.get("/api/v1/books", async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    if (!useQdrant) {
      // In-memory: group by book_id
      const booksMap = new Map();
      inMemoryVectorStore.forEach(item => {
        const bookId = item.payload.book_id;
        if (!booksMap.has(bookId)) {
          booksMap.set(bookId, {
            book_id: bookId,
            title: item.payload.file_name || 'Untitled',
            filename: item.payload.file_name || null,
            file_path: item.payload.file_path || null,
            chunk_count: 0,
            created_at: item.payload.created_at || null
          });
        }
        booksMap.get(bookId).chunk_count++;
      });
      
      const books = Array.from(booksMap.values()).slice(0, parseInt(limit));
      return res.json({
        success: true,
        data: {
          books,
          total: books.length
        }
      });
    }
    
    // Qdrant: scroll through all points and group by book_id
    const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
      limit: 1000,
      with_payload: true,
      with_vector: false
    });
    
    const booksMap = new Map();
    scrollResult.points.forEach(point => {
      const bookId = point.payload.book_id;
      if (!booksMap.has(bookId)) {
        booksMap.set(bookId, {
          book_id: bookId,
          title: point.payload.file_name || 'Untitled',
          filename: point.payload.file_name || null,
          file_path: point.payload.file_path || null,
          chunk_count: 0,
          created_at: point.payload.created_at || null
        });
      }
      booksMap.get(bookId).chunk_count++;
    });
    
    const books = Array.from(booksMap.values()).slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        books,
        total: books.length
      }
    });
  } catch (err) {
    console.error("List books error:", err);
    res.status(500).json({
      success: false,
      error: { code: "LIST_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/books/:bookId
 * Get book details and chunks
 */
app.get("/api/v1/books/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;
    const { include_chunks = false } = req.query;

    const bookInfo = await getBookInfo(bookId);
    
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Book not found" }
      });
    }

    const chunks = await getBookChunks(bookId);

    const response = {
      success: true,
      data: {
        book_id: bookId,
        file_name: bookInfo.file_name,
        file_path: bookInfo.file_path,
        chunk_count: chunks.length,
        total_text_length: chunks.reduce((sum, c) => sum + c.text_length, 0),
        created_at: bookInfo.created_at,
        storage_backend: useQdrant ? "qdrant" : "in-memory"
      }
    };

    if (include_chunks === 'true' || include_chunks === true) {
      response.data.chunks = chunks;
    }

    res.json(response);
  } catch (err) {
    console.error("Get book error:", err);
    res.status(500).json({
      success: false,
      error: { code: "FETCH_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/books/:bookId/download
 * Download the original PDF file
 */
app.get("/api/v1/books/:bookId/download", async (req, res) => {
  try {
    const { bookId } = req.params;
    
    const bookInfo = await getBookInfo(bookId);
    
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Book not found" }
      });
    }

    if (!bookInfo.file_path) {
      return res.status(404).json({
        success: false,
        error: { code: "NO_FILE", message: "No file associated with this book (text ingestion)" }
      });
    }

    const absolutePath = path.resolve(bookInfo.file_path);
    
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: { code: "FILE_NOT_FOUND", message: "File no longer exists on server" }
      });
    }

    res.download(absolutePath, bookInfo.file_name);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      success: false,
      error: { code: "DOWNLOAD_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/books/text
 * Ingest raw text content (alternative to PDF upload)
 * Use this when sending text directly from backend instead of PDF
 */
app.post("/api/v1/books/text", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { text, title, chunk_size, chunk_overlap} = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_TEXT", message: "Text content is required" }
      });
    }

    if (!embeddingModel) {
      return res.status(503).json({
        success: false,
        error: { code: "MODEL_NOT_READY", message: "Embedding model is still loading" }
      });
    }

    const bookId = generateBookId();
    const chunks = chunkText(text, chunk_size, chunk_overlap);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_CHUNKS", message: "No valid text chunks could be created" }
      });
    }

    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i]);
      const chunkId = generateUUID(); // UUID for Qdrant compatibility
      
      points.push({
        id: chunkId,
        vector: vector,
        payload: {
          book_id: bookId,
          text: chunks[i],
          chunk_index: i,
          total_chunks: chunks.length,
          file_name: title,
          created_at: new Date().toISOString()
        }
      });
    }

    await storeVectors(points);

    const processingTime = Date.now() - startTime;

    res.status(201).json({
      success: true,
      data: {
        book_id: bookId,
        title: title,
        text_length: text.length,
        word_count: text.split(/\s+/).length,
        chunk_count: chunks.length,
        storage_backend: useQdrant ? "qdrant" : "in-memory",
        created_at: new Date().toISOString(),
        processing_time_ms: processingTime
      }
    });
  } catch (err) {
    console.error("Text ingest error:", err);
    res.status(500).json({
      success: false,
      error: { code: "PROCESSING_ERROR", message: err.message }
    });
  }
});

/**
 * DELETE /api/v1/books/:bookId
 * Delete a book and all its chunks
 */
app.delete("/api/v1/books/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;

    const deletedCount = await deleteBookVectors(bookId);

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Book not found or already deleted" }
      });
    }

    res.json({
      success: true,
      data: {
        book_id: bookId,
        deleted_chunks: deletedCount,
        deleted_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      success: false,
      error: { code: "DELETE_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/health
 * Health check endpoint
 */
app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      api_version: API_VERSION,
      embedding_model_loaded: !!embeddingModel,
      storage_backend: useQdrant ? "qdrant" : "in-memory",
      qdrant_url: useQdrant ? QDRANT_URL : null,
      collection_name: COLLECTION_NAME,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/stats
 * Get vector store statistics
 */
app.get("/api/v1/stats", async (req, res) => {
  try {
    let stats;
    
    if (useQdrant && qdrant) {
      const info = await qdrant.getCollection(COLLECTION_NAME);
      stats = {
        total_vectors: info.points_count,
        vector_dimension: info.config.params.vectors.size,
        storage_backend: "qdrant"
      };
    } else {
      stats = {
        total_vectors: inMemoryVectorStore.length,
        vector_dimension: VECTOR_SIZE,
        storage_backend: "in-memory"
      };
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: "STATS_ERROR", message: err.message }
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Endpoint ${req.method} ${req.path} not found` }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: err.message }
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Lurniva RAG Microservice API v${API_VERSION}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`${'='.repeat(50)}\n`);
});
