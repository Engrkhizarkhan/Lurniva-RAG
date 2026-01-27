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
import dotenv from "dotenv";
import crypto from "crypto";
import cookieParser from "cookie-parser";

// Load environment variables
dotenv.config();

// Configure Transformers.js cache
const transformersCache = './.cache';

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = "1.0.0";

// Auth Configuration
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Store active sessions (in production, use Redis or similar)
const activeSessions = new Map();

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware
function requireAuth(req, res, next) {
  const sessionToken = req.cookies?.session;
  
  if (!sessionToken || !activeSessions.has(sessionToken)) {
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }
    // For page requests, redirect to login
    return res.redirect('/');
  }
  
  // Update session last activity
  activeSessions.set(sessionToken, {
    ...activeSessions.get(sessionToken),
    lastActivity: Date.now()
  });
  
  next();
}

// Clean up expired sessions (30 min timeout)
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  for (const [token, session] of activeSessions) {
    if (now - session.lastActivity > timeout) {
      activeSessions.delete(token);
    }
  }
}, 60000); // Check every minute

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// --------------------
// Auth Routes
// --------------------

// Login page (root)
app.get('/', (req, res) => {
  const sessionToken = req.cookies?.session;
  if (sessionToken && activeSessions.has(sessionToken)) {
    return res.redirect('/console');
  }
  res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
});

// Login endpoint
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    const token = generateSessionToken();
    activeSessions.set(token, {
      username,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    
    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000 // 30 minutes
    });
    
    return res.json({ success: true, data: { message: 'Login successful' } });
  }
  
  res.status(401).json({
    success: false,
    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }
  });
});

// Check auth status
app.get('/auth/check', (req, res) => {
  const sessionToken = req.cookies?.session;
  const authenticated = sessionToken && activeSessions.has(sessionToken);
  res.json({ authenticated });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    activeSessions.delete(sessionToken);
  }
  res.clearCookie('session');
  res.json({ success: true, data: { message: 'Logged out' } });
});

// Protected console route
app.get('/console', requireAuth, (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'test.html'));
});

