# Contributing to Lurniva RAG

Thank you for your interest in contributing to Lurniva RAG! This guide will help you get started with contributing to the project.

## 🎯 Ways to Contribute

### Code Contributions
- 🐛 **Bug Fixes**: Fix reported issues
- ✨ **New Features**: Implement new functionality
- 🔧 **Improvements**: Enhance existing features
- 📝 **Documentation**: Improve documentation
- 🧪 **Tests**: Add or improve test coverage

### Non-Code Contributions
- 🐛 **Bug Reports**: Report issues you encounter
- 💡 **Feature Requests**: Suggest new features
- 📚 **Documentation**: Improve guides and examples
- 🎨 **UI/UX**: Improve user interface and experience
- 🌍 **Community**: Help others in discussions

## 🚀 Getting Started

### Prerequisites

Before contributing, make sure you have:
- **Node.js 18+** installed
- **Git** for version control
- **GitHub account** for submitting contributions
- **Code editor** (VS Code recommended)
- Basic understanding of **JavaScript/Node.js**

### Development Setup

1. **Fork the Repository**
   ```bash
   # Go to GitHub and fork the repository
   # Then clone your fork
   git clone https://github.com/your-username/Lurniva-RAG.git
   cd Lurniva-RAG
   ```

2. **Add Upstream Remote**
   ```bash
   git remote add upstream https://github.com/original-owner/Lurniva-RAG.git
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Verify Setup**
   ```bash
   npm test
   npm run dev
   ```

## 🔄 Development Workflow

### Branch Strategy

We use **Git Flow** with these branches:
- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical production fixes

### Creating a Contribution

1. **Sync with Upstream**
   ```bash
   git checkout develop
   git pull upstream develop
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-description
   ```

3. **Make Changes**
   - Write your code
   - Follow coding standards
   - Add tests
   - Update documentation

4. **Test Your Changes**
   ```bash
   npm test
   npm run lint
   npm run dev  # Manual testing
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

### Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic changes)
- `refactor`: Code refactoring
- `test`: Adding/modifying tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(api): add quiz generation endpoint
fix(pdf): handle malformed PDF files gracefully
docs(readme): update installation instructions
test(search): add integration tests for search API
```

## 📝 Coding Standards

### JavaScript Style Guide

Follow these conventions:

```javascript
// Use ES6+ features
import { someFunction } from 'module';
export default class MyClass {}

// Use const/let, not var
const API_BASE_URL = 'http://localhost:3000/api/v1';
let currentUser = null;

// Use template literals
const message = `Hello ${name}, welcome to Lurniva RAG!`;

// Use arrow functions for short callbacks
const results = items.map(item => item.name);

// Use async/await over Promises
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

// Use descriptive names
function calculateDocumentEmbeddings(textChunks) {
  // Implementation
}

// Add JSDoc comments for public functions
/**
 * Generates quiz questions from document content
 * @param {string} bookId - The document identifier
 * @param {Object} options - Quiz generation options
 * @param {number} options.questionCount - Number of questions
 * @param {string} options.difficulty - Difficulty level
 * @returns {Promise<Object>} Generated quiz data
 */
async function generateQuiz(bookId, options = {}) {
  // Implementation
}
```

### API Design Principles

```javascript
// Consistent response format
{
  "success": true,
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2026-02-05T10:30:00.000Z",
    "version": "1.0.0"
  }
}

// Error response format
{
  "success": false,
  "error": {
    "code": "SPECIFIC_ERROR_CODE",
    "message": "Human-readable error message",
    "details": {} // Optional additional info
  }
}

// Use proper HTTP status codes
// 200: Success
// 201: Created
// 400: Bad Request (client error)
// 401: Unauthorized
// 403: Forbidden
// 404: Not Found
// 429: Too Many Requests
// 500: Internal Server Error

// Validate input
import Joi from 'joi';

const schema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(0).max(150).optional()
});
```

### Error Handling

```javascript
// Create custom error classes
export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

// Use try-catch blocks consistently
async function processDocument(file) {
  try {
    validateFile(file);
    const result = await extractText(file);
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw validation errors
    }
    
    // Wrap unexpected errors
    throw new ProcessingError(
      `Document processing failed: ${error.message}`
    );
  }
}

// Log errors appropriately
import { logger } from '../utils/logger.js';

try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed:', {
    error: error.message,
    stack: error.stack,
    context: { userId, documentId }
  });
  throw error;
}
```

## 🧪 Testing Guidelines

### Test Structure

```javascript
// tests/unit/services/QuizService.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import QuizService from '../../../src/services/QuizService.js';

