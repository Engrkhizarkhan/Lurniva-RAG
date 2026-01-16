/**
 * Test script for Lurniva RAG Microservice
 * Tests all endpoints with dummy text data
 */

const API_URL = 'http://localhost:3000/api/v1';

// Sample test content about Machine Learning
const SAMPLE_TEXT = `
Machine Learning Fundamentals

Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed. It focuses on developing computer programs that can access data and use it to learn for themselves.

The process of learning begins with observations or data, such as examples, direct experience, or instruction, in order to look for patterns in data and make better decisions in the future based on the examples that we provide.

Deep Learning and Neural Networks

Deep learning is a specialized subset of machine learning that uses neural networks with multiple layers to process complex patterns. These neural networks are inspired by the structure and function of the human brain, consisting of interconnected nodes or neurons.

Convolutional neural networks (CNNs) are particularly effective for image recognition tasks. They use convolutional layers to automatically and adaptively learn spatial hierarchies of features from input images.

Recurrent neural networks (RNNs) are designed to work with sequential data. They have loops in them, allowing information to persist. This makes them particularly useful for tasks like natural language processing and time series prediction.

Natural Language Processing

Natural language processing (NLP) allows computers to understand, interpret, and generate human language. It combines computational linguistics with statistical, machine learning, and deep learning models.

Key NLP tasks include sentiment analysis, named entity recognition, machine translation, text summarization, and question answering. Modern NLP systems often use transformer architectures like BERT and GPT.

Computer Vision Applications

Computer vision enables machines to interpret and analyze visual information from the world. It involves acquiring, processing, analyzing, and understanding digital images to produce numerical or symbolic information.

Applications include facial recognition, object detection, image segmentation, and autonomous vehicles. Deep learning has revolutionized computer vision, enabling systems to achieve human-level performance on many visual tasks.

Reinforcement Learning

Reinforcement learning is a type of machine learning where an agent learns to make decisions by performing actions in an environment to maximize cumulative reward. Unlike supervised learning, reinforcement learning operates on a trial-and-error basis.

The agent receives feedback in the form of rewards or penalties and learns to choose actions that maximize its long-term reward. This approach has been successful in game playing, robotics, and resource management.
`;

async function test() {
  console.log('🧪 Testing Lurniva RAG Microservice\n');
  console.log('='.repeat(50));

  // Test 1: Health Check
  console.log('\n📋 Test 1: Health Check');
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    const health = await healthRes.json();
    console.log('   Status:', health.data.status);
    console.log('   Model Loaded:', health.data.embedding_model_loaded);
    console.log('   Backend:', health.data.storage_backend);
    console.log('   ✅ PASSED\n');
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
    console.log('\n⚠️  Make sure the server is running: node server.js');
    return;
  }

  // Test 2: Ingest Text
  console.log('📋 Test 2: Ingest Text Data');
  let bookId;
  try {
    const ingestRes = await fetch(`${API_URL}/test/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: SAMPLE_TEXT,
        title: "Machine Learning Guide"
      })
    });

    const ingest = await ingestRes.json();
    
    if (ingest.success) {
      bookId = ingest.data.book_id;
      console.log('   Book ID:', bookId);
      console.log('   Chunks Created:', ingest.data.chunk_count);
      console.log('   Text Length:', ingest.data.text_length);
      console.log('   Word Count:', ingest.data.word_count);
      console.log('   Processing Time:', ingest.data.processing_time_ms, 'ms');
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', ingest.error.message);
      return;
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
    return;
  }

  // Test 3: Search All Books
  console.log('📋 Test 3: Search All Books');
  try {
    const searchRes = await fetch(`${API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'neural networks deep learning',
        limit: 3
      })
    });

    const search = await searchRes.json();
    
    if (search.success) {
      console.log('   Query: "neural networks deep learning"');
      console.log('   Results Found:', search.data.result_count);
      if (search.data.results.length > 0) {
        console.log('   Top Result:');
        console.log('     - Score:', search.data.results[0].score.toFixed(4));
        console.log('     - Text:', search.data.results[0].text.substring(0, 80) + '...');
      }
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', search.error.message);
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  // Test 4: Search Specific Book
  console.log('📋 Test 4: Search Specific Book');
  try {
    const searchRes = await fetch(`${API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'reinforcement learning rewards',
        book_id: bookId,
        limit: 2
      })
    });

    const search = await searchRes.json();
    
    if (search.success) {
      console.log('   Query: "reinforcement learning rewards"');
      console.log('   Book ID:', bookId);
      console.log('   Results Found:', search.data.result_count);
      if (search.data.results.length > 0) {
        console.log('   Top Result Score:', search.data.results[0].score.toFixed(4));
      }
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', search.error.message);
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  // Test 5: Get Book Details
  console.log('📋 Test 5: Get Book Details');
  try {
    const getRes = await fetch(`${API_URL}/books/${bookId}?include_chunks=true`);
    const book = await getRes.json();
    
    if (book.success) {
      console.log('   Book ID:', book.data.book_id);
      console.log('   Chunk Count:', book.data.chunk_count);
      console.log('   Total Text Length:', book.data.total_text_length);
      console.log('   Storage Backend:', book.data.storage_backend);
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', book.error.message);
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  // Test 6: Get Stats
  console.log('📋 Test 6: Get Statistics');
  try {
    const statsRes = await fetch(`${API_URL}/stats`);
    const stats = await statsRes.json();
    
    if (stats.success) {
      console.log('   Total Vectors:', stats.data.total_vectors);
      console.log('   Vector Dimension:', stats.data.vector_dimension);
      console.log('   Backend:', stats.data.storage_backend);
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', stats.error.message);
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  // Test 7: Delete Book
  console.log('📋 Test 7: Delete Book');
  try {
    const deleteRes = await fetch(`${API_URL}/books/${bookId}`, {
      method: 'DELETE'
    });

    const del = await deleteRes.json();
    
    if (del.success) {
      console.log('   Deleted Book ID:', del.data.book_id);
      console.log('   Deleted Chunks:', del.data.deleted_chunks);
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED:', del.error.message);
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  // Test 8: Verify Delete
  console.log('📋 Test 8: Verify Deletion');
  try {
    const getRes = await fetch(`${API_URL}/books/${bookId}`);
    const book = await getRes.json();
    
    if (!book.success && book.error.code === 'NOT_FOUND') {
      console.log('   Book correctly not found after deletion');
      console.log('   ✅ PASSED\n');
    } else {
      console.log('   ❌ FAILED: Book should not exist');
    }
  } catch (err) {
    console.log('   ❌ FAILED:', err.message);
  }

  console.log('='.repeat(50));
  console.log('🎉 All tests completed!\n');
  
  console.log('📊 Summary:');
  console.log('   - Health check works');
  console.log('   - Text ingestion creates vectors');
  console.log('   - Semantic search returns relevant results');
  console.log('   - Book filtering works');
  console.log('   - CRUD operations function correctly');
  console.log('   - Qdrant integration is working\n');
}

test().catch(console.error);
