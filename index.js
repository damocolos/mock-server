require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const webhookService = require('./webhookService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/xml'], limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Bootstrap webhook database tables
webhookService.initWebhookTables(pool).catch(err => {
  console.warn('[WebhookService] Table bootstrap warning:', err.message);
});

// Documentation & Webhook UI routes
app.get(['/docs', '/docs/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

app.get(['/webhooks', '/webhooks/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'webhooks.html'));
});

// --- Entry point ---
// show version fixed
// list out all the endpoints

const sendMockResponse = (res, statusCode, body) => {
  if (statusCode >= 100 && statusCode < 200) {
    const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
    res.socket.write(
      `HTTP/1.1 ${statusCode} Custom\r\n` +
      `Content-Type: application/json\r\n` +
      `Access-Control-Allow-Origin: *\r\n` +
      `Connection: close\r\n\r\n` +
      bodyStr
    );
    res.socket.destroy();
  } else {
    res.status(statusCode).json(body);
  }
};

app.get('/', async (req, res) => {
  let databaseHealhty = false;
  try {
    const response = await pool.query('SELECT NOW()');
    databaseHealhty = response.rows[0].now;
  } catch (error) {
    console.error('Database error on health check:', error);
    databaseHealhty = false;
  }
  res.status(200).json({
    success: true,
    message: 'Mock server is running',
    data: {
      version: '1.0.3',
      // pool indicator of healtiness
      database_health: databaseHealhty,
      documentation: '/docs'
    }
  });
});

// --- Mock API Endpoints ---

// 1. Success Responses
app.get('/api/success', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Request was successful',
    data: {
      id: 1,
      name: 'Mock Item',
      description: 'This is a mock item from the success endpoint'
    }
  });
});

app.post('/api/created', (req, res) => {
  const receivedData = req.body;
  res.status(201).json({
    success: true,
    message: 'Resource created successfully',
    data: receivedData
  });
});

app.get('/api/no-content', (req, res) => {
  res.status(204).send(); // 204 No Content
});

// 2. Client Error Responses
app.get('/api/bad-request', (req, res) => {
  res.status(400).json({
    success: false,
    error: 'Bad Request',
    message: 'The request could not be understood or was missing required parameters.'
  });
});

app.get('/api/unauthorized', (req, res) => {
  res.status(401).json({
    success: false,
    error: 'Unauthorized',
    message: 'Authentication is required and has failed or has not yet been provided.'
  });
});

app.get('/api/forbidden', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'Forbidden',
    message: 'You do not have the necessary permissions to access this resource.'
  });
});

app.get('/api/not-found', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested resource could not be found.'
  });
});

// 3. Server Error Responses
app.get('/api/server-error', (req, res) => {
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected condition was encountered on the server.'
  });
});

app.get('/api/bad-gateway', (req, res) => {
  res.status(502).json({
    success: false,
    error: 'Bad Gateway',
    message: 'The server received an invalid response from the upstream server.'
  });
});

// 4. Utility / Dynamic Endpoints

// Dynamic status code endpoint
app.all('/api/status/:code', (req, res) => {
  const code = parseInt(req.params.code, 10);

  // Check if valid HTTP status code (rough check between 100 and 599)
  if (isNaN(code) || code < 100 || code >= 600) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status code',
      message: 'Please provide a valid HTTP status code.'
    });
  }

  sendMockResponse(res, code, {
    success: code >= 200 && code < 300,
    message: `Returned status code ${code}`
  });
});

// Delayed response endpoint (simulates slow network)
app.get('/api/delay/:ms', (req, res) => {
  const ms = parseInt(req.params.ms, 10) || 1000; // default 1 second

  setTimeout(() => {
    res.status(200).json({
      success: true,
      message: `Response delayed by ${ms} milliseconds.`
    });
  }, ms);
});

// Echo endpoint (returns back what was sent)
app.all('/api/echo', (req, res) => {
  res.status(200).json({
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query
  });
});

