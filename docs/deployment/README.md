# Deployment Guide

This comprehensive guide covers deploying Lurniva RAG in various environments, from development to production.

## 🚀 Deployment Options

### Quick Overview

| Environment | Best For | Complexity | Scalability |
|-------------|----------|------------|-------------|
| **Local Development** | Testing, development | Low | Single machine |
| **VPS/Cloud Server** | Small-medium deployments | Medium | Vertical scaling |
| **Docker Container** | Containerized deployments | Medium | Horizontal scaling |
| **Kubernetes** | Large-scale production | High | Auto-scaling |
| **Serverless** | Event-driven workloads | Medium | Auto-scaling |

## 🖥 Local Development Deployment

### Prerequisites

- Node.js 18+
- 4GB+ RAM
- 10GB+ disk space

### Setup

```bash
# Clone and setup
git clone <repository-url>
cd Lurniva-RAG
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development server
npm run dev
```

### Development Configuration

```env
# .env for development
NODE_ENV=development
PORT=3000
DEBUG=lurniva-rag:*

# OpenAI (required for AI features)
OPENAI_API_KEY=your_openai_api_key_here

# Storage (optional - uses in-memory if not set)
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=books_dev

# Upload settings
MAX_FILE_SIZE=10000000  # 10MB for faster testing
UPLOAD_DIR=./uploads

# Session
SESSION_SECRET=development-secret-change-in-production
```

## 🌐 VPS/Cloud Server Deployment

### Recommended Specifications

**Minimum Requirements:**
- 2 CPU cores
- 4GB RAM
- 20GB SSD storage
- Ubuntu 20.04+ or similar

**Recommended:**
- 4 CPU cores
- 8GB RAM
- 50GB SSD storage
- Load balancer (for multiple instances)

### Step-by-Step Deployment

#### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx for reverse proxy
sudo apt install nginx -y

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

#### 2. Application Setup

```bash
# Create app user
sudo useradd -m -s /bin/bash lurniva
sudo usermod -aG sudo lurniva

# Switch to app user
sudo su - lurniva

# Clone application
git clone <repository-url> lurniva-rag
cd lurniva-rag

# Install dependencies (production only)
npm ci --only=production

# Create directories
mkdir -p uploads logs
chmod 755 uploads
```

#### 3. Environment Configuration

```bash
# Create production environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000

# OpenAI Configuration
OPENAI_API_KEY=${OPENAI_API_KEY}

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=books_production

# Session Security
SESSION_SECRET=${SESSION_SECRET}
SESSION_SECURE=true
SESSION_HTTP_ONLY=true

# Upload Configuration
MAX_FILE_SIZE=50000000
UPLOAD_DIR=/home/lurniva/lurniva-rag/uploads

# Security
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FILE=/home/lurniva/lurniva-rag/logs/app.log
EOF

# Secure environment file
chmod 600 .env
```

