# Development Guide

This guide covers everything you need to know to contribute to, customize, or extend the Lurniva RAG system.

## 🚀 Development Setup

### Prerequisites

- **Node.js 18+**: Latest LTS recommended
- **Git**: For version control
- **Code Editor**: VS Code recommended with extensions
- **Docker**: Optional, for containerized development
- **Postman/Insomnia**: For API testing

### Local Development Environment

#### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd Lurniva-RAG

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

#### 2. Environment Configuration

```env
# Development settings
NODE_ENV=development
PORT=3000
DEBUG=lurniva-rag:*

# OpenAI (required for AI features)
OPENAI_API_KEY=your_api_key_here

# Qdrant (optional - uses in-memory if not set)
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=books_dev

# Session configuration
SESSION_SECRET=development-secret-key

# Development optimizations
MAX_FILE_SIZE=10000000  # 10MB for faster testing
```

#### 3. Start Development Server

```bash
# Start with auto-reload
npm run dev

# Start with debugging
DEBUG=* npm run dev

# Start with specific debug namespaces
DEBUG=lurniva-rag:* npm run dev
```

### Development Tools

#### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.rest-client",
    "bradlc.vscode-tailwindcss"
  ]
}
```

#### Debug Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Lurniva RAG",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server.js",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "lurniva-rag:*"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeExecutable": "node",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## 🏗 Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Lurniva RAG System                         │
├─────────────────────────────────────────────────────────────────┤
│  Express Server (server.js)                                    │
│  ├── Middleware                                                │
│  │   ├── CORS, Body Parser, Session                          │
│  │   ├── File Upload (Multer)                                │
│  │   └── Rate Limiting, Security                             │
│  ├── Routes                                                   │
│  │   ├── /api/v1/books (Document operations)                 │
│  │   ├── /api/v1/search (Search operations)                  │
│  │   ├── /api/v1/quiz (Quiz generation)                      │
│  │   ├── /api/v1/lecture (Lecture generation)                │
│  │   ├── /api/v1/tutor (AI tutoring)                         │
│  │   └── /api/v1/visual (Image generation)                   │
│  └── Core Services                                            │
│      ├── PDF Processing (pdf-parse, pdf2json)                │
│      ├── Text Chunking (sentence-aware)                      │
│      ├── Embeddings (@xenova/transformers)                   │
│      ├── Vector Storage (Qdrant/In-memory)                   │
│      └── OpenAI Integration (GPT-4, DALL-E 3)                │
└─────────────────────────────────────────────────────────────────┘
```

### Code Organization

```
Lurniva-RAG/
├── server.js              # Main application entry point
├── package.json            # Dependencies and scripts
├── .env.example           # Environment template
├── docs/                  # Documentation
├── public/                # Static assets
│   ├── admin.html         # Admin console
│   └── login.html         # Login page
├── uploads/               # Temporary file storage
├── src/                   # Source code (when refactored)
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic
│   ├── middleware/        # Express middleware
│   ├── utils/             # Utility functions
│   └── models/            # Data models
└── tests/                 # Test files
    ├── unit/              # Unit tests
    ├── integration/       # Integration tests
    └── fixtures/          # Test data
```

## 🛠 Development Workflows

### Adding New Features

#### 1. Feature Planning

Before coding:
- Define the feature requirements
- Design the API endpoints
- Plan the data flow
- Consider error handling
- Update documentation

#### 2. Implementation Steps

```bash
# Create feature branch
git checkout -b feature/new-feature-name

# Implement the feature
# 1. Add route handlers
# 2. Implement business logic
# 3. Add error handling
# 4. Write tests
# 5. Update documentation

# Test the implementation
npm test
npm run dev  # Manual testing

# Commit changes
git add .
git commit -m "feat: add new feature description"

# Push and create PR
git push origin feature/new-feature-name
```

#### 3. Code Structure Example

```javascript
// routes/newFeature.js
import express from 'express';
import { validateRequest } from '../middleware/validation.js';
import { newFeatureSchema } from '../schemas/newFeature.js';
import NewFeatureService from '../services/NewFeatureService.js';

const router = express.Router();

router.post('/new-endpoint', 
  validateRequest(newFeatureSchema),
  async (req, res) => {
    try {
      const result = await NewFeatureService.processRequest(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('New feature error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'NEW_FEATURE_ERROR',
          message: error.message
        }
      });
    }
  }
);

export default router;
```

### Testing Strategy

#### Unit Testing

```javascript
// tests/unit/services/NewFeatureService.test.js
import { jest } from '@jest/globals';
import NewFeatureService from '../../../services/NewFeatureService.js';

describe('NewFeatureService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processRequest', () => {
    it('should process valid request successfully', async () => {
      const mockData = { test: 'data' };
      const result = await NewFeatureService.processRequest(mockData);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle invalid input gracefully', async () => {
      await expect(
        NewFeatureService.processRequest(null)
      ).rejects.toThrow('Invalid input');
    });
  });
});
```

#### Integration Testing

