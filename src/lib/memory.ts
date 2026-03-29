import {
  Memory,
  MemoryCategory,
  MemoryContextBundle,
  MemoryDraft,
  MemorySource,
  MemoryStability,
  MemoryStatus,
  Message,
  UserData,
} from '@/types/memory';

const STORAGE_KEY = 'companion_ai_data';

const PROFILE_CATEGORIES = new Set<MemoryCategory>([
  'identity_profile',
  'life_context',
  'interaction_preference',
  'feedback_for_evolution',
  'long_term_goal',
  'sensitive_boundary',
]);

const CATEGORY_LABELS = {
  identity_profile: '画像',
  life_context: '背景',
  interaction_preference: '偏好',
  emotional_pattern: '情绪',
  relationship_history: '关系',
  active_topic: '近期话题',
  feedback_for_evolution: '反馈',
  long_term_goal: '目标',
  sensitive_boundary: '边界',
} as const;

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getUserData(): UserData {
  if (typeof window === 'undefined') {
    return {
      memories: [],
      messages: [],
      preferences: { responseLength: 'short', preferredStyle: 'companionship' },
    };
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return {
      memories: [],
      messages: [],
      preferences: { responseLength: 'short', preferredStyle: 'companionship' },
    };
  }

  try {
    return JSON.parse(stored) as UserData;
  } catch {
    return {
      memories: [],
      messages: [],
      preferences: { responseLength: 'short', preferredStyle: 'companionship' },
    };
  }
}

export function saveUserData(data: UserData): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, '')
    .replace(/[，。！？、；：,.!?;:'"“”‘’()（）【】[\]{}]/g, '');
}

function getChineseFragments(word: string): string[] {
  const fragments = new Set<string>();
  const maxSize = Math.min(4, word.length);

  for (let size = 2; size <= maxSize; size += 1) {
    for (let start = 0; start <= word.length - size; start += 1) {
      fragments.add(word.slice(start, start + size));
    }
  }

  return [...fragments];
}

function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .trim();

  if (!cleaned) {
    return [];
  }

  const tokens = new Set<string>();

  for (const word of cleaned.split(/\s+/)) {
    if (!word) {
      continue;
    }

    if (/^[\u4e00-\u9fff]+$/u.test(word)) {
      for (const fragment of getChineseFragments(word)) {
        tokens.add(fragment);
      }

      continue;
    }

    if (word.length > 1) {
      tokens.add(word);
    }
  }

  return [...tokens];
}

function calculateTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return normalizeContent(left).includes(normalizeContent(right))
      || normalizeContent(right).includes(normalizeContent(left))
      ? 1
      : 0;
  }

  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(leftTokens.length, rightTokens.length);
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function stabilityScore(stability: MemoryStability): number {
  if (stability === 'high') {
    return 1;
  }

  if (stability === 'medium') {
    return 0.7;
  }

  return 0.45;
}

function layerScore(layer: Memory['layer']): number {
  if (layer === 'profile') {
    return 1;
  }

  if (layer === 'dynamic') {
    return 0.75;
  }

  return 0.6;
}

function pickHigherStability(left: MemoryStability, right: MemoryStability): MemoryStability {
  const order: MemoryStability[] = ['low', 'medium', 'high'];
  return order[Math.max(order.indexOf(left), order.indexOf(right))];
}

