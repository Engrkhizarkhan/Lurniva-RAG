# API Authentication Guide

Lurniva RAG uses session-based authentication for admin access and API security. This guide covers all authentication methods and security best practices.

## 🔐 Authentication Overview

### Authentication Types

1. **Public API Endpoints** - No authentication required
2. **Session-Based Admin** - Cookie-based authentication for admin console
3. **API Key Authentication** - For production integrations (optional)

### Security Levels

| Endpoint Type | Authentication | Rate Limiting | Purpose |
|---------------|----------------|---------------|---------|
| Public Upload/Search | None | Basic | General document operations |
| Admin Console | Session | Enhanced | System administration |
| Batch Operations | Session/API Key | Strict | Bulk processing |

## 🚪 Session Authentication

### Login Process

**Endpoint:** `POST /api/v1/auth/login`

```javascript
// Login to admin console
async function adminLogin(username, password) {
  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Important: Include cookies
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

// Usage
const loginSuccess = await adminLogin('admin', 'your-admin-password');
if (loginSuccess) {
  console.log('Logged in successfully');
  // Session cookie is automatically set
} else {
  console.log('Login failed');
}
```

**Default Credentials:**
- Username: `admin`
- Password: `admin` (Change in production!)

### Session Management

```javascript
// Check if session is valid
async function checkSession() {
  try {
    const response = await fetch('/api/v1/auth/check', {
      credentials: 'include'
    });
    
    const result = await response.json();
    return result.authenticated;
  } catch (error) {
    return false;
  }
}

// Logout
async function logout() {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    
    console.log('Logged out successfully');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Session-aware API wrapper
async function authenticatedRequest(url, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (response.status === 401) {
    // Session expired - redirect to login
    window.location.href = '/admin/login';
    throw new Error('Session expired');
  }
  
  return response;
}
```

### Session Configuration

Environment variables for session security:

```env
# Session Configuration
SESSION_SECRET=your-super-secure-secret-key-here
SESSION_MAX_AGE=86400000  # 24 hours in milliseconds
SESSION_SECURE=true       # HTTPS only (production)
SESSION_HTTP_ONLY=true    # Prevent XSS attacks
```

## 🔑 API Key Authentication (Optional)

For production integrations, you can implement API key authentication:

### Custom API Key Implementation

```javascript
// Example API key middleware (add to your server)
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_API_KEY', message: 'API key required' }
    });
  }
  
  // Validate API key (implement your logic)
  if (!isValidApiKey(apiKey)) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Invalid API key' }
    });
  }
  
  req.apiKey = apiKey;
  next();
}

// Client-side API key usage
class LurnivaClient {
  constructor(apiKey, baseUrl = 'http://localhost:3000/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: 'Request failed' }
      }));
      throw new Error(error.error?.message || 'API request failed');
    }
    
    return response.json();
  }
  
  async uploadDocument(pdfFile) {
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    
    const response = await fetch(`${this.baseUrl}/books/upload`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey },
      body: formData
    });
    
    return response.json();
  }
  
  async searchDocuments(query, options = {}) {
    return this.request('/books/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options })
    });
  }
}

// Usage
const client = new LurnivaClient('your-api-key-here');
const results = await client.searchDocuments('machine learning');
```

## 🛡️ Security Best Practices

### Production Security Checklist

#### Environment Configuration

```env
# Production Security Settings
NODE_ENV=production
SESSION_SECRET=64-character-random-string-generated-securely
SESSION_SECURE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=strict
HTTPS_ONLY=true
RATE_LIMIT_ENABLED=true
```

#### Secure Session Management

```javascript
// Secure session configuration
import session from 'express-session';
import MongoStore from 'connect-mongo'; // or another store

app.use(session({
  secret: process.env.SESSION_SECRET,
  name: 'lurniva-session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  },
  store: process.env.NODE_ENV === 'production' ? 
    MongoStore.create({ mongoUrl: process.env.MONGODB_URI }) : 
    undefined
}));
```

### Rate Limiting

```javascript
// Rate limiting configuration
import rateLimit from 'express-rate-limit';

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many requests' }
  }
});

// Upload rate limiting (stricter)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 uploads per minute
  message: {
    success: false,
    error: { code: 'UPLOAD_RATE_LIMIT', message: 'Upload rate limit exceeded' }
  }
});

// AI generation rate limiting (strictest)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 AI requests per minute
  message: {
    success: false,
    error: { code: 'AI_RATE_LIMIT', message: 'AI generation rate limit exceeded' }
  }
});

// Apply rate limiting
app.use('/api/v1', apiLimiter);
app.use('/api/v1/books/upload', uploadLimiter);
app.use('/api/v1/quiz/generate', aiLimiter);
app.use('/api/v1/lecture/generate', aiLimiter);
```

