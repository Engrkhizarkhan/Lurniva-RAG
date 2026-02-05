# API Examples and Use Cases

This document provides practical examples and common use cases for the Lurniva RAG API. All examples include complete request/response patterns and error handling.

## 🚀 Quick Start Examples

### Basic Document Upload

```javascript
// Upload a PDF document
async function uploadDocument(pdfFile) {
  const formData = new FormData();
  formData.append('pdf', pdfFile);
  
  try {
    const response = await fetch('/api/v1/books/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data.book_id;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Usage
const bookId = await uploadDocument(document.getElementById('pdf-file').files[0]);
console.log('Document uploaded with ID:', bookId);
```

### Basic Search

```javascript
// Search across all documents
async function searchDocuments(query, limit = 5) {
  try {
    const response = await fetch('/api/v1/books/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    });
    
    const result = await response.json();
    return result.data.chunks.map(chunk => ({
      text: chunk.text,
      book_id: chunk.book_id,
      score: chunk.score
    }));
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Usage
const results = await searchDocuments("machine learning algorithms");
results.forEach(result => {
  console.log(`Score: ${result.score}, Text: ${result.text.substring(0, 100)}...`);
});
```

## 📚 Educational Content Generation

### Quiz Generation

```javascript
// Generate a comprehensive quiz from a document
async function generateQuiz(bookId, options = {}) {
  const defaultOptions = {
    question_count: 10,
    difficulty: 'medium',
    question_types: ['multiple_choice', 'true_false', 'short_answer'],
    focus_topics: [],
    target_audience: 'university'
  };
  
  const params = { ...defaultOptions, ...options, book_id: bookId };
  
  try {
    const response = await fetch('/api/v1/quiz/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      throw new Error(`Quiz generation failed: ${response.status}`);
    }
    
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Quiz generation error:', error);
    throw error;
  }
}

// Usage example
const quiz = await generateQuiz('book_1737158400000_a1b2c3d4', {
  question_count: 5,
  difficulty: 'easy',
  question_types: ['multiple_choice'],
  focus_topics: ['introduction', 'basic concepts']
});

// Display quiz questions
quiz.questions.forEach((q, index) => {
  console.log(`${index + 1}. ${q.question}`);
  if (q.type === 'multiple_choice') {
    q.options.forEach((option, optIndex) => {
      console.log(`   ${String.fromCharCode(65 + optIndex)}. ${option}`);
    });
  }
  console.log(`Answer: ${q.correct_answer}`);
  console.log('---');
});
```

### Lecture Generation