function inferSlot(category: MemoryCategory, content: string): string | null {
  const text = content.toLowerCase();

  switch (category) {
    case 'interaction_preference':
      return 'interaction.style';
    case 'feedback_for_evolution':
      return 'assistant.feedback';
    case 'sensitive_boundary':
      return 'boundary.general';
    case 'long_term_goal':
      return 'goal.primary';
    case 'identity_profile':
      if (/(我叫|名字)/.test(content)) return 'identity.name';
      if (/(学生|读研|读博|本科|上学)/.test(content)) return 'identity.education';
      if (/(工作|上班|职业|产品经理|程序员|设计师|运营|创业)/.test(content)) return 'identity.role';
      if (/(住在|来自|老家|在北京|在上海|在深圳|在杭州)/.test(content)) return 'identity.location';
      return 'identity.general';
    case 'life_context':
      if (/(学校|课程|作业|考试|论文)/.test(content)) return 'context.study';
      if (/(公司|团队|老板|同事|客户|项目)/.test(content)) return 'context.work';
      if (/(家人|父母|对象|伴侣|朋友|室友)/.test(content)) return 'context.relationships';
      return 'context.general';
    case 'emotional_pattern':
      if (/(焦虑|紧张|担心)/.test(content)) return 'emotion.anxiety';
      if (/(难过|委屈|伤心|失落)/.test(content)) return 'emotion.sadness';
      if (/(烦|生气|火大|暴躁)/.test(content)) return 'emotion.frustration';
      return 'emotion.general';
    case 'relationship_history':
      return text.includes('上次') || text.includes('之前') ? 'relationship.timeline' : null;
    case 'active_topic':
      return null;
    default:
      return null;
  }
}

function inferLayer(category: MemoryCategory, stability: MemoryStability): Memory['layer'] {
  if (PROFILE_CATEGORIES.has(category)) {
    return 'profile';
  }

  if (category === 'relationship_history') {
    return 'episodic';
  }

  if (category === 'active_topic' || category === 'emotional_pattern') {
    return 'dynamic';
  }

  return stability === 'high' ? 'profile' : 'dynamic';
}

function inferValidUntil(category: MemoryCategory, content: string, now: Date): string | null {
  if (category === 'active_topic') {
    if (/(今天|今晚|下午|晚上|明天|明早)/.test(content)) {
      return addDays(now, 2);
    }

    if (/(这周|本周)/.test(content)) {
      return addDays(now, 7);
    }

    if (/(这个月|本月)/.test(content)) {
      return addDays(now, 30);
    }

    return addDays(now, 14);
  }

  if (category === 'emotional_pattern' && /(最近|这阵子|这段时间|近期)/.test(content)) {
    return addDays(now, 21);
  }

  return null;
}

function defaultImportance(category: MemoryCategory): number {
  if (category === 'feedback_for_evolution' || category === 'interaction_preference') {
    return 0.92;
  }

  if (category === 'sensitive_boundary' || category === 'long_term_goal') {
    return 0.88;
  }

  if (category === 'active_topic') {
    return 0.78;
  }

  return 0.82;
}

function defaultConfidence(category: MemoryCategory, source: MemorySource): number {
  if (source === 'user_feedback') {
    return 0.96;
  }

  if (category === 'active_topic') {
    return 0.8;
  }

  return 0.86;
}

function defaultStability(category: MemoryCategory): MemoryStability {
  if (PROFILE_CATEGORIES.has(category)) {
    return 'high';
  }

  if (category === 'active_topic' || category === 'emotional_pattern') {
    return 'low';
  }

  return 'medium';
}

function refreshMemoryStatus(memory: Memory, now: Date): Memory {
  if (memory.status !== 'active') {
    return memory;
  }

  if (!memory.validUntil) {
    return memory;
  }

  if (new Date(memory.validUntil).getTime() > now.getTime()) {
    return memory;
  }

  return {
    ...memory,
    status: 'expired',
  };
}

export function createMemoryFromDraft(draft: MemoryDraft, userId: string, now: Date = new Date()): Memory {
  const stability = draft.stability ?? defaultStability(draft.category);
  const layer = draft.layer ?? inferLayer(draft.category, stability);

  return {
    id: generateId(),
    userId,
    category: draft.category,
    content: draft.content.trim(),
    confidence: draft.confidence ?? defaultConfidence(draft.category, draft.source),
    importance: draft.importance ?? defaultImportance(draft.category),
    source: draft.source,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    stability,
    usageCount: 0,
    layer,
    status: 'active',
    slot: draft.slot === undefined ? inferSlot(draft.category, draft.content) : draft.slot,
    validUntil:
      draft.validUntil === undefined
        ? inferValidUntil(draft.category, draft.content, now)
        : draft.validUntil,
    supersededBy: null,
    supersedes: [],
  };
}

