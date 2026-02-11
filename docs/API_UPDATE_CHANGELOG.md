# Lurniva RAG API - Recent Updates & Changes

**Date:** February 12, 2026  
**Version:** 1.0.0  
**Type:** Breaking Changes & Improvements

---

## 📋 Summary of Changes

### Key Changes:
1. **Removed vector DB storage** for non-book data (study plans, chapter structures)
2. **Deprecated 2 GET endpoints** (no longer store derived data)
3. **Replaced chapter-based lecture** with more flexible topic-based approach
4. **Updated total endpoint count**: 22 → **20 active endpoints**

### Philosophy:
- **Vector DB = Books Only**: Store only source PDFs and chunks
- **On-Demand Generation**: Generate study plans and chapter structures dynamically
- **Chunk-Based Everything**: All features work with chunk offsets/limits
- **Auto-Detection**: AI detects topics/chapters from content automatically

---

## 🔴 Breaking Changes

### 1. ❌ Deprecated: GET /books/:bookId/study-plan

**Reason:** Study plans are no longer stored in vector DB

**Migration:**
```bash
# OLD (No longer works)
GET /api/v1/books/:bookId/study-plan

# NEW (Generate on-demand)
POST /api/v1/books/:bookId/generate-study-plan
{
  "total_days": 30,
  "class_no": "10",
  "board": "CBSE",
  "subject": "Biology"
}
```

**Response:** Always returns fresh plan (not cached)

---

### 2. ❌ Deprecated: GET /books/:bookId/chapters

**Reason:** Chapter structures are no longer stored in vector DB

**Migration:**
```bash
# OLD (No longer works)
GET /api/v1/books/:bookId/chapters

# NEW (Generate on-demand)
POST /api/v1/books/:bookId/extract-chapters
{
  "subject": "Biology",
  "class_no": "10",
  "board": "CBSE"
}
```

**Response:** Always returns fresh analysis (not cached)

---

### 3. ❌ Replaced: POST /lecture/generate-by-chapter

**Reason:** Simplified to chunk-based approach with auto-detection

**Migration:**
```bash
# OLD (Required pre-extraction, chapter number/name)
POST /api/v1/lecture/generate-by-chapter
{
  "book_id": "uuid",
  "chapter_number": 1,
  "class_no": "10",
  "board": "CBSE",
  "subject": "Biology"
}

# NEW (Works with any chunk range, auto-detects topics)
POST /api/v1/lecture/generate-by-topic
{
  "book_id": "uuid",
  "chunk_limit": 10,
  "chunk_offset": 0,
  "class_no": "10",
  "board": "CBSE",
  "subject": "Biology",
  "include_full_chapter": false  // Set true if chunks = complete chapter
}
```

**Key Improvements:**
- ✅ No pre-extraction needed
- ✅ Works with any chunk range
- ✅ Auto-detects chapter name and topics
- ✅ Flexible: can do single topic OR full chapter
- ✅ Returns topic analysis in response

---

## ✅ Updated Features

### POST /books/:bookId/generate-study-plan

**Status:** ✅ Active (but not stored)

**Changes:**
- Now generates on-demand only
- NOT stored in vector DB
- Returns complete plan in response
- Must be called each time needed

**Usage:**
```bash
POST /api/v1/books/:bookId/generate-study-plan
Content-Type: application/json

{
  "total_days": 30,
  "class_no": "10",
  "board": "CBSE",
  "subject": "Biology",
  "chunks_per_day": 10  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "uuid",
    "study_plan": {
      "total_days": 30,
      "chunks_per_day": 10,
      "days": [
        {
          "day": 1,
          "topic": "Introduction to Plant Biology",
          "chunk_range": {
            "offset": 0,
            "limit": 10,
            "start_chunk": 0,
            "end_chunk": 9
          },
          "lecture_generated": false
        }
      ]
    },
    "metadata": {
      "notes": "Use chunk_range.offset and chunk_range.limit when calling /lecture/generate"
    }
  }
}
```

---

### POST /books/:bookId/extract-chapters

**Status:** ✅ Active (but not stored)

**Changes:**
- Now returns structure only (not stored)
- Must be called each time needed
- AI analyzes book structure dynamically

