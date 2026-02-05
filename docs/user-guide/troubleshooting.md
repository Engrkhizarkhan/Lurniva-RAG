# Troubleshooting Guide

This comprehensive guide helps you diagnose and resolve common issues with the Lurniva RAG system.

## 🔍 Quick Diagnostics

### System Health Check

Start with these basic checks:

```bash
# 1. Check if server is running
curl http://localhost:3000/api/v1/health

# 2. Check server logs
npm run dev  # Look for error messages

# 3. Check environment variables
echo $OPENAI_API_KEY
echo $NODE_ENV

# 4. Verify file permissions
ls -la uploads/
ls -la logs/

# 5. Check disk space
df -h
```

### Common Error Patterns

Look for these patterns in logs:

- `ECONNREFUSED`: Connection issues (API/Database)
- `ENOENT`: File not found
- `EPERM`: Permission denied
- `ENOMEM`: Out of memory
- `timeout`: Request timeouts
- `429`: Rate limiting
- `401/403`: Authentication issues

## 🚨 Server Issues

### Server Won't Start

#### Problem: Port Already in Use
```bash
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
```bash
# Find process using port 3000
lsof -i :3000
# or
netstat -tulpn | grep 3000

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Problem: Missing Dependencies
```bash
Error: Cannot find module 'express'
```

**Solutions:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Or install specific missing module
npm install express
```

#### Problem: Environment Variables Missing
```bash
Error: OPENAI_API_KEY is required
```

**Solutions:**
```bash
# Check .env file exists
ls -la .env

# Copy from template
cp .env.example .env

# Edit with your values
nano .env

# Verify environment loading
node -e "require('dotenv').config(); console.log(process.env.OPENAI_API_KEY)"
```

### Server Crashes

#### Memory Issues

**Symptoms:**
- Server crashes with "out of memory" errors
- Slow performance with large files
- High memory usage in monitoring

**Solutions:**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 server.js

# Monitor memory usage
# In development
DEBUG=lurniva-rag:memory npm run dev

# Check system memory
free -h
htop
```

**Prevention:**
```javascript
// Add memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  
  console.log(`Memory: RSS=${mb(usage.rss)}MB, Heap=${mb(usage.heapUsed)}/${mb(usage.heapTotal)}MB`);
  
  if (usage.heapUsed > 2000 * 1024 * 1024) { // 2GB
    console.warn('High memory usage detected');
  }
}, 30000);
```

#### CPU Issues

**Symptoms:**
- High CPU usage
- Slow response times
- Server becomes unresponsive

**Solutions:**
```bash
# Monitor CPU usage
top
htop

# Check Node.js process
ps aux | grep node

# Reduce concurrent processing
# Edit server configuration to limit concurrent operations
```

## 📄 PDF Processing Issues

### PDF Upload Failures

#### Problem: File Too Large
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds maximum size"
  }
}
```

**Solutions:**
```bash
# Increase upload limit in .env
MAX_FILE_SIZE=100000000  # 100MB

# Check nginx configuration (if using)
client_max_body_size 100M;

# Verify disk space
df -h
```

#### Problem: Invalid PDF Format
```json
{
  "success": false,
  "error": {
    "code": "EXTRACTION_FAILED",
    "message": "Could not extract text from PDF"
  }
}
```

**Solutions:**
1. **Check PDF Quality:**
```bash
# Test PDF with standard tools
pdftotext test.pdf output.txt
```

2. **Use Different PDF:**
- Ensure PDF contains actual text (not just images)
- Try with a simple text-based PDF first
- Check if PDF is password-protected

3. **Debug Processing:**
```javascript
// Add debug logging in PDF processing
console.log('PDF buffer size:', buffer.length);
console.log('PDF extraction method:', method);
```

### Text Extraction Issues

#### Problem: Empty Text Extracted
```bash
Extracted text is empty or very short
```

**Solutions:**
1. **Check PDF Content:**
```javascript
// Debug extracted text
console.log('Extracted text length:', text.length);
console.log('First 200 characters:', text.substring(0, 200));
```

2. **Try OCR for Image-Based PDFs:**
```bash
# Install Tesseract for OCR
sudo apt-get install tesseract-ocr

# Convert PDF to image and OCR
pdftoppm -png document.pdf page
tesseract page-1.png output
```

#### Problem: Garbled Text
```bash
Text contains strange characters or encoding issues
```

**Solutions:**
```javascript
// Add encoding detection
import { detect } from 'chardet';

const encoding = detect(buffer);
console.log('Detected encoding:', encoding);