```javascript
// Generate a structured lecture
async function generateLecture(bookId, topic, options = {}) {
  const params = {
    book_id: bookId,
    topic,
    target_audience: options.audience || 'university',
    duration_minutes: options.duration || 45,
    include_images: options.includeImages !== false,
    include_examples: options.includeExamples !== false,
    learning_objectives: options.objectives || [],
    prerequisite_knowledge: options.prerequisites || []
  };
  
  try {
    const response = await fetch('/api/v1/lecture/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error.message);
    }
    
    return result.data;
  } catch (error) {
    console.error('Lecture generation error:', error);
    throw error;
  }
}

// Usage example
const lecture = await generateLecture(
  'book_1737158400000_a1b2c3d4',
  'Introduction to Neural Networks',
  {
    audience: 'undergraduate',
    duration: 60,
    includeImages: true,
    objectives: ['Understand basic neural network concepts', 'Learn about activation functions']
  }
);

// Use the generated lecture
console.log('Lecture Title:', lecture.title);
console.log('Learning Objectives:', lecture.learning_objectives);
lecture.sections.forEach(section => {
  console.log(`\\n## ${section.title}`);
  console.log(section.content);
  if (section.image_prompt) {
    console.log(`[Generated Image: ${section.image_prompt}]`);
  }
});
```

## 🤖 AI Tutoring and Assessment

### Interactive Tutoring

```javascript
// AI tutor conversation
async function askTutor(query, bookId = null, conversationHistory = []) {
  const params = {
    query,
    book_id: bookId,
    conversation_history: conversationHistory,
    include_sources: true,
    student_level: 'intermediate'
  };
  
  try {
    const response = await fetch('/api/v1/tutor/search-and-ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    const result = await response.json();
    return {
      answer: result.data.response,
      sources: result.data.sources,
      followUp: result.data.follow_up_questions
    };
  } catch (error) {
    console.error('Tutor error:', error);
    throw error;
  }
}

// Tutoring conversation example
let conversation = [];

async function startTutoringSession(bookId) {
  const questions = [
    "What are the main concepts covered in this document?",
    "Can you explain the first concept in simple terms?",
    "What are some real-world applications of these concepts?"
  ];
  
  for (const question of questions) {
    console.log(`Student: ${question}`);
    
    const response = await askTutor(question, bookId, conversation);
    console.log(`Tutor: ${response.answer}`);
    
    // Add to conversation history
    conversation.push({ role: 'student', content: question });
    conversation.push({ role: 'tutor', content: response.answer });
    
    // Show sources
    if (response.sources.length > 0) {
      console.log('Sources:', response.sources.map(s => `"${s.text.substring(0, 50)}..."`));
    }
    
    // Show follow-up questions
    if (response.followUp.length > 0) {
      console.log('Follow-up questions:', response.followUp);
    }
    console.log('---\\n');
  }
}
```

### Assignment Grading

```javascript
// Grade a text assignment
async function gradeAssignment(assignmentId, studentResponse, rubric = null) {
  const params = {
    assignment_id: assignmentId,
    student_response: studentResponse,
    rubric: rubric || {
      criteria: [
        { name: 'Content Understanding', weight: 40 },
        { name: 'Critical Thinking', weight: 30 },
        { name: 'Writing Quality', weight: 20 },
        { name: 'Evidence Usage', weight: 10 }
      ],
      total_points: 100
    }
  };
  
  try {
    const response = await fetch('/api/v1/assignment/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Grading error:', error);
    throw error;
  }
}

// Usage example
const grade = await gradeAssignment(
  'assignment_123',
  "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions without being explicitly programmed...",
  {
    criteria: [
      { name: 'Accuracy', weight: 50 },
      { name: 'Completeness', weight: 30 },
      { name: 'Clarity', weight: 20 }
    ],
    total_points: 100
  }
);

console.log(`Grade: ${grade.total_score}/${grade.max_score}`);
console.log('Feedback:', grade.overall_feedback);
grade.criteria_scores.forEach(criterion => {
  console.log(`${criterion.name}: ${criterion.score}/${criterion.max_score} - ${criterion.feedback}`);
});
```

## 🎨 Visual Content Generation

### Educational Images

```javascript
// Generate educational images
async function generateEducationalImage(prompt, style = 'educational') {
  const params = {
    prompt,
    style,
    size: '1024x1024',
    educational_context: true
  };
  
  try {
    const response = await fetch('/api/v1/visual/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    const result = await response.json();
    return result.data.image_url;
  } catch (error) {
    console.error('Image generation error:', error);
    throw error;
  }
}

// Usage example
const imageUrl = await generateEducationalImage(
  "A diagram showing the layers of a neural network with input, hidden, and output layers"
);
console.log('Generated image URL:', imageUrl);
```

### Educational Charts

```javascript
// Generate data visualization charts
async function generateChart(data, chartType = 'bar', topic = '') {
  const params = {
    data,
    chart_type: chartType,
    topic,
    educational_style: true,
    include_annotations: true
  };
  
  try {
    const response = await fetch('/api/v1/chart/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Chart generation error:', error);
    throw error;
  }
}

// Usage example
const chartData = {
  labels: ['Supervised', 'Unsupervised', 'Reinforcement'],
  values: [60, 25, 15],
  unit: 'percentage'
};

const chart = await generateChart(chartData, 'pie', 'Types of Machine Learning');
console.log('Chart image URL:', chart.image_url);
console.log('Chart description:', chart.description);
```

## 🔄 Batch Operations

### Bulk Document Processing

```javascript
// Upload and process multiple documents
async function bulkUpload(files) {
  const results = [];
  
  for (const file of files) {
    try {
      const bookId = await uploadDocument(file);
      results.push({
        file: file.name,
        book_id: bookId,
        status: 'success'
      });
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({
        file: file.name,
        error: error.message,
        status: 'failed'
      });
    }
  }
  
  return results;
}

// Usage example
const fileInput = document.getElementById('bulk-upload');
const uploadResults = await bulkUpload(Array.from(fileInput.files));

uploadResults.forEach(result => {
  if (result.status === 'success') {
    console.log(`✓ ${result.file}: ${result.book_id}`);
  } else {
    console.log(`✗ ${result.file}: ${result.error}`);
  }
});
```

### Batch Search Across Documents

```javascript
// Search multiple queries across all documents
async function batchSearch(queries, limit = 3) {
  const searchPromises = queries.map(query => 
    searchDocuments(query, limit).catch(error => ({
      query,
      error: error.message,
      results: []
    }))
  );
  
  const results = await Promise.all(searchPromises);
  
  return results.map((result, index) => ({
    query: queries[index],
    results: result.results || result,
    error: result.error
  }));
}

// Usage example
const queries = [
  "machine learning algorithms",
  "data preprocessing techniques",
  "model evaluation methods"
];

const searchResults = await batchSearch(queries);
searchResults.forEach(({ query, results, error }) => {
  console.log(`\\nQuery: "${query}"`);
  if (error) {
    console.log(`Error: ${error}`);
  } else {
    console.log(`Found ${results.length} results:`);
    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.text.substring(0, 80)}...`);
    });
  }
});
```

## 📊 Analytics and Monitoring

### Document Analytics

```javascript
// Get document statistics
async function getDocumentStats(bookId) {
  try {
    const response = await fetch(`/api/v1/books/${bookId}/stats`);
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Stats error:', error);
    return null;
  }
}

// Usage example
const stats = await getDocumentStats('book_1737158400000_a1b2c3d4');
if (stats) {
  console.log('Document Statistics:');
  console.log(`- Total chunks: ${stats.chunk_count}`);
  console.log(`- Page count: ${stats.page_count}`);
  console.log(`- Word count: ${stats.word_count}`);
  console.log(`- Average chunk length: ${stats.avg_chunk_length}`);
  console.log(`- Processing date: ${stats.created_at}`);
}
```

### System Health Monitoring

```javascript
// Monitor system health
async function monitorHealth() {
  try {
    const response = await fetch('/api/v1/health');
    const health = await response.json();
    
    console.log('System Health:');
    console.log(`- Status: ${health.status}`);
    console.log(`- Model loaded: ${health.embedding_model_loaded}`);
    console.log(`- Storage: ${health.storage_backend}`);
    console.log(`- Version: ${health.version}`);
    
    return health.status === 'healthy';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Set up health monitoring
setInterval(async () => {
  const isHealthy = await monitorHealth();
  if (!isHealthy) {
    console.warn('System health check failed!');
    // Implement your alerting logic here
  }
}, 60000); // Check every minute
```

## 🔒 Error Handling Best Practices

### Comprehensive Error Handling

```javascript
// Robust error handling wrapper
async function safeApiCall(apiFunction, ...args) {
  try {
    return await apiFunction(...args);
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('Network error - server might be down');
      return { error: 'Network error', code: 'NETWORK_ERROR' };
    }
    
    if (error.status === 429) {
      console.warn('Rate limit exceeded - retrying in 5 seconds');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return safeApiCall(apiFunction, ...args);
    }
    
    if (error.status >= 500) {
      console.error('Server error:', error.message);
      return { error: 'Server error', code: 'SERVER_ERROR' };
    }
    
    console.error('API error:', error);
    return { error: error.message, code: error.code || 'UNKNOWN_ERROR' };
  }
}

// Usage with error handling
const result = await safeApiCall(uploadDocument, pdfFile);
if (result.error) {
  console.error('Upload failed:', result.error);
  // Handle error appropriately
} else {
  console.log('Upload successful:', result);
}
```

## 🏗 Integration Patterns

### React Integration Example

```jsx
// React hook for Lurniva RAG
import { useState, useEffect } from 'react';

export function useLurnivaRAG() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    checkHealth();
  }, []);
  
  const checkHealth = async () => {
    try {
      const response = await fetch('/api/v1/health');
      const healthData = await response.json();
      setHealth(healthData);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealth({ status: 'unhealthy' });
    }
  };
  
  const uploadDocument = async (file) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/v1/books/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const result = await response.json();
      return result.data;
    } finally {
      setLoading(false);
    }
  };
  
  const searchDocuments = async (query, limit = 5) => {
    const response = await fetch('/api/v1/books/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    });
    
    const result = await response.json();
    return result.data.chunks;
  };
  
  return {
    health,
    loading,
    uploadDocument,
    searchDocuments,
    checkHealth
  };
}

// Component usage
function DocumentManager() {
  const { health, loading, uploadDocument, searchDocuments } = useLurnivaRAG();
  const [searchResults, setSearchResults] = useState([]);
  
  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const result = await uploadDocument(file);
        console.log('Uploaded:', result.book_id);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
  };
  
  const handleSearch = async (query) => {
    try {
      const results = await searchDocuments(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  };
  
  return (
    <div>
      <div>Status: {health?.status || 'Unknown'}</div>
      <input type="file" accept=".pdf" onChange={handleUpload} disabled={loading} />
      {loading && <div>Processing...</div>}
      {/* Search and results components */}
    </div>
  );
}
```

---

For more examples and detailed API documentation, see the [API Reference](README.md).