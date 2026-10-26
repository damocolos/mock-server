const crypto = require('crypto');
const EventEmitter = require('events');

// Global event emitter for real-time SSE broadcasts
const webhookEmitter = new EventEmitter();
webhookEmitter.setMaxListeners(200);

/**
 * Sliding Window Rate Limiter:
 * Enforces maximum 10 requests per minute per webhook ID.
 */
class SlidingWindowRateLimiter {
  constructor(limit = 10, windowMs = 60 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> [timestamp1, timestamp2, ...]

    // Clean up expired keys every 60 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.hits.entries()) {
        const valid = timestamps.filter(ts => now - ts < this.windowMs);
        if (valid.length === 0) {
          this.hits.delete(key);
        } else {
          this.hits.set(key, valid);
        }
      }
    }, 60000);

    if (interval.unref) interval.unref();
  }

  check(key) {
    const now = Date.now();
    const timestamps = (this.hits.get(key) || []).filter(ts => now - ts < this.windowMs);
    const count = timestamps.length;
    const remaining = Math.max(0, this.limit - count);
    const resetSeconds = timestamps.length > 0 
      ? Math.max(1, Math.ceil((timestamps[0] + this.windowMs - now) / 1000))
      : Math.ceil(this.windowMs / 1000);

    if (count >= this.limit) {
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        retryAfter: resetSeconds,
        resetSeconds
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      allowed: true,
      limit: this.limit,
      remaining: Math.max(0, this.limit - timestamps.length),
      resetSeconds
    };
  }

  reset(key) {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }
}

const rateLimiter = new SlidingWindowRateLimiter(10, 60 * 1000);

// In-memory fallback stores (used if PostgreSQL connection is offline)
const inMemoryWebhooks = new Map();
const inMemoryLogs = [];

/**
 * Initialize Webhook tables in PostgreSQL if available
 */