describe('QuizService', () => {
  let quizService;

  beforeEach(() => {
    quizService = new QuizService();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('generateQuiz', () => {
    it('should generate quiz with correct number of questions', async () => {
      const options = { questionCount: 5, difficulty: 'medium' };
      const result = await quizService.generateQuiz('book_123', options);
      
      expect(result).toBeDefined();
      expect(result.questions).toHaveLength(5);
      expect(result.difficulty).toBe('medium');
    });

    it('should throw error for invalid book ID', async () => {
      await expect(
        quizService.generateQuiz('invalid_id')
      ).rejects.toThrow('Book not found');
    });

    it('should use default options when not provided', async () => {
      const result = await quizService.generateQuiz('book_123');
      
      expect(result.questions).toHaveLength(10); // Default count
      expect(result.difficulty).toBe('medium'); // Default difficulty
    });
  });
});
```

### Integration Tests

```javascript
// tests/integration/api/quiz.test.js
import request from 'supertest';
import app from '../../../server.js';

describe('Quiz API Integration', () => {
  let bookId;

  beforeAll(async () => {
    // Setup test data
    const uploadResponse = await request(app)
      .post('/api/v1/books/upload')
      .attach('pdf', 'tests/fixtures/sample.pdf');
    
    bookId = uploadResponse.body.data.book_id;
  });

  describe('POST /api/v1/quiz/generate', () => {
    it('should generate quiz successfully', async () => {
      const response = await request(app)
        .post('/api/v1/quiz/generate')
        .send({
          book_id: bookId,
          question_count: 3,
          difficulty: 'easy'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.questions).toHaveLength(3);
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/api/v1/quiz/generate')
        .send({
          question_count: -1 // Invalid
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

### Test Requirements

- **Unit Tests**: Test individual functions/classes
- **Integration Tests**: Test API endpoints
- **Coverage**: Maintain >80% code coverage
- **Fixtures**: Use realistic test data
- **Mocks**: Mock external dependencies
- **Assertions**: Clear, specific assertions

## 📋 Pull Request Guidelines

### PR Checklist

Before submitting a PR, ensure:

- [ ] Code follows project conventions
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR description is clear and complete
- [ ] Breaking changes are documented

### PR Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] All tests pass

## Documentation
- [ ] README updated
- [ ] API documentation updated
- [ ] Code comments added where needed

## Screenshots (if applicable)
Add screenshots for UI changes.

## Additional Notes
Any additional information, concerns, or context.
```

### Review Process

1. **Automated Checks**: CI pipeline runs tests and linting
2. **Code Review**: Team members review the code
3. **Discussion**: Address feedback and questions
4. **Approval**: Maintainer approves the changes
5. **Merge**: Squash and merge to maintain clean history

## 🐛 Bug Reports

### Bug Report Template

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
- OS: [e.g. iOS]
- Browser [e.g. chrome, safari]
- Version [e.g. 22]

**Additional context**
Add any other context about the problem here.
```

### Reporting Security Issues

For security vulnerabilities:
1. **Do not** open a public issue
2. Email security@lurniva.com with details
3. Include steps to reproduce
4. Allow time for investigation and fix

## 💡 Feature Requests

### Feature Request Template

```markdown
**Is your feature request related to a problem? Please describe.**
A clear description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.

**Implementation ideas**
If you have ideas about how this could be implemented, please share them.
```

## 🏆 Recognition

### Contributors

All contributors are recognized in:
- Project README
- Release notes
- Contributor graph

### Types of Contributions

We recognize various types of contributions:
- 💻 **Code**: Direct code contributions
- 📖 **Documentation**: Improving documentation
- 🐛 **Bug Reports**: Finding and reporting issues
- 💡 **Ideas**: Suggesting improvements
- 🎨 **Design**: UI/UX improvements
- 🌍 **Translation**: Internationalization
- 📢 **Community**: Helping others

## 📚 Resources

### Documentation
- [Development Guide](README.md)
- [API Reference](../api/README.md)
- [Architecture Overview](../architecture.md)
- [User Guide](../user-guide/README.md)

### External Resources
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Guide](https://expressjs.com/en/guide/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Communication
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community chat
- **Email**: maintainers@lurniva.com for direct communication

## 📞 Getting Help

### Before Asking for Help

1. **Check Documentation**: Review relevant docs
2. **Search Issues**: Look for existing discussions
3. **Try Debugging**: Use debug mode and logs
4. **Minimal Example**: Create a minimal reproduction case

### Where to Ask

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and help
- **Stack Overflow**: Tag with 'lurniva-rag'
- **Discord/Slack**: Real-time community support (if available)

### Providing Context

When asking for help, include:
- **Environment**: OS, Node version, package versions
- **Steps**: What you were trying to do
- **Expected**: What you expected to happen
- **Actual**: What actually happened
- **Logs**: Relevant error messages or debug output
- **Code**: Minimal reproduction example

---

## 🎉 Welcome to the Community!

Thank you for contributing to Lurniva RAG! Your contributions help make AI-powered education accessible to everyone.

**Remember:**
- Be kind and respectful
- Help others learn and grow
- Share your knowledge
- Have fun building amazing features!

---

*Happy Contributing! 🚀*