// Handle different encodings
const text = buffer.toString(encoding || 'utf8');
```

## 🔍 Search Issues

### No Search Results

#### Problem: Search Returns Empty Results
```json
{
  "success": true,
  "data": {
    "chunks": []
  }
}
```

**Solutions:**
1. **Check Document Processing:**
```bash
# Verify document was processed
curl -X POST http://localhost:3000/api/v1/books/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 10}'
```

2. **Debug Vector Storage:**
```javascript
// Add debug logging
console.log('Vector store type:', vectorStore.constructor.name);
console.log('Total documents in store:', await vectorStore.getDocumentCount());
```

3. **Test with Simple Queries:**
```javascript
// Try basic keyword searches first
const simpleQuery = "the";  // Common word
const results = await search(simpleQuery);
console.log('Simple query results:', results.length);
```

#### Problem: Low Relevance Scores
```bash
Search results have very low similarity scores (< 0.3)
```

**Solutions:**
1. **Improve Query Specificity:**
```javascript
// Instead of: "learning"
// Try: "machine learning algorithms"
// Or: "supervised learning methods"
```

2. **Check Embedding Quality:**
```javascript
// Test embedding generation
const testText = "machine learning";
const embedding = await generateEmbedding(testText);
console.log('Embedding dimensions:', embedding.length);
console.log('Embedding sample:', embedding.slice(0, 5));
```

### Search Performance Issues

#### Problem: Slow Search Responses
```bash
Search requests taking > 5 seconds
```

**Solutions:**
1. **Check Vector Database:**
```bash
# Test Qdrant directly
curl http://localhost:6333/collections/books

# Check collection stats
curl http://localhost:6333/collections/books/cluster
```

2. **Optimize Query Parameters:**
```javascript
// Reduce search limit
const results = await search(query, { limit: 5 });

// Use more specific queries
const query = "specific technical term";  // Better than "general topic"
```

3. **Monitor Performance:**
```javascript
// Add timing to search operations
console.time('search');
const results = await search(query);
console.timeEnd('search');
```

## 🤖 AI Features Issues

### OpenAI API Problems

#### Problem: API Key Issues
```json
{
  "success": false,
  "error": {
    "code": "OPENAI_API_ERROR",
    "message": "Invalid API key"
  }
}
```

**Solutions:**
1. **Verify API Key:**
```bash
# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check key format (should start with 'sk-')
echo $OPENAI_API_KEY | head -c 10
```

2. **Check Account Status:**
- Verify OpenAI account has credits
- Check rate limits and usage quotas
- Ensure API key has required permissions

#### Problem: Rate Limiting
```json
{
  "error": {
    "message": "Rate limit reached",
    "type": "requests"
  }
}
```

**Solutions:**
1. **Implement Retry Logic:**
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

2. **Monitor Usage:**
```javascript
// Track API usage
let apiCallCount = 0;
let lastReset = Date.now();

function trackAPICall() {
  apiCallCount++;
  if (Date.now() - lastReset > 60000) { // Reset every minute
    console.log(`API calls in last minute: ${apiCallCount}`);
    apiCallCount = 0;
    lastReset = Date.now();
  }
}
```

### Content Generation Issues

#### Problem: Poor Quality Generated Content
```bash
Generated quiz questions are irrelevant or incorrect
```

**Solutions:**
1. **Improve Prompts:**
```javascript
// More specific prompts
const prompt = `
Based on the following document content about ${topic}:
${relevantText}

Generate 5 multiple-choice questions that:
- Test understanding of key concepts
- Are appropriate for ${targetAudience} level
- Include plausible distractors
- Cover different aspects of the content
`;
```

2. **Provide More Context:**
```javascript
// Include more relevant chunks
const context = searchResults
  .slice(0, 5)  // Top 5 results
  .map(r => r.text)
  .join('\n\n');
