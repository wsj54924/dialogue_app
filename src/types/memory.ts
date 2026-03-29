export interface User {
  id: string;
  username: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export type MemoryCategory =
  | 'identity_profile'
  | 'life_context'
  | 'interaction_preference'
  | 'emotional_pattern'
  | 'relationship_history'
  | 'active_topic'
  | 'feedback_for_evolution'
  | 'long_term_goal'
  | 'sensitive_boundary';

export type MemorySource =
  | 'explicit_user_statement'
  | 'repeated_pattern_inference'
  | 'user_feedback'
  | 'conversation_summary';

export type MemoryStability = 'low' | 'medium' | 'high';
export type MemoryLayer = 'profile' | 'dynamic' | 'episodic';
export type MemoryStatus = 'active' | 'superseded' | 'expired' | 'archived';

export interface Memory {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  importance: number;
  source: MemorySource;
  createdAt: string;
  lastUsedAt: string;
  stability: MemoryStability;
  usageCount: number;
  layer: MemoryLayer;
  status: MemoryStatus;
  slot: string | null;
  validUntil: string | null;
  supersededBy: string | null;
  supersedes: string[];
}

export interface MemoryDraft {
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  importance?: number;
  confidence?: number;
  stability?: MemoryStability;
  layer?: MemoryLayer;
  slot?: string | null;
  validUntil?: string | null;
}

export interface MemoryContextBundle {
  profile: Memory[];
  relevant: Memory[];
  temporal: Memory[];
  all: Memory[];
}

export interface MemoryWritePlan {
  primaryMemory: Memory;
  upserts: Memory[];
  retiredIds: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export type ConversationState = 'light' | 'companionship' | 'exploration' | 'analysis' | 'push';
export type UserNeed = 'light' | 'companionship' | 'understanding' | 'analysis' | 'push';

export interface UserData {
  memories: Memory[];
  messages: Message[];
  preferences: {
    responseLength: 'short' | 'medium' | 'long';
    preferredStyle: UserNeed;
  };
}

export interface ChatState {
  conversations: Conversation[];
  conversation: Conversation;
  messages: Message[];
  memories: Memory[];
  searchEnabled: boolean;
}