// Random failure endpoint (returns 500 randomly, e.g., 50% of the time)
app.get('/api/flaky', (req, res) => {
  const isSuccess = Math.random() > 0.5;

  if (isSuccess) {
    res.status(200).json({ success: true, message: 'Flaky request succeeded this time!' });
  } else {
    res.status(500).json({ success: false, error: 'Internal Server Error', message: 'Flaky request failed!' });
  }
});

// Psp mock payout
app.post('/api/500/payout', (req, res) => {
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected condition was encountered on the server.'
  });
});

app.post('/api/502/payout', (req, res) => {
  res.status(502).json({
    success: false,
    error: 'Bad Gateway',
    message: 'The server received an invalid response from the upstream server.'
  });
});

app.post('/api/503/payout', (req, res) => {
  res.status(503).json({
    success: false,
    error: 'Service Unavailable',
    message: 'The server is not ready to handle the request.'
  });
});


app.post('/api/499/payout', (req, res) => {
  res.status(499).json({
    success: false,
    error: 'Client Closed Request',
    message: 'The client closed the connection.'
  });
});

app.post('/api/504/payout', (req, res) => {
  res.status(504).json({
    success: false,
    error: 'Gateway Timeout',
    message: 'The server did not receive a timely response from the upstream server.'
  });
});

app.post('/api/117/payout', (req, res) => {
  sendMockResponse(res, 117, {
    success: false,
    error: 'Unknown Error',
    message: 'Unknown error.'
  });
});

app.post('/api/unknown-error/payout', (req, res) => {
  res.status(407).json({
    success: false,
    error: 'Unknown Error',
    message: 'Unknown error.'
  });
});
// Create dynamic endpoint data
app.post('/api/mocks', async (req, res) => {
  try {
    const { status_code, response, label } = req.body;

    if (status_code === undefined || response === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'status_code and response are required.'
      });
    }

    const { rows } = await pool.query(
      'INSERT INTO apis (status_code, response, label) VALUES ($1, $2, $3) RETURNING *',
      [status_code, JSON.stringify(response), label || null]
    );

    res.status(201).json({
      success: true,
      message: 'API configuration created successfully.',
      data: rows[0]
    });
  } catch (err) {
    console.error('Database error on create:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create API configuration.'
    });
  }
});

// Update dynamic endpoint data
app.patch('/api/mocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_code, response, label } = req.body;

    // Update only the fields that are provided
    const { rowCount } = await pool.query(
      'UPDATE apis SET status_code = COALESCE($1, status_code), response = COALESCE($2, response), label = COALESCE($3, label) WHERE id = $4',
      [status_code, response ? JSON.stringify(response) : null, label, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'API configuration not found in database.'
      });
    }

    res.json({ success: true, message: 'API configuration updated successfully.' });
  } catch (err) {
    console.error('Database error on update:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update API configuration.'
    });
  }
});

// Get dynamic endpoint config
app.get('/api/mocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM apis WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'API configuration not found in database.'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Database error on get:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch API configuration.'
    });
  }
});

app.all(['/api/dynamic/:id', '/api/dynamic/:id/*path'], async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT status_code, response FROM apis WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'API configuration not found in database.'
      });
    }

    console.log(rows);

    const api = rows[0];
    sendMockResponse(res, api.status_code, api.response);
  } catch (err) {
    console.error('Database error:', err);
    sendMockResponse(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch API configuration from database.'
    });
  }
});

// ==========================================
// --- WEBHOOK RECEIVER ENGINE ENDPOINTS ---
// ==========================================

// 1. Create Webhook ID (API only)
app.post('/api/webhooks', async (req, res) => {
  try {
    const { name, metadata } = req.body || {};
    const webhook = await webhookService.createWebhook(pool, { name, metadata });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      success: true,
      message: 'Webhook endpoint created successfully.',
      data: {
        id: webhook.id,
        name: webhook.name,
        status: webhook.status,
        webhook_url: `${baseUrl}/api/webhooks/${webhook.id}/incoming`,
        relative_url: `/api/webhooks/${webhook.id}/incoming`,
        created_at: webhook.created_at
      }
    });
  } catch (err) {
    console.error('Error creating webhook:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create webhook endpoint.'
    });
  }
});

