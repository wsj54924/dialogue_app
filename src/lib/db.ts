import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { ChatState, Conversation, Memory, Message, User } from '@/types/memory';

let client: Client | null = null;
let initialized = false;

function getDatabaseUrl(): string {
  const configuredUrl = process.env.TURSO_DATABASE_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const dataDir = path.join(process.cwd(), '.data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'dialogue.db').replace(/\\/g, '/');
  return `file:${dbPath}`;
}

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: getDatabaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  return client;
}

async function ensureMemoryColumns(db: Client) {
  const result = await db.execute('PRAGMA table_info(memories)');
  const columns = new Set(result.rows.map((row) => String(row.name)));
  const alterations: string[] = [];

  if (!columns.has('layer')) {
    alterations.push("ALTER TABLE memories ADD COLUMN layer TEXT");
  }

  if (!columns.has('status')) {
    alterations.push("ALTER TABLE memories ADD COLUMN status TEXT");
  }

  if (!columns.has('slot')) {
    alterations.push("ALTER TABLE memories ADD COLUMN slot TEXT");
  }

  if (!columns.has('valid_until')) {
    alterations.push("ALTER TABLE memories ADD COLUMN valid_until TEXT");
  }

  if (!columns.has('superseded_by')) {
    alterations.push("ALTER TABLE memories ADD COLUMN superseded_by TEXT");
  }

  if (!columns.has('supersedes')) {
    alterations.push("ALTER TABLE memories ADD COLUMN supersedes TEXT");
  }

  for (const statement of alterations) {
    await db.execute(statement);
  }

  await db.execute(
    `UPDATE memories
     SET layer = COALESCE(layer, 'dynamic'),
         status = COALESCE(status, 'active'),
         supersedes = COALESCE(supersedes, '[]')`
  );
}