export function addMemory(
  content: string,
  category: MemoryCategory,
  source: MemorySource,
  userId: string,
  importance = 0.7,
  confidence = 0.8,
  stability: MemoryStability = 'medium'
): Memory {
  return createMemoryFromDraft({
    category,
    content,
    source,
    importance,
    confidence,
    stability,
  }, userId);
}

export function calculateRecallScore(
  memory: Memory,
  context: string,
  now: Date = new Date()
): number {
  const freshMemory = refreshMemoryStatus(memory, now);
  if (freshMemory.status !== 'active') {
    return 0;
  }

  const referenceTime = Math.max(
    new Date(freshMemory.lastUsedAt).getTime(),
    new Date(freshMemory.createdAt).getTime()
  );
  const daysSinceReference = (now.getTime() - referenceTime) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - daysSinceReference / 45);
  const similarity = calculateTextSimilarity(freshMemory.content, context);

  return (
    similarity * 0.45 +
    freshMemory.importance * 0.2 +
    freshMemory.confidence * 0.15 +
    recency * 0.1 +
    stabilityScore(freshMemory.stability) * 0.05 +
    layerScore(freshMemory.layer) * 0.05
  );
}

export function getActiveMemories(memories: Memory[], now: Date = new Date()): Memory[] {
  return memories
    .map((memory) => refreshMemoryStatus(memory, now))
    .filter((memory) => memory.status === 'active');
}