```

#### Problem: Content Generation Timeouts
```bash
AI generation requests timing out after 60 seconds
```

**Solutions:**
1. **Increase Timeout:**
```javascript
// Increase OpenAI timeout
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000  // 2 minutes
});
```

2. **Reduce Content Size:**
```javascript
// Limit input content
const maxContentLength = 8000;  // characters
const trimmedContent = content.substring(0, maxContentLength);
```

## 🎯 Performance Issues

### Slow Response Times

#### Problem: API Responses > 5 Seconds
**Diagnosis:**
```javascript
// Add timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {  // Log slow requests
      console.log(`Slow request: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});
```

**Solutions:**
1. **Optimize Database Queries:**
```javascript
// Use connection pooling
// Implement query optimization
// Add database indexes
```

2. **Add Caching:**
```javascript
// Simple in-memory cache
const cache = new Map();

async function getCachedResult(key, generator) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await generator();
  cache.set(key, result);
  
  // Auto-expire after 5 minutes
  setTimeout(() => cache.delete(key), 5 * 60 * 1000);
  
  return result;
}
```

#### Problem: High Memory Usage
**Diagnosis:**
```bash
# Monitor memory usage
watch -n 5 "ps aux --sort=-%mem | head -10"

# Check Node.js memory
node -e "console.log(process.memoryUsage())"
```

**Solutions:**
1. **Optimize Data Structures:**
```javascript
// Use streams for large files
const stream = fs.createReadStream(filePath);
stream.on('data', (chunk) => {
  // Process chunk by chunk
});

// Clear large variables
let largeData = null;  // Help GC
```

2. **Garbage Collection:**
```javascript
// Force garbage collection (development only)
if (global.gc && process.env.NODE_ENV === 'development') {
  global.gc();
}
```

## 🔐 Authentication Issues

### Session Problems

#### Problem: Sessions Not Persisting
```bash
User gets logged out immediately after login
```

**Solutions:**
1. **Check Session Configuration:**
```javascript
// Ensure secure settings are appropriate for environment
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // Only HTTPS in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));
```

2. **Check HTTPS Configuration:**
```bash
# For development (HTTP)
SESSION_SECURE=false

# For production (HTTPS)
SESSION_SECURE=true
```

#### Problem: CORS Issues with Authentication
```bash
Credentials not sent with cross-origin requests
```

**Solutions:**
```javascript
// Server CORS configuration
app.use(cors({
  origin: true,
  credentials: true  // Allow credentials
}));

// Client configuration
fetch('/api/v1/endpoint', {
  credentials: 'include'  // Include cookies
});
```

## 🛠 Development Issues

### Hot Reload Problems

#### Problem: Changes Not Reflected
```bash
Code changes not appearing in development server
```

**Solutions:**
```bash
# Restart development server
npm run dev

# Clear Node.js cache
rm -rf node_modules/.cache

# Check file watchers
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Testing Issues

#### Problem: Tests Failing in CI
```bash
Tests pass locally but fail in CI environment
```

**Solutions:**
1. **Check Environment Differences:**
```bash
# Compare Node versions
node --version

# Check environment variables
env | grep NODE

# Verify test database/dependencies
```

2. **Add Debug Output:**
```javascript
// Add debug info to tests
beforeAll(() => {
  console.log('Node version:', process.version);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Memory:', process.memoryUsage());
});
```

## 📊 Monitoring and Debugging

### Debug Mode

Enable comprehensive debugging:
```bash
# Enable all debug output
DEBUG=* npm run dev

# Enable specific modules
DEBUG=lurniva-rag:* npm run dev

# Enable specific features
DEBUG=lurniva-rag:pdf,lurniva-rag:openai npm run dev
```

### Logging Configuration

```javascript
// Enhanced logging
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5
    })
  ]
});

// Add console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}
```

### Health Monitoring

```javascript
// Enhanced health check
app.get('/api/v1/health/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    
    // Application-specific checks
    checks: {
      database: checkDatabaseConnection(),
      openai: checkOpenAIConnection(),
      storage: checkStorageHealth(),
      embedding_model: !!global.embeddingPipeline
    }
  };
  
  const allHealthy = Object.values(health.checks).every(check => check);
  health.status = allHealthy ? 'healthy' : 'degraded';
  
  res.status(allHealthy ? 200 : 503).json(health);
});
```

## 📞 Getting Help

### Before Asking for Help

1. **Check Logs:** Review server logs for error messages
2. **Test Isolation:** Reproduce with minimal example
3. **Environment:** Note your OS, Node.js version, dependencies
4. **Recent Changes:** What changed before the issue appeared

### Information to Include

When reporting issues, include:

```bash
# System information
node --version
npm --version
cat package.json | grep version
echo $NODE_ENV

# Error details
tail -50 logs/combined.log
tail -20 logs/error.log

# Health status
curl http://localhost:3000/api/v1/health

# Memory/CPU usage
ps aux | grep node
free -h
```

### Support Channels

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and help
- **Documentation**: Check all relevant docs first
- **Community**: Join community discussions

### Creating Bug Reports

Use this template:

```markdown
## Bug Description
Clear description of what's wrong.

## To Reproduce
1. Step one
2. Step two
3. Error appears

## Expected Behavior
What should happen instead.

## Environment
- OS: [Ubuntu 20.04]
- Node.js: [18.15.0]
- Lurniva RAG Version: [1.0.0]

## Logs
```
[Paste relevant log entries]
```

## Additional Context
Any other relevant information.
```

---

## 📚 Quick Reference

### Essential Commands

```bash
# Health check
curl http://localhost:3000/api/v1/health

# View logs
tail -f logs/combined.log

# Restart server
pm2 restart lurniva-rag

# Memory usage
ps aux --sort=-%mem | head -5

# Check port usage
lsof -i :3000

# Test environment
node -e "require('dotenv').config(); console.log('OpenAI Key:', !!process.env.OPENAI_API_KEY)"
```

### Common File Locations

```
Project Root/
├── logs/                  # Application logs
├── uploads/               # Temporary file uploads
├── .env                   # Environment variables
├── package.json           # Dependencies
└── node_modules/          # Installed packages
```

### Emergency Recovery

If everything breaks:

```bash
# Nuclear option - complete reset
git clean -fdx
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

---

*Still having issues? Don't hesitate to reach out for help! 🤝*