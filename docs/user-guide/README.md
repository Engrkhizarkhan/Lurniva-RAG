# User Guide

Welcome to the Lurniva RAG User Guide! This comprehensive guide will help you understand and effectively use all the features of the Lurniva RAG system.

## 📖 Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Document Management](#document-management)
- [Search and Discovery](#search-and-discovery)
- [Educational Content Generation](#educational-content-generation)
- [AI Tutoring](#ai-tutoring)
- [Assessment and Grading](#assessment-and-grading)
- [Visual Content](#visual-content)
- [Admin Console](#admin-console)
- [Best Practices](#best-practices)

## Overview

Lurniva RAG transforms your PDF documents into interactive learning experiences. The system combines document processing, semantic search, and AI-powered content generation to create comprehensive educational resources.

### What You Can Do

🔍 **Search Documents**: Find relevant information using natural language queries  
📚 **Generate Lectures**: Create structured lessons from document content  
📝 **Create Quizzes**: Generate various types of questions automatically  
📊 **Build Assignments**: Design writing tasks and exercises  
🤖 **AI Tutoring**: Get intelligent responses to educational questions  
✅ **Grade Work**: Automatically assess student responses  
🎨 **Visual Content**: Generate educational images and charts  

## Getting Started

### System Requirements

- **Web Browser**: Modern browser with JavaScript enabled
- **Internet Connection**: Required for AI features
- **PDF Documents**: Up to 50MB per file
- **File Formats**: PDF only (other formats coming soon)

### First Steps

1. **Access the System**: Navigate to your Lurniva RAG instance
2. **Upload a Document**: Start with a small PDF (< 5MB) for testing
3. **Wait for Processing**: Processing time varies by document size
4. **Try Searching**: Use natural language queries to test the system
5. **Generate Content**: Create your first quiz or lecture

## Document Management

### Uploading Documents

#### Via Web Interface

1. Navigate to the upload section
2. Click "Choose File" and select your PDF
3. Wait for the upload and processing to complete
4. Note the generated Book ID for future reference

#### File Requirements

- **Format**: PDF files only
- **Size**: Maximum 50MB per file
- **Content**: Text-based PDFs work best
- **Language**: English language content (other languages coming soon)

#### Processing Times

| File Size | Typical Processing Time |
|-----------|------------------------|
| < 1MB | 2-10 seconds |
| 1-5MB | 10-30 seconds |
| 5-20MB | 30-120 seconds |
| 20-50MB | 2-5 minutes |

### Document Status

After upload, documents go through several stages:

1. **Uploading**: File transfer in progress
2. **Extracting**: Text extraction from PDF
3. **Processing**: Creating chunks and embeddings
4. **Storing**: Saving to vector database
5. **Complete**: Ready for search and content generation

### Managing Documents

#### Finding Your Documents

Each uploaded document receives a unique Book ID in the format:
```
book_1737158400000_a1b2c3d4
```

Use this ID to:
- Search within specific documents
- Generate content from specific sources
- Track document analytics
- Reference in API calls

#### Document Information

For each document, the system tracks:
- **File Name**: Original PDF filename
- **Book ID**: Unique identifier
- **Upload Date**: When the document was processed
- **Page Count**: Number of pages in the PDF
- **Chunk Count**: Number of text segments created
- **Word Count**: Total words extracted
- **Text Length**: Total characters processed

## Search and Discovery

### Basic Search

#### Simple Queries

Use natural language to search your documents:

```
"What is machine learning?"
"How does photosynthesis work?"
"Main benefits of renewable energy"
```

#### Advanced Search Tips

**Be Specific**: More specific queries return better results
- Good: "neural network backpropagation algorithm"
- Better: "gradient descent in backpropagation training"

**Use Context**: Include context words
- Good: "protein structure"
- Better: "protein secondary structure alpha helix"

**Ask Questions**: Frame as questions for better results
- Good: "climate change effects"
- Better: "What are the effects of climate change on ocean temperatures?"

### Search Results

#### Understanding Results

Each search result includes:
- **Relevance Score**: 0-1 scale (higher = more relevant)
- **Text Snippet**: Relevant portion of the document
- **Source Information**: Book ID and chunk location
- **Context**: Surrounding text for better understanding

#### Relevance Scores Guide

- **0.8-1.0**: Highly relevant, direct match
- **0.6-0.8**: Good relevance, related content
- **0.4-0.6**: Moderate relevance, may be useful
- **0.2-0.4**: Low relevance, tangentially related
- **0.0-0.2**: Poor match, likely not useful

### Search Strategies

#### Finding Specific Information

**Definitions**: "What is [term]" or "Define [concept]"
**Procedures**: "How to [action]" or "Steps for [process]"
**Examples**: "Example of [concept]" or "[concept] case study"
**Comparisons**: "Difference between [A] and [B]"

#### Exploring Topics

**Broad Overview**: Use general topic terms
**Deep Dive**: Use specific technical terminology
**Related Concepts**: Search for connected ideas
**Applications**: Look for "uses of" or "applications"

## Educational Content Generation

### Quiz Generation

#### Types of Questions

**Multiple Choice**
- 4 answer options (A, B, C, D)
- One correct answer
- Plausible distractors
- Automatic answer key

**True/False**
- Binary choice questions
- Clear true/false statements
- Explanation for correct answer

**Short Answer**
- Open-ended questions
- Key point identification
- Flexible acceptable answers

#### Quiz Configuration

**Question Count**: Choose 1-20 questions per quiz
**Difficulty Levels**:
- **Easy**: Basic recall and recognition
- **Medium**: Understanding and application
- **Hard**: Analysis and synthesis

**Topic Focus**: Specify particular topics or let the AI choose
**Target Audience**: 
- Elementary
- Middle School
- High School
- University
- Professional

#### Best Practices for Quizzes

1. **Start Small**: Begin with 5-10 questions to test quality
2. **Review Generated Content**: Always check questions before use
3. **Mix Question Types**: Combine multiple choice with other formats
4. **Consider Difficulty**: Match difficulty to your audience
5. **Test Yourself**: Take the quiz to ensure quality

### Lecture Generation

#### Lecture Structure

Generated lectures include:
- **Title and Overview**
- **Learning Objectives**
- **Main Content Sections**
- **Key Concepts and Definitions**
- **Examples and Applications**
- **Summary and Conclusions**
- **Suggested Activities**

#### Customization Options

**Duration**: Specify lecture length (15, 30, 45, 60+ minutes)
**Audience Level**: Match content complexity to audience
**Learning Objectives**: Specific goals you want to achieve
**Include Visuals**: Generate accompanying images
**Prerequisites**: Assumed prior knowledge
**Focus Topics**: Emphasize specific concepts

#### Lecture Quality Tips

1. **Provide Clear Topics**: Be specific about the lecture focus
2. **Set Appropriate Duration**: Match content depth to time
3. **Define Prerequisites**: Help the AI assume correct knowledge level
4. **Review Learning Objectives**: Ensure they match your goals
5. **Customize for Audience**: Adjust complexity and examples

### Assignment Generation

#### Assignment Types

**Essay Prompts**
- Analytical writing tasks
- Argumentative essays
- Reflective pieces
- Research questions

**Project Ideas**
- Hands-on activities
- Investigation projects
- Creative applications
- Problem-solving tasks

**Discussion Questions**
- Class discussion starters
- Critical thinking prompts
- Debate topics
- Group exploration questions

#### Assignment Configuration

**Complexity Level**: Match to student capabilities
**Length Requirements**: Specify expected response length
**Skills Focus**: Target specific learning skills
**Resources**: Indicate available materials
**Timeline**: Consider available time for completion

## AI Tutoring

### Interactive Learning

#### How AI Tutoring Works

1. **Ask Questions**: Use natural language questions
2. **Context Awareness**: AI considers document content
3. **Personalized Responses**: Tailored to your level
4. **Follow-up Questions**: Continue the conversation
5. **Source Citations**: See where answers come from

#### Effective Questioning

**Start Broad**: "What are the main concepts in this document?"
**Get Specific**: "Can you explain [specific concept] in detail?"
**Ask for Examples**: "Give me an example of [concept]"
**Seek Clarification**: "What does [term] mean in this context?"
**Request Applications**: "How is this used in real life?"

#### Conversation Features

**Conversation Memory**: AI remembers previous questions
**Progressive Learning**: Build on previous topics
**Clarification Requests**: Ask for more details
**Different Perspectives**: Request alternative explanations
**Connection Making**: Link concepts together

### Learning Strategies

#### Effective Tutoring Sessions

1. **Start with Overview**: Get document summary
2. **Identify Key Concepts**: List main ideas
3. **Deep Dive**: Explore concepts one by one
4. **Make Connections**: Link related ideas
5. **Practice Application**: Work through examples
6. **Test Understanding**: Ask for explanations back

#### Question Progression

**Level 1 - Recall**: "What is [concept]?"
**Level 2 - Comprehension**: "Explain [concept] in your own words"
**Level 3 - Application**: "How would you use [concept]?"
**Level 4 - Analysis**: "What are the components of [concept]?"
**Level 5 - Synthesis**: "How does [concept] relate to [other concept]?"
**Level 6 - Evaluation**: "What are the strengths and weaknesses?"

## Assessment and Grading

### Automatic Grading

#### What Can Be Graded

**Quiz Responses**
- Multiple choice questions
- True/false questions
- Short answer responses
- Fill-in-the-blank

**Written Assignments**
- Essay responses
- Short answer explanations
- Project descriptions
- Reflection pieces

#### Grading Criteria

**Content Understanding** (40%)
- Accuracy of information
- Depth of knowledge
- Concept comprehension

**Critical Thinking** (30%)
- Analysis quality
- Reasoning skills
- Problem-solving approach

**Communication** (20%)
- Clarity of expression
- Organization of ideas
- Grammar and style

**Evidence Usage** (10%)
- Source integration
- Supporting examples
- Data interpretation

### Feedback System

#### Types of Feedback

**Overall Assessment**
- General performance summary
- Strengths and areas for improvement
- Grade justification

**Criterion-Specific Feedback**
- Detailed comments for each grading criterion
- Specific suggestions for improvement
- Examples of good practice

**Constructive Suggestions**
- Actionable improvement recommendations
- Study suggestions
- Additional resources

#### Using Feedback Effectively

1. **Read Thoroughly**: Review all feedback sections
2. **Identify Patterns**: Look for recurring themes
3. **Prioritize Improvements**: Focus on major areas first
4. **Seek Clarification**: Ask questions about unclear feedback
5. **Track Progress**: Compare feedback over time

### Remedial Learning

#### When Additional Help is Needed

The system provides remedial learning when:
- Quiz scores are below 70%
- Assignment grades are unsatisfactory
- Multiple attempts show no improvement
- Specific knowledge gaps are identified

#### Remedial Learning Process

1. **Gap Analysis**: Identify specific knowledge gaps
2. **Targeted Content**: Generate focused learning materials
3. **Practice Opportunities**: Additional questions and exercises
4. **Progress Monitoring**: Track improvement over time
5. **Reassessment**: Test understanding again

## Visual Content

### Educational Images

#### Image Generation

The system can create educational visuals:
- **Diagrams**: Process flows and concept maps
- **Illustrations**: Scientific phenomena and abstract concepts
- **Charts and Graphs**: Data visualization
- **Historical Scenes**: Events and contexts
- **Technical Drawings**: Equipment and structures

#### Best Practices for Images

**Be Descriptive**: Provide detailed image prompts
**Specify Style**: Choose appropriate visual styles
**Consider Audience**: Match complexity to viewers
**Educational Focus**: Emphasize learning over aesthetics
**Verify Accuracy**: Check generated images for correctness

### Chart Generation

#### Chart Types

**Bar Charts**: Comparing categories
**Pie Charts**: Showing proportions
**Line Graphs**: Trends over time
**Scatter Plots**: Relationships between variables
**Flow Charts**: Process visualization
**Concept Maps**: Relationship diagrams

#### Creating Effective Charts

1. **Clear Labels**: Use descriptive titles and axis labels
2. **Appropriate Scale**: Choose scales that show data clearly
3. **Color Coding**: Use colors meaningfully
4. **Annotations**: Add explanatory notes
5. **Context**: Provide background information

## Admin Console

### Accessing Admin Features

#### Login Process

1. Navigate to `/admin` on your Lurniva RAG instance
2. Use your admin credentials (default: admin/admin)
3. Access enhanced features and system management

#### Admin Dashboard

**System Overview**
- Health status and performance metrics
- Document processing statistics
- User activity summaries
- Storage usage information

**Document Management**
- View all uploaded documents
- Document details and statistics
- Bulk operations and management
- Search and filtering capabilities

**System Configuration**
- Environment settings
- Feature toggles
- Performance tuning
- Integration settings

### System Monitoring

#### Health Checks

Monitor system health through:
- **API Status**: Check if all endpoints are responding
- **Model Status**: Verify AI models are loaded
- **Storage Status**: Confirm database connectivity
- **Performance Metrics**: Response times and throughput

#### Performance Analytics

Track system performance:
- **Processing Times**: Document upload and processing speeds
- **Search Performance**: Query response times
- **AI Generation Speed**: Content creation benchmarks
- **Error Rates**: Failed requests and issues

## Best Practices

### Document Preparation

#### Optimizing PDFs for Processing

**Text Quality**
- Use text-based PDFs rather than scanned images
- Ensure clear, readable fonts
- Check for OCR quality in scanned documents

**Document Structure**
- Organize content with clear headings
- Use consistent formatting
- Include table of contents when possible

**File Management**
- Use descriptive filenames
- Organize documents by topic or course
- Keep file sizes reasonable (under 20MB when possible)

### Content Generation

#### Getting Better Results

**Specific Prompts**: Provide detailed, specific requests
**Context Setting**: Give background information
**Iterative Refinement**: Generate, review, and refine
**Quality Review**: Always check generated content
**Customization**: Adapt content to your specific needs

#### Common Issues and Solutions

**Generic Content**: Make prompts more specific
**Incorrect Information**: Verify facts in source documents
**Inappropriate Level**: Adjust audience settings
**Missing Context**: Provide more background information
**Poor Quality**: Try different generation parameters

### Learning Optimization

#### Effective Study Strategies

**Progressive Learning**
1. Start with document overview
2. Identify key concepts
3. Deep dive into specifics
4. Practice with quizzes
5. Apply knowledge through assignments

**Active Engagement**
- Ask questions regularly
- Seek examples and applications
- Make connections between concepts
- Practice explaining concepts back
- Use multiple content types (text, visual, interactive)

#### Maximizing AI Tutoring

**Conversation Flow**
- Start with broad questions
- Progress to specific details
- Ask for clarification when needed
- Request different explanations
- Build on previous topics

**Question Quality**
- Be specific in your questions
- Ask "how" and "why" questions
- Request examples and applications
- Seek connections to other topics
- Ask for step-by-step explanations

---

## 🆘 Need Help?

### Quick Support

- **Troubleshooting**: Check [Troubleshooting Guide](troubleshooting.md)
- **FAQ**: See [Frequently Asked Questions](FAQ.md)
- **Admin Issues**: Review [Admin Guide](admin-guide.md)

### Contact Support

- **Technical Issues**: Create a support ticket
- **Feature Requests**: Submit through feedback system
- **Integration Help**: Consult API documentation
- **Educational Support**: Contact learning specialists

---

*Happy Learning with Lurniva RAG! 🎓*