### Input Validation

```javascript
// Request validation middleware
import Joi from 'joi';

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message
        }
      });
    }
    next();
  };
};

// Validation schemas
const searchSchema = Joi.object({
  query: Joi.string().min(1).max(500).required(),
  book_id: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(20).default(5)
});

const quizSchema = Joi.object({
  book_id: Joi.string().required(),
  question_count: Joi.number().integer().min(1).max(20).default(5),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').default('medium'),
  question_types: Joi.array().items(
    Joi.string().valid('multiple_choice', 'true_false', 'short_answer')
  ).default(['multiple_choice'])
});

// Apply validation
app.post('/api/v1/books/search', validateRequest(searchSchema), searchHandler);
app.post('/api/v1/quiz/generate', validateRequest(quizSchema), quizHandler);
```

## 🔄 Authentication Flow Examples

### Frontend Integration (React)

```jsx
// Authentication context
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    checkSession();
  }, []);
  
  const checkSession = async () => {
    try {
      const response = await fetch('/api/v1/auth/check', {
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.authenticated) {
        setUser({ username: result.username, role: result.role });
      }
    } catch (error) {
      console.error('Session check failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const login = async (username, password) => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const result = await response.json();
        setUser({ username: result.username, role: result.role });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };
  
  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } finally {
      setUser(null);
    }
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Protected route component
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return <LoginForm />;
  }
  
  return children;
}

// Login form component
function LoginForm() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const success = await login(credentials.username, credentials.password);
    if (!success) {
      setError('Invalid credentials');
    }
    setLoading(false);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Username"
        value={credentials.username}
        onChange={(e) => setCredentials({...credentials, username: e.target.value})}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={credentials.password}
        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

### Node.js Backend Integration

```javascript
// Backend service integration
class LurnivaService {
  constructor(baseUrl = 'http://localhost:3000/api/v1') {
    this.baseUrl = baseUrl;
    this.sessionCookie = null;
  }
  
  async authenticate(username, password) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      // Store session cookie for future requests
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        this.sessionCookie = setCookie.split(';')[0];
      }
      return true;
    }
    return false;
  }
  
  async makeAuthenticatedRequest(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    
    if (response.status === 401) {
      // Re-authenticate if needed
      throw new Error('Authentication required');
    }
    
    return response.json();
  }
  
  async uploadDocument(pdfBuffer, filename) {
    const formData = new FormData();
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('pdf', blob, filename);
    
    const response = await fetch(`${this.baseUrl}/books/upload`, {
      method: 'POST',
      headers: this.sessionCookie ? { Cookie: this.sessionCookie } : {},
      body: formData
    });
    
    return response.json();
  }
}

// Usage in your backend
const lurniva = new LurnivaService();

// Authenticate once
await lurniva.authenticate('admin', process.env.LURNIVA_ADMIN_PASSWORD);

// Make authenticated requests
const searchResults = await lurniva.makeAuthenticatedRequest('/books/search', {
  method: 'POST',
  body: JSON.stringify({ query: 'machine learning', limit: 5 })
});
```

## 🚨 Security Troubleshooting

### Common Authentication Issues

#### 1. Session Cookie Not Set

**Problem:** Login succeeds but subsequent requests fail
**Solution:**
```javascript
// Ensure credentials: 'include' in all requests
fetch('/api/v1/protected-endpoint', {
  credentials: 'include'  // This is crucial!
});

// Check CORS configuration on server
app.use(cors({
  origin: true,
  credentials: true  // Allow credentials
}));
```

#### 2. HTTPS/HTTP Cookie Issues

**Problem:** Sessions work locally but not in production
**Solution:**
```env
# Set secure cookie settings based on environment
SESSION_SECURE=false  # Development (HTTP)
SESSION_SECURE=true   # Production (HTTPS)
```

#### 3. Cross-Origin Authentication

**Problem:** Authentication fails on different domains
**Solution:**
```javascript
// Server CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Client configuration
const response = await fetch('https://api.yourdomain.com/auth/login', {
  method: 'POST',
  credentials: 'include',  // Include cookies in cross-origin requests
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(credentials)
});
```

## 📚 Additional Resources

- [Express Session Documentation](https://github.com/expressjs/session)
- [OWASP Session Management](https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/06-Session_Management_Testing/)
- [MDN HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)

---

For API endpoint details, see the [API Reference](README.md).