**Usage:**
```bash
POST /api/v1/books/:bookId/extract-chapters
Content-Type: application/json

{
  "subject": "Biology",
  "class_no": "10",
  "board": "CBSE"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "book_id": "uuid",
    "structure": {
      "total_chapters": 10,
      "chapters": [
        {
          "chapter_number": 1,
          "chapter_name": "Introduction to Photosynthesis",
          "estimated_start_chunk": 0,
          "estimated_end_chunk": 50,
          "chunk_count": 50,
          "topics": ["Light reactions", "Dark reactions", "Chloroplast structure"]
        }
      ]
    }
  }
}
```

**Note:** Use these chunk ranges with `/lecture/generate-by-topic`

---

### 🆕 NEW: POST /lecture/generate-by-topic

**Replaces:** `/lecture/generate-by-chapter`

**Key Features:**
- ✅ Works with any chunk offset/limit
- ✅ Auto-detects chapter and topics
- ✅ Supports both topic and full chapter modes
- ✅ Returns content analysis

**Usage:**
```bash
POST /api/v1/lecture/generate-by-topic
Content-Type: application/json

{
  "book_id": "uuid",
  "chunk_limit": 10,
  "chunk_offset": 0,
  "class_no": "10",
  "board": "CBSE",
  "subject": "Biology",
  "include_full_chapter": false,  // true = treat as complete chapter
  "model": "gpt-4o-mini",
  "max_tokens": 3000,
  "include_visuals": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lecture_content": "<section><h2>Photosynthesis</h2>...</section>",
    "visual_assets": [...],
    "content_analysis": {
      "chapter_name": "Photosynthesis",
      "topics_covered": ["Light reactions", "Dark reactions", "Energy conversion"],
      "content_type": "topic_section",
      "is_complete_chapter": false
    },
    "chunk_info": {
      "chunk_offset": 0,
      "chunk_limit": 10,
      "chunks_used": 10,
      "total_chunks_in_book": 500
    },
    "metadata": {
      "lecture_type": "topic_focused",
      "tokens_used": {...},
      "response_time_ms": 4500
    }
  }
}
```

**Two Modes:**

1. **Topic Mode** (Default):
   ```json
   {
     "include_full_chapter": false,
     "chunk_limit": 10
   }
   // Result: Focused lecture on specific topics within chunks
   ```

2. **Full Chapter Mode**:
   ```json
   {
     "include_full_chapter": true,
     "chunk_limit": 50  // All chunks in chapter
   }
   // Result: Comprehensive chapter-wide lecture
   ```

---

## 📊 Updated Endpoint Count

### Total Active Endpoints: **20**

**Before this update:** 22 endpoints  
**Deprecated:** -2 GET endpoints  
**Current:** 20 endpoints

### Complete Endpoint List:

#### 📄 PDF Management (8 endpoints)
1. `POST /books/upload` - Upload PDF
2. `POST /books/text` - Ingest raw text
3. `GET /books` - List all books
4. `GET /books/:bookId` - Get book details
5. `GET /books/:bookId/download` - Download PDF
6. `DELETE /books/:bookId` - Delete book
7. `GET /health` - Health check
8. `GET /stats` - System statistics

#### 🔍 Semantic Search (1 endpoint)
9. `POST /search` - Semantic search

#### 🤖 AI Tutoring (2 endpoints)
10. `POST /tutor/ask` - AI tutor with highlighted text
11. `POST /tutor/search-and-ask` - Combined search + AI tutor

#### 📚 Lecture Generation (2 endpoints)
12. `POST /lecture/generate` - Generate lecture (auto topic detection)
13. `POST /lecture/generate-by-topic` - **NEW** Topic-based lecture with analysis

#### 📝 Assignment Management (2 endpoints)
14. `POST /assignment/generate` - Generate assignments
15. `POST /assignment/check` - Check assignments

#### 🧪 Quiz Management (2 endpoints)
16. `POST /quiz/generate` - Generate quiz
17. `POST /quiz/check` - Check quiz

#### 🔄 Remedial Learning (1 endpoint)
18. `POST /remedial/learn` - Adaptive learning for failed quizzes