// Serve static files (but not test.html directly)
app.use('/static', express.static(path.join(process.cwd(), 'public')));

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
let VECTOR_SIZE = 384; // all-MiniLM-L6-v2 output size, will be updated to 1536 for OpenAI

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
    console.log("Loading transformers library...");
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = transformersCache;
    
    console.log("Loading embedding model...");
    embeddingModel = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("✓ Embedding model loaded!");
    VECTOR_SIZE = 384; // MiniLM vector size
  } catch (err) {
    console.error("Failed to load embedding model:", err.message);
    console.log("⚠️  Running in fallback mode - embeddings will use OpenAI API");
    // Set a flag to indicate fallback mode
    embeddingModel = "fallback";
    VECTOR_SIZE = 1536; // OpenAI ada-002 vector size
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
    const totalBatches = Math.ceil(points.length / BATCH_SIZE);
    let successCount = 0;
    let failedIndices = [];
    
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        await qdrant.upsert(COLLECTION_NAME, { wait: true, points: batch });
        successCount += batch.length;
        
        if (totalBatches > 1) {
          process.stdout.write(`\r   Batch upload: ${batchNum}/${totalBatches}`);
        }
      } catch (err) {
        // Log which batch failed
        console.error(`\n   ❌ Batch ${batchNum} failed:`, err.message);
        // Try to upload points individually to identify problematic ones
        for (let j = 0; j < batch.length; j++) {
          try {
            await qdrant.upsert(COLLECTION_NAME, { wait: true, points: [batch[j]] });
            successCount++;
          } catch (pointErr) {
            const chunkIndex = batch[j].payload.chunk_index;
            failedIndices.push(chunkIndex);
            console.error(`   ❌ Chunk ${chunkIndex} failed:`, pointErr.message);
          }
        }
      }
    }
    
    if (totalBatches > 1) console.log(''); // New line after batch progress
    
    if (failedIndices.length > 0) {
      console.warn(`   ⚠️  ${failedIndices.length} chunks failed to upload: ${failedIndices.join(', ')}`);
    }
    
    return { total: points.length, success: successCount, failed: failedIndices.length };
  } else {
    inMemoryVectorStore.push(...points);
    return { total: points.length, success: points.length, failed: 0 };
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
  if (embeddingModel === "fallback") {
    // Use OpenAI for embeddings as fallback
    try {
      const OpenAI = await import('openai').then(module => module.default);
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (err) {
      throw new Error("Both local and OpenAI embedding models failed");
    }
  }
  
  const output = await embeddingModel(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Generate AI Images using DALL-E
async function generateAIImage(description, subject, classNo) {
  try {
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const enhancedPrompt = `Educational illustration for Class ${classNo} ${subject}: ${description}. Style: clean, educational, suitable for textbooks, clear labels, appropriate for students aged ${getAgeRange(classNo)}.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      size: "1024x1024",
      quality: "standard",
      n: 1,
    });

    return {
      url: response.data[0].url,
      description: description,
      prompt_used: enhancedPrompt
    };
  } catch (error) {
    console.warn(`Image generation failed: ${error.message}`);
    return {
      url: null,
      description: description,
      error: error.message,
      fallback_text: `[Image: ${description}]`
    };
  }
}

// Generate Chart Data
async function generateChartData(description, subject) {
  try {
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const chartPrompt = `Generate realistic educational chart data for: ${description}. 
    Subject: ${subject}
    Return ONLY a JSON object with this structure:
    {
      "type": "bar|line|pie|scatter",
      "title": "Chart Title",
      "data": {
        "labels": ["Label1", "Label2", ...],
        "datasets": [{
          "label": "Dataset Label",
          "data": [10, 20, 30, ...],
          "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"]
        }]
      },
      "description": "Educational explanation of the chart"
    }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a data visualization expert for educational content. Generate realistic chart data in JSON format only." },
        { role: "user", content: chartPrompt }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    const chartData = JSON.parse(response.choices[0].message.content);
    return chartData;
  } catch (error) {
    console.warn(`Chart generation failed: ${error.message}`);
    return {
      type: "bar",
      title: "Chart Data",
      error: error.message,
      fallback_text: `[Chart: ${description}]`
    };
  }
}

// Get age range for class
function getAgeRange(classNo) {
  const classNum = parseInt(classNo);
  return classNum + 5; // Approximate age
}

// Process visual elements in lecture content
async function processVisualElements(lectureContent, subject, classNo, includeVisuals) {
  if (!includeVisuals) {
    return {
      content: lectureContent,
      visual_assets: []
    };
  }

  const visualAssets = [];
  let processedContent = lectureContent;

  // Find all visual element patterns
  const imageMatches = lectureContent.match(/\{\{IMAGE: ([^}]+)\}\}/g) || [];
  const diagramMatches = lectureContent.match(/\{\{DIAGRAM: ([^}]+)\}\}/g) || [];
  const chartMatches = lectureContent.match(/\{\{CHART: ([^}]+)\}\}/g) || [];
  const interactiveMatches = lectureContent.match(/\{\{INTERACTIVE: ([^}]+)\}\}/g) || [];

  // Process Images
  for (const match of imageMatches) {
    const description = match.replace(/\{\{IMAGE: /, '').replace(/\}\}/, '');
    const imageData = await generateAIImage(description, subject, classNo);
    
    visualAssets.push({
      type: 'image',
      description: description,
      data: imageData,
      id: `img_${visualAssets.length + 1}`
    });

    // Replace in content with structured HTML
    const imageHtml = imageData.url 
      ? `<div class="generated-image" style="margin: 20px 0; text-align: center;">
          <img src="${imageData.url}" alt="${description}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <p class="image-caption" style="font-size: 0.9em; color: #666; margin-top: 8px;">${description}</p>
        </div>`
      : `<div class="image-placeholder" style="border: 2px dashed #ccc; padding: 20px; text-align: center; background: #f8f9fa; margin: 20px 0;">
          <p>🖼️ ${imageData.fallback_text}</p>
          <small style="color: #666;">Image generation unavailable: ${imageData.error}</small>
        </div>`;
    
    processedContent = processedContent.replace(match, imageHtml);
  }

  // Process Charts
  for (const match of chartMatches) {
    const description = match.replace(/\{\{CHART: /, '').replace(/\}\}/, '');
    const chartData = await generateChartData(description, subject);
    
    visualAssets.push({
      type: 'chart',
      description: description,
      data: chartData,
      id: `chart_${visualAssets.length + 1}`
    });

    // Replace in content with chart configuration
    const chartHtml = chartData.data 
      ? `<div class="chart-container" data-chart='${JSON.stringify(chartData)}' style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
          <h4 style="margin-bottom: 15px; color: #333;">${chartData.title}</h4>
          <div class="chart-placeholder" style="height: 300px; background: white; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; color: #666; flex-direction: column;">
            <div>📊 ${chartData.title}</div>
            <small style="margin-top: 10px;">Chart data available in API response</small>
          </div>
          ${chartData.description ? `<p style="font-size: 0.9em; color: #666; margin-top: 10px;">${chartData.description}</p>` : ''}
        </div>`
      : `<div class="chart-error" style="border: 2px dashed #ffc107; padding: 20px; background: #fff8e1; color: #856404; margin: 20px 0;">
          📊 ${chartData.fallback_text}
        </div>`;
    
    processedContent = processedContent.replace(match, chartHtml);
  }

  // Process Diagrams (similar to images but optimized for diagrams)
  for (const match of diagramMatches) {
    const description = match.replace(/\{\{DIAGRAM: /, '').replace(/\}\}/, '');
    const diagramData = await generateAIImage(`Educational diagram: ${description}`, subject, classNo);
    
    visualAssets.push({
      type: 'diagram',
      description: description,
      data: diagramData,
      id: `diagram_${visualAssets.length + 1}`
    });

    const diagramHtml = diagramData.url 
      ? `<div class="diagram-container" style="margin: 20px 0; text-align: center;">
          <img src="${diagramData.url}" alt="${description}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 8px;">
          <p class="diagram-caption" style="font-size: 0.9em; color: #666; margin-top: 8px;"><strong>Diagram:</strong> ${description}</p>
        </div>`
      : `<div class="diagram-placeholder" style="border: 2px dashed #007bff; padding: 20px; text-align: center; background: #f0f8ff; margin: 20px 0;">
          <p>📊 ${diagramData.fallback_text}</p>
          <small style="color: #666;">Diagram generation unavailable: ${diagramData.error}</small>
        </div>`;
    
    processedContent = processedContent.replace(match, diagramHtml);
  }

  // Process Interactive Elements
  for (const match of interactiveMatches) {
    const description = match.replace(/\{\{INTERACTIVE: /, '').replace(/\}\}/, '');
    
    visualAssets.push({
      type: 'interactive',
      description: description,
      data: {
        activity_type: description.toLowerCase().includes('quiz') ? 'quiz' : 'exercise',
        description: description,
        suggestions: [
          "Create multiple choice questions",
          "Add interactive elements", 
          "Include student engagement activities"
        ]
      },
      id: `interactive_${visualAssets.length + 1}`
    });

    const interactiveHtml = `<div class="interactive-element" style="border: 2px solid #28a745; background: #f8fff9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #28a745; margin-bottom: 10px;">🎯 Interactive Activity</h4>
        <p><strong>${description}</strong></p>
        <div style="margin-top: 15px; padding: 15px; background: white; border: 1px dashed #28a745; border-radius: 5px;">
          <small style="color: #666;">💡 Interactive element - implement in your frontend dashboard</small>
        </div>
      </div>`;
    
    processedContent = processedContent.replace(match, interactiveHtml);
  }

  return {
    content: processedContent,
    visual_assets: visualAssets
  };
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
    console.log(`\n📄 Processing: ${originalName}`);
    console.log(`   Total chunks: ${chunks.length}`);
    console.log(`   Generating embeddings...`);
    
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
      
      // Progress logging every 10 chunks or at the end
      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        const percent = Math.round(((i + 1) / chunks.length) * 100);
        process.stdout.write(`\r   Embedding: ${i + 1}/${chunks.length} chunks (${percent}%)`);
      }
    }
    console.log(''); // New line after progress
    
    console.log(`   Uploading to vector store...`);
    const uploadResult = await storeVectors(points);
    console.log(`   ✓ Upload complete! (${uploadResult.success}/${uploadResult.total} chunks)`);
    
    if (uploadResult.failed > 0) {
      console.warn(`   ⚠️  Warning: ${uploadResult.failed} chunks failed to upload`);
    }

    // Rename file to use book_id for easy reference
    const newFileName = `${bookId}_${originalName}`;
    const newFilePath = path.join('./uploads', newFileName);
    fs.renameSync(filePath, newFilePath);

    const processingTime = Date.now() - startTime;
    
    // Summary log
    console.log(`\n   ✅ Book processed successfully!`);
    console.log(`   ├─ Book ID: ${bookId}`);
    console.log(`   ├─ Chunks: ${chunks.length} (${uploadResult.success} uploaded${uploadResult.failed > 0 ? `, ${uploadResult.failed} failed` : ''})`);
    console.log(`   ├─ Pages: ${pageCount}`);
    console.log(`   └─ Time: ${(processingTime / 1000).toFixed(2)}s\n`);

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
    const { query, book_id, limit = 5, min_score = 0 } = req.body;

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
    let results = await searchVectors(queryVector, Math.min(limit, 20), book_id);
    
    // Filter by min_score if provided
    if (min_score > 0) {
      results = results.filter(r => r.score >= min_score);
    }

    res.json({
      success: true,
      data: {
        query: query,
        book_id: book_id || null,
        min_score: min_score,
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
    const { include_chunks = false, limit = 0, offset = 0 } = req.query;

    const bookInfo = await getBookInfo(bookId);
    
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Book not found" }
      });
    }

    const allChunks = await getBookChunks(bookId);
    const totalChunks = allChunks.length;

    const response = {
      success: true,
      data: {
        book_id: bookId,
        file_name: bookInfo.file_name,
        file_path: bookInfo.file_path,
        chunk_count: totalChunks,
        total_text_length: allChunks.reduce((sum, c) => sum + c.text_length, 0),
        created_at: bookInfo.created_at,
        storage_backend: useQdrant ? "qdrant" : "in-memory"
      }
    };

    if (include_chunks === 'true' || include_chunks === true) {
      const chunkLimit = parseInt(limit) || 0;
      const chunkOffset = parseInt(offset) || 0;
      
      let chunks = allChunks;
      
      // Apply offset first
      if (chunkOffset > 0) {
        chunks = chunks.slice(chunkOffset);
      }
      
      // Apply limit if specified
      if (chunkLimit > 0) {
        chunks = chunks.slice(0, chunkLimit);
      }
      
      response.data.chunks = chunks;
      response.data.chunks_returned = chunks.length;
      response.data.offset = chunkOffset;
      response.data.limit = chunkLimit || 'all';
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

    console.log(`\n📝 Processing text: ${title}`);
    console.log(`   Total chunks: ${chunks.length}`);
    console.log(`   Generating embeddings...`);
    
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
      
      // Progress logging every 10 chunks or at the end
      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        const percent = Math.round(((i + 1) / chunks.length) * 100);
        process.stdout.write(`\r   Embedding: ${i + 1}/${chunks.length} chunks (${percent}%)`);
      }
    }
    console.log(''); // New line after progress
    
    console.log(`   Uploading to vector store...`);
    const uploadResult = await storeVectors(points);
    console.log(`   ✓ Upload complete! (${uploadResult.success}/${uploadResult.total} chunks)`);
    
    if (uploadResult.failed > 0) {
      console.warn(`   ⚠️  Warning: ${uploadResult.failed} chunks failed to upload`);
    }

    const processingTime = Date.now() - startTime;
    
    // Summary log
    console.log(`\n   ✅ Text processed successfully!`);
    console.log(`   ├─ Book ID: ${bookId}`);
    console.log(`   ├─ Title: ${title}`);
    console.log(`   ├─ Chunks: ${chunks.length}`);
    console.log(`   └─ Time: ${(processingTime / 1000).toFixed(2)}s\n`);

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

