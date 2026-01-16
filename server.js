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

// Load environment variables from .env file
dotenv.config();

// Configure Transformers.js to use local cache
env.cacheDir = './.cache';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// --------------------
// Multer config - UNLIMITED file size
// --------------------
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ 
  storage,
  // No file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// --------------------
// Vector Storage Configuration
// --------------------
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const USE_IN_MEMORY = false; // Set to false to use Qdrant (requires Qdrant server running)
const COLLECTION_NAME = "books";
const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 output size

// In-memory vector store
let inMemoryVectorStore = [];
let documentsMetadata = []; // Store document metadata
let qdrant = null;
let useQdrant = false;

// Try to connect to Qdrant
async function initializeVectorStore() {
  if (!USE_IN_MEMORY) {
    try {
      console.log(`Attempting to connect to Qdrant at ${QDRANT_URL}...`);
      
      // Parse URL to handle port properly
      const url = new URL(QDRANT_URL);
      const isHttps = url.protocol === 'https:';
      const port = url.port || (isHttps ? 443 : 6333);
      
      qdrant = new QdrantClient({
        url: QDRANT_URL,
        port: port,
        https: isHttps,
        checkCompatibility: false
      });
      
      console.log(`Connection config: URL=${QDRANT_URL}, Port=${port}, HTTPS=${isHttps}`);
      
      // Test connection with longer timeout for HTTPS
      await Promise.race([
        qdrant.getCollections(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000))
      ]);
      
      // Create collection if needed
      const collections = await qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
      if (!exists) {
        await qdrant.createCollection(COLLECTION_NAME, {
          vectors: { 
            size: VECTOR_SIZE, 
            distance: "Cosine" 
          }
        });
        console.log(`✓ Qdrant collection '${COLLECTION_NAME}' created!`);
      } else {
        console.log(`✓ Connected to Qdrant at ${QDRANT_URL}`);
      }
      
      useQdrant = true;
    } catch (err) {
      console.log(`⚠ Could not connect to Qdrant at ${QDRANT_URL}`);
      console.log(`Error details: ${err.message}`);
      if (err.cause) {
        console.log(`Cause: ${err.cause.message || err.cause}`);
      }
      console.log(`✓ Using in-memory vector store instead`);
      useQdrant = false;
    }
  } else {
    console.log(`✓ Using in-memory vector store`);
    useQdrant = false;
  }
}

// Helper: Calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Helper: Store vectors (in-memory or Qdrant)
async function storeVectors(points) {
  if (useQdrant && qdrant) {
    // Upload in batches to avoid "Request Entity Too Large" error
    const BATCH_SIZE = 100; // Upload 100 chunks at a time
    
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: batch,
      });
      
      if (points.length > BATCH_SIZE) {
        console.log(`Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(points.length / BATCH_SIZE)} (${batch.length} chunks)`);
      }
    }
  } else {
    // Store in memory
    inMemoryVectorStore.push(...points);
  }
}

// Helper: Search vectors (in-memory or Qdrant)
async function searchVectors(queryVector, limit = 5) {
  if (useQdrant && qdrant) {
    return await qdrant.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: limit,
      with_payload: true,
    });
  } else {
    // Search in memory
    const results = inMemoryVectorStore.map(point => ({
      id: point.id,
      score: cosineSimilarity(queryVector, point.vector),
      payload: point.payload
    }));
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    // Return top N
    return results.slice(0, limit);
  }
}

// Helper: Get vector store stats
async function getVectorStats() {
  if (useQdrant && qdrant) {
    const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
    return {
      pointsCount: collectionInfo.points_count,
      vectorSize: collectionInfo.config.params.vectors.size,
      backend: 'Qdrant'
    };
  } else {
    return {
      pointsCount: inMemoryVectorStore.length,
      vectorSize: VECTOR_SIZE,
      backend: 'In-Memory'
    };
  }
}