```javascript
// tests/integration/api/newFeature.test.js
import request from 'supertest';
import app from '../../../server.js';

describe('New Feature API', () => {
  describe('POST /api/v1/new-endpoint', () => {
    it('should create new feature successfully', async () => {
      const testData = { name: 'test', value: 123 };
      
      const response = await request(app)
        .post('/api/v1/new-endpoint')
        .send(testData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should validate input parameters', async () => {
      const response = await request(app)
        .post('/api/v1/new-endpoint')
        .send({}) // Invalid input
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

### API Development

#### Adding New Endpoints

1. **Define the Route**:
```javascript
// In server.js or routes file
app.post('/api/v1/new-endpoint', async (req, res) => {
  try {
    // Implementation
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR_CODE', message: error.message }
    });
  }
});
```

2. **Add Validation**:
```javascript
import Joi from 'joi';

const newEndpointSchema = Joi.object({
  requiredField: Joi.string().required(),
  optionalField: Joi.number().optional(),
  arrayField: Joi.array().items(Joi.string()).optional()
});
```

3. **Implement Business Logic**:
```javascript
class NewFeatureService {
  static async processData(inputData) {
    // Validate input
    if (!inputData) {
      throw new Error('Input data required');
    }

    // Process data
    const result = await this.performOperation(inputData);
    
    // Return formatted result
    return {
      id: generateId(),
      data: result,
      timestamp: new Date().toISOString()
    };
  }

  static async performOperation(data) {
    // Implementation details
    return processedData;
  }
}
```

4. **Add Error Handling**:
```javascript
// Custom error classes
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

export class ProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProcessingError';
    this.code = 'PROCESSING_ERROR';
  }
}

// Error handler middleware
export function errorHandler(error, req, res, next) {
  console.error('API Error:', error);

  if (error instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }

  if (error instanceof ProcessingError) {
    return res.status(500).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
  });
}
```

## 🧪 Testing

### Test Setup

```bash
# Install test dependencies
npm install --save-dev jest supertest @jest/globals

# Create test configuration
# jest.config.js
export default {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- NewFeatureService.test.js

# Run tests matching pattern
npm test -- --grep "API"
```

### Test Categories

#### 1. Unit Tests
Test individual functions and classes in isolation.

#### 2. Integration Tests
Test API endpoints and service interactions.

#### 3. Performance Tests
Test system performance under load.

```javascript
// tests/performance/load.test.js
import { performance } from 'perf_hooks';

describe('Performance Tests', () => {
  it('should process document upload within time limit', async () => {
    const startTime = performance.now();
    
    // Perform operation
    await uploadLargeDocument();
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(30000); // 30 seconds
  });
});
```

## 🔧 Configuration Management

### Environment Variables

```javascript
// config/environment.js
export const config = {
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000
  },
  qdrant: {
    url: process.env.QDRANT_URL,
    collectionName: process.env.COLLECTION_NAME || 'books'
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000,
    allowedTypes: ['application/pdf'],
    uploadDir: process.env.UPLOAD_DIR || './uploads'
  }
};

