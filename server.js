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

// Multer configuration for assignment document uploads
const uploadAssignment = multer({
  storage: multer.memoryStorage(), // Store in memory for processing
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents (.doc, .docx), and text files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
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

// Extract text from various document formats for assignment submissions
async function extractDocumentText(fileBuffer, mimetype, originalName) {
  try {
    if (mimetype === 'text/plain') {
      return fileBuffer.toString('utf-8');
    }
    
    if (mimetype === 'application/pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text;
    }
    
    if (mimetype === 'application/msword' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For Word documents, we'll extract what we can or ask user to convert to PDF/TXT
      throw new Error('Word document support limited. Please upload as PDF or TXT file.');
    }
    
    throw new Error(`Unsupported file type: ${mimetype}`);
  } catch (error) {
    throw new Error(`Failed to extract text from ${originalName}: ${error.message}`);
  }
}

// Helper function to clean JSON from markdown formatting
// Generate interactive HTML quiz
function generateInteractiveQuizHTML(quizData) {
  const quiz = quizData.quiz;
  const timeLimit = quiz.time_limit || 30;
  
  // Build questions HTML
  let questionsHTML = '';
  quiz.questions.forEach((q, index) => {
    questionsHTML += `
    <div class="question">
      <h3>${q.question_id}. ${q.question}</h3>
      <div class="options">
        ${q.options.map(option => {
          const optionLetter = option.charAt(0);
          return `
          <div class="option" onclick="selectOption(this, ${q.question_id}, '${optionLetter}')">
            <input type="radio" name="q${q.question_id}" value="${optionLetter}">
            <label>${option}</label>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  
  // Build correct answers object for JavaScript
  const correctAnswers = {};
  quiz.questions.forEach(q => {
    correctAnswers[q.question_id] = q.correct_answer;
  });
  
  // Build explanations object for JavaScript
  const explanations = {};
  quiz.questions.forEach(q => {
    explanations[q.question_id] = q.explanation;
  });
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${quiz.title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .timer {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 1000;
        }
        .quiz-info {
            background: #f8f9fa;
            padding: 20px 30px;
            border-bottom: 2px solid #e9ecef;
        }
        .quiz-info p {
            margin: 5px 0;
            font-size: 16px;
        }
        .quiz-content {
            padding: 30px;
        }
        .question {
            margin: 30px 0;
            padding: 25px;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            background: #f8f9fa;
            transition: all 0.3s ease;
        }
        .question:hover {
            border-color: #007bff;
            box-shadow: 0 4px 15px rgba(0,123,255,0.1);
        }
        .question h3 {
            color: #333;
            margin-bottom: 20px;
            font-size: 18px;
        }
        .options {
            display: grid;
            gap: 10px;
        }
        .option {
            padding: 15px 20px;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            background: white;
            display: flex;
            align-items: center;
        }
        .option:hover {
            background: #e3f2fd;
            border-color: #2196F3;
        }
        .option.selected {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }
        .option input[type="radio"] {
            margin-right: 15px;
            transform: scale(1.2);
        }
        .option label {
            cursor: pointer;
            flex: 1;
            font-size: 16px;
        }
        .submit-btn {
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            padding: 15px 40px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            display: block;
            margin: 40px auto;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,123,255,0.3);
        }
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,123,255,0.4);
        }
        .submit-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }
        .results {
            margin: 30px 0;
            padding: 25px;
            background: #f8f9fa;
            border-radius: 10px;
            border-left: 5px solid #007bff;
        }
        .results h3 {
            color: #007bff;
            margin-bottom: 20px;
        }
        .result-item {
            margin: 15px 0;
            padding: 15px;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .result-item.correct {
            background: #d4edda;
            border-left: 4px solid #28a745;
            color: #155724;
        }
        .result-item.incorrect {
            background: #f8d7da;
            border-left: 4px solid #dc3545;
            color: #721c24;
        }
        .score-summary {
            text-align: center;
            padding: 25px;
            margin: 20px 0;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
        }
        .explanation {
            margin-top: 10px;
            padding: 10px;
            background: rgba(255,255,255,0.8);
            border-radius: 5px;
            font-size: 14px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${quiz.title}</h1>
        </div>
        
        <div class="timer" id="timer">
            ⏰ Time: <span id="time">${timeLimit}:00</span>
        </div>
        
        <div class="quiz-info">
            <p><strong>Instructions:</strong> ${quiz.instructions}</p>
            <p><strong>Total Questions:</strong> ${quiz.questions.length} | <strong>Total Marks:</strong> ${quiz.total_marks} | <strong>Time Limit:</strong> ${timeLimit} minutes</p>
        </div>
        
        <div class="quiz-content">
            <form id="quizForm">
                ${questionsHTML}
            </form>
            
            <button class="submit-btn" onclick="submitQuiz()" id="submitBtn">
                📝 Submit Quiz
            </button>
            
            <div id="results" style="display:none;" class="results">
                <!-- Results will be populated here -->
            </div>
        </div>
    </div>

    <script>
        let timeLeft = ${timeLimit} * 60;
        let answers = {};
        let quizSubmitted = false;
        const correctAnswers = ${JSON.stringify(correctAnswers)};
        const explanations = ${JSON.stringify(explanations)};

        // Timer function
        function updateTimer() {
            if (quizSubmitted) return;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            document.getElementById('time').textContent = 
                minutes + ':' + seconds.toString().padStart(2, '0');
            
            if (timeLeft <= 0) {
                alert('Time is up! Submitting quiz automatically.');
                submitQuiz();
                return;
            }
            timeLeft--;
        }

        // Start timer
        const timerInterval = setInterval(updateTimer, 1000);

        // Option selection function
        function selectOption(element, questionId, optionValue) {
            // Remove selected class from all options in this question
            const questionDiv = element.closest('.question');
            questionDiv.querySelectorAll('.option').forEach(opt => 
                opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            element.classList.add('selected');
            element.querySelector('input').checked = true;
            
            // Store answer
            answers[questionId] = optionValue;
            
            console.log('Selected:', questionId, optionValue);
        }

        // Submit quiz function
        function submitQuiz() {
            if (quizSubmitted) return;
            
            quizSubmitted = true;
            clearInterval(timerInterval);
            
            let score = 0;
            let totalQuestions = Object.keys(correctAnswers).length;
            let resultsHTML = '<h3>📊 Quiz Results</h3>';
            
            // Calculate score and generate results
            Object.keys(correctAnswers).forEach(questionId => {
                const userAnswer = answers[questionId];
                const correctAnswer = correctAnswers[questionId];
                const explanation = explanations[questionId];
                
                if (userAnswer === correctAnswer) {
                    score++;
                    resultsHTML += \`
                        <div class="result-item correct">
                            <span>Question \${questionId}: ✅ Correct</span>
                            <span>Your answer: \${userAnswer}</span>
                        </div>
                        <div class="explanation">💡 \${explanation}</div>
                    \`;
                } else {
                    resultsHTML += \`
                        <div class="result-item incorrect">
                            <span>Question \${questionId}: ❌ Incorrect</span>
                            <span>Correct answer: \${correctAnswer}</span>
                        </div>
                        <div class="explanation">💡 \${explanation}</div>
                    \`;
                }
            });
            
            const percentage = Math.round((score / totalQuestions) * 100);
            let gradeColor = percentage >= 80 ? '#28a745' : percentage >= 60 ? '#ffc107' : '#dc3545';
            
            resultsHTML += \`
                <div class="score-summary" style="background: \${gradeColor}">
                    🎯 Final Score: \${score}/\${totalQuestions} (\${percentage}%)
                    <br>
                    <span style="font-size: 18px;">
                        \${percentage >= 80 ? '🌟 Excellent!' : 
                          percentage >= 60 ? '👍 Good Job!' : '📚 Keep Studying!'}
                    </span>
                </div>
            \`;
            
            // Show results and hide form
            document.getElementById('results').innerHTML = resultsHTML;
            document.getElementById('results').style.display = 'block';
            document.getElementById('quizForm').style.display = 'none';
            document.getElementById('submitBtn').style.display = 'none';
            document.getElementById('timer').style.display = 'none';
            
            // Scroll to results
            document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
        }

        // Prevent form submission
        document.getElementById('quizForm').addEventListener('submit', function(e) {
            e.preventDefault();
            submitQuiz();
        });
    </script>
</body>
</html>`;
}

function cleanJsonFromMarkdown(content) {
  // Remove markdown code blocks
  let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
  
  // Remove any remaining code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // If it still starts with backticks, remove them
  if (cleaned.startsWith('`')) {
    cleaned = cleaned.replace(/^`+/, '').replace(/`+$/, '');
  }
  
  // Remove any leading/trailing markdown
  cleaned = cleaned.replace(/^#+\s*.*$/gm, ''); // Remove headers
  cleaned = cleaned.replace(/^\*\*.*?\*\*$/gm, ''); // Remove bold text
  cleaned = cleaned.replace(/^Here's.*?:/gm, ''); // Remove intro text
  cleaned = cleaned.replace(/^The.*?:/gm, ''); // Remove explanation text
  
  // Clean up extra whitespace
  cleaned = cleaned.trim();
  
  // Find JSON object boundaries
  const startIndex = cleaned.indexOf('{');
  const lastIndex = cleaned.lastIndexOf('}');
  
  if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
    cleaned = cleaned.substring(startIndex, lastIndex + 1);
  }
  
  return cleaned;
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

// Auto-detect topic from content
async function detectTopicFromContent(contentText, subject, classNo, model = "gpt-4o-mini") {
  try {
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const detectionPrompt = `Analyze this educational content and provide a concise topic/chapter name.

SUBJECT: ${subject}
CLASS: ${classNo}

CONTENT:
${contentText.substring(0, 2000)}

Return ONLY a short, clear topic name (3-8 words). Examples:
- "Introduction to Photosynthesis"
- "Newton's Laws of Motion"
- "Chemical Bonding and Molecular Structure"
- "The French Revolution"

YOUR RESPONSE (topic name only):`;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: "You are an expert at identifying educational topics. Return only the topic name, nothing else." },
        { role: "user", content: detectionPrompt }
      ],
      max_tokens: 50,
      temperature: 0.3,
    });

    const detectedTopic = response.choices[0].message.content.trim();
    return detectedTopic;
  } catch (error) {
    console.warn(`Topic detection failed: ${error.message}`);
    return `${subject} - Study Session`; // Fallback
  }
}

// Note: Book structures are NOT stored in vector DB anymore
// This function is kept for backward compatibility but always returns null
async function getBookStructure(bookId) {
  return null;
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
 * AI Tutoring API - Process highlighted lecture text with student question and RAG database search
 */
app.post("/api/v1/tutor/ask", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      question, 
      highlighted_text,
      book_id,
      class_no, 
      board, 
      subject,
      search_limit = 5,
      min_score = 0.3,
      model = "gpt-4o-mini",
      max_tokens = 1500
    } = req.body;

    // Validation
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUESTION", message: "Question is required" }
      });
    }

    if (!highlighted_text || highlighted_text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_HIGHLIGHTED_TEXT", message: "Highlighted text from lecture is required" }
      });
    }

    if (!book_id) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_BOOK_ID", message: "Book ID is required for RAG search" }
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

    if (!embeddingModel) {
      return res.status(503).json({
        success: false,
        error: { code: "EMBEDDING_MODEL_NOT_READY", message: "Embedding model is still loading" }
      });
    }

    console.log(`\n🎓 AI Tutor Request (Lecture + RAG):`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Book ID: ${book_id}`);
    console.log(`   Question: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`);
    console.log(`   Highlighted Text: ${highlighted_text.substring(0, 150)}${highlighted_text.length > 150 ? '...' : ''}`);

    // Step 1: Search RAG database for relevant chunks
    console.log(`   📚 Searching RAG database...`);
    const queryVector = await generateEmbedding(question);
    let searchResults = await searchVectors(queryVector, Math.min(search_limit, 10), book_id);
    
    // Filter by min_score
    if (min_score > 0) {
      searchResults = searchResults.filter(r => r.score >= min_score);
    }

    console.log(`   Found ${searchResults.length} relevant chunks from book`);

    // Step 2: Prepare content sections
    const ragChunksText = searchResults.length > 0 
      ? searchResults.map((result, index) => 
          `--- TEXTBOOK CHUNK ${index + 1} (Score: ${result.score.toFixed(3)}) ---\n${result.payload.text}`
        ).join('\n\n')
      : "No relevant textbook content found for this question.";

    // Step 3: Create enhanced tutor prompt
    const tutorPrompt = `You are an AI tutor for a learning platform helping students understand their lessons.

CONTEXT:
• Student is in Class ${class_no}, studying ${subject} under ${board} board
• Student highlighted text from their lecture and asked a question
• You have access to relevant textbook content from RAG database

TASK:
Answer the student's question by combining:
1. The highlighted lecture text (primary context)
2. Relevant textbook knowledge (supporting information)
3. Your educational guidance

RULES:
1. Start by acknowledging the highlighted text from their lecture
2. Use textbook content to provide deeper understanding and context
3. If textbook content is not relevant, focus on the highlighted text
4. Keep explanations simple and suitable for Class ${class_no}
5. Respond ONLY in valid HTML (no Markdown)
6. Use <h3>, <p>, <ul>, <li>, <strong> tags appropriately
7. If diagrams/images are mentioned, explain them clearly
8. Connect lecture content with textbook knowledge when relevant
9. Provide practical examples when helpful
10. End with a brief summary or key takeaway

--- HIGHLIGHTED LECTURE TEXT ---
${highlighted_text}

--- RELEVANT TEXTBOOK CONTENT ---
${ragChunksText}

--- STUDENT QUESTION ---
${question}

--- YOUR RESPONSE (HTML ONLY) ---`;

    // Step 4: Call OpenAI API
    try {
      const OpenAI = await import('openai').then(module => module.default);
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: "You are an expert educational AI tutor. Help students by combining their lecture content with textbook knowledge. Always respond in valid HTML format only."
          },
          {
            role: "user",
            content: tutorPrompt
          }
        ],
        max_tokens: max_tokens,
        temperature: 0.7, // Balanced temperature for educational responses
      });

      const responseTime = Date.now() - startTime;
      const aiResponse = completion.choices[0].message.content;
      const tokensUsed = completion.usage;
      
      console.log(`   ✅ Response generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

      res.json({
        success: true,
        data: {
          question: question,
          highlighted_text: highlighted_text,
          answer: aiResponse,
          search_results: {
            book_id: book_id,
            chunks_found: searchResults.length,
            min_score_used: min_score,
            chunks: searchResults.map(r => ({
              chunk_id: r.id,
              score: parseFloat(r.score.toFixed(4)),
              text_preview: r.payload.text.substring(0, 200) + '...',
              chunk_index: r.payload.chunk_index,
              file_name: r.payload.file_name
            }))
          },
          metadata: {
            class_no: class_no,
            board: board,
            subject: subject,
            model_used: model,
            tokens_used: tokensUsed,
            response_time_ms: responseTime,
            highlighted_text_length: highlighted_text.length,
            rag_chunks_used: searchResults.length,
            search_limit: search_limit,
            min_score: min_score,
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
 * POST /api/v1/assignment/generate
 * Generate assignments based on book chunks with limit and offset
 */
app.post("/api/v1/assignment/generate", async (req, res) => {
  try {
    const { 
      book_id,
      class_no, 
      board, 
      subject,
      topic,
      chunk_limit = 5,
      chunk_offset = 0,
      difficulty = "medium", // easy, medium, hard
      assignment_type = "mixed", // essay, mcq, short_answer, mixed
      question_count = 5,
      model = "gpt-4o-mini",
      max_tokens = 2000
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

    console.log(`\n📝 Assignment Generation Request:`);
    console.log(`   Book ID: ${book_id}`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Type: ${assignment_type} | Difficulty: ${difficulty}`);
    console.log(`   Chunks: ${chunk_limit} (offset: ${chunk_offset})`);

    // Get book information
    const bookInfo = await getBookInfo(book_id);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    // Get book chunks with pagination
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

    // Prepare content for assignment generation
    const contentText = selectedChunks.map((chunk, index) => {
      const actualIndex = startIndex + index + 1;
      return `Content Section ${actualIndex}:\n${chunk.text}`;
    }).join('\n\n');

    // Create assignment prompt
    const assignmentPrompt = `You are an expert educator creating document-based assignment topics for ${subject} (Class ${class_no}, ${board} Board).

CONTENT TO ANALYZE:
${contentText}

ASSIGNMENT REQUIREMENTS:
- Generate ${question_count} assignment topics/prompts based ONLY on the provided content
- These are essay/discussion topics that students will write about in detail
- Students will submit a comprehensive document addressing these topics
- Total marks: 15-20 marks distributed across topics
- Submission deadline: 5-7 days from assignment date
- Difficulty Level: ${difficulty}
- Class Level: ${class_no}
- Board: ${board}
- Subject: ${subject}
${topic ? `- Focus Area: ${topic}` : ''}

ASSIGNMENT TOPIC FORMAT:
Each topic should be structured like:
- Main Topic Statement (what to discuss/analyze)
- Focus Points (specific aspects to cover)
- Objective (what skills/understanding are being tested)

EXAMPLE FORMAT:
"Discuss the character of Mr. Chipping as a teacher. Focus: How did he change from his early days at Brookfield to his retirement? Mention his sense of humor and his relationship with his students. Objective: To test the student's grip on the novel Goodbye, Mr. Chips."

INSTRUCTIONS:
1. Create assignment topics that require analytical writing and deep thinking
2. Base topics ONLY on the provided content
3. Topics should require 300-500 words per topic for Class ${class_no}
4. Include specific focus points to guide students
5. Age-appropriate for Class ${class_no}
6. Follow ${board} board curriculum standards
7. Return response in JSON format ONLY - NO markdown, NO code blocks

RETURN ONLY THIS JSON:
{
  "assignment": {
    "title": "${subject} Assignment - Class ${class_no}",
    "assignment_type": "Document-based Essay Assignment",
    "instructions": "Write comprehensive essays addressing each topic. Support your analysis with examples from the provided study material. Submit as a single document within the deadline.",
    "total_marks": 20,
    "submission_deadline_days": 6,
    "submission_format": "Document (PDF/Word)",
    "word_count_per_topic": "400-600 words",
    "topics": [
      {
        "topic_id": 1,
        "topic_statement": "Main topic/discussion prompt based on provided content",
        "focus_points": [
          "Specific aspect 1 to cover",
          "Specific aspect 2 to cover",
          "Specific aspect 3 to cover"
        ],
        "objective": "To test student's understanding of [specific concept/skill from content]",
        "marks": 5,
        "expected_elements": [
          "Introduction with clear thesis",
          "Analysis with examples from content",
          "Logical argument development",
          "Conclusion with personal insights"
        ]
      }
    ],
    "general_instructions": [
      "Read all topics carefully before starting",
      "Base your essays only on the provided study material",
      "Use clear paragraph structure with topic sentences",
      "Support all arguments with specific examples from the content",
      "Maintain academic tone and proper grammar",
      "Each topic should be treated as a separate essay within your document"
    ],
    "evaluation_criteria": [
      "Content knowledge and understanding (40%)",
      "Analysis and critical thinking (30%)",
      "Use of examples from study material (20%)",
      "Writing clarity and organization (10%)"
    ]
  }
}`;

    console.log(`   Generating assignment topics from ${selectedChunks.length} chunks...`);

    // Call OpenAI API
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
          content: `You are an expert educator specializing in ${subject} for ${board} board. Generate assignment topics in JSON format only. Return ONLY valid JSON without any markdown formatting, code blocks, or extra text. Follow the exact structure provided.`
        },
        {
          role: "user",
          content: assignmentPrompt
        }
      ],
      max_tokens: max_tokens,
      temperature: 0.4,
    });

    const responseTime = Date.now() - startTime;
    const assignmentContent = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    try {
      // Clean and parse the JSON response
      const cleanedContent = cleanJsonFromMarkdown(assignmentContent);
      const assignmentData = JSON.parse(cleanedContent);
      
      console.log(`   ✓ Assignment topics generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

      res.json({
        success: true,
        data: {
          assignment: assignmentData.assignment,
          metadata: {
            assignment_id: generateUUID(),
            book_id: book_id,
            book_title: bookInfo.file_name,
            class_no: class_no,
            board: board,
            subject: subject,
            focus_area: topic || "Generated from book content",
            difficulty: difficulty,
            topic_count: assignmentData.assignment.topics.length,
            total_marks: assignmentData.assignment.total_marks,
            submission_deadline_days: assignmentData.assignment.submission_deadline_days,
            assignment_type: "essay_topics",
            word_count_per_topic: assignmentData.assignment.word_count_per_topic,
            chunks_used: {
              total_available: totalChunks,
              used_count: selectedChunks.length,
              start_index: startIndex + 1,
              end_index: endIndex,
              offset: chunk_offset,
              limit: chunk_limit
            },
            generation_settings: {
              model_used: model,
              max_tokens: max_tokens,
              topics_requested: question_count,
              tokens_used: tokensUsed,
              response_time_ms: responseTime
            },
            created_at: new Date().toISOString()
          }
        }
      });

    } catch (parseError) {
      console.error("Failed to parse assignment JSON:", parseError);
      res.status(500).json({
        success: false,
        error: { code: "JSON_PARSE_ERROR", message: "Failed to parse generated assignment" },
        raw_response: assignmentContent
      });
    }

  } catch (err) {
    console.error("Assignment generation error:", err);
    
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
      error: { code: "ASSIGNMENT_GENERATION_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/quiz/generate
 * Generate quiz/test from book chunks
 */
app.post("/api/v1/quiz/generate", async (req, res) => {
  try {
    const { 
      book_id,
      class_no, 
      board, 
      subject,
      topic,
      chunk_limit = 3,
      chunk_offset = 0,
      difficulty = "medium",
      question_count = 10,
      quiz_type = "mcq", // mcq, true_false, mixed
      model = "gpt-4o-mini",
      max_tokens = 2500
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

    console.log(`\n🧪 Quiz Generation Request:`);
    console.log(`   Book ID: ${book_id}`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Type: ${quiz_type} | Questions: ${question_count}`);

    // Get book chunks
    const bookInfo = await getBookInfo(book_id);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    const allChunks = await getBookChunks(book_id);
    const selectedChunks = allChunks.slice(chunk_offset, chunk_offset + chunk_limit);

    const contentText = selectedChunks.map((chunk, index) => 
      `Section ${index + 1}:\n${chunk.text}`
    ).join('\n\n');

    const quizPrompt = `Create a ${quiz_type} quiz based ONLY on the provided content.

CONTENT:
${contentText}

REQUIREMENTS:
- Subject: ${subject} (Class ${class_no}, ${board} Board)
- Questions: ${question_count}
- Question Types: ${quiz_type}
- Difficulty: ${difficulty}
${topic ? `- Focus Topic: ${topic}` : ''}

QUESTION TYPE FORMATS:
1. Multiple Choice (mcq): 4 options with letters A, B, C, D
2. True/False (true_false): Only True or False options
3. Short Answer (short_answer): No options, just correct answer text
4. Mixed (mixed): Combination of all types

RULES:
1. Base questions ONLY on provided content
2. Return ONLY valid JSON (no markdown, no HTML)
3. Determine appropriate time limit (15-60 minutes)
4. Include detailed explanations for each answer
5. For mixed quizzes, use variety of question types

RETURN ONLY THIS JSON:
{
  "quiz": {
    "title": "${subject} Quiz - Class ${class_no}",
    "instructions": "Read each question carefully and provide your answer.",
    "time_limit": 30,
    "total_marks": ${question_count},
    "questions": [
      {
        "question_id": 1,
        "type": "mcq",
        "question": "Question text based on content",
        "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
        "correct_answer": "A",
        "explanation": "Detailed explanation of correct answer",
        "marks": 1
      },
      {
        "question_id": 2,
        "type": "true_false",
        "question": "Statement to be evaluated as true or false",
        "options": ["True", "False"],
        "correct_answer": "True",
        "explanation": "Explanation of why this is true/false",
        "marks": 1
      },
      {
        "question_id": 3,
        "type": "short_answer",
        "question": "Question requiring brief written answer",
        "options": [],
        "correct_answer": "Expected answer text",
        "explanation": "Key points that should be in the answer",
        "marks": 1
      }
    ]
  }
}

Generate exactly ${question_count} questions based on quiz type "${quiz_type}".`;

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
          content: `You are a quiz generator for ${board} board ${subject}. Generate JSON format quizzes only. Return ONLY valid JSON without markdown formatting or code blocks.`
        },
        {
          role: "user",
          content: quizPrompt
        }
      ],
      max_tokens: max_tokens,
      temperature: 0.3,
    });

    const responseTime = Date.now() - startTime;
    const quizContent = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    try {
      const cleanedContent = cleanJsonFromMarkdown(quizContent);
      console.log(`   Raw AI response length: ${quizContent.length} chars`);
      console.log(`   Cleaned content length: ${cleanedContent.length} chars`);
      
      const quizData = JSON.parse(cleanedContent);
      
      console.log(`   ✓ Quiz generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

      res.json({
        success: true,
        data: {
          quiz: quizData.quiz,
          metadata: {
            quiz_id: generateUUID(),
            book_id: book_id,
            book_title: bookInfo.file_name,
            class_no: class_no,
            board: board,
            subject: subject,
            topic: topic || "Generated from content",
            quiz_type: quiz_type,
            difficulty: difficulty,
            question_count: question_count,
            ai_determined_time_limit: quizData.quiz.time_limit,
            chunks_used: selectedChunks.length,
            created_at: new Date().toISOString(),
            generation_time_ms: responseTime
          }
        }
      });

    } catch (parseError) {
      console.error("Quiz JSON parse error:", parseError);
      console.error("Raw AI response:", quizContent.substring(0, 500) + "...");
      
      res.status(500).json({
        success: false,
        error: { 
          code: "JSON_PARSE_ERROR", 
          message: "Failed to parse generated quiz",
          details: parseError.message,
          response_preview: quizContent.substring(0, 300) + "..."
        },
        raw_response: quizContent
      });
    }

  } catch (err) {
    console.error("Quiz generation error:", err);
    res.status(500).json({
      success: false,
      error: { code: "QUIZ_GENERATION_ERROR", message: err.message }
    });
  }
});

/**
 * POST /api/v1/assignment/check
 * Check and grade assignment submissions
 */
app.post("/api/v1/assignment/check", uploadAssignment.single('student_submission_file'), async (req, res) => {
  try {
    const {
      total_marks,
      assignment_title,
      assignment_questions, // JSON string of questions array
      assignment_instructions,
      model = "gpt-4o-mini",
      max_tokens = 3000
    } = req.body;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "MISSING_FILE", 
          message: "student_submission_file is required - please upload a document (PDF, DOC, DOCX, or TXT)" 
        }
      });
    }

    // Validation of required fields
    if (!total_marks || !assignment_title || !assignment_questions || !assignment_instructions) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "MISSING_REQUIRED_FIELDS", 
          message: "total_marks, assignment_title, assignment_questions, and assignment_instructions are required" 
        }
      });
    }

    let questions;
    try {
      questions = JSON.parse(assignment_questions);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUESTIONS_JSON", message: "assignment_questions must be valid JSON" }
      });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUESTIONS", message: "assignment_questions must be a non-empty array" }
      });
    }

    const totalMarksNum = parseInt(total_marks);
    if (isNaN(totalMarksNum) || totalMarksNum <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TOTAL_MARKS", message: "total_marks must be a positive number" }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: { code: "OPENAI_NOT_CONFIGURED", message: "OpenAI API key not configured" }
      });
    }

    console.log(`\n✅ Assignment Checking Request:`);
    console.log(`   Title: ${assignment_title}`);
    console.log(`   Total Marks: ${totalMarksNum}`);
    console.log(`   Questions: ${questions.length}`);
    console.log(`   File: ${req.file.originalname} (${req.file.mimetype}, ${Math.round(req.file.size/1024)}KB)`);

    // Extract text from uploaded document
    let studentSubmissionText;
    try {
      studentSubmissionText = await extractDocumentText(
        req.file.buffer, 
        req.file.mimetype, 
        req.file.originalname
      );
    } catch (extractError) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "TEXT_EXTRACTION_ERROR", 
          message: extractError.message 
        }
      });
    }

    if (!studentSubmissionText || studentSubmissionText.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "INSUFFICIENT_CONTENT", 
          message: "The submitted document appears to be empty or has insufficient content" 
        }
      });
    }

    console.log(`   Extracted text: ${studentSubmissionText.length} characters`);

    // Prepare checking prompt
    const checkingPrompt = `You are an expert teacher grading "${assignment_title}".

ASSIGNMENT DETAILS:
Title: ${assignment_title}
Instructions: ${assignment_instructions}
Total Marks: ${totalMarksNum}

ASSIGNMENT QUESTIONS:
${questions.map((q, index) => `
${index + 1}. ${q.question}
   Marks: ${q.marks || Math.floor(totalMarksNum / questions.length)}
   Expected Length: ${q.expected_length || '100-200 words'}
   Marking Criteria: ${q.marking_criteria || 'Understanding, clarity, use of examples'}