// --------------------
// Load local embedding model
// --------------------
let embeddingModel;
async function loadModel() {
  try {
    console.log("Loading embedding model...");
    embeddingModel = await pipeline(
      "feature-extraction", 
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("✓ Embedding model loaded!");
  } catch (err) {
    console.error("Error loading model:", err.message);
  }
}

// Initialize on startup
(async () => {
  await loadModel();
  await initializeVectorStore();
})();

// --------------------
// Helper: Extract text from PDF with fallback methods
// --------------------
async function extractPDFText(filePath) {
  console.log(`Attempting to extract text from: ${path.basename(filePath)}`);
  
  // Method 1: Try pdf-parse (fast, works for most PDFs)
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer, {
      max: 0, // No page limit
      version: 'default'
    });
    
    if (pdfData.text && pdfData.text.trim().length > 50) {
      console.log(`✓ Extracted ${pdfData.text.length} characters using pdf-parse`);
      return pdfData.text;
    }
  } catch (err) {
    console.log(`⚠ pdf-parse failed: ${err.message}`);
  }
  
  // Method 2: Try pdf2json (more robust for complex PDFs)
  try {
    return await new Promise((resolve, reject) => {
      const pdfParser = new PDFParser(null, 1);
      
      pdfParser.on("pdfParser_dataError", errData => {
        reject(new Error(errData.parserError));
      });
      
      pdfParser.on("pdfParser_dataReady", pdfData => {
        try {
          let text = '';
          
          if (pdfData.Pages) {
            pdfData.Pages.forEach(page => {
              if (page.Texts) {
                page.Texts.forEach(textItem => {
                  if (textItem.R) {
                    textItem.R.forEach(r => {
                      if (r.T) {
                        text += decodeURIComponent(r.T) + ' ';
                      }
                    });
                  }
                });
              }
              text += '\n';
            });
          }
          
          if (text.trim().length > 50) {
            console.log(`✓ Extracted ${text.length} characters using pdf2json`);
            resolve(text);
          } else {
            reject(new Error('Insufficient text extracted'));
          }
        } catch (err) {
          reject(err);
        }
      });
      
      pdfParser.loadPDF(filePath);
    });
  } catch (err) {
    console.log(`⚠ pdf2json failed: ${err.message}`);
  }
  
  // Method 3: Try pdf-parse with different options
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer, {
      max: 0,
      version: 'v1.10.100',
      pagerender: function(pageData) {
        return pageData.getTextContent()
          .then(function(textContent) {
            let text = '';
            textContent.items.forEach(function(item) {
              text += item.str + ' ';
            });
            return text;
          });
      }
    });
    
    if (pdfData.text && pdfData.text.trim().length > 0) {
      console.log(`✓ Extracted ${pdfData.text.length} characters using pdf-parse (alternative method)`);
      return pdfData.text;
    }
  } catch (err) {
    console.log(`⚠ pdf-parse alternative failed: ${err.message}`);
  }
  
  throw new Error('Could not extract text from PDF using any available method. The PDF might be password-protected, corrupted, or contain only images.');
}

// --------------------
// Helper: Generate embeddings with mean pooling
// --------------------
async function generateEmbedding(text) {
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// --------------------
// Helper: Chunk text intelligently
// --------------------
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep last part for overlap
      const words = currentChunk.split(' ');
      currentChunk = words.slice(-Math.floor(overlap / 10)).join(' ') + ' ' + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(c => c.length > 10); // Filter out very short chunks
}