// Validation
export function validateConfig() {
  const required = ['OPENAI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### Feature Flags

```javascript
// config/features.js
export const features = {
  aiGeneration: process.env.ENABLE_AI_GENERATION !== 'false',
  visualGeneration: process.env.ENABLE_VISUAL_GENERATION !== 'false',
  batchOperations: process.env.ENABLE_BATCH_OPERATIONS === 'true',
  adminConsole: process.env.ENABLE_ADMIN_CONSOLE !== 'false',
  rateLimit: process.env.ENABLE_RATE_LIMIT !== 'false'
};

// Feature flag middleware
export function requireFeature(featureName) {
  return (req, res, next) => {
    if (!features[featureName]) {
      return res.status(404).json({
        success: false,
        error: { code: 'FEATURE_DISABLED', message: 'Feature not available' }
      });
    }
    next();
  };
}
```

## 🔍 Debugging

### Debug Configuration

```javascript
// utils/debug.js
import debug from 'debug';

export const logger = {
  server: debug('lurniva-rag:server'),
  api: debug('lurniva-rag:api'),
  pdf: debug('lurniva-rag:pdf'),
  embedding: debug('lurniva-rag:embedding'),
  qdrant: debug('lurniva-rag:qdrant'),
  openai: debug('lurniva-rag:openai')
};

// Usage in code
logger.api('Processing search request: %O', req.body);
logger.pdf('Extracted %d pages from PDF', pageCount);
```

### Common Debug Scenarios

#### 1. PDF Processing Issues

```javascript
// Add debugging to PDF processing
logger.pdf('Starting PDF processing for file: %s', filename);

try {
  const pdfData = await pdfParse(buffer);
  logger.pdf('pdf-parse extracted %d characters', pdfData.text.length);
} catch (error) {
  logger.pdf('pdf-parse failed: %s, trying pdf2json', error.message);
  
  try {
    const pdf2jsonData = await processPdf2Json(buffer);
    logger.pdf('pdf2json extracted %d characters', pdf2jsonData.text.length);
  } catch (fallbackError) {
    logger.pdf('Both PDF methods failed: %O', {
      pdfParseError: error.message,
      pdf2jsonError: fallbackError.message
    });
  }
}
```

#### 2. Embedding Generation Debug

```javascript
// Debug embedding generation
logger.embedding('Starting embedding generation for %d chunks', chunks.length);

for (let i = 0; i < chunks.length; i++) {
  const startTime = performance.now();
  const embedding = await generateEmbedding(chunks[i].text);
  const endTime = performance.now();
  
  logger.embedding('Generated embedding for chunk %d/%d in %dms', 
    i + 1, chunks.length, Math.round(endTime - startTime));
}
```

#### 3. API Response Debug

```javascript
// Debug API responses
app.use('/api/v1', (req, res, next) => {
  logger.api('Request: %s %s %O', req.method, req.path, req.body);
  
  const originalSend = res.send;
  res.send = function(body) {
    logger.api('Response: %s %s -> %d %s', 
      req.method, req.path, res.statusCode, 
      typeof body === 'string' ? body.substring(0, 200) + '...' : 'Object');
    originalSend.call(this, body);
  };
  
  next();
});
```

## 📊 Performance Optimization

### Profiling and Monitoring

#### Performance Measurement

```javascript
// utils/performance.js
export class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
  }

  start(operation) {
    this.metrics.set(operation, performance.now());
  }

  end(operation) {
    const startTime = this.metrics.get(operation);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.delete(operation);
      return duration;
    }
    return null;
  }

  async track(operation, asyncFunction) {
    this.start(operation);
    try {
      const result = await asyncFunction();
      const duration = this.end(operation);
      logger.server('Operation %s completed in %dms', operation, Math.round(duration));
      return result;
    } catch (error) {
      this.end(operation);
      throw error;
    }
  }
}

// Usage
const tracker = new PerformanceTracker();

const embedding = await tracker.track('generate-embedding', async () => {
  return await generateEmbedding(text);
});
```

#### Memory Usage Monitoring

```javascript
// utils/memory.js
export function logMemoryUsage(operation) {
  const usage = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  
  logger.server('Memory usage after %s: RSS=%dMB, Heap=%dMB/%dMB, External=%dMB', 
    operation,
    mb(usage.rss),
    mb(usage.heapUsed),
    mb(usage.heapTotal),
    mb(usage.external)
  );
}

// Usage
logMemoryUsage('document-processing');
```

### Optimization Strategies

#### 1. Caching

```javascript
// utils/cache.js
export class SimpleCache {
  constructor(maxSize = 1000, ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
}

// Usage
const embeddingCache = new SimpleCache(500, 600000); // 10 minutes

async function getCachedEmbedding(text) {
  const key = hashString(text);
  let embedding = embeddingCache.get(key);
  
  if (!embedding) {
    embedding = await generateEmbedding(text);
    embeddingCache.set(key, embedding);
  }
  
  return embedding;
}
```

#### 2. Batching Operations

```javascript
// utils/batch.js
export class BatchProcessor {
  constructor(processor, batchSize = 10, delayMs = 100) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.delayMs = delayMs;
    this.queue = [];
    this.processing = false;
  }

  async add(item) {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      
      try {
        const results = await this.processor(batch.map(b => b.item));
        batch.forEach((b, index) => b.resolve(results[index]));
      } catch (error) {
        batch.forEach(b => b.reject(error));
      }

      if (this.queue.length > 0 && this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }

    this.processing = false;
  }
}

// Usage
const embeddingBatcher = new BatchProcessor(
  async (texts) => await generateEmbeddings(texts),
  5, // batch size
  100 // delay between batches
);
```

## 🚀 Deployment

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "http.get('http://localhost:3000/api/v1/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  lurniva-rag:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - QDRANT_URL=http://qdrant:6333
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  qdrant_data:
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run tests
      run: npm test
    
    - name: Run security audit
      run: npm audit

  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: docker build -t lurniva-rag:${{ github.sha }} .
    
    - name: Run Docker container
      run: |
        docker run -d --name test-container -p 3000:3000 \
          -e OPENAI_API_KEY=test \
          lurniva-rag:${{ github.sha }}
        sleep 10
        curl -f http://localhost:3000/api/v1/health || exit 1
```

## 📚 Contributing

### Code Style

#### ESLint Configuration

```json
{
  "env": {
    "es2022": true,
    "node": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "quotes": ["error", "single"],
    "semi": ["error", "always"],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

#### Prettier Configuration

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

### Commit Convention

Use conventional commits:

```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting changes
refactor: code refactoring
test: add or modify tests
chore: maintenance tasks
```

### Pull Request Process

1. **Fork and Branch**: Create feature branch from `develop`
2. **Implement**: Write code following style guidelines
3. **Test**: Ensure all tests pass and coverage is maintained
4. **Document**: Update documentation as needed
5. **PR**: Create detailed pull request with description
6. **Review**: Address feedback and make requested changes
7. **Merge**: Squash and merge when approved

---

## 📖 Additional Resources

- [API Documentation](../api/README.md)
- [Architecture Guide](../architecture.md)
- [Deployment Guide](../deployment/README.md)
- [Troubleshooting](../user-guide/troubleshooting.md)

---

*Happy Coding! 🚀*