`).join('\n')}

STUDENT SUBMISSION:
${studentSubmissionText}

GRADING INSTRUCTIONS:
1. Evaluate the student's submission against each question
2. Award marks based on understanding, clarity, and completeness
3. Look for answers to each specific question in the submission
4. Give partial marks for partially correct answers
5. Calculate completion percentage based on content coverage and quality
6. Provide constructive overall feedback

RETURN ONLY THIS JSON FORMAT:
{
  "marks_obtained": 8,
  "ai_feedback": "Overall assessment of the submission with specific strengths and areas for improvement",
  "completion_percent": 85
}`;

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
          content: "You are an experienced teacher grading assignments. Be fair, constructive, and maintain academic standards. Return ONLY valid JSON without any markdown formatting or code blocks."
        },
        {
          role: "user",
          content: checkingPrompt
        }
      ],
      max_tokens: max_tokens,
      temperature: 0.3,
    });

    const responseTime = Date.now() - startTime;
    const gradingContent = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    try {
      const cleanedContent = cleanJsonFromMarkdown(gradingContent);
      const gradingData = JSON.parse(cleanedContent);
      
      // Extract the required output fields
      const marks_obtained = gradingData.marks_obtained;
      const ai_feedback = gradingData.ai_feedback;
      const completion_percent = gradingData.completion_percent;
      
      console.log(`   ✓ Assignment graded (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);
      console.log(`   Score: ${marks_obtained}/${totalMarksNum} (${completion_percent}%)`);

      // Return only the required output fields
      res.json({
        success: true,
        marks_obtained: marks_obtained,
        ai_feedback: ai_feedback,
        completion_percent: completion_percent
      });

    } catch (parseError) {
      console.error("Assignment grading JSON parse error:", parseError);
      res.status(500).json({
        success: false,
        error: { 
          code: "JSON_PARSE_ERROR", 
          message: "Failed to parse grading results",
          details: parseError.message
        }
      });
    }

  } catch (error) {
    console.error("Assignment checking error:", error);
    res.status(500).json({
      success: false,
      error: { 
        code: "CHECKING_ERROR", 
        message: error.message || "Failed to check assignment"
      }
    });
  }
});

/**
 * POST /api/v1/quiz/check
 * Check and grade quiz/test submissions
 */
app.post("/api/v1/quiz/check", async (req, res) => {
  try {
    const {
      quiz_questions, // Array of questions from quiz generation
      student_answers, // Array of {question_id, answer}
      quiz_title,
      total_marks,
      model = "gpt-4o-mini",
      max_tokens = 2500
    } = req.body;

    // Validation
    if (!quiz_questions || !Array.isArray(quiz_questions)) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_QUIZ_QUESTIONS", message: "quiz_questions array is required" }
      });
    }

    if (!student_answers || !Array.isArray(student_answers)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ANSWERS", message: "student_answers array is required" }
      });
    }

    if (!quiz_title || !total_marks) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "quiz_title and total_marks are required" }
      });
    }

    console.log(`\n🧪 Quiz Checking Request:`);
    console.log(`   Quiz: ${quiz_title}`);
    console.log(`   Questions: ${quiz_questions.length}`);
    console.log(`   Answers submitted: ${student_answers.length}`);
    console.log(`   Total marks: ${total_marks}`);

    // Grade the quiz
    const gradingResults = [];
    let scoredMarks = 0;
    const totalMarksNum = parseInt(total_marks);

    // Create answer map for quick lookup
    const answerMap = new Map();
    student_answers.forEach(ans => {
      answerMap.set(parseInt(ans.question_id), ans.answer);
    });

    // Grade each question
    for (const question of quiz_questions) {
      const studentAnswer = answerMap.get(question.question_id);
      const correctAnswer = question.correct_answer;
      const questionMarks = question.marks || 1;
      
      let isCorrect = false;
      let marksAwarded = 0;

      if (question.type === 'mcq' || question.type === 'true_false') {
        // Exact match for MCQ and True/False
        isCorrect = studentAnswer === correctAnswer;
        marksAwarded = isCorrect ? questionMarks : 0;
      } else if (question.type === 'short_answer') {
        // For short answers, we need AI to evaluate
        // For now, we'll do a simple comparison, but this could be enhanced with AI
        if (studentAnswer && correctAnswer) {
          const similarity = calculateSimilarity(studentAnswer.toLowerCase(), correctAnswer.toLowerCase());
          if (similarity > 0.7) {
            isCorrect = true;
            marksAwarded = questionMarks;
          } else if (similarity > 0.4) {
            marksAwarded = Math.ceil(questionMarks * 0.5); // Partial marks
          }
        }
      }

      scoredMarks += marksAwarded;

      gradingResults.push({
        question_id: question.question_id,
        question: question.question,
        type: question.type,
        correct_answer: correctAnswer,
        student_answer: studentAnswer || "No answer provided",
        is_correct: isCorrect,
        marks_awarded: marksAwarded,
        max_marks: questionMarks,
        explanation: question.explanation
      });
    }

    const percentage = Math.round((scoredMarks / totalMarksNum) * 100);
    const grade = getLetterGrade(percentage);

    console.log(`   ✓ Quiz graded: ${scoredMarks}/${totalMarksNum} (${percentage}%)`);

    res.json({
      success: true,
      marks_obtained: scoredMarks,
      ai_feedback: generateQuizFeedback(gradingResults, percentage),
      completion_percent: percentage,
      detailed_results: {
        total_questions: quiz_questions.length,
        correct_answers: gradingResults.filter(r => r.is_correct).length,
        grade: grade,
        question_results: gradingResults
      }
    });

  } catch (error) {
    console.error("Quiz checking error:", error);
    res.status(500).json({
      success: false,
      error: { 
        code: "QUIZ_CHECKING_ERROR", 
        message: error.message || "Failed to check quiz"
      }
    });
  }
});

/**
 * POST /api/v1/remedial/learn
 * Remedial Learning API - Analyze failed quiz, generate focused lecture, and create new quiz
 * This creates a learning loop for students who fail quizzes
 */
app.post("/api/v1/remedial/learn", async (req, res) => {
  try {
    const {
      // Quiz data
      quiz_questions, // Original quiz questions array
      student_answers, // Student's answers array [{question_id, answer}]
      quiz_title,
      
      // Metadata
      book_id,
      class_no,
      board,
      subject,
      
      // Optional settings
      passing_percentage = 60,
      chunk_limit = 5,
      chunk_offset = 0,
      new_quiz_question_count = 5,
      model = "gpt-4o-mini",
      max_tokens = 4000
    } = req.body;

    // Validation
    if (!quiz_questions || !Array.isArray(quiz_questions) || quiz_questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUIZ_QUESTIONS", message: "quiz_questions array is required and must not be empty" }
      });
    }

    if (!student_answers || !Array.isArray(student_answers)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_STUDENT_ANSWERS", message: "student_answers array is required" }
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

    console.log(`\n📚 Remedial Learning Request:`);
    console.log(`   Quiz: ${quiz_title || 'Untitled Quiz'}`);
    console.log(`   Class: ${class_no} | Board: ${board} | Subject: ${subject}`);
    console.log(`   Questions: ${quiz_questions.length} | Answers: ${student_answers.length}`);

    // Step 1: Analyze the quiz results
    const answerMap = new Map();
    student_answers.forEach(ans => {
      answerMap.set(parseInt(ans.question_id), ans.answer);
    });

    const analysisResults = {
      total_questions: quiz_questions.length,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      weak_areas: [],
      incorrect_questions: [],
      correct_questions: []
    };

    // Grade each question and identify weak areas
    for (const question of quiz_questions) {
      const studentAnswer = answerMap.get(question.question_id);
      const correctAnswer = question.correct_answer;
      
      if (!studentAnswer) {
        analysisResults.unanswered++;
        analysisResults.incorrect_questions.push({
          ...question,
          student_answer: "No answer provided",
          is_correct: false
        });
        analysisResults.weak_areas.push(question.question);
      } else if (question.type === 'mcq' || question.type === 'true_false') {
        const isCorrect = studentAnswer.toString().toUpperCase() === correctAnswer.toString().toUpperCase();
        if (isCorrect) {
          analysisResults.correct++;
          analysisResults.correct_questions.push({ ...question, student_answer: studentAnswer, is_correct: true });
        } else {
          analysisResults.incorrect++;
          analysisResults.incorrect_questions.push({ ...question, student_answer: studentAnswer, is_correct: false });
          analysisResults.weak_areas.push(question.question);
        }
      } else if (question.type === 'short_answer') {
        const similarity = calculateSimilarity(
          (studentAnswer || '').toString().toLowerCase(),
          (correctAnswer || '').toString().toLowerCase()
        );
        const isCorrect = similarity > 0.6;
        if (isCorrect) {
          analysisResults.correct++;
          analysisResults.correct_questions.push({ ...question, student_answer: studentAnswer, is_correct: true });
        } else {
          analysisResults.incorrect++;
          analysisResults.incorrect_questions.push({ ...question, student_answer: studentAnswer, is_correct: false });
          analysisResults.weak_areas.push(question.question);
        }
      }
    }

    const percentage = Math.round((analysisResults.correct / analysisResults.total_questions) * 100);
    const passed = percentage >= passing_percentage;
    const grade = getLetterGrade(percentage);

    console.log(`   Score: ${analysisResults.correct}/${analysisResults.total_questions} (${percentage}%)`);
    console.log(`   Status: ${passed ? '✅ PASSED' : '❌ FAILED - Generating remedial content...'}`);

    // If passed, return success without remedial content
    if (passed) {
      return res.json({
        success: true,
        data: {
          status: "passed",
          message: "Congratulations! You passed the quiz. No remedial learning required.",
          quiz_result: {
            score: analysisResults.correct,
            total: analysisResults.total_questions,
            percentage: percentage,
            grade: grade,
            passing_percentage: passing_percentage
          },
          detailed_results: analysisResults.correct_questions.concat(analysisResults.incorrect_questions).map(q => ({
            question_id: q.question_id,
            question: q.question,
            correct_answer: q.correct_answer,
            student_answer: q.student_answer,
            is_correct: q.is_correct,
            explanation: q.explanation
          }))
        }
      });
    }

    // Step 2: Get book content for remedial lecture (if book_id provided)
    let contentText = "";
    let bookInfo = null;
    
    if (book_id) {
      bookInfo = await getBookInfo(book_id);
      if (bookInfo) {
        const allChunks = await getBookChunks(book_id);
        const selectedChunks = allChunks.slice(chunk_offset, chunk_offset + chunk_limit);
        contentText = selectedChunks.map((chunk, index) => 
          `Section ${index + 1}:\n${chunk.text}`
        ).join('\n\n');
        console.log(`   Using ${selectedChunks.length} chunks from book for context`);
      }
    }

    // Step 3: Generate remedial lecture focused on weak areas
    const weakAreasText = analysisResults.incorrect_questions.map((q, i) => 
      `${i + 1}. Question: "${q.question}"
   Correct Answer: ${q.correct_answer}
   Student's Answer: ${q.student_answer}
   Explanation: ${q.explanation || 'Not provided'}`
    ).join('\n\n');

    const lecturePrompt = `You are an expert educator creating a REMEDIAL LECTURE for a student who failed a quiz.

STUDENT'S WEAK AREAS (Questions they got wrong):
${weakAreasText}

${contentText ? `REFERENCE MATERIAL FROM TEXTBOOK:
${contentText}` : ''}

STUDENT DETAILS:
- Class: ${class_no}
- Board: ${board}
- Subject: ${subject}
- Quiz Score: ${percentage}% (Failed - needs ${passing_percentage}% to pass)

YOUR TASK:
Create a focused remedial lecture that:
1. Addresses EACH concept the student got wrong
2. Explains the correct answers in simple terms
3. Provides clear examples and analogies
4. Builds understanding step-by-step
5. Is age-appropriate for Class ${class_no}

LECTURE REQUIREMENTS:
1. Start with encouragement - failing is part of learning
2. Break down each weak concept clearly
3. Use real-world examples
4. Include memory tips or mnemonics where helpful
5. Summarize key points at the end
6. Keep language simple and engaging

OUTPUT FORMAT:
Return ONLY valid HTML (no markdown). Use these tags:
- <h2> for main topic headings
- <h3> for subtopic headings
- <p> for paragraphs
- <ul>/<li> for bullet points
- <strong> for emphasis
- <div class="tip"> for helpful tips
- <div class="example"> for examples
- <div class="key-point"> for important concepts

Generate a comprehensive but focused lecture that will help this student understand their mistakes and learn the correct concepts.`;

    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const startTime = Date.now();
    
    // Generate remedial lecture
    console.log(`   Generating remedial lecture...`);
    const lectureCompletion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a patient, encouraging teacher who specializes in helping students learn from their mistakes. Create remedial lectures in HTML format that build confidence while teaching correct concepts.`
        },
        {
          role: "user",
          content: lecturePrompt
        }
      ],
      max_tokens: Math.floor(max_tokens * 0.6), // 60% of tokens for lecture
      temperature: 0.4,
    });

    const lectureContent = lectureCompletion.choices[0].message.content;
    const lectureTokens = lectureCompletion.usage;
    console.log(`   ✓ Lecture generated (${lectureTokens.total_tokens} tokens)`);

    // Step 4: Generate a new quiz focused on the weak areas
    console.log(`   Generating follow-up quiz...`);
    const quizPrompt = `Create a NEW quiz to test the student on the concepts they previously got wrong.

CONCEPTS TO TEST (from their failed answers):
${weakAreasText}

${contentText ? `REFERENCE MATERIAL:
${contentText}` : ''}

REQUIREMENTS:
- Subject: ${subject} (Class ${class_no}, ${board} Board)
- Questions: ${new_quiz_question_count}
- Focus: Test the SAME concepts but with DIFFERENT questions
- Make questions slightly easier to build confidence
- Include helpful hints in explanations
- Mix question types for variety

RULES:
1. Questions must test the concepts the student struggled with
2. Make questions clear and unambiguous
3. Include detailed explanations for learning
4. Return ONLY valid JSON (no markdown)

RETURN ONLY THIS JSON:
{
  "quiz": {
    "title": "Remedial Quiz - ${subject}",
    "instructions": "This quiz will help you practice the concepts you found challenging. Take your time and read each question carefully.",
    "time_limit": ${Math.max(15, new_quiz_question_count * 2)},
    "total_marks": ${new_quiz_question_count},
    "is_remedial": true,
    "questions": [
      {
        "question_id": 1,
        "type": "mcq",
        "question": "Question testing a weak concept",
        "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
        "correct_answer": "A",
        "explanation": "Detailed explanation with learning tip",
        "related_concept": "Which weak area this tests",
        "marks": 1
      }
    ]
  }
}`;

    const quizCompletion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a quiz creator specializing in remedial education. Create quizzes that test understanding while building student confidence. Return JSON format only.`
        },
        {
          role: "user",
          content: quizPrompt
        }
      ],
      max_tokens: Math.floor(max_tokens * 0.4), // 40% of tokens for quiz
      temperature: 0.3,
    });

    const quizContent = quizCompletion.choices[0].message.content;
    const quizTokens = quizCompletion.usage;
    
    let newQuiz;
    try {
      const cleanedQuiz = cleanJsonFromMarkdown(quizContent);
      newQuiz = JSON.parse(cleanedQuiz);
      console.log(`   ✓ New quiz generated (${newQuiz.quiz.questions.length} questions)`);
    } catch (parseError) {
      console.error("Failed to parse new quiz JSON:", parseError);
      newQuiz = {
        quiz: {
          title: `Remedial Quiz - ${subject}`,
          instructions: "Practice quiz generated for remedial learning.",
          time_limit: 15,
          total_marks: new_quiz_question_count,
          is_remedial: true,
          questions: [],
          error: "Quiz generation had formatting issues. Please try again."
        }
      };
    }

    const totalTime = Date.now() - startTime;
    const totalTokens = lectureTokens.total_tokens + quizTokens.total_tokens;

    console.log(`   ✓ Remedial content ready (${totalTime}ms, ${totalTokens} total tokens)`);

    // Step 5: Return comprehensive response
    res.json({
      success: true,
      data: {
        status: "failed",
        message: "Don't worry! We've created a personalized learning plan to help you improve.",
        
        // Original quiz results
        quiz_result: {
          original_quiz_title: quiz_title || "Quiz",
          score: analysisResults.correct,
          total: analysisResults.total_questions,
          percentage: percentage,
          grade: grade,
          passing_percentage: passing_percentage,
          correct_count: analysisResults.correct,
          incorrect_count: analysisResults.incorrect,
          unanswered_count: analysisResults.unanswered
        },
        
        // Analysis of mistakes
        analysis: {
          weak_areas_count: analysisResults.weak_areas.length,
          weak_concepts: analysisResults.weak_areas,
          detailed_mistakes: analysisResults.incorrect_questions.map(q => ({
            question_id: q.question_id,
            question: q.question,
            type: q.type,
            correct_answer: q.correct_answer,
            student_answer: q.student_answer,
            explanation: q.explanation
          }))
        },
        
        // Remedial lecture
        remedial_lecture: {
          content: lectureContent,
          focus_areas: analysisResults.weak_areas.slice(0, 5), // Top 5 weak areas
          estimated_reading_time_minutes: Math.ceil(lectureContent.length / 1500)
        },
        
        // New quiz for re-testing
        follow_up_quiz: newQuiz.quiz,
        
        // Metadata
        metadata: {
          remedial_id: generateUUID(),
          book_id: book_id || null,
          book_title: bookInfo?.file_name || null,
          class_no: class_no,
          board: board,
          subject: subject,
          chunks_used: book_id ? chunk_limit : 0,
          model_used: model,
          tokens_used: {
            lecture: lectureTokens,
            quiz: quizTokens,
            total: totalTokens
          },
          processing_time_ms: totalTime,
          created_at: new Date().toISOString(),
          learning_path: {
            step_1: "Review the remedial lecture focusing on your weak areas",
            step_2: "Take notes on key concepts and examples",
            step_3: "Attempt the follow-up quiz when ready",
            step_4: "If needed, repeat the process until you pass"
          }
        }
      }
    });

  } catch (err) {
    console.error("Remedial learning error:", err);
    
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
      error: { code: "REMEDIAL_LEARNING_ERROR", message: err.message }
    });
  }
});

// Helper function for string similarity
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matches = 0;
  const totalWords = Math.max(words1.length, words2.length);
  
  for (const word of words1) {
    if (words2.includes(word)) {
      matches++;
    }
  }
  
  return matches / totalWords;
}

// Helper function for letter grades
function getLetterGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 80) return 'B+';
  if (percentage >= 75) return 'B';
  if (percentage >= 70) return 'C+';
  if (percentage >= 65) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

// Helper function for quiz feedback
function generateQuizFeedback(gradingResults, percentage) {
  const correctCount = gradingResults.filter(r => r.is_correct).length;
  const totalCount = gradingResults.length;
  
  let feedback = `You scored ${correctCount} out of ${totalCount} questions correctly (${percentage}%). `;
  
  if (percentage >= 90) {
    feedback += "Excellent work! You have a strong understanding of the material.";
  } else if (percentage >= 80) {
    feedback += "Good job! You have a solid grasp of the concepts.";
  } else if (percentage >= 70) {
    feedback += "Not bad! Review the incorrect answers to improve your understanding.";
  } else if (percentage >= 60) {
    feedback += "You're on the right track, but there's room for improvement. Study the material more thoroughly.";
  } else {
    feedback += "You need to study the material more carefully. Focus on the areas where you made mistakes.";
  }
  
  return feedback;
}

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
      max_tokens = 8000,
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

    // Step 3.5: Auto-detect topic if not provided
    let detectedTopic = topic;
    let topicDetectionMethod = 'user_provided';
    
    if (!topic) {
      console.log(`   Auto-detecting topic from ${selectedChunks.length} chunks...`);
      detectedTopic = await detectTopicFromContent(contentText, subject, class_no, model);
      topicDetectionMethod = 'auto_detected';
      console.log(`   ✓ Detected topic: "${detectedTopic}"`);
    }

    // Step 4: Create comprehensive lecture prompt
    const lecturePrompt = `You are an expert educator creating a COMPREHENSIVE, DETAILED lecture for ${subject} (Class ${class_no}, ${board} Board).

