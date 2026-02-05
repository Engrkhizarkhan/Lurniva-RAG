# Getting Started with Lurniva RAG

This guide will help you set up and start using the Lurniva RAG system quickly. Whether you're integrating it into an existing application or running it standalone, this guide covers everything you need to know.

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 18 or higher** - [Download here](https://nodejs.org/)
- **OpenAI API Key** - Required for AI features [Get one here](https://platform.openai.com/)
- **Git** - For cloning the repository
- **4GB+ RAM** - Recommended for optimal performance

## 🚀 Quick Installation

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd Lurniva-RAG
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create your environment configuration:

```bash
cp .env.example .env
```

Edit the `.env` file with your settings:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# OpenAI Configuration (Required for AI features)
OPENAI_API_KEY=your_openai_api_key_here

# Qdrant Configuration (Optional - uses in-memory storage if not provided)
QDRANT_URL=your_qdrant_url
COLLECTION_NAME=books

# Session Configuration
SESSION_SECRET=your_secure_session_secret

# Upload Configuration
MAX_FILE_SIZE=50000000  # 50MB
UPLOAD_DIR=./uploads
```

### 4. Start the Server

**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

The server will start at `http://localhost:3000`

## ✅ Verify Installation

### Check System Health

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "embedding_model_loaded": true,
  "storage_backend": "in-memory",
  "version": "1.0.0",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

### Test Document Upload

```bash
curl -X POST \
  http://localhost:3000/api/v1/books/upload \
  -F "pdf=@/path/to/your/test.pdf"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "book_id": "book_1737158400000_a1b2c3d4",
    "file_name": "test.pdf",
    "chunk_count": 45,
    "page_count": 12,
    "processing_time": "3.2s"
  }
}
```

## 📚 First Steps

### 1. Upload Your First Document

Use the admin console or API to upload a PDF:

**Admin Console:** Visit `http://localhost:3000/admin` (default login: admin/admin)

**API Upload:**
```javascript
const formData = new FormData();
formData.append('pdf', fileInput.files[0]);

const response = await fetch('/api/v1/books/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Book ID:', result.data.book_id);
```

### 2. Search Your Document

```javascript
const response = await fetch('/api/v1/books/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "What is the main topic?",
    book_id: "book_1737158400000_a1b2c3d4", // Optional: search specific book
    limit: 5
  })
});

const results = await response.json();
console.log('Search results:', results.data.chunks);
```

### 3. Generate Educational Content

**Create a Quiz:**
```javascript
const response = await fetch('/api/v1/quiz/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    book_id: "book_1737158400000_a1b2c3d4",
    question_count: 5,
    difficulty: "medium",
    question_types: ["multiple_choice", "true_false"]
  })
});
```

**Generate a Lecture:**
```javascript
const response = await fetch('/api/v1/lecture/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    book_id: "book_1737158400000_a1b2c3d4",
    topic: "Introduction to the main concepts",
    target_audience: "university",
    include_images: true
  })
});
```

## 🛠 Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `OPENAI_API_KEY` | OpenAI API key for AI features | - | Yes* |
| `QDRANT_URL` | Qdrant database URL | - | No |
| `COLLECTION_NAME` | Vector collection name | books | No |
| `SESSION_SECRET` | Session encryption secret | - | Yes |
| `MAX_FILE_SIZE` | Maximum upload size (bytes) | 50MB | No |

*Required for AI features (quiz generation, lectures, tutoring, etc.)

### Storage Backends

**In-Memory (Default):**
- Good for: Development, testing, small deployments
- Limitations: Data lost on restart, limited scalability

**Qdrant (Recommended for Production):**
- Good for: Production, large datasets, persistence
- Requirements: Qdrant server instance
- Setup: Set `QDRANT_URL` in environment

### Performance Tuning

**For Development:**
```env
NODE_ENV=development
MAX_FILE_SIZE=10000000  # 10MB limit
```

**For Production:**
```env
NODE_ENV=production
MAX_FILE_SIZE=50000000  # 50MB limit
QDRANT_URL=https://your-qdrant-instance.com
```

## 🔧 Troubleshooting

### Common Issues

#### 1. "Model not ready" Error
**Problem:** Embedding model is still loading
**Solution:** Wait 30-60 seconds after server start, check `/api/v1/health`

#### 2. Large PDF Processing Fails
**Problem:** Memory or timeout issues with large files
**Solutions:**
- Increase `MAX_FILE_SIZE`
- Use Qdrant instead of in-memory storage
- Ensure sufficient RAM (4GB+)

#### 3. OpenAI API Errors
**Problem:** AI features return errors
**Solutions:**
- Verify `OPENAI_API_KEY` is correct
- Check OpenAI account credits
- Ensure API key has required permissions

#### 4. Upload Directory Issues
**Problem:** File upload fails
**Solutions:**
```bash
# Create uploads directory
mkdir uploads
chmod 755 uploads

# Or set custom directory
export UPLOAD_DIR=/path/to/writable/directory
```

### Debug Mode

Enable debug logging:
```bash
DEBUG=lurniva-rag:* npm run dev
```

### Health Checks

Monitor system status:
```bash
# Check if server is responsive
curl http://localhost:3000/api/v1/health

# Detailed system info (admin access required)
curl -b "session-cookie" http://localhost:3000/api/v1/admin/stats
```

## 🔐 Security Considerations

### Development Environment
- Use strong session secrets
- Don't commit API keys to version control
- Limit file upload sizes

### Production Environment
- Use HTTPS only
- Implement rate limiting
- Set up proper firewall rules
- Use secure session management
- Regular security updates

## 📖 Next Steps

Now that you have Lurniva RAG running:

1. **Read the [API Documentation](api/README.md)** - Complete API reference
2. **Check the [User Guide](user-guide/README.md)** - Detailed usage instructions  
3. **Review [Architecture](architecture.md)** - Understand the system design
4. **See [Deployment Guide](deployment/README.md)** - Production deployment
5. **Join our Community** - Get support and contribute

## 🆘 Getting Help

### Documentation
- [API Reference](api/README.md)
- [Troubleshooting Guide](user-guide/troubleshooting.md)
- [FAQ](user-guide/FAQ.md)

### Support Channels
- **Issues:** GitHub Issues for bugs and feature requests
- **Discussions:** GitHub Discussions for questions
- **Email:** support@lurniva.com for enterprise support

---

**Quick Reference:**
- **Health Check:** `GET /api/v1/health`
- **Admin Console:** `http://localhost:3000/admin`
- **API Base:** `http://localhost:3000/api/v1`
- **Default Port:** 3000

*Happy Learning! 🎓*