async function runMigrations() {
  if (initialized) {
    return;
  }

  const db = getClient();
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        user_id TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )`,
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL,
        importance REAL NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        stability TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        layer TEXT NOT NULL DEFAULT 'dynamic',
        status TEXT NOT NULL DEFAULT 'active',
        slot TEXT,
        valid_until TEXT,
        superseded_by TEXT,
        supersedes TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
    ],
    'write'
  );

  await ensureMemoryColumns(db);
  await ensureUserColumns(db);
  initialized = true;
}

async function ensureUserColumns(db: Client) {
  const convResult = await db.execute('PRAGMA table_info(conversations)');
  const convColumns = new Set(convResult.rows.map((row) => String(row.name)));
  if (!convColumns.has('user_id')) {
    await db.execute("ALTER TABLE conversations ADD COLUMN user_id TEXT DEFAULT 'default-user'");
  }

  const memResult = await db.execute('PRAGMA table_info(memories)');
  const memColumns = new Set(memResult.rows.map((row) => String(row.name)));
  if (!memColumns.has('user_id')) {
    await db.execute("ALTER TABLE memories ADD COLUMN user_id TEXT DEFAULT 'default-user'");
  }
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    userId: String(row.user_id ?? 'default-user'),
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content),
    timestamp: String(row.timestamp),
  };
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? 'default-user'),
    category: row.category as Memory['category'],
    content: String(row.content),
    confidence: Number(row.confidence),
    importance: Number(row.importance),
    source: row.source as Memory['source'],
    createdAt: String(row.created_at),
    lastUsedAt: String(row.last_used_at),
    stability: row.stability as Memory['stability'],
    usageCount: Number(row.usage_count),
    layer: (row.layer as Memory['layer']) ?? 'dynamic',
    status: (row.status as Memory['status']) ?? 'active',
    slot: row.slot ? String(row.slot) : null,
    validUntil: row.valid_until ? String(row.valid_until) : null,
    supersededBy: row.superseded_by ? String(row.superseded_by) : null,
    supersedes: parseJsonArray(row.supersedes),
  };
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeConversationTitle(seed?: string): string {
  if (!seed) {
    return '新对话';
  }

  const clean = seed.replace(/\s+/g, ' ').trim();
  return clean.length > 18 ? `${clean.slice(0, 18)}...` : clean;
}

// Message functions
export async function listMessages(conversationId: string): Promise<Message[]> {
  await runMigrations();
  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id, role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
    args: [conversationId],
  });

  return result.rows.map((row) => rowToMessage(row));
}

export async function insertMessages(conversationId: string, messages: Message[]) {
  if (messages.length === 0) {
    return;
  }

  await runMigrations();
  const db = getClient();
  const statements = messages.map((message) => ({
    sql: 'INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
    args: [message.id, conversationId, message.role, message.content, message.timestamp],
  }));

  await db.batch(statements, 'write');
  await db.execute({
    sql: 'UPDATE conversations SET updated_at = ? WHERE id = ?',
    args: [new Date().toISOString(), conversationId],
  });
}

export async function updateConversationTitle(conversationId: string, title: string) {
  await runMigrations();
  const db = getClient();
  await db.execute({
    sql: 'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    args: [makeConversationTitle(title), new Date().toISOString(), conversationId],
  });
}

export async function markMemoriesUsed(memoryIds: string[]) {
  if (memoryIds.length === 0) {
    return;
  }

  await runMigrations();
  const db = getClient();
  const now = new Date().toISOString();
  const statements = memoryIds.map((id) => ({
    sql: 'UPDATE memories SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?',
    args: [now, id],
  }));

  await db.batch(statements, 'write');
}

// User functions
export async function createUser(username: string, passwordHash: string, displayName?: string): Promise<User> {
  await runMigrations();
  const db = getClient();
  const now = new Date().toISOString();
  const user: User = {
    id: createId(),
    username,
    displayName: displayName ?? null,
    createdAt: now,
    lastLoginAt: null,
  };

  await db.execute({
    sql: 'INSERT INTO users (id, username, password_hash, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [user.id, user.username, passwordHash, user.displayName, user.createdAt, user.lastLoginAt],
  });

  return user;
}

export async function getUserByUsername(username: string): Promise<(User & { passwordHash: string }) | null> {
  await runMigrations();
  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id, username, password_hash, display_name, created_at, last_login_at FROM users WHERE username = ? LIMIT 1',
    args: [username],
  });

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    displayName: row.display_name ? String(row.display_name) : null,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export async function getUserById(userId: string): Promise<User | null> {
  await runMigrations();
  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id, username, display_name, created_at, last_login_at FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  });

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: row.display_name ? String(row.display_name) : null,
    createdAt: String(row.created_at),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
  };
}

export async function updateLastLogin(userId: string): Promise<void> {
  await runMigrations();
  const db = getClient();
  await db.execute({
    sql: 'UPDATE users SET last_login_at = ? WHERE id = ?',
    args: [new Date().toISOString(), userId],
  });
}

export async function updateUserDisplayName(userId: string, displayName: string): Promise<void> {
  await runMigrations();
  const db = getClient();
  await db.execute({
    sql: 'UPDATE users SET display_name = ? WHERE id = ?',
    args: [displayName, userId],
  });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await runMigrations();
  const db = getClient();
  await db.execute({
    sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
    args: [passwordHash, userId],
  });
}

// Conversation functions with user support
export async function listConversations(userId: string): Promise<Conversation[]> {
  await runMigrations();
  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id, title, created_at, updated_at, user_id FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
    args: [userId],
  });
  return result.rows.map((row) => rowToConversation(row));
}

export async function createConversation(userId: string, title?: string): Promise<Conversation> {
  await runMigrations();
  const db = getClient();
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: createId(),
    title: makeConversationTitle(title),
    createdAt: now,
    updatedAt: now,
    userId,
  };

  await db.execute({
    sql: 'INSERT INTO conversations (id, title, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?)',
    args: [conversation.id, conversation.title, conversation.createdAt, conversation.updatedAt, conversation.userId],
  });

  return conversation;
}

export async function getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
  await runMigrations();
  const db = getClient();
  const result = await db.execute({
    sql: 'SELECT id, title, created_at, updated_at, user_id FROM conversations WHERE id = ? AND user_id = ? LIMIT 1',
    args: [conversationId, userId],
  });

  return result.rows[0] ? rowToConversation(result.rows[0]) : null;
}

export async function ensureConversation(userId: string, conversationId?: string): Promise<Conversation> {
  await runMigrations();

  if (conversationId) {
    const existing = await getConversation(userId, conversationId);
    if (existing) {
      return existing;
    }
  }

  const conversations = await listConversations(userId);
  if (conversations.length > 0) {
    return conversations[0];
  }

  return createConversation(userId, '默认对话');
}

export async function deleteConversation(userId: string, conversationId: string): Promise<Conversation> {
  await runMigrations();
  const db = getClient();
  await db.execute({ sql: 'DELETE FROM messages WHERE conversation_id = ?', args: [conversationId] });
  await db.execute({ sql: 'DELETE FROM conversations WHERE id = ? AND user_id = ?', args: [conversationId, userId] });

  const remaining = await listConversations(userId);
  if (remaining.length === 0) {
    return createConversation(userId, '新对话');
  }

  return remaining[0];
}

// Memory functions with user support
export async function listMemories(userId: string, limit = 64): Promise<Memory[]> {
  await runMigrations();
  const db = getClient();
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `SELECT id, user_id, category, content, confidence, importance, source, created_at, last_used_at,
                 stability, usage_count, layer, status, slot, valid_until, superseded_by, supersedes
          FROM memories
          WHERE user_id = ?
            AND COALESCE(status, 'active') = 'active'
            AND (valid_until IS NULL OR valid_until > ?)
          ORDER BY importance DESC, last_used_at DESC
          LIMIT ?`,
    args: [userId, now, limit],
  });

  return result.rows.map((row) => rowToMemory(row));
}

function memoryToStatement(memory: Memory) {
  return {
    sql: `INSERT INTO memories (
            id, user_id, category, content, confidence, importance, source, created_at, last_used_at,
            stability, usage_count, layer, status, slot, valid_until, superseded_by, supersedes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            content = excluded.content,
            confidence = excluded.confidence,
            importance = excluded.importance,
            source = excluded.source,
            created_at = excluded.created_at,
            last_used_at = excluded.last_used_at,
            stability = excluded.stability,
            usage_count = excluded.usage_count,
            layer = excluded.layer,
            status = excluded.status,
            slot = excluded.slot,
            valid_until = excluded.valid_until,
            superseded_by = excluded.superseded_by,
            supersedes = excluded.supersedes`,
    args: [
      memory.id,
      memory.userId,
      String(memory.category),
      memory.content,
      memory.confidence,
      memory.importance,
      String(memory.source),
      memory.createdAt,
      memory.lastUsedAt,
      String(memory.stability),
      memory.usageCount,
      String(memory.layer),
      String(memory.status),
      memory.slot,
      memory.validUntil,
      memory.supersededBy,
      JSON.stringify(memory.supersedes),
    ],
  };
}

export async function upsertMemories(memories: Memory[]) {
  if (memories.length === 0) {
    return;
  }

  await runMigrations();
  const db = getClient();
  await db.batch(memories.map((memory) => memoryToStatement(memory)), 'write');
}

// Chat state with user support
export async function getChatState(userId: string, conversationId?: string): Promise<ChatState> {
  const conversation = await ensureConversation(userId, conversationId);
  const [conversations, messages, memories] = await Promise.all([
    listConversations(userId),
    listMessages(conversation.id),
    listMemories(userId),
  ]);

  return {
    conversations,
    conversation,
    messages,
    memories,
    searchEnabled: Boolean(process.env.TAVILY_API_KEY),
  };
}

export async function resetChatState(userId: string): Promise<Conversation> {
  await runMigrations();
  const db = getClient();

  // Delete user's messages through their conversations
  const conversations = await listConversations(userId);
  for (const conv of conversations) {
    await db.execute({ sql: 'DELETE FROM messages WHERE conversation_id = ?', args: [conv.id] });
  }

  await db.execute({ sql: 'DELETE FROM memories WHERE user_id = ?', args: [userId] });
  await db.execute({ sql: 'DELETE FROM conversations WHERE user_id = ?', args: [userId] });

  return createConversation(userId, '默认对话');
}