#### 4. Process Management with PM2

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'lurniva-rag',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '2G',
    node_args: '--max-old-space-size=4096'
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by the command above
```

#### 5. Nginx Reverse Proxy

```bash
# Create nginx configuration
sudo cat > /etc/nginx/sites-available/lurniva-rag << EOF
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 300s;
    }

    # Handle large file uploads
    client_max_body_size 50M;

    # Static file serving (if needed)
    location /static/ {
        alias /home/lurniva/lurniva-rag/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/lurniva-rag /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. SSL Certificate

```bash
# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### 7. Qdrant Database Setup (Optional)

```bash
# Install Docker
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker

# Run Qdrant
sudo docker run -d \
  --name qdrant \
  -p 6333:6333 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:latest

# Or install Qdrant directly
wget https://github.com/qdrant/qdrant/releases/download/v1.7.0/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
sudo mv qdrant /usr/local/bin/

# Create systemd service
sudo cat > /etc/systemd/system/qdrant.service << EOF
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
Type=simple
User=lurniva
WorkingDirectory=/home/lurniva/qdrant_data
ExecStart=/usr/local/bin/qdrant
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable qdrant
sudo systemctl start qdrant
```

## 🐳 Docker Deployment

### Docker Configuration

#### Dockerfile

```dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p uploads logs && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "http.get('http://localhost:3000/api/v1/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Start command
CMD ["node", "server.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  lurniva-rag:
    build: .
    container_name: lurniva-rag
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - QDRANT_URL=http://qdrant:6333
      - COLLECTION_NAME=books_production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      - qdrant
    networks:
      - lurniva-network

  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    restart: unless-stopped
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - lurniva-network

  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - lurniva-rag
    networks:
      - lurniva-network

volumes:
  qdrant_data:

networks:
  lurniva-network:
    driver: bridge
```

#### Environment File for Docker

```bash
# .env file for Docker
NODE_ENV=production
OPENAI_API_KEY=your_api_key_here
SESSION_SECRET=your_super_secure_session_secret
POSTGRES_PASSWORD=secure_database_password
```

### Docker Deployment Commands

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f lurniva-rag

# Update application
git pull
docker-compose build lurniva-rag
docker-compose up -d lurniva-rag

# Backup data
docker-compose exec qdrant tar czf /qdrant/backup.tar.gz /qdrant/storage

# Monitor resources
docker stats

# Scale services
docker-compose up -d --scale lurniva-rag=3
```

## ☸️ Kubernetes Deployment

### Kubernetes Manifests

#### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: lurniva-rag-config
data:
  NODE_ENV: "production"
  PORT: "3000"
  QDRANT_URL: "http://qdrant-service:6333"
  COLLECTION_NAME: "books_production"
  MAX_FILE_SIZE: "50000000"
```

#### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: lurniva-rag-secret
type: Opaque
data:
  OPENAI_API_KEY: <base64-encoded-api-key>
  SESSION_SECRET: <base64-encoded-session-secret>
```

#### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lurniva-rag
  labels:
    app: lurniva-rag
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lurniva-rag
  template:
    metadata:
      labels:
        app: lurniva-rag
    spec:
      containers:
      - name: lurniva-rag
        image: lurniva-rag:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: lurniva-rag-config
              key: NODE_ENV
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: lurniva-rag-secret
              key: OPENAI_API_KEY
        envFrom:
        - configMapRef:
            name: lurniva-rag-config
        - secretRef:
            name: lurniva-rag-secret
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2000m"
            memory: "4Gi"
        readinessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
        volumeMounts:
        - name: uploads
          mountPath: /app/uploads
      volumes:
      - name: uploads
        persistentVolumeClaim:
          claimName: lurniva-rag-uploads
```

#### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: lurniva-rag-service
spec:
  selector:
    app: lurniva-rag
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

#### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lurniva-rag-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - yourdomain.com
    secretName: lurniva-rag-tls
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: lurniva-rag-service
            port:
              number: 80
```

### Kubernetes Deployment Commands

```bash
# Apply configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get deployments
kubectl get pods
kubectl get services

# View logs
kubectl logs -f deployment/lurniva-rag

# Scale deployment
kubectl scale deployment lurniva-rag --replicas=5

# Update deployment
kubectl set image deployment/lurniva-rag lurniva-rag=lurniva-rag:v1.1.0

# Check resource usage
kubectl top nodes
kubectl top pods
```

## 🌩 Serverless Deployment

### AWS Lambda

#### Serverless Framework Configuration

```yaml
# serverless.yml
service: lurniva-rag

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  stage: ${opt:stage, 'dev'}
  environment:
    NODE_ENV: ${self:provider.stage}
    OPENAI_API_KEY: ${env:OPENAI_API_KEY}
    SESSION_SECRET: ${env:SESSION_SECRET}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:GetObject
        - s3:PutObject
      Resource: "arn:aws:s3:::lurniva-uploads/*"

functions:
  api:
    handler: lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
    timeout: 300
    memorySize: 2048

plugins:
  - serverless-offline
  - serverless-domain-manager

custom:
  customDomain:
    domainName: api.yourdomain.com
    stage: ${self:provider.stage}
    createRoute53Record: true
```

#### Lambda Handler

```javascript
// lambda.js
import serverless from 'serverless-http';
import app from './server.js';

export const handler = serverless(app);
```

### Vercel Deployment

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "OPENAI_API_KEY": "@openai-api-key",
    "SESSION_SECRET": "@session-secret"
  },
  "functions": {
    "server.js": {
      "maxDuration": 300
    }
  }
}
```

## 📊 Monitoring and Logging

### Health Monitoring

```javascript
// Add to server.js
app.get('/api/v1/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    embedding_model_loaded: !!global.embeddingPipeline,
    storage_backend: process.env.QDRANT_URL ? 'qdrant' : 'in-memory'
  };
  
  res.json(health);
});