// 2. List all Webhooks
app.get('/api/webhooks', async (req, res) => {
  try {
    const webhooks = await webhookService.listWebhooks(pool);
    res.json({
      success: true,
      data: webhooks
    });
  } catch (err) {
    console.error('Error listing webhooks:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to retrieve webhooks.'
    });
  }
});

// 3. Get specific Webhook details
app.get('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = await webhookService.getWebhook(pool, id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook ID unidentified or not found.'
      });
    }

    res.json({
      success: true,
      data: webhook
    });
  } catch (err) {
    console.error('Error fetching webhook:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch webhook details.'
    });
  }
});

// 4. Soft-delete Webhook
app.delete('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const webhook = await webhookService.getWebhook(pool, id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook ID unidentified or not found.'
      });
    }

    if (webhook.status === 'deleted' || webhook.deleted_at) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Webhook endpoint is already deleted.'
      });
    }

    await webhookService.deleteWebhook(pool, id);

    res.json({
      success: true,
      message: 'Webhook deleted successfully.'
    });
  } catch (err) {
    console.error('Error deleting webhook:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete webhook.'
    });
  }
});

// 5. Inbound Webhook Receiver
// Flow: Rate limit check (10 req/min) -> Validate ID (404/410) -> Extract & Save -> 200 OK -> SSE broadcast
app.all(['/api/webhooks/:id/incoming', '/api/webhooks/:id'], async (req, res, next) => {
  // If matched standard REST routes on exact base path, allow them to proceed
  if (req.path === `/api/webhooks/${req.params.id}` && (req.method === 'GET' || req.method === 'DELETE')) {
    return next();
  }

  const { id } = req.params;

  // 1. Rate limiter: max 10 requests per minute per webhook ID
  const limitStatus = webhookService.rateLimiter.check(id);
  res.setHeader('X-RateLimit-Limit', limitStatus.limit);
  res.setHeader('X-RateLimit-Remaining', limitStatus.remaining);
  res.setHeader('X-RateLimit-Reset', limitStatus.resetSeconds);

  if (!limitStatus.allowed) {
    res.setHeader('Retry-After', limitStatus.retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Maximum 10 requests per minute allowed for this webhook endpoint.',
      retry_after_seconds: limitStatus.retryAfter
    });
  }

  try {
    // 2. Validate webhook existence and deletion status
    const webhook = await webhookService.getWebhook(pool, id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook ID unidentified or invalid.'
      });
    }

    if (webhook.status === 'deleted' || webhook.deleted_at) {
      return res.status(410).json({
        success: false,
        error: 'Gone',
        message: 'Webhook endpoint has been deleted or deactivated.'
      });
    }

    // 3. Extract request details: headers, body, query, ip, metadata
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
                     req.socket?.remoteAddress ||
                     req.ip ||
                     '127.0.0.1';

    let parsedBody = req.body;
    let rawBody = null;

    if (typeof req.body === 'string') {
      rawBody = req.body;
      try {
        parsedBody = JSON.parse(req.body);
      } catch {
        parsedBody = { raw: req.body };
      }
    } else if (req.body && typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
    }

    const metadata = {
      host: req.get('host'),
      protocol: req.protocol,
      userAgent: req.get('user-agent') || 'Unknown',
      contentType: req.get('content-type') || 'Unknown',
      contentLength: req.get('content-length') || null,
      receivedAt: new Date().toISOString()
    };

    // 4. Save record to database
    const savedLog = await webhookService.recordWebhookLog(pool, {
      webhook_id: id,
      method: req.method,
      headers: req.headers,
      query: req.query,
      body: parsedBody,
      raw_body: rawBody,
      ip: clientIp,
      metadata
    });

    // 5. Send status OK 200 once received
    return res.status(200).json({
      success: true,
      message: 'Webhook received successfully',
      data: {
        delivery_id: savedLog.id,
        webhook_id: id,
        timestamp: savedLog.created_at
      }
    });
  } catch (err) {
    console.error('Error handling incoming webhook:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to process incoming webhook.'
    });
  }
});