/**
 * POST /api/v1/tutor/ask
 * AI Tutoring API - Send chunks and metadata to OpenAI for educational responses
 */
app.post("/api/v1/tutor/ask", async (req, res) => {
  try {
    const { 
      question, 
      chunks, 
      class_no, 
      board, 
      subject,
      model = "gpt-4o-mini",
      max_tokens = 1000
    } = req.body;

    // Validation
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUESTION", message: "Question is required" }
      });
    }

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_CHUNKS", message: "Chunks array is required and must not be empty" }
      });
    }

    if (!class_no || !board || !subject) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_METADATA", message: "class_no, board, and subject are required" }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: { code: "OPENAI_NOT_CONFIGURED", message: "OpenAI API key not configured" }
      });
    }

    // Prepare chunks text
    const chunksText = chunks.map((chunk, index) => {
      if (typeof chunk === 'string') {
        return `Chunk ${index + 1}:\n${chunk}`;
      } else if (chunk.text) {
        return `Chunk ${index + 1}:\n${chunk.text}`;
      } else {
        return `Chunk ${index + 1}:\n${JSON.stringify(chunk)}`;
      }
    }).join('\n\n');

    // Create the tutor prompt
    const tutorPrompt = `You are an AI tutor for a learning platform.

Inputs:
• Retrieved textbook chunks
• Metadata: Class ${class_no}, Board ${board}, Subject ${subject}

Rules:
1. Answer ONLY using the provided chunks.
2. Do NOT use external knowledge or assumptions.
3. If the answer is not in the chunks, say: "This topic is not covered in the provided material."
4. Keep explanations simple and suitable for Class ${class_no}.
5. Respond ONLY in valid HTML (no Markdown).
6. Use <h3>, <p>, <ul>, <li>, <strong> as needed.
7. If a video link exists, embed it using <iframe>.
8. If diagrams/images are referenced, explain them clearly.
9. If the question is unrelated to the subject or chunks, state that politely.
10. Do not mention chunks, retrieval, or system behavior.

Goal: Provide clear, syllabus-aligned answers within the given material only.

--- PROVIDED CHUNKS ---
${chunksText}

--- STUDENT QUESTION ---
${question}

--- YOUR RESPONSE (HTML ONLY) ---`;

    console.log(`\n🤖 AI Tutor Request:`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Question: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);
    console.log(`   Chunks: ${chunks.length}`);

    // Call OpenAI API
    try {
      const OpenAI = await import('openai').then(module => module.default);
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      const startTime = Date.now();
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: "You are an AI tutor that provides educational responses in HTML format only. Follow the rules exactly as specified."
          },
          {
            role: "user",
            content: tutorPrompt
          }
        ],
        max_tokens: max_tokens,
        temperature: 0.3, // Lower temperature for more consistent educational responses
      });

      const responseTime = Date.now() - startTime;
      const aiResponse = completion.choices[0].message.content;
      const tokensUsed = completion.usage;

      console.log(`   ✓ Response generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

      res.json({
        success: true,
        data: {
          question: question,
          answer: aiResponse,
          metadata: {
            class_no: class_no,
            board: board,
            subject: subject,
            chunks_count: chunks.length,
            model_used: model,
            tokens_used: tokensUsed,
            response_time_ms: responseTime,
            timestamp: new Date().toISOString()
          }
        }
      });

    } catch (openaiError) {
      console.error("OpenAI API error:", openaiError);
      
      // Handle specific OpenAI errors
      if (openaiError.status === 401) {
        return res.status(401).json({
          success: false,
          error: { code: "INVALID_API_KEY", message: "Invalid OpenAI API key" }
        });
      } else if (openaiError.status === 429) {
        return res.status(429).json({
          success: false,
          error: { code: "RATE_LIMITED", message: "OpenAI API rate limit exceeded" }
        });
      } else if (openaiError.status === 400) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_REQUEST", message: openaiError.message }
        });
      }
      
      return res.status(500).json({
        success: false,
        error: { code: "OPENAI_ERROR", message: openaiError.message }
      });
    }

  } catch (err) {
    console.error("Tutor API error:", err);
    res.status(500).json({
      success: false,
      error: { code: "TUTOR_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/tutor/search-and-ask
 * Combined endpoint: Search for relevant chunks and ask AI tutor
 */
app.post("/api/v1/tutor/search-and-ask", async (req, res) => {
  try {
    const { 
      question, 
      book_id, 
      class_no, 
      board, 
      subject,
      search_limit = 5,
      min_score = 0.3,
      model = "gpt-4o-mini",
      max_tokens = 1000
    } = req.body;

    // Validation
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUESTION", message: "Question is required" }
      });
    }

    if (!class_no || !board || !subject) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_METADATA", message: "class_no, board, and subject are required" }
      });
    }

    if (!embeddingModel) {
      return res.status(503).json({
        success: false,
        error: { code: "MODEL_NOT_READY", message: "Embedding model is still loading" }
      });
    }

    console.log(`\n🔍 Search & Ask Request:`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Question: ${question}`);
    console.log(`   Book ID: ${book_id || 'All books'}`);

    // Step 1: Search for relevant chunks
    const queryVector = await generateEmbedding(question);
    let searchResults = await searchVectors(queryVector, search_limit, book_id);
    
    // Filter by min_score
    searchResults = searchResults.filter(r => r.score >= min_score);

    if (searchResults.length === 0) {
      return res.json({
        success: true,
        data: {
          question: question,
          answer: "<p>This topic is not covered in the provided material.</p>",
          metadata: {
            class_no: class_no,
            board: board,
            subject: subject,
            chunks_found: 0,
            search_performed: true,
            timestamp: new Date().toISOString()
          }
        }
      });
    }

    // Step 2: Extract chunks for AI tutor
    const chunks = searchResults.map(r => ({
      text: r.payload.text,
      score: r.score,
      file_name: r.payload.file_name,
      chunk_index: r.payload.chunk_index
    }));

    console.log(`   Found ${chunks.length} relevant chunks`);

    // Step 3: Call the tutor API internally
    const tutorRequest = {
      question,
      chunks: chunks.map(c => c.text), // Just the text for the tutor
      class_no,
      board,
      subject,
      model,
      max_tokens
    };

    // Reuse the tutor logic
    const chunksText = tutorRequest.chunks.map((chunk, index) => 
      `Chunk ${index + 1}:\n${chunk}`
    ).join('\n\n');

    const tutorPrompt = `You are an AI tutor for a learning platform.

Inputs:
• Retrieved textbook chunks
• Metadata: Class ${class_no}, Board ${board}, Subject ${subject}

Rules:
1. Answer ONLY using the provided chunks.
2. Do NOT use external knowledge or assumptions.
3. If the answer is not in the chunks, say: "This topic is not covered in the provided material."
4. Keep explanations simple and suitable for Class ${class_no}.
5. Respond ONLY in valid HTML (no Markdown).
6. Use <h3>, <p>, <ul>, <li>, <strong> as needed.
7. If a video link exists, embed it using <iframe>.
8. If diagrams/images are referenced, explain them clearly.
9. If the question is unrelated to the subject or chunks, state that politely.
10. Do not mention chunks, retrieval, or system behavior.

Goal: Provide clear, syllabus-aligned answers within the given material only.

--- PROVIDED CHUNKS ---
${chunksText}

--- STUDENT QUESTION ---
${question}

--- YOUR RESPONSE (HTML ONLY) ---`;

    // Call OpenAI
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const startTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an AI tutor that provides educational responses in HTML format only. Follow the rules exactly as specified."
        },
        {
          role: "user",
          content: tutorPrompt
        }
      ],
      max_tokens: max_tokens,
      temperature: 0.3,
    });

    const responseTime = Date.now() - startTime;
    const aiResponse = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    console.log(`   ✓ AI Response generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

    res.json({
      success: true,
      data: {
        question: question,
        answer: aiResponse,
        metadata: {
          class_no: class_no,
          board: board,
          subject: subject,
          chunks_found: chunks.length,
          chunks_used: chunks.map(c => ({
            file_name: c.file_name,
            chunk_index: c.chunk_index,
            relevance_score: parseFloat(c.score.toFixed(4))
          })),
          search_performed: true,
          model_used: model,
          tokens_used: tokensUsed,
          response_time_ms: responseTime,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (err) {
    console.error("Search & Ask error:", err);
    res.status(500).json({
      success: false,
      error: { code: "SEARCH_ASK_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/lecture/generate
 * Generate comprehensive lecture content from book chunks
 */
app.post("/api/v1/lecture/generate", async (req, res) => {
  try {
    const { 
      book_id,
      class_no, 
      board, 
      subject,
      topic,
      chunk_limit = 10,
      chunk_offset = 0,
      model = "gpt-4o-mini",
      max_tokens = 3000,
      include_visuals = true,
      lecture_style = "comprehensive" // comprehensive, concise, interactive
    } = req.body;

    // Validation
    if (!book_id) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_BOOK_ID", message: "book_id is required" }
      });
    }

    if (!class_no || !board || !subject) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_METADATA", message: "class_no, board, and subject are required" }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: { code: "OPENAI_NOT_CONFIGURED", message: "OpenAI API key not configured" }
      });
    }

    console.log(`\n📚 Lecture Generation Request:`);
    console.log(`   Book ID: ${book_id}`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Topic: ${topic || 'Auto-detected from content'}`);
    console.log(`   Chunks: ${chunk_limit} (offset: ${chunk_offset})`);

    // Step 1: Get book information
    const bookInfo = await getBookInfo(book_id);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    // Step 2: Get book chunks with pagination
    const allChunks = await getBookChunks(book_id);
    const totalChunks = allChunks.length;
    
    if (totalChunks === 0) {
      return res.status(404).json({
        success: false,
        error: { code: "NO_CONTENT", message: "No content found for this book" }
      });
    }

    // Apply pagination
    const startIndex = chunk_offset;
    const endIndex = Math.min(startIndex + chunk_limit, totalChunks);
    const selectedChunks = allChunks.slice(startIndex, endIndex);

    if (selectedChunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PAGINATION", message: "No chunks found for given offset and limit" }
      });
    }

    // Step 3: Prepare content for lecture generation
    const contentText = selectedChunks.map((chunk, index) => {
      const actualIndex = startIndex + index + 1;
      return `Section ${actualIndex}:\n${chunk.text}`;
    }).join('\n\n');

    // Step 4: Create comprehensive lecture prompt
    const lecturePrompt = `You are an expert educator creating a comprehensive lecture for ${subject} (Class ${class_no}, ${board} Board).

TASK: Generate a complete, engaging lecture based on the provided textbook content.

CONTENT TO COVER:
${contentText}

REQUIREMENTS:
1. Create a structured lecture with clear sections and subsections
2. Use appropriate HTML formatting (h1, h2, h3, p, ul, ol, li, strong, em, blockquote) make it like <section> and inside it the h1 and etc
3. Add educational elements: definitions, examples, key points, summaries
4. Make it engaging and age-appropriate for Class ${class_no} students
5. Follow ${board} curriculum standards
6. Provide clear explanations with real-world applications

${include_visuals ? `
VISUAL ELEMENTS TO INCLUDE:
When you want to include visual elements, use this EXACT format:
- For Images: {{IMAGE: [detailed description for image generation]}}
- For Diagrams: {{DIAGRAM: [detailed description of diagram/flowchart needed]}}  
- For Charts: {{CHART: [chart type and data description]}}
- For Interactive: {{INTERACTIVE: [quiz/exercise description]}}