export function buildMemoryContext(
  memories: Memory[],
  context: string,
  now: Date = new Date()
): MemoryContextBundle {
  const activeMemories = getActiveMemories(memories, now);
  const profile = activeMemories
    .filter((memory) => memory.layer === 'profile')
    .sort((left, right) => {
      const leftScore = left.importance + left.confidence + stabilityScore(left.stability);
      const rightScore = right.importance + right.confidence + stabilityScore(right.stability);
      return rightScore - leftScore;
    })
    .slice(0, 6);

  const profileIds = new Set(profile.map((memory) => memory.id));

  const temporal = activeMemories
    .filter((memory) => !profileIds.has(memory.id) && memory.validUntil)
    .map((memory) => ({
      memory,
      score: calculateRecallScore(memory, context, now),
    }))
    .filter((item) => item.score >= 0.2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((item) => item.memory);

  const reservedIds = new Set([...profileIds, ...temporal.map((memory) => memory.id)]);

  let relevant = activeMemories
    .filter((memory) => !reservedIds.has(memory.id))
    .map((memory) => ({
      memory,
      score: calculateRecallScore(memory, context, now),
    }))
    .filter((item) => item.score >= 0.28)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((item) => item.memory);

  if (relevant.length === 0) {
    relevant = activeMemories
      .filter((memory) => !reservedIds.has(memory.id))
      .sort((left, right) => {
        const leftScore = left.importance + left.confidence + layerScore(left.layer);
        const rightScore = right.importance + right.confidence + layerScore(right.layer);
        return rightScore - leftScore;
      })
      .slice(0, 2);
  }

  const all = [...profile, ...temporal, ...relevant].filter(
    (memory, index, collection) => collection.findIndex((item) => item.id === memory.id) === index
  );

  return {
    profile,
    relevant,
    temporal,
    all,
  };
}

export function getRelevantMemories(context: string, limit = 10): Memory[] {
  return buildMemoryContext(getUserData().memories, context).all.slice(0, limit);
}

function mergeWithExisting(existing: Memory, incoming: Memory, now: Date): Memory {
  return {
    ...existing,
    category: incoming.category,
    content: incoming.content,
    confidence: Math.max(existing.confidence, incoming.confidence),
    importance: Math.max(existing.importance, incoming.importance),
    source: incoming.source,
    lastUsedAt: now.toISOString(),
    stability: pickHigherStability(existing.stability, incoming.stability),
    layer: incoming.layer,
    slot: incoming.slot,
    validUntil: incoming.validUntil ?? existing.validUntil,
    status: 'active',
    supersededBy: null,
    supersedes: existing.supersedes,
  };
}

export function resolveMemoryWrite(
  existingMemories: Memory[],
  draft: MemoryDraft,
  userId: string,
  now: Date = new Date()
): { primaryMemory: Memory; upserts: Memory[]; retiredIds: string[] } {
  const candidate = createMemoryFromDraft(draft, userId, now);
  const activeMemories = getActiveMemories(existingMemories, now);
  const normalizedCandidate = normalizeContent(candidate.content);

  const exactMatch = activeMemories.find(
    (memory) =>
      memory.category === candidate.category
      && normalizeContent(memory.content) === normalizedCandidate
      && (candidate.slot ? memory.slot === candidate.slot : true)
  );

  if (exactMatch) {
    const merged = mergeWithExisting(exactMatch, candidate, now);
    return {
      primaryMemory: merged,
      upserts: [merged],
      retiredIds: [],
    };
  }

  const conflictingMemories = candidate.slot
    ? activeMemories.filter(
        (memory) =>
          memory.slot === candidate.slot
          && normalizeContent(memory.content) !== normalizedCandidate
      )
    : [];

  const retired = conflictingMemories.map((memory) => ({
    ...memory,
    status: 'superseded' as MemoryStatus,
    supersededBy: candidate.id,
  }));

  const primaryMemory: Memory = {
    ...candidate,
    supersedes: conflictingMemories.map((memory) => memory.id),
  };

  return {
    primaryMemory,
    upserts: [...retired, primaryMemory],
    retiredIds: conflictingMemories.map((memory) => memory.id),
  };
}

export function addMessage(role: 'user' | 'assistant', content: string): Message {
  const message: Message = {
    id: generateId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  const data = getUserData();
  data.messages.push(message);
  saveUserData(data);
  return message;
}

export function getRecentMessages(limit = 20): Message[] {
  return getUserData().messages.slice(-limit);
}

export function updateMemoryUsage(memoryId: string): void {
  const data = getUserData();
  const memory = data.memories.find((item) => item.id === memoryId);
  if (!memory) {
    return;
  }

  memory.lastUsedAt = new Date().toISOString();
  memory.usageCount += 1;
  saveUserData(data);
}

export function decayOldMemories(now: Date = new Date()): void {
  const data = getUserData();
  data.memories = data.memories
    .map((memory) => refreshMemoryStatus(memory, now))
    .filter((memory) => memory.status !== 'expired' || memory.layer === 'profile');
  saveUserData(data);
}

function formatSection(title: string, memories: Memory[]): string {
  if (memories.length === 0) {
    return '';
  }

  const lines = memories.map(
    (memory) => `- [${CATEGORY_LABELS[memory.category as keyof typeof CATEGORY_LABELS] || memory.category}] ${memory.content}`
  );

  return `${title}\n${lines.join('\n')}`;
}

export function formatMemoriesForPrompt(input: Memory[] | MemoryContextBundle): string {
  const bundle = Array.isArray(input)
    ? {
        profile: [] as Memory[],
        relevant: input,
        temporal: [] as Memory[],
        all: input,
      }
    : input;

  const sections = [
    formatSection('【稳定画像】', bundle.profile),
    formatSection('【近期动态】', bundle.temporal),
    formatSection('【当前相关记忆】', bundle.relevant),
  ].filter(Boolean);

  if (sections.length === 0) {
    return '';
  }

  return `【关于用户的重要信息】\n${sections.join('\n\n')}`;
}