TASK: Generate a complete, thorough, and engaging lecture based on the provided textbook content.

CONTENT TO COVER:
${contentText}

REQUIREMENTS:
1. Create a well-structured lecture with clear sections and multiple subsections
2. Use appropriate HTML formatting (h1, h2, h3, p, ul, ol, li, strong, em, blockquote) within <section> tags
3. Provide EXTENSIVE educational content:
   - Thorough definitions for all key terms
   - Multiple detailed examples for each major concept (minimum 2-3 per topic)
   - Step-by-step explanations for complex topics
   - Real-world applications and scenarios
   - Analogies to aid understanding
4. Make it highly engaging and age-appropriate for Class ${class_no} students
5. Strictly follow ${board} curriculum standards
6. Include detailed "Key Points to Remember" sections throughout
7. Add comparison tables where relevant
8. Provide background context and historical perspective when applicable
9. Include highlighted boxes for important formulas, principles, or definitions
10. Add comprehensive subsections with in-depth explanations
11. Ensure minimum 3000+ words of educational content

${include_visuals ? `
VISUAL ELEMENTS TO INCLUDE:
When you want to include visual elements, use this EXACT format:
- For Images: {{IMAGE: [detailed description for image generation]}}
- For Diagrams: {{DIAGRAM: [detailed description of diagram/flowchart needed]}}  
- For Charts: {{CHART: [chart type and data description]}}

Example: {{IMAGE: A detailed cross-section diagram of a plant cell showing chloroplasts, nucleus, cell wall, and vacuoles for Class ${class_no} ${subject} students}}
` : ''}