async function initWebhookTables(pool) {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        method VARCHAR(10) NOT NULL,
        headers JSONB NOT NULL,
        query JSONB DEFAULT '{}'::jsonb,
        body JSONB DEFAULT NULL,
        raw_body TEXT DEFAULT NULL,
        ip VARCHAR(45) NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_lookup ON webhook_logs(webhook_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
    `);
    console.log('[WebhookService] PostgreSQL webhook tables ready.');
    return true;
  } catch (err) {
    console.warn('[WebhookService] Database unavailable for table initialization, falling back to memory store:', err.message);
    return false;
  }
}

/**
 * Create a new Webhook ID
 */
async function createWebhook(pool, { name, metadata = {} }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const { rows } = await pool.query(
      'INSERT INTO webhooks (id, name, status, metadata, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, name || null, 'active', JSON.stringify(metadata), createdAt]
    );
    const webhook = rows[0];
    inMemoryWebhooks.set(webhook.id, webhook);
    return webhook;
  } catch (err) {
    console.warn('[WebhookService] DB insert failed, using in-memory store:', err.message);
    const fallbackWebhook = {
      id,
      name: name || null,
      status: 'active',
      metadata,
      created_at: createdAt,
      deleted_at: null
    };
    inMemoryWebhooks.set(id, fallbackWebhook);
    return fallbackWebhook;
  }
}

/**
 * Fetch a Webhook by ID
 */
async function getWebhook(pool, id) {
  try {
    const { rows } = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
    if (rows.length > 0) {
      return rows[0];
    }
    return inMemoryWebhooks.get(id) || null;
  } catch (err) {
    console.warn('[WebhookService] DB query failed, using in-memory store:', err.message);
    return inMemoryWebhooks.get(id) || null;
  }
}

/**
 * List all active/all webhooks
 */
async function listWebhooks(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT w.*, 
        (SELECT COUNT(*) FROM webhook_logs l WHERE l.webhook_id = w.id)::int AS delivery_count
      FROM webhooks w
      ORDER BY w.created_at DESC
    `);
    return rows;
  } catch (err) {
    console.warn('[WebhookService] DB list failed, using in-memory store:', err.message);
    return Array.from(inMemoryWebhooks.values()).map(w => {
      const deliveryCount = inMemoryLogs.filter(l => l.webhook_id === w.id).length;
      return { ...w, delivery_count: deliveryCount };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

/**
 * Soft delete a Webhook
 */
async function deleteWebhook(pool, id) {
  const deletedAt = new Date().toISOString();
  try {
    const { rowCount } = await pool.query(
      "UPDATE webhooks SET status = 'deleted', deleted_at = $1 WHERE id = $2 AND status != 'deleted'",
      [deletedAt, id]
    );
    if (inMemoryWebhooks.has(id)) {
      const w = inMemoryWebhooks.get(id);
      w.status = 'deleted';
      w.deleted_at = deletedAt;
    }
    return rowCount > 0 || inMemoryWebhooks.has(id);
  } catch (err) {
    console.warn('[WebhookService] DB delete failed, using in-memory store:', err.message);
    if (inMemoryWebhooks.has(id)) {
      const w = inMemoryWebhooks.get(id);
      w.status = 'deleted';
      w.deleted_at = deletedAt;
      return true;
    }
    return false;
  }
}

/**
 * Record an incoming webhook delivery log
 */
async function recordWebhookLog(pool, {
  webhook_id,
  method,
  headers,
  query,
  body,
  raw_body,
  ip,
  metadata
}) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const record = {
    id,
    webhook_id,
    method,
    headers: headers || {},
    query: query || {},
    body: body !== undefined ? body : null,
    raw_body: raw_body || null,
    ip: ip || '127.0.0.1',
    metadata: metadata || {},
    created_at: createdAt
  };

  try {
    const { rows } = await pool.query(
      `INSERT INTO webhook_logs (id, webhook_id, method, headers, query, body, raw_body, ip, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        webhook_id,
        method,
        JSON.stringify(headers || {}),
        JSON.stringify(query || {}),
        body !== undefined ? JSON.stringify(body) : null,
        raw_body || null,
        record.ip,
        JSON.stringify(metadata || {}),
        createdAt
      ]
    );
    const saved = rows[0];
    inMemoryLogs.unshift(saved);
    if (inMemoryLogs.length > 500) inMemoryLogs.pop(); // keep bounded

    // Emit real-time event for SSE
    webhookEmitter.emit('delivery', saved);
    return saved;
  } catch (err) {
    console.warn('[WebhookService] DB insert log failed, using in-memory fallback:', err.message);
    inMemoryLogs.unshift(record);
    if (inMemoryLogs.length > 500) inMemoryLogs.pop();

    webhookEmitter.emit('delivery', record);
    return record;
  }
}

/**
 * Get logs for a specific webhook or globally, sorted by created_at DESC
 */
async function getWebhookLogs(pool, { webhook_id = null, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  try {
    let queryStr = `
      SELECT l.*, w.name AS webhook_name, w.status AS webhook_status
      FROM webhook_logs l
      LEFT JOIN webhooks w ON l.webhook_id = w.id
    `;
    const params = [];

    if (webhook_id) {
      params.push(webhook_id);
      queryStr += ` WHERE l.webhook_id = $${params.length}`;
    }

    params.push(safeLimit, safeOffset);
    queryStr += ` ORDER BY l.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(queryStr, params);
    return rows;
  } catch (err) {
    console.warn('[WebhookService] DB get logs failed, using in-memory fallback:', err.message);
    let filtered = inMemoryLogs;
    if (webhook_id) {
      filtered = filtered.filter(l => l.webhook_id === webhook_id);
    }
    const sliced = filtered.slice(safeOffset, safeOffset + safeLimit).map(l => {
      const webhook = inMemoryWebhooks.get(l.webhook_id);
      return {
        ...l,
        webhook_name: webhook?.name || null,
        webhook_status: webhook?.status || 'active'
      };
    });
    return sliced;
  }
}

module.exports = {
  rateLimiter,
  webhookEmitter,
  initWebhookTables,
  createWebhook,
  getWebhook,
  listWebhooks,
  deleteWebhook,
  recordWebhookLog,
  getWebhookLogs
};