// --------------------
// Upload PDF & vectorize
// --------------------
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!embeddingModel) {
      return res.status(503).json({ error: "Embedding model not loaded yet. Please wait." });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`Processing PDF: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Generate unique book ID for this document
    const bookId = `book_${Date.now()}`;

    // Extract text using robust method with fallbacks
    const text = await extractPDFText(filePath);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from PDF" });
    }

    console.log(`Extracted ${text.length} characters from PDF`);

    // Chunk text intelligently
    const chunks = chunkText(text, 600, 100);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "No valid text chunks created" });
    }

    // Generate embeddings and prepare points
    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i]);
      
      // Create globally unique ID for this chunk
      const uniqueId = `${bookId}_chunk_${i}`;
      
      points.push({
        id: uniqueId,
        vector: vector,
        payload: { 
          book_id: bookId,              // Unique identifier for this book
          text: chunks[i],
          fileName: fileName,
          chunkIndex: i,
          uploadDate: new Date().toISOString(),
          totalChunks: chunks.length
        },
      });

      // Log progress for large documents
      if ((i + 1) % 10 === 0) {
        console.log(`Processed ${i + 1}/${chunks.length} chunks`);
      }
    }

    // Upload to vector store (Qdrant or in-memory)
    await storeVectors(points);

    // Store document metadata with book_id
    documentsMetadata.push({
      id: bookId,
      book_id: bookId,               // Store book_id in metadata too
      fileName: fileName,
      fileSize: fileSize,
      uploadDate: new Date().toISOString(),
      chunksCount: points.length,
      textLength: text.length,
      firstChunkId: points[0].id
    });

    console.log(`✓ Uploaded ${points.length} chunks to vector store`);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ 
      status: "success", 
      chunksUploaded: points.length,
      fileName: fileName,
      textLength: text.length,
      documentId: docId
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// List all documents
// --------------------
app.get("/documents", (req, res) => {
  try {
    res.json({
      documents: documentsMetadata,
      totalDocuments: documentsMetadata.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Get document details and preview
// --------------------
app.get("/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const doc = documentsMetadata.find(d => d.id === id);
    
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    let chunks = [];
    
    if (useQdrant && qdrant) {
      // Scroll through all points and filter by book_id
      const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
        limit: 10000,
        with_payload: true,
        with_vector: false
      });
      
      chunks = scrollResult.points
        .filter(point => point.payload.book_id === doc.book_id)
        .map((point, idx) => ({
          index: point.payload.chunkIndex || idx,
          text: point.payload.text,
          id: point.id
        }));
    } else {
      // Get from in-memory store
      chunks = inMemoryVectorStore
        .filter(point => point.payload.book_id === doc.book_id)
        .map((chunk, idx) => ({
          index: idx,
          text: chunk.payload.text,
          id: chunk.id
        }));
    }
    
    res.json({
      ...doc,
      chunks: chunks.sort((a, b) => a.index - b.index)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Delete document
// --------------------
app.delete("/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const docIndex = documentsMetadata.findIndex(d => d.id === id);
    
    if (docIndex === -1) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    const doc = documentsMetadata[docIndex];
    
    // Remove from vector store
    if (useQdrant && qdrant) {
      console.log(`Deleting "${doc.fileName}" from Qdrant...`);
      
      // First, get all point IDs for this document
      const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
        limit: 10000,
        with_payload: true,
        with_vector: false
      });
      
      const pointIdsToDelete = scrollResult.points
        .filter(point => point.payload.fileName === doc.fileName)
        .map(point => point.id);
      
      if (pointIdsToDelete.length > 0) {
        // Delete points in batches
        const BATCH_SIZE = 100;
        for (let i = 0; i < pointIdsToDelete.length; i += BATCH_SIZE) {
          const batch = pointIdsToDelete.slice(i, i + BATCH_SIZE);
          await qdrant.delete(COLLECTION_NAME, {
            wait: true,
            points: batch
          });
        }
        console.log(`✓ Deleted ${pointIdsToDelete.length} chunks from Qdrant`);
      }
    } else {
      // Remove from in-memory store
      const beforeCount = inMemoryVectorStore.length;
      inMemoryVectorStore = inMemoryVectorStore.filter(
        point => point.payload.book_id !== doc.book_id
      );
      const deletedCount = beforeCount - inMemoryVectorStore.length;
      console.log(`✓ Deleted ${deletedCount} chunks from memory`);
    }
    
    // Remove from metadata
    documentsMetadata.splice(docIndex, 1);
    
    console.log(`✓ Deleted document: ${doc.fileName}`);
    
    res.json({ 
      status: "success", 
      message: `Document "${doc.fileName}" deleted successfully`,
      deletedDocument: doc
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Update document (re-upload with same name)
// --------------------
app.put("/documents/:id", upload.single("pdf"), async (req, res) => {
  try {
    const { id } = req.params;
    const docIndex = documentsMetadata.findIndex(d => d.id === id);
    
    if (docIndex === -1) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!embeddingModel) {
      return res.status(503).json({ error: "Embedding model not loaded yet. Please wait." });
    }

    const oldDoc = documentsMetadata[docIndex];
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`Updating document: ${oldDoc.fileName} -> ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Delete old document chunks
    if (useQdrant && qdrant) {
      console.log(`Deleting old version "${oldDoc.fileName}" (book_id: ${oldDoc.book_id}) from Qdrant...`);
      
      const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
        limit: 10000,
        with_payload: true,
        with_vector: false
      });
      
      const pointIdsToDelete = scrollResult.points
        .filter(point => point.payload.book_id === oldDoc.book_id)
        .map(point => point.id);
      
      if (pointIdsToDelete.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < pointIdsToDelete.length; i += BATCH_SIZE) {
          const batch = pointIdsToDelete.slice(i, i + BATCH_SIZE);
          await qdrant.delete(COLLECTION_NAME, {
            wait: true,
            points: batch
          });
        }
        console.log(`✓ Deleted ${pointIdsToDelete.length} old chunks`);
      }
    } else {
      inMemoryVectorStore = inMemoryVectorStore.filter(
        point => point.payload.book_id !== oldDoc.book_id
      );
    }

    // Extract and process new PDF
    const text = await extractPDFText(filePath);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from PDF" });
    }

    console.log(`Extracted ${text.length} characters from PDF`);

    // Chunk and embed
    const chunks = chunkText(text, 600, 100);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return res.status(400).json({ error: "No valid text chunks created" });
    }

    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await generateEmbedding(chunks[i]);
      
      // Preserve the same book_id for this document update
      const uniqueId = `${oldDoc.book_id}_chunk_${i}`;
      
      points.push({
        id: uniqueId,
        vector: vector,
        payload: { 
          book_id: oldDoc.book_id,  // Keep the same book_id
          text: chunks[i],
          fileName: fileName,
          chunkIndex: i,
          uploadDate: new Date().toISOString(),
          totalChunks: chunks.length
        },
      });

      if ((i + 1) % 10 === 0) {
        console.log(`Processed ${i + 1}/${chunks.length} chunks`);
      }
    }

    // Store vectors
    await storeVectors(points);

    // Update metadata
    documentsMetadata[docIndex] = {
      id: id,
      book_id: oldDoc.book_id,   // Preserve book_id
      fileName: fileName,
      fileSize: fileSize,
      uploadDate: new Date().toISOString(),
      chunksCount: points.length,
      textLength: text.length,
      firstChunkId: points[0].id,
      previousVersion: oldDoc.fileName
    };

    // Clean up
    fs.unlinkSync(filePath);

    console.log(`✓ Updated document successfully`);

    res.json({ 
      status: "success", 
      message: "Document updated successfully",
      chunksUploaded: points.length,
      fileName: fileName,
      textLength: text.length,
      documentId: id
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Search Endpoint
// --------------------
app.post("/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query is required" });
    }

    if (!embeddingModel) {
      return res.status(503).json({ error: "Embedding model not loaded yet" });
    }

    console.log(`Searching for: "${query}"`);

    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    // Search in vector store (Qdrant or in-memory)
    const searchResults = await searchVectors(queryVector, 5);

    console.log(`Found ${searchResults.length} results`);

    res.json({
      query: query,
      results: searchResults.map(result => ({
        text: result.payload.text,
        score: result.score,
        fileName: result.payload.fileName,
        chunkIndex: result.payload.chunkIndex
      }))
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Health check endpoint
// --------------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    modelLoaded: !!embeddingModel,
    timestamp: new Date().toISOString()
  });
});

// --------------------
// Get collection stats
// --------------------
app.get("/stats", async (req, res) => {
  try {
    const stats = await getVectorStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✓ Server running on http://localhost:${PORT}`));