LECTURE STRUCTURE:
1. Introduction & Detailed Learning Objectives (minimum 5 objectives)
2. Main Content (organized by topics/subtopics with extensive explanations)
3. Key Concepts & Comprehensive Definitions
4. Multiple Examples & Practical Applications
5. Real-World Case Studies or Scenarios
6. Detailed Summary & Conclusion covering all major points
7. 10-15 Review Questions of varying difficulty levels

${detectedTopic ? `FOCUS TOPIC: "${detectedTopic}" - Ensure this topic gets special emphasis with extra detail and examples.` : ''}

STYLE: ${lecture_style === 'comprehensive' ? 'EXTREMELY detailed explanations with multiple examples, thorough coverage, and rich educational content' : 
         lecture_style === 'concise' ? 'Concise but complete coverage' : 
         lecture_style === 'visual' ? 'Rich visual content with clear explanations' :
         'Practical examples with real-world applications'}

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
          content: `You are an expert educator specializing in ${subject} for ${board} board. Create engaging, curriculum-aligned lectures in HTML format only. Your lectures are known for being thorough, comprehensive, and packed with detailed explanations, examples, and practical applications. Always provide extensive content that fully explores each concept. Always include visual placeholders to enhance learning.`
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
          topic: detectedTopic,
          topic_detection: {
            method: topicDetectionMethod,
            confidence: topicDetectionMethod === 'user_provided' ? 'high' : 'medium',
            original_input: topic || null
          },
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
            charts_created: visualAssets.filter(v => v.type === 'chart').length
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