#### 📅 Study Planning (2 endpoints)
19. `POST /books/:bookId/generate-study-plan` - Generate study plan (on-demand)
20. `POST /books/:bookId/extract-chapters` - Extract chapters (on-demand)

---

## 🔧 Implementation Changes

### Vector Database Usage

**Before:**
```
Qdrant Collections:
├── books (book chunks)
├── study_plans (stored plans)
└── book_structures (stored chapters)
```

**After:**
```
Qdrant Collections:
└── books (ONLY book chunks)
```

### Why This Change?

1. **Simplicity**: Vector DB for source data only
2. **Flexibility**: Generate fresh analysis on-demand
3. **No Stale Data**: Always current with latest AI models
4. **Cost Efficiency**: Less vector storage needed
5. **Cleaner Architecture**: Separation of concerns

---

## 📖 New Workflow Examples

### Example 1: Day-by-Day Study Plan

```javascript
// 1. Generate 30-day plan
const planResponse = await fetch('/api/v1/books/book123/generate-study-plan', {
  method: 'POST',
  body: JSON.stringify({
    total_days: 30,
    class_no: "10",
    board: "CBSE",
    subject: "Biology"
  })
});

const { data } = await planResponse.json();

// 2. Get Day 1 content
const day1 = data.study_plan.days[0];
console.log(`Day 1: ${day1.topic}`);

// 3. Generate lecture for Day 1
const lectureResponse = await fetch('/api/v1/lecture/generate-by-topic', {
  method: 'POST',
  body: JSON.stringify({
    book_id: "book123",
    chunk_offset: day1.chunk_range.offset,
    chunk_limit: day1.chunk_range.limit,
    class_no: "10",
    board: "CBSE",
    subject: "Biology"
  })
});

const lecture = await lectureResponse.json();
console.log(`Generated: ${lecture.data.content_analysis.chapter_name}`);
console.log(`Topics: ${lecture.data.content_analysis.topics_covered.join(', ')}`);
```

---

### Example 2: Chapter-Based Learning

```javascript
// 1. Extract chapter structure
const chaptersResponse = await fetch('/api/v1/books/book123/extract-chapters', {
  method: 'POST',
  body: JSON.stringify({
    subject: "Biology",
    class_no: "10",
    board: "CBSE"
  })
});

const { data } = await chaptersResponse.json();

// 2. Student selects Chapter 3
const chapter3 = data.structure.chapters[2];  // 0-indexed
console.log(`Chapter 3: ${chapter3.chapter_name}`);
console.log(`Topics: ${chapter3.topics.join(', ')}`);

// 3. Generate full chapter lecture
const lectureResponse = await fetch('/api/v1/lecture/generate-by-topic', {
  method: 'POST',
  body: JSON.stringify({
    book_id: "book123",
    chunk_offset: chapter3.estimated_start_chunk,
    chunk_limit: chapter3.chunk_count,
    class_no: "10",
    board: "CBSE",
    subject: "Biology",
    include_full_chapter: true  // Full chapter mode
  })
});

const lecture = await lectureResponse.json();
// lecture.data.content_analysis.is_complete_chapter === true
```

---

## 🎯 Migration Guide

### If you were using GET /books/:bookId/study-plan:

```javascript
// ❌ OLD CODE (No longer works)
const plan = await fetch(`/api/v1/books/${bookId}/study-plan`);

// ✅ NEW CODE
const plan = await fetch(`/api/v1/books/${bookId}/generate-study-plan`, {
  method: 'POST',
  body: JSON.stringify({
    total_days: 30,
    class_no: "10",
    board: "CBSE",
    subject: "Biology"
  })
});

// Note: Store the response in your MySQL database if you need persistence
```

---

### If you were using GET /books/:bookId/chapters:

```javascript
// ❌ OLD CODE (No longer works)
const chapters = await fetch(`/api/v1/books/${bookId}/chapters`);

// ✅ NEW CODE
const chapters = await fetch(`/api/v1/books/${bookId}/extract-chapters`, {
  method: 'POST',
  body: JSON.stringify({
    subject: "Biology",
    class_no: "10",
    board: "CBSE"
  })
});

// Note: Cache the response in your app if needed for this session
```

---

### If you were using POST /lecture/generate-by-chapter:

```javascript
// ❌ OLD CODE (No longer works)
const lecture = await fetch('/api/v1/lecture/generate-by-chapter', {
  method: 'POST',
  body: JSON.stringify({
    book_id: "uuid",
    chapter_number: 1,
    class_no: "10",
    board: "CBSE",
    subject: "Biology"
  })
});

// ✅ NEW CODE (Option 1: Use chapters from extract-chapters)
// First, extract chapters to get chunk ranges
const chaptersData = await fetch(`/api/v1/books/${bookId}/extract-chapters`, {...});
const chapter1 = chaptersData.structure.chapters[0];

const lecture = await fetch('/api/v1/lecture/generate-by-topic', {
  method: 'POST',
  body: JSON.stringify({
    book_id: "uuid",
    chunk_offset: chapter1.estimated_start_chunk,
    chunk_limit: chapter1.chunk_count,
    class_no: "10",
    board: "CBSE",
    subject: "Biology",
    include_full_chapter: true
  })
});

// ✅ NEW CODE (Option 2: Direct chunk-based)
const lecture = await fetch('/api/v1/lecture/generate-by-topic', {
  method: 'POST',
  body: JSON.stringify({
    book_id: "uuid",
    chunk_offset: 0,
    chunk_limit: 50,
    class_no: "10",
    board: "CBSE",
    subject: "Biology",
    include_full_chapter: false  // Auto-detect topics
  })
});
```

---

## 🚀 Performance Notes

### Study Plan Generation:
- **Time:** 30-60 seconds (samples 20 days max)
- **Cost:** Samples content, not full book
- **Recommendation:** Generate once, cache in your MySQL

### Chapter Extraction:
- **Time:** 20-40 seconds (samples 50 chunks max)
- **Cost:** AI analysis of structure
- **Recommendation:** Generate once per book, cache result

### Topic-Based Lecture:
- **Time:** 3-10 seconds (depends on chunk count)
- **Cost:** Same as regular lecture generation
- **Benefit:** Auto-detects topics, no pre-work needed

---

## ✅ Testing Updated Endpoints

### Test Console:
Navigate to: `http://localhost:3000/console`

Updated sections:
1. **Generate Study Plan** - Now shows "not stored" note
2. **Extract Chapters** - Now shows "not stored" note
3. **Generate Lecture by Topic** - **NEW** with full chapter checkbox

### Quick Test:

```bash
# 1. Test study plan
curl -X POST http://localhost:3000/api/v1/books/YOUR_BOOK_ID/generate-study-plan \
  -H "Content-Type: application/json" \
  -d '{
    "total_days": 10,
    "class_no": "10",
    "board": "CBSE",
    "subject": "Biology"
  }'

# 2. Test chapter extraction
curl -X POST http://localhost:3000/api/v1/books/YOUR_BOOK_ID/extract-chapters \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Biology",
    "class_no": "10",
    "board": "CBSE"
  }'

# 3. Test topic-based lecture
curl -X POST http://localhost:3000/api/v1/lecture/generate-by-topic \
  -H "Content-Type: application/json" \
  -d '{
    "book_id": "YOUR_BOOK_ID",
    "chunk_limit": 10,
    "chunk_offset": 0,
    "class_no": "10",
    "board": "CBSE",
    "subject": "Biology",
    "include_full_chapter": false
  }'
```

---

## 📝 Summary

### What Changed:
- ✅ Vector DB now stores **only book chunks**
- ✅ Study plans and chapters generated **on-demand**
- ✅ New topic-based lecture with **auto-detection**
- ✅ More flexible, chunk-based approach
- ✅ Reduced from 22 to **20 active endpoints**

### Benefits:
- 🚀 Simpler architecture
- 💾 Less storage overhead
- 🎯 Always fresh analysis
- 🔧 More flexible for dashboards
- 💰 Better cost efficiency

### Action Required:
- 🔄 Update any code using deprecated endpoints
- 📚 Store study plans in MySQL if persistence needed
- 🗂️ Cache chapter structures in your app if needed
- ✅ Test all integrations with new endpoints

---

**Questions or Issues?**  
Check the main API documentation: `docs/api/README.md`  
Test Console: `http://localhost:3000console`
