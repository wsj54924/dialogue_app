'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChatState, Conversation, Memory, Message, User } from '@/types/memory';

export default function Chat() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync state from server
  const syncState = async (conversationId?: string) => {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    const response = await fetch(`/api/state${query}`);
    const data: ChatState = await response.json();
    if (!response.ok) throw new Error('加载会话失败');
    setConversations(data.conversations);
    setActiveConversationId(data.conversation.id);
    setMessages(data.messages);
    setMemories(data.memories);
    setSearchEnabled(data.searchEnabled);
  };

  // Load user info
  const loadUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Load user error:', error);
    }
  };

  // Initialize
  useEffect(() => {
    const load = async () => {
      await loadUser();
      try {
        await syncState();
      } catch (error) {
        console.error('初始化失败:', error);
      } finally {
        setIsBootstrapping(false);
      }
    };
    load();
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Send message
  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || !activeConversationId) return;

    const userMessage: Message = {
      id: `local_${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          conversationId: activeConversationId,
        }),
      });

      const data = await response.json();
      if (!response.ok || typeof data.message !== 'string') {
        throw new Error(data.error || '聊天请求失败');
      }

      const assistantMessage: Message = {
        id: `local_assistant_${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await syncState(activeConversationId);
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `local_error_${Date.now()}`,
          role: 'assistant',
          content: '抱歉，出了点问题。请再试一次。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Create new conversation
  const createConversation = async () => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新对话' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '新建失败');
      await syncState(data.conversation.id);
      setMobileSidebarOpen(false);
    } catch (error) {
      console.error('新建会话失败:', error);
    }
  };

  // Switch conversation
  const switchConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) return;
    setIsBootstrapping(true);
    try {
      await syncState(conversationId);
      setMobileSidebarOpen(false);
    } catch (error) {
      console.error('切换会话失败:', error);
    } finally {
      setIsBootstrapping(false);
    }
  };

  // Delete conversation
  const removeConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations?id=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除失败');
      await syncState(data.conversation.id);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  // Clear all data
  const clearHistory = async () => {
    if (!confirm('确定要清空所有聊天记录和记忆吗？')) return;
    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      if (!response.ok) throw new Error('重置失败');
      await syncState();
    } catch (error) {
      console.error('清空失败:', error);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Truncate title
  const truncateTitle = (title: string) =>
    title.length > 24 ? `${title.slice(0, 24)}...` : title;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileSidebarOpen ? 'active' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'open' : ''} flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] relative`}>
        {/* Sidebar content */}
        <div className="sidebar-content flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center shadow-lg shadow-[var(--accent-primary)]/20">
                  <span className="text-[var(--bg-primary)] font-semibold text-lg">伴</span>
                </div>
                <div>
                  <h1 className="font-display text-base text-[var(--text-primary)]">陪伴</h1>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {searchEnabled ? '智能搜索已启用' : '本地模式'}
                  </p>
                </div>
              </div>
            </div>

            {/* New chat button */}
            <button onClick={createConversation} className="btn-primary w-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              新对话
            </button>
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <div
                    key={conversation.id}
                    className={`conversation-item group ${isActive ? 'active' : ''}`}
                    onClick={() => switchConversation(conversation.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {truncateTitle(conversation.title)}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      {conversations.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeConversation(conversation.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--error)] transition-all"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[var(--border-subtle)]">
            {user && (
              <Link
                href="/settings"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--surface-glass)] transition-colors"
              >
                <div className="avatar-sm">
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {user.displayName || user.username}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">设置</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-muted)]">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={clearHistory}
                className="flex-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] py-2 rounded-lg hover:bg-[var(--surface-glass)] transition-colors"
              >
                清空数据
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 text-xs text-[var(--error)] hover:text-[var(--error)] py-2 rounded-lg hover:bg-[var(--error)]/10 transition-colors"
              >
                退出
              </button>
            </div>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="sidebar-toggle hidden md:flex"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 h-full bg-[var(--bg-primary)]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="btn-icon md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Collapse button (desktop) */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="btn-icon hidden md:flex"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarCollapsed ? (
                  <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" strokeLinejoin="round"/>
                ) : (
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center shadow-md shadow-[var(--accent-primary)]/20">
                <span className="text-[var(--bg-primary)] font-medium text-sm">聊</span>
              </div>
              <div>
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  {conversations.find((c) => c.id === activeConversationId)?.title || '对话'}
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {searchEnabled && (
              <span className="text-xs text-[var(--accent-primary)] flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                搜索
              </span>
            )}
            <button onClick={createConversation} className="btn-ghost text-xs md:hidden">
              新对话
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isBootstrapping ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] animate-pulse" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 animate-fade-in relative z-10">
              <div className="relative mb-10 w-32 h-32 flex items-center justify-center animate-orb">
                <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-primary)] to-[var(--accent-tertiary)] opacity-30 blur-3xl rounded-full scale-150 animate-pulse" />
                <div className="absolute inset-4 bg-gradient-to-bl from-[var(--accent-secondary)] to-[var(--accent-primary)] opacity-50 blur-xl rounded-full mix-blend-screen" />
                <div className="relative w-20 h-20 rounded-full glass-elevated flex items-center justify-center overflow-hidden border border-white/10 shadow-[0_0_40px_rgba(0,242,254,0.4)]">
                   <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-50"></div>
                   <span className="text-3xl font-display text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] relative z-10">伴</span>
                </div>
              </div>
              <h2 className="text-3xl font-display text-primary mb-4 tracking-tight drop-shadow-sm">随时倾听，永远在场</h2>
              <p className="text-[var(--text-secondary)] text-center max-w-sm mb-8 text-base leading-relaxed">
                我会记住你的偏好、理解你的情绪。<br/>这里是一个安全、专属的空间。
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <span className="px-4 py-2 text-xs font-medium text-[var(--text-primary)] glass rounded-full shadow-sm">
                  多会话支持
                </span>
                <span className="px-4 py-2 text-xs font-medium text-[var(--accent-primary)] glass rounded-full shadow-[0_0_15px_var(--accent-glow)] border-[var(--accent-primary)]/30">
                  长期记忆
                </span>
                {searchEnabled && (
                  <span className="px-4 py-2 text-xs font-medium text-[var(--accent-tertiary)] glass rounded-full border-[var(--accent-tertiary)]/30">
                    智能搜索
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 pt-6 pb-40 space-y-6">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-message-pop`}
                  style={{ animationDelay: `${Math.min(index * 0.03, 0.3)}s` }}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 mr-4 mt-1">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center shadow-md shadow-[var(--accent-primary)]/20">
                        <span className="text-[var(--bg-primary)] font-medium text-sm">伴</span>
                      </div>
                    </div>
                  )}
                  <div className={`message-bubble ${message.role}`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 ml-4 mt-1">
                      <div className="w-8 h-8 rounded-full glass-elevated flex items-center justify-center shadow-sm">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--text-primary)]">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex justify-start animate-fade-in animate-message-pop">
                  <div className="flex-shrink-0 mr-4 mt-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-primary)] flex items-center justify-center shadow-md shadow-[var(--accent-primary)]/20 animate-pulse">
                      <span className="text-[var(--bg-primary)] font-medium text-sm">伴</span>
                    </div>
                  </div>
                  <div className="message-bubble assistant">
                    <div className="flex items-center gap-1.5 h-5">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="floating-input-container">
          <div className="max-w-3xl mx-auto w-full">
            <div className="flex items-center gap-2 mb-3 px-2 text-xs text-[var(--text-muted)] drop-shadow-md font-medium">
              <span className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-[var(--accent-primary)] shadow-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {memories.length} 条专属记忆
              </span>
            </div>

            <div className="glass-input flex items-end gap-3 p-2 pl-4">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchEnabled ? '说点什么，或让我搜索...' : '说点什么，我一直都在...'}
                className="flex-1 min-h-[24px] max-h-[120px] py-2 text-[var(--text-primary)] font-regular transition-all"
                rows={1}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim() || !activeConversationId}
                className="btn-primary rounded-full w-10 h-10 p-0 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--accent-primary)]/20"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-0.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}