/**
 * POST /api/v1/books/:bookId/generate-study-plan
 * Pre-generate topic names for all chunk ranges (for day-by-day plans)
 */
app.post("/api/v1/books/:bookId/generate-study-plan", async (req, res) => {
  try {
    const { bookId } = req.params;
    const {
      total_days,
      class_no,
      board,
      subject,
      chunks_per_day,
      model = "gpt-4o-mini"
    } = req.body;

    if (!total_days || !class_no || !board || !subject) {
      return res.status(400).json({
        success: false,
        error: { 
          code: "MISSING_FIELDS", 
          message: "total_days, class_no, board, and subject are required" 
        }
      });
    }

    console.log(`\n📅 Generating ${total_days}-day study plan for book: ${bookId}`);

    const bookInfo = await getBookInfo(bookId);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    const allChunks = await getBookChunks(bookId);
    const totalChunks = allChunks.length;

    const calculatedChunksPerDay = chunks_per_day || Math.ceil(totalChunks / total_days);
    const actualDays = Math.ceil(totalChunks / calculatedChunksPerDay);

    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Chunks per day: ${calculatedChunksPerDay}`);
    console.log(`   Actual days needed: ${actualDays}`);

    const sampleSize = Math.min(total_days, 20);
    const dayInterval = Math.max(1, Math.floor(total_days / sampleSize));

    console.log(`   Analyzing ${sampleSize} sample days to detect topics...`);

    const sampleDays = [];
    for (let day = 1; day <= total_days; day += dayInterval) {
      const offset = (day - 1) * calculatedChunksPerDay;
      const dayChunks = allChunks.slice(offset, offset + calculatedChunksPerDay);
      
      if (dayChunks.length > 0) {
        const dayContent = dayChunks.map(c => c.text).join('\n').substring(0, 1500);
        sampleDays.push({
          day: day,
          offset: offset,
          content: dayContent
        });
      }
    }

    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const planPrompt = `Analyze this ${subject} textbook for Class ${class_no} (${board} Board) and generate topic names for a ${total_days}-day study plan.

BOOK: ${bookInfo.file_name}
TOTAL CHUNKS: ${totalChunks}
CHUNKS PER DAY: ${calculatedChunksPerDay}

I'm providing sample content from different days throughout the study plan:

${sampleDays.map(d => `DAY ${d.day} (starting at chunk ${d.offset}):\n${d.content}\n`).join('\n---\n')}

TASK:
Based on these samples, extrapolate and generate topic names for ALL ${total_days} days.
The topics should:
1. Flow logically through the curriculum
2. Be specific and clear (3-8 words each)
3. Follow the content progression shown in samples
4. Cover the entire book evenly

Return ONLY valid JSON:
{
  "study_plan": [
    {"day": 1, "topic": "Introduction to Plant Biology", "estimated_chunks": ${calculatedChunksPerDay}},
    {"day": 2, "topic": "Cell Structure and Organelles", "estimated_chunks": ${calculatedChunksPerDay}},
    ...
    {"day": ${total_days}, "topic": "Review and Practice", "estimated_chunks": ${calculatedChunksPerDay}}
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an expert curriculum planner. Generate logical topic progressions for study plans. Return only valid JSON."
        },
        { role: "user", content: planPrompt }
      ],
      max_tokens: 4000,
      temperature: 0.3,
    });

    const planData = cleanJsonFromMarkdown(completion.choices[0].message.content);
    const studyPlan = JSON.parse(planData);

    console.log(`   ✓ Generated topics for ${studyPlan.study_plan.length} days`);

    const enrichedPlan = studyPlan.study_plan.map((dayPlan, index) => {
      const offset = index * calculatedChunksPerDay;
      const limit = Math.min(calculatedChunksPerDay, totalChunks - offset);
      
      return {
        day: dayPlan.day,
        topic: dayPlan.topic,
        chunk_range: {
          offset: offset,
          limit: limit,
          start_chunk: offset,
          end_chunk: offset + limit - 1
        },
        lecture_generated: false
      };
    });

    console.log(`   ✓ Study plan generated (not stored in DB)`);

    res.json({
      success: true,
      data: {
        book_id: bookId,
        book_name: bookInfo.file_name,
        total_chunks: totalChunks,
        study_plan: {
          total_days: enrichedPlan.length,
          chunks_per_day: calculatedChunksPerDay,
          days: enrichedPlan
        },
        metadata: {
          subject: subject,
          class_no: class_no,
          board: board,
          created_at: new Date().toISOString(),
          notes: "Use chunk_range.offset and chunk_range.limit when calling /lecture/generate"
        }
      }
    });

  } catch (err) {
    console.error("Study plan generation error:", err);
    res.status(500).json({
      success: false,
      error: { code: "PLAN_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/books/:bookId/study-plan
 * Retrieve existing study plan for a book
 * Note: Study plans are NOT stored in DB. This endpoint is deprecated.
 * Use POST /books/:bookId/generate-study-plan to create a new plan.
 */
app.get("/api/v1/books/:bookId/study-plan", async (req, res) => {
  return res.status(404).json({
    success: false,
    error: { 
      code: "ENDPOINT_DEPRECATED", 
      message: "Study plans are not stored. Use POST /books/:bookId/generate-study-plan to generate a new plan." 
    }
  });
});

/**
 * POST /api/v1/books/:bookId/extract-chapters
 * Extract chapters/topics from a book automatically
 */
app.post("/api/v1/books/:bookId/extract-chapters", async (req, res) => {
  try {
    const { bookId } = req.params;
    const { 
      subject,
      class_no,
      board,
      model = "gpt-4o-mini" 
    } = req.body;

    if (!subject || !class_no || !board) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_METADATA", message: "subject, class_no, and board are required" }
      });
    }

    console.log(`\n📚 Extracting chapters from book: ${bookId}`);

    const bookInfo = await getBookInfo(bookId);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    const allChunks = await getBookChunks(bookId);
    const totalChunks = allChunks.length;

    const sampleSize = Math.min(50, totalChunks);
    const interval = Math.floor(totalChunks / sampleSize);
    const sampleChunks = [];
    
    for (let i = 0; i < totalChunks; i += interval) {
      sampleChunks.push({
        index: i,
        text: allChunks[i].text
      });
    }

    const sampleText = sampleChunks.map((chunk, idx) => 
      `[Chunk ${chunk.index}]: ${chunk.text.substring(0, 300)}`
    ).join('\n\n');

    console.log(`   Analyzing ${sampleSize} sample chunks...`);

    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const extractionPrompt = `Analyze this textbook and extract the chapter structure.

BOOK: ${bookInfo.file_name}
SUBJECT: ${subject}
CLASS: ${class_no}
BOARD: ${board}
TOTAL CHUNKS: ${totalChunks}

SAMPLE CONTENT (showing chunk indices):
${sampleText}

TASK:
1. Identify major chapters in this book
2. Estimate which chunk ranges belong to each chapter
3. Provide a clear chapter structure

Return ONLY valid JSON in this format:
{
  "book_structure": {
    "total_chapters": 10,
    "chapters": [
      {
        "chapter_number": 1,
        "chapter_name": "Introduction to Photosynthesis",
        "estimated_start_chunk": 0,
        "estimated_end_chunk": 50,
        "chunk_count": 50
      }
    ]
  }
}`;

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { 
          role: "system", 
          content: "You are an expert at analyzing educational textbooks and identifying chapter structures. Return JSON only." 
        },
        { role: "user", content: extractionPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const extractedStructure = cleanJsonFromMarkdown(completion.choices[0].message.content);
    const bookStructure = JSON.parse(extractedStructure);

    console.log(`   ✓ Extracted ${bookStructure.book_structure.total_chapters} chapters (not stored in DB)`);

    res.json({
      success: true,
      data: {
        book_id: bookId,
        book_name: bookInfo.file_name,
        total_chunks: totalChunks,
        structure: bookStructure.book_structure,
        metadata: {
          subject: subject,
          class_no: class_no,
          board: board,
          extraction_method: 'ai_analysis',
          sample_chunks_analyzed: sampleSize,
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (err) {
    console.error("Chapter extraction error:", err);
    res.status(500).json({
      success: false,
      error: { code: "EXTRACTION_ERROR", message: err.message }
    });
  }
});

/**
 * GET /api/v1/books/:bookId/chapters
 * Get all chapters/topics for a book
 * Note: Chapter structures are NOT stored. This endpoint is deprecated.
 * Use POST /books/:bookId/extract-chapters to generate chapter structure.
 */
app.get("/api/v1/books/:bookId/chapters", async (req, res) => {
  return res.status(404).json({
    success: false,
    error: { 
      code: "ENDPOINT_DEPRECATED", 
      message: "Chapter structures are not stored. Use POST /books/:bookId/extract-chapters to generate chapter structure." 
    }
  });
});

/**
 * POST /api/v1/lecture/generate-by-topic
 * Generate lecture for specific chunks with auto-detected chapter and topics
 */
app.post("/api/v1/lecture/generate-by-topic", async (req, res) => {
  try {
    const {
      book_id,
      chunk_limit = 10,
      chunk_offset = 0,
      class_no,
      board,
      subject,
      include_full_chapter = false, // If true, tries to analyze broader context
      model = "gpt-4o-mini",
      max_tokens = 8000,
      include_visuals = true
    } = req.body;

    if (!book_id || !class_no || !board || !subject) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "book_id, class_no, board, and subject are required" }
      });
    }

    console.log(`\n📖 Topic-based Lecture Generation:`);
    console.log(`   Book ID: ${book_id}`);
    console.log(`   Chunks: ${chunk_limit} (offset: ${chunk_offset})`);
    console.log(`   Full Chapter Mode: ${include_full_chapter}`);

    const bookInfo = await getBookInfo(book_id);
    if (!bookInfo) {
      return res.status(404).json({
        success: false,
        error: { code: "BOOK_NOT_FOUND", message: "Book not found" }
      });
    }

    const allChunks = await getBookChunks(book_id);
    const totalChunks = allChunks.length;
    
    const startIndex = chunk_offset;
    const endIndex = Math.min(startIndex + chunk_limit, totalChunks);
    const selectedChunks = allChunks.slice(startIndex, endIndex);

    if (selectedChunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PAGINATION", message: "No chunks found for given offset and limit" }
      });
    }

    const contentText = selectedChunks.map((chunk, index) => {
      const actualIndex = startIndex + index + 1;
      return `Section ${actualIndex}:\n${chunk.text}`;
    }).join('\n\n');

    // Auto-detect chapter and topics from content
    console.log(`   Auto-detecting chapter and topics...`);
    
    const OpenAI = await import('openai').then(module => module.default);
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const analysisPrompt = `Analyze this educational content and identify the chapter/main topic it belongs to.

SUBJECT: ${subject}
CLASS: ${class_no}
BOARD: ${board}

CONTENT:
${contentText.substring(0, 3000)}

Return ONLY valid JSON in this format:
{
  "chapter_name": "Main chapter name (e.g., Photosynthesis)",
  "is_complete_chapter": ${include_full_chapter},
  "content_type": "full_chapter" or "chapter_section"
}`;

    const analysisCompletion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: "You are an expert at analyzing educational content. Return only valid JSON." },
        { role: "user", content: analysisPrompt }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const analysisData = cleanJsonFromMarkdown(analysisCompletion.choices[0].message.content);
    const contentAnalysis = JSON.parse(analysisData);

    console.log(`   ✓ Detected chapter: ${contentAnalysis.chapter_name}`);
    console.log(`   ✓ Content type: ${contentAnalysis.content_type}`);

    // Generate lecture based on analyzed content
    const lecturePrompt = `Create a COMPREHENSIVE, DETAILED lecture for this chapter content.

CHAPTER: ${contentAnalysis.chapter_name}
SUBJECT: ${subject} (Class ${class_no}, ${board} Board)

CONTENT:
${contentText}

REQUIREMENTS:
1. ${contentAnalysis.is_complete_chapter ? 'Cover the complete chapter comprehensively with extensive detail' : 'Provide in-depth coverage of the chapter content'}
2. Use clear HTML structure with <section> tags and proper headings hierarchy
3. Include detailed learning objectives at the beginning (minimum 5 objectives)
4. Provide EXTENSIVE explanations for each concept:
   - Define key terms thoroughly
   - Explain concepts in multiple ways (analogies, examples, real-world applications)
   - Include step-by-step breakdowns for complex topics
   - Add background context and historical perspective where relevant
5. Include MULTIPLE examples for each major concept (at least 2-3 examples per topic)
6. Add detailed subsections with clear explanations
7. Use bullet points, numbered lists, and structured formatting for clarity
8. Include "Key Points to Remember" sections throughout
9. Add comparison tables where applicable to show differences/similarities
10. Provide real-world applications and practical scenarios
11. Include important formulas, definitions, or principles in highlighted boxes
12. Add comprehensive chapter summary covering all major points
13. Include 10-15 practice questions of varying difficulty levels
14. Make it appropriate for ${board} board Class ${class_no} students
15. Ensure the lecture is thorough, educational, and engaging - aim for 3000+ words

${include_visuals ? `VISUAL ELEMENTS: Use {{IMAGE: description}}, {{DIAGRAM: description}}, {{CHART: description}} format when helpful to illustrate concepts` : ''}

IMPORTANT: Generate an EXTENSIVE, DETAILED lecture that thoroughly covers all aspects of the content. Do not summarize - expand and elaborate on every concept with rich explanations, examples, and educational content.`;

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are an expert ${subject} educator creating comprehensive, detailed lectures for ${board} board. Your lectures are known for being thorough, well-explained, and packed with examples and practical applications. Always provide extensive content that fully explores each concept.`
        },
        { role: "user", content: lecturePrompt }
      ],
      max_tokens: max_tokens,
      temperature: 0.4,
    });

    const responseTime = Date.now() - startTime;
    const lectureContent = completion.choices[0].message.content;
    const tokensUsed = completion.usage;

    console.log(`   ✓ Lecture generated (${responseTime}ms, ${tokensUsed.total_tokens} tokens)`);

    const processedResult = await processVisualElements(lectureContent, subject, class_no, include_visuals);

    res.json({
      success: true,
      data: {
        lecture_content: processedResult.content,
        visual_assets: processedResult.visual_assets,
        content_analysis: {
          chapter_name: contentAnalysis.chapter_name,
          content_type: contentAnalysis.content_type,
          is_complete_chapter: contentAnalysis.is_complete_chapter
        },
        chunk_info: {
          chunk_offset: chunk_offset,
          chunk_limit: chunk_limit,
          chunks_used: selectedChunks.length,
          total_chunks_in_book: totalChunks
        },
        metadata: {
          book_id: book_id,
          book_title: bookInfo.title || bookInfo.file_name,
          class_no: class_no,
          board: board,
          subject: subject,
          lecture_type: contentAnalysis.is_complete_chapter ? 'full_chapter' : 'chapter_section',
          tokens_used: tokensUsed,
          response_time_ms: responseTime,
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (err) {
    console.error("Topic lecture error:", err);
    res.status(500).json({
      success: false,
      error: { code: "LECTURE_ERROR", message: err.message }
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
