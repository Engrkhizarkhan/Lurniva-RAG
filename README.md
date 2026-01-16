# 🔍 Lurniva RAG - PDF Search System

A fully functional **Retrieval-Augmented Generation (RAG)** system that allows you to upload PDF documents, process them into vector embeddings, and perform intelligent semantic search using Qdrant vector database.

## ✨ Features

- **PDF Document Processing**: Upload and extract text from PDF files
- **Vector Embeddings**: Uses `all-MiniLM-L6-v2` model for generating 384-dimensional embeddings
- **Semantic Search**: Find relevant information using natural language queries
- **Smart Chunking**: Intelligently splits documents into overlapping chunks for better context
- **Vector Database**: Stores embeddings in Qdrant for fast similarity search
- **Modern UI**: Beautiful, responsive interface with real-time feedback
- **Statistics Dashboard**: View collection metrics and document counts

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Qdrant instance (cloud or local)

### Installation

1. **Clone or navigate to the project directory**
```bash
cd Lurniva-RAG
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure Qdrant Connection** (if needed)

Edit `server.js` line 29 to point to your Qdrant instance:
```javascript
const qdrant = new QdrantClient({
  url: "https://qdrant.lurniva.com", // Change this to your Qdrant URL
});
```

For local Qdrant:
```javascript
const qdrant = new QdrantClient({
  url: "http://localhost:6333",
});
```

4. **Start the server**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

5. **Open your browser**
```
http://localhost:3000
```

## 📖 How It Works

### 1. Document Upload & Processing

```
PDF Upload → Text Extraction → Smart Chunking → Embedding Generation → Vector Storage
```

- **Text Extraction**: Uses `pdf-parse` to extract text from PDF files
- **Smart Chunking**: Splits text into ~600 character chunks with 100 character overlap
- **Embedding**: Each chunk is converted to a 384-dimensional vector using MiniLM
- **Storage**: Vectors are stored in Qdrant with metadata (filename, chunk index, date)

### 2. Search Process

```
Query → Embedding Generation → Vector Similarity Search → Ranked Results
```

- User query is converted to the same 384-dimensional vector space
- Qdrant performs cosine similarity search
- Top 5 most relevant chunks are returned with similarity scores

## 🛠️ API Endpoints

### Upload PDF
```http
POST /upload
Content-Type: multipart/form-data

Form Data:
  pdf: <file>
```

**Response:**
```json
{
  "status": "success",
  "chunksUploaded": 42,
  "fileName": "document.pdf",
  "textLength": 25000
}
```

### Search Documents
```http
POST /search
Content-Type: application/json

{
  "query": "What is machine learning?"
}
```

**Response:**
```json
{
  "query": "What is machine learning?",
  "results": [
    {
      "text": "Machine learning is a subset of artificial intelligence...",
      "score": 0.87,
      "fileName": "ai-guide.pdf",
      "chunkIndex": 5
    }
  ]
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "modelLoaded": true,
  "timestamp": "2026-01-16T10:30:00.000Z"
}
```

### Collection Stats
```http
GET /stats
```

**Response:**
```json
{
  "collection": "books",
  "pointsCount": 150,
  "vectorSize": 384
}
```

## 📁 Project Structure

```
Lurniva-RAG/
├── server.js           # Main Express server with RAG logic
├── package.json        # Dependencies and scripts
├── public/
│   └── index.html      # Frontend UI
├── uploads/            # Temporary PDF storage (auto-created)
└── .cache/             # Transformers.js model cache (auto-created)
```

## 🔧 Configuration

### Chunk Settings
Edit in `server.js`:
```javascript
const chunks = chunkText(text, 600, 100);
// chunkText(text, chunkSize=600, overlap=100)
```

### Search Results Limit
```javascript
const searchResults = await qdrant.search(COLLECTION_NAME, {
  vector: queryVector,
  limit: 5, // Change this number
  with_payload: true,
});
```

### File Upload Limit
```javascript
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB - change as needed
});
```

## 🧠 How RAG Works

**RAG (Retrieval-Augmented Generation)** enhances AI responses by:

1. **Retrieval**: Finding relevant documents from a knowledge base
2. **Augmentation**: Providing context to the AI model
3. **Generation**: AI generates informed responses based on retrieved context

This system handles the **Retrieval** part. To add **Generation**, you can integrate with:
- OpenAI API
- Anthropic Claude
- Local LLMs (Ollama, LM Studio)
- Hugging Face Inference API

## 🚀 Future Enhancements

- [ ] Add LLM integration for answer generation
- [ ] Support multiple file formats (DOCX, TXT, etc.)
- [ ] Implement user authentication
- [ ] Add document management (delete, update)
- [ ] Support multiple collections
- [ ] Add conversation history
- [ ] Implement re-ranking for better results

## 🐛 Troubleshooting

### Model Download Issues
The embedding model (~90MB) downloads on first run. If you encounter issues:
```bash
# Clear cache and restart
rm -rf .cache
npm start
```

### Qdrant Connection Failed
Make sure your Qdrant instance is running and accessible:
```bash
# For local Qdrant with Docker:
docker run -p 6333:6333 qdrant/qdrant
```

### PDF Extraction Failed
Some PDFs may have issues:
- Ensure PDF is not password-protected
- Try converting scanned PDFs with OCR first
- Check file size (max 10MB by default)

## 📝 License

ISC

## 👤 Author

**Khizar Khan**

---

Built with ❤️ using Node.js, Express, Qdrant, and Transformers.js