// Detailed metrics endpoint (authenticated)
app.get('/api/v1/metrics', requireAuth, (req, res) => {
  const metrics = {
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version
    },
    application: {
      documentsProcessed: getDocumentCount(),
      searchQueries: getSearchCount(),
      aiRequestsToday: getAIRequestCount(),
      averageResponseTime: getAverageResponseTime()
    }
  };
  
  res.json(metrics);
});
```

### Logging Configuration

```javascript
// utils/logger.js
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'lurniva-rag' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

### Application Performance Monitoring (APM)

```javascript
// monitoring/apm.js
import newrelic from 'newrelic';
// or
import * as Sentry from '@sentry/node';

// Sentry configuration
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});

// Performance tracking
export function trackPerformance(operation, fn) {
  return async (...args) => {
    const transaction = Sentry.startTransaction({
      op: operation,
      name: `${operation}`
    });
    
    try {
      const result = await fn(...args);
      transaction.setStatus('ok');
      return result;
    } catch (error) {
      transaction.setStatus('error');
      Sentry.captureException(error);
      throw error;
    } finally {
      transaction.finish();
    }
  };
}
```

## 🔧 Configuration Management

### Environment-Specific Configurations

```javascript
// config/index.js
const configs = {
  development: {
    server: {
      port: 3000,
      cors: { origin: true }
    },
    openai: {
      timeout: 30000,
      retries: 1
    },
    uploads: {
      maxSize: 10 * 1024 * 1024, // 10MB
      cleanup: false
    }
  },
  
  production: {
    server: {
      port: process.env.PORT || 3000,
      cors: { origin: process.env.CORS_ORIGIN }
    },
    openai: {
      timeout: 60000,
      retries: 3
    },
    uploads: {
      maxSize: 50 * 1024 * 1024, // 50MB
      cleanup: true
    }
  }
};

export default configs[process.env.NODE_ENV] || configs.development;
```

### Secrets Management

```bash
# Using AWS Secrets Manager
aws secretsmanager create-secret \
  --name "lurniva-rag/production" \
  --description "Lurniva RAG Production Secrets" \
  --secret-string '{
    "OPENAI_API_KEY": "your_openai_key",
    "SESSION_SECRET": "your_session_secret",
    "DATABASE_URL": "your_database_url"
  }'

# Using HashiCorp Vault
vault kv put secret/lurniva-rag \
  openai_api_key="your_openai_key" \
  session_secret="your_session_secret"
```

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
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
    - run: npm ci
    - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Build Docker image
      run: docker build -t lurniva-rag:${{ github.sha }} .
    - name: Push to registry
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker push lurniva-rag:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
    - name: Deploy to production
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          docker pull lurniva-rag:${{ github.sha }}
          docker-compose down
          docker-compose up -d
```

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Environment variables configured
- [ ] Secrets properly managed
- [ ] Database/storage setup
- [ ] SSL certificates configured
- [ ] Monitoring tools setup
- [ ] Backup strategy implemented
- [ ] Load testing completed
- [ ] Security audit passed

### Post-Deployment

- [ ] Health checks passing
- [ ] Monitoring alerts configured
- [ ] Log aggregation working
- [ ] Performance metrics baseline
- [ ] Auto-scaling configured
- [ ] Backup verification
- [ ] Documentation updated
- [ ] Team notification

### Rollback Plan

- [ ] Previous version tagged
- [ ] Rollback procedure documented
- [ ] Database migration rollback ready
- [ ] Monitoring for rollback scenarios
- [ ] Communication plan for issues

---

## 🆘 Troubleshooting

### Common Issues

**Memory Issues**
```bash
# Increase Node.js memory
node --max-old-space-size=4096 server.js

# Monitor memory usage
docker stats
htop
```

**Port Conflicts**
```bash
# Find process using port
lsof -i :3000
netstat -tulpn | grep 3000

# Kill process
kill -9 <PID>
```

**Permission Issues**
```bash
# Fix file permissions
chmod -R 755 uploads/
chown -R app:app /app/
```

### Health Check Failures

```bash
# Check application logs
pm2 logs lurniva-rag
docker logs lurniva-rag

# Test endpoints manually
curl -f http://localhost:3000/api/v1/health

# Check dependencies
curl -f http://localhost:6333/collections
```

---

For more deployment scenarios and advanced configurations, see the [Performance Tuning](performance.md) and [Security Guide](security.md).

*Happy Deploying! 🚀*