Example: {{IMAGE: A detailed cross-section diagram of a plant cell showing chloroplasts, nucleus, cell wall, and vacuoles for Class ${class_no} ${subject} students}}
` : ''}

LECTURE STRUCTURE:
1. Introduction & Learning Objectives
2. Main Content (organized by topics/subtopics)
3. Key Concepts & Definitions
4. Examples & Applications
5. Summary & Conclusion
6. Review Questions

${topic ? `FOCUS TOPIC: "${topic}" - Ensure this topic gets special emphasis in the lecture.` : ''}

STYLE: ${lecture_style === 'comprehensive' ? 'Detailed explanations with examples' : 
         lecture_style === 'concise' ? 'Concise but complete coverage' : 
         'Interactive with engaging activities'}

Generate ONLY the HTML lecture content. No markdown, no code blocks, just clean HTML.`;

    console.log(`   Generating lecture from ${selectedChunks.length} chunks...`);

    // Step 5: Call OpenAI API
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const startTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are an expert educator specializing in ${subject} for ${board} board. Create engaging, curriculum-aligned lectures in HTML format only. Always include visual placeholders and interactive elements to enhance learning.`
        },
        {
          role: "user",
          content: lecturePrompt
        }
      ],
      max_tokens: max_tokens,
      temperature: 0.4, // Balanced creativity for educational content
    });

    const responseTime = Date.now() - startTime;
    const lectureContent = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    console.log(`   ✓ Lecture generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

    // Step 6: Process visual elements if enabled
    console.log(`   Processing visual elements...`);
    const processedResult = await processVisualElements(lectureContent, subject, class_no, include_visuals);
    const finalLectureContent = processedResult.content;
    const visualAssets = processedResult.visual_assets;

    console.log(`   ✓ Visual processing complete (${visualAssets.length} elements)`);

    // Step 7: Return comprehensive response with visual assets
    res.json({
      success: true,
      data: {
        lecture_content: finalLectureContent,
        visual_assets: visualAssets,
        metadata: {
          book_id: book_id,
          book_title: bookInfo.title || bookInfo.file_name,
          class_no: class_no,
          board: board,
          subject: subject,
          topic: topic || "Generated from book content",
          chunks_used: {
            total_available: totalChunks,
            used_count: selectedChunks.length,
            start_index: startIndex + 1,
            end_index: endIndex,
            offset: chunk_offset,
            limit: chunk_limit
          },
          content_stats: {
            total_characters: contentText.length,
            estimated_reading_time_minutes: Math.ceil(contentText.length / 1000), // ~1000 chars per minute
            sections_covered: selectedChunks.length
          },
          visual_summary: {
            total_visual_elements: visualAssets.length,
            images_generated: visualAssets.filter(v => v.type === 'image').length,
            diagrams_generated: visualAssets.filter(v => v.type === 'diagram').length,
            charts_created: visualAssets.filter(v => v.type === 'chart').length,
            interactive_elements: visualAssets.filter(v => v.type === 'interactive').length
          },
          generation_settings: {
            model_used: model,
            max_tokens: max_tokens,
            lecture_style: lecture_style,
            include_visuals: include_visuals,
            tokens_used: tokensUsed,
            response_time_ms: responseTime
          },
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (err) {
    console.error("Lecture generation error:", err);
    
    // Handle OpenAI specific errors
    if (err.status === 401) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_API_KEY", message: "Invalid OpenAI API key" }
      });
    } else if (err.status === 429) {
      return res.status(429).json({
        success: false,
        error: { code: "RATE_LIMITED", message: "OpenAI API rate limit exceeded" }
      });
    }
    
    res.status(500).json({
      success: false,
      error: { code: "LECTURE_GENERATION_ERROR", message: err.message }
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
  console.log(`  Auth: Enabled (Username: ${AUTH_USERNAME})`);
  console.log(`${'='.repeat(50)}\n`);
});