// 6. Get logs for a specific webhook (sorted created_at DESC)
app.get('/api/webhooks/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;

    const webhook = await webhookService.getWebhook(pool, id);
    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook ID unidentified or not found.'
      });
    }

    const logs = await webhookService.getWebhookLogs(pool, {
      webhook_id: id,
      limit,
      offset
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Error fetching webhook logs:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch webhook logs.'
    });
  }
});

// 7. Global Webhook Logs (for dashboard table sorted created_at DESC)
app.get('/api/webhooks-logs', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const logs = await webhookService.getWebhookLogs(pool, {
      webhook_id: null,
      limit,
      offset
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error('Error fetching global webhook logs:', err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch webhook logs.'
    });
  }
});

// 8. Server-Sent Events (SSE) Stream to push real-time received webhooks
app.get(['/api/webhooks/stream', '/api/webhooks/:id/stream'], (req, res) => {
  const targetWebhookId = req.params.id || null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Initial connection handshake
  res.write(`event: connected\ndata: ${JSON.stringify({
    status: 'connected',
    target: targetWebhookId || 'all',
    timestamp: new Date().toISOString()
  })}\n\n`);

  const onDelivery = (payload) => {
    if (!targetWebhookId || targetWebhookId === payload.webhook_id) {
      res.write(`event: webhook_received\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  webhookService.webhookEmitter.on('delivery', onDelivery);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    webhookService.webhookEmitter.removeListener('delivery', onDelivery);
    res.end();
  });
});

// Fallback for any other route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'API route not found. Check the URL.'
  });
});

// Start the server (only if not running on Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Mock server is running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /docs (API Documentation Page)');
    console.log('  GET  /webhooks (Live Webhook Inspector Dashboard)');
    console.log('  POST /api/webhooks (Create Webhook ID)');
    console.log('  GET  /api/webhooks (List Webhooks)');
    console.log('  GET  /api/webhooks/:id (Get Webhook)');
    console.log('  DEL  /api/webhooks/:id (Soft-delete Webhook)');
    console.log('  ALL  /api/webhooks/:id/incoming (Inbound Webhook Receiver - 10 req/min)');
    console.log('  GET  /api/webhooks/:id/logs (Webhook Logs DESC)');
    console.log('  GET  /api/webhooks-logs (Global Logs DESC)');
    console.log('  GET  /api/webhooks/stream (SSE Real-time Stream)');
    console.log('  POST /api/mocks');
    console.log('  GET  /api/mocks/:id');
    console.log('  PATCH /api/mocks/:id');
    console.log('  ALL  /api/dynamic/:id/*path');
    console.log('  GET  /api/success');
    console.log('  POST /api/created');
    console.log('  GET  /api/no-content');
    console.log('  GET  /api/bad-request');
    console.log('  GET  /api/unauthorized');
    console.log('  GET  /api/forbidden');
    console.log('  GET  /api/not-found');
    console.log('  GET  /api/server-error');
    console.log('  GET  /api/bad-gateway');
    console.log('  ALL  /api/status/:code');
    console.log('  GET  /api/delay/:ms');
    console.log('  ALL  /api/echo');
    console.log('  GET  /api/flaky');
    console.log('  POST /api/500/payout');
    console.log('  POST /api/502/payout');
    console.log('  POST /api/503/payout');
    console.log('  POST /api/499/payout');
    console.log('  POST /api/504/payout');
    console.log('  POST /api/407/payout');
  });
}

// Export the Express API
module.exports = app;
