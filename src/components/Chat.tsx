'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BrainCircuit,
  ChevronUp,
  Database,
  Edit3,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Settings,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ChatState, Conversation, Memory, Message, User as AppUser } from '@/types/memory';

function formatConversationDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMemoryType(memory: Memory) {
  return memory.layer === 'profile' || memory.importance >= 0.8 ? 'Key Insight' : 'Memory';
}

function formatMemoryTimestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateTitle(title: string, maxLength = 24) {
  return title.length > maxLength ? `${title.slice(0, maxLength)}...` : title;
}

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
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );

  const syncState = async (conversationId?: string) => {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    const response = await fetch(`/api/state${query}`);
    const data: ChatState = await response.json();

    if (!response.ok) {
      throw new Error(data.conversation?.title || '加载会话失败');
    }

    setConversations(data.conversations);
    setActiveConversationId(data.conversation.id);
    setMessages(data.messages);
    setMemories(data.memories);
    setSearchEnabled(data.searchEnabled);
  };

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

    void load();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
    if (inputRef.current) {
      inputRef.current.style.height = '24px';
    }
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
          content: '抱歉，刚刚出了点问题。你可以再发一次，我继续接着聊。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const createConversation = async () => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新对话' }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '新建会话失败');
      }

      await syncState(data.conversation.id);
      setIsMobileSidebarOpen(false);
    } catch (error) {
      console.error('新建会话失败:', error);
    }
  };

  const switchConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) return;

    setIsBootstrapping(true);
    try {
      await syncState(conversationId);
      setIsMobileSidebarOpen(false);
    } catch (error) {
      console.error('切换会话失败:', error);
    } finally {
      setIsBootstrapping(false);
    }
  };

  const removeConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations?id=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '删除会话失败');
      }

      await syncState(data.conversation.id);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  const clearHistory = async () => {
    if (!confirm('确定要清空所有聊天记录和记忆吗？')) return;

    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      if (!response.ok) {
        throw new Error('重置失败');
      }
      await syncState();
    } catch (error) {
      console.error('清空失败:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    target.style.height = '24px';
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0a0c0b] font-sans text-[#e0e0e0]">
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            aria-label="关闭侧边栏遮罩"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isLeftCollapsed ? 0 : 320 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`relative z-40 hidden flex-col border-r border-[#1a1e1c] bg-[#0d110f] overflow-hidden whitespace-nowrap lg:flex ${
          isMobileSidebarOpen ? 'fixed inset-y-0 left-0 flex w-80' : ''
        }`}
      >
        <div className="w-80 p-6 h-full flex flex-col">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-2xl font-bold text-[#071018] shadow-[0_8px_24px_rgba(18,216,232,0.2)]">
                伴
              </div>
              <div>
                <h1 className="text-[22px] font-semibold leading-tight text-white">Companion</h1>
                <p className="mt-1 text-[15px] text-[#9ca8bf]">
                  {searchEnabled ? 'Search Mode' : 'Local Mode'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsLeftCollapsed(true)}
              className="hidden rounded-xl p-2 text-[#7f8897] transition hover:bg-[#141a18] hover:text-[#26d5df] lg:block"
              aria-label="收起左侧栏"
            >
              <PanelLeftClose size={20} />
            </button>
          </div>

          <button
            onClick={createConversation}
            className="mb-8 flex w-full items-center justify-center gap-3 rounded-[24px] bg-gradient-to-r from-[#4da5ff] to-[#18d7e7] px-6 py-6 text-[20px] font-semibold text-[#071018] transition hover:brightness-105"
          >
            <Plus size={28} />
            <span>新对话</span>
          </button>

          <nav className="custom-scrollbar flex-1 space-y-5 overflow-y-auto pb-6">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;

              return (
                <div
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchConversation(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void switchConversation(conversation.id);
                    }
                  }}
                  className={`group relative w-full rounded-[24px] border px-6 py-7 text-left transition focus:outline-none focus:ring-2 focus:ring-[#26d5df]/50 ${
                    isActive
                      ? 'border-[#2a3038] bg-[#111319] shadow-[0_12px_40px_rgba(0,0,0,0.22)]'
                      : 'border-transparent bg-transparent text-[#98a2b3] hover:border-[#1a1e1c] hover:bg-[#101411]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute bottom-7 left-0 top-7 w-1 rounded-r-full bg-[#12d8e8]" />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[18px] font-semibold text-white">
                        {truncateTitle(conversation.title, 18)}
                      </div>
                      <div className="mt-3 text-[16px] text-[#657188]">
                        {formatConversationDate(conversation.updatedAt)}
                      </div>
                    </div>
                    {conversations.length > 1 && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeConversation(conversation.id);
                        }}
                        className="opacity-0 transition group-hover:opacity-100"
                        aria-label="删除会话"
                      >
                        <Trash2 size={18} className="text-[#7f8897] hover:text-[#ff7f96]" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 pt-4">
              <Link
                href="/settings"
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-[#aab4c5] transition hover:bg-[#141a18] hover:text-white"
              >
                <Settings size={18} />
                <span>设置</span>
              </Link>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-[#aab4c5]">
                <User size={18} />
                <span>{user?.displayName || user?.username || '未登录用户'}</span>
              </div>
          </div>
        </div>
      </motion.aside>

      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-[#1a1e1c] bg-[#0d110f] lg:hidden"
          >
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-2xl font-bold text-[#071018]">
                  伴
                </div>
                <div>
                  <h2 className="text-[18px] font-semibold text-white">Companion</h2>
                  <p className="text-sm text-[#9ca8bf]">{searchEnabled ? 'Search Mode' : 'Local Mode'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileSidebarOpen(false)}
                className="rounded-xl p-2 text-[#7f8897] transition hover:bg-[#141a18] hover:text-[#26d5df]"
                aria-label="关闭移动侧边栏"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={createConversation}
                className="flex w-full items-center justify-center gap-3 rounded-[24px] bg-gradient-to-r from-[#4da5ff] to-[#18d7e7] px-6 py-5 text-lg font-semibold text-[#071018]"
              >
                <Plus size={24} />
                <span>新对话</span>
              </button>
            </div>
            <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-5 pb-5">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;

                return (
                  <button
                    key={conversation.id}
                    onClick={() => switchConversation(conversation.id)}
                    className={`w-full rounded-[20px] border px-5 py-5 text-left transition ${
                      isActive
                        ? 'border-[#2a3038] bg-[#111319]'
                        : 'border-transparent bg-transparent hover:border-[#1a1e1c] hover:bg-[#101411]'
                    }`}
                  >
                    <div className="truncate text-base font-semibold text-white">{conversation.title}</div>
                    <div className="mt-2 text-sm text-[#657188]">{formatConversationDate(conversation.updatedAt)}</div>
                  </button>
                );
              })}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col bg-[#050708]">
        <header className="flex h-[92px] items-center justify-between border-b border-[#1a1e1c] px-6 lg:px-10">
          <div className="flex items-center gap-4 lg:gap-8">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="rounded-xl p-2 text-[#cbd5e1] transition hover:bg-[#141a18] lg:hidden"
              aria-label="打开移动侧边栏"
            >
              <MessageSquare size={24} />
            </button>
            {isLeftCollapsed && (
              <button
                onClick={() => setIsLeftCollapsed(false)}
                className="hidden rounded-xl p-2 text-[#7f8897] transition hover:bg-[#141a18] hover:text-[#26d5df] lg:block"
                aria-label="展开左侧栏"
              >
                <PanelLeftOpen size={24} />
              </button>
            )}
            <button
              onClick={() => setIsLeftCollapsed((value) => !value)}
              className="hidden rounded-xl p-2 text-[#cbd5e1] transition hover:bg-[#141a18] lg:block"
              aria-label="切换左侧栏"
            >
              <MessageSquare size={24} />
            </button>
            <div className="hidden text-[#d8e1f0] lg:block">
              <span className="text-[32px] leading-none">›</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-[22px] font-bold text-[#071018]">
                聊
              </div>
              <div className="text-[20px] font-semibold text-white">
                {activeConversation?.title || '新对话'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={createConversation}
              className="rounded-[22px] border border-[#1c2128] bg-[#090b10] px-6 py-4 text-[18px] font-semibold text-white transition hover:border-[#2a3038] hover:bg-[#111319]"
            >
              新对话
            </button>
            <button
              onClick={createConversation}
              className="hidden rounded-xl p-2 text-[#26d5df] transition hover:bg-[#141a18] lg:flex"
              aria-label="快速新建对话"
            >
              <Edit3 size={20} />
            </button>
            {isRightCollapsed && (
              <button
                onClick={() => setIsRightCollapsed(false)}
                className="hidden rounded-xl p-2 text-[#7f8897] transition hover:bg-[#141a18] hover:text-[#26d5df] xl:flex"
                aria-label="展开右侧栏"
              >
                <PanelRightOpen size={22} />
              </button>
            )}
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden">
          {isBootstrapping ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-14 w-14 animate-pulse rounded-[20px] bg-gradient-to-br from-[#4da5ff] to-[#12d8e8]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="-mt-32"
              >
                <h3 className="mb-6 text-2xl font-medium tracking-tight text-white lg:text-4xl">
                  你好，我一直都在。
                </h3>
                <div className="mx-auto max-w-md space-y-2 text-sm leading-relaxed text-[#96a1b4] lg:text-base">
                  <p>随时倾听，永远在线。</p>
                  <p>我会记住你的偏好、理解你的情绪，这是一个安全、专属的空间。</p>
                  <p>随时可以和我分享你的情绪、想法 and 日常</p>
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="custom-scrollbar h-full overflow-y-auto px-5 pb-40 pt-10 lg:px-10">
              <div className="mx-auto flex max-w-5xl flex-col gap-8">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start gap-5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-[30px] font-bold text-[#071018]">
                        伴
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] rounded-[32px] border px-8 py-7 text-[18px] leading-[1.8] shadow-[0_16px_50px_rgba(0,0,0,0.18)] ${
                        message.role === 'user'
                          ? 'border-[#1bcadd] bg-gradient-to-r from-[#4da5ff] to-[#12d8e8] text-[#071018]'
                          : 'border-[#1a1e1c] bg-[#0d0f13] text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>

                    {message.role === 'user' && (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-[#1c2128] bg-[#111319] text-[#d9e1ee]">
                        <User size={28} />
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-start gap-5">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-[30px] font-bold text-[#071018]">
                      伴
                    </div>
                    <div className="flex rounded-[32px] border border-[#1a1e1c] bg-[#0d0f13] px-8 py-7 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#26d5df]" />
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#26d5df] [animation-delay:0.2s]" />
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#26d5df] [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#050708] via-[#050708]/90 to-transparent px-5 pb-6 pt-12 lg:px-10 lg:pb-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1d232a] bg-[#0c1014] px-5 py-2 text-[12px] font-semibold text-[#12d8e8]">
              <BrainCircuit size={14} />
              <span>{memories.length} 条专属记忆</span>
            </div>

            <div className="relative rounded-[34px] border border-[#151920] bg-[#0d0f13] px-5 py-4 shadow-[0_25px_60px_rgba(0,0,0,0.2)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={searchEnabled ? '说点什么，也可以让我顺手搜一下…' : '说点什么，我认真听着...'}
                className="custom-scrollbar min-h-[56px] max-h-[120px] w-full resize-none bg-transparent py-1 pr-20 text-[18px] text-white outline-none placeholder:text-[#6b7380]"
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim() || !activeConversationId}
                className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#4da5ff] to-[#12d8e8] text-[#071018] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="发送消息"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {!isRightCollapsed && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="hidden overflow-hidden border-l border-[#1a1e1c] bg-[#0d110f] xl:flex"
          >
            <div className="flex h-full w-80 flex-col p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsRightCollapsed(true)}
                    className="rounded-xl p-2 text-[#7f8897] transition hover:bg-[#141a18] hover:text-[#26d5df]"
                    aria-label="收起右侧栏"
                  >
                    <PanelRightClose size={20} />
                  </button>
                  <h2 className="text-lg font-semibold text-white">专属记忆库</h2>
                </div>
                <ChevronUp size={18} className="text-[#7f8897]" />
              </div>

              <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {memories.map((memory, index) => {
                    const memoryType = formatMemoryType(memory);

                    return (
                      <motion.div
                        key={memory.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: Math.min(index * 0.04, 0.16) }}
                        className="relative overflow-hidden rounded-[24px] border border-[#1a2321] bg-[#141a18] p-4 transition hover:border-[#232d2a]"
                      >
                        {index === 0 && (
                          <div className="pointer-events-none absolute inset-0 rounded-[24px] border border-[#2dd4bf]/30 shadow-[inset_0_0_15px_rgba(45,212,191,0.05)]" />
                        )}
                        <div className="relative z-10 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                                memoryType === 'Key Insight' ? 'text-[#2dd4bf]' : 'text-[#95a1b2]'
                              }`}
                            >
                              {memoryType}
                            </span>
                            <span className="text-[10px] text-[#667085]">{memory.category}</span>
                          </div>
                          <p className="text-sm leading-relaxed text-[#d3dae4]">{memory.content}</p>
                          <div className="flex items-center justify-between text-[10px] text-[#667085]">
                            <span>{memory.status}</span>
                            <span>{formatMemoryTimestamp(memory.createdAt)}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {memories.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-[#1f272f] bg-[#101411] px-4 py-6 text-sm leading-relaxed text-[#7f8897]">
                    还没有沉淀下来的长期记忆。继续聊天后，重要偏好和关系信息会出现在这里。
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .custom-scrollbar::-webkit-scrollbar {
              width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #1a2321;
              border-radius: 999px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #2a3531;
            }
          `,
        }}
      />
    </div>
  );
}
