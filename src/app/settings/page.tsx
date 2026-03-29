'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User } from '@/types/memory';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setUser(data.user);
      setDisplayName(data.user.displayName || '');
    } catch (error) {
      router.push('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || '更新失败' });
        return;
      }

      setUser(data.user);
      setMessage({ type: 'success', text: '昵称已更新' });
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少需要 6 个字符' });
      return;
    }

    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || '密码修改失败' });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: '密码已更新' });
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' });
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 animate-pulse-soft" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="p-2 rounded-xl glass hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold">个人设置</h1>
        </div>

        {message.text && (
          <div
            className={`rounded-xl px-4 py-3 text-sm mb-6 ${
              message.type === 'error'
                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                : 'bg-green-500/10 border border-green-500/20 text-green-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Profile section */}
        <div className="glass-strong rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">基本信息</h2>

          <form onSubmit={handleUpdateDisplayName} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">用户名</label>
              <input
                type="text"
                value={user?.username || ''}
                disabled
                className="w-full rounded-xl glass px-4 py-3 text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">昵称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl glass-strong px-4 py-3 text-sm placeholder:text-gray-500 focus-ring transition-all"
                placeholder="设置一个昵称"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-blue-500/25"
            >
              保存昵称
            </button>
          </form>
        </div>

        {/* Password section */}
        <div className="glass-strong rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">修改密码</h2>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">当前密码</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl glass-strong px-4 py-3 text-sm placeholder:text-gray-500 focus-ring transition-all"
                placeholder="输入当前密码"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl glass-strong px-4 py-3 text-sm placeholder:text-gray-500 focus-ring transition-all"
                placeholder="至少6个字符"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl glass-strong px-4 py-3 text-sm placeholder:text-gray-500 focus-ring transition-all"
                placeholder="再输入一次新密码"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={!currentPassword || !newPassword || !confirmPassword}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              修改密码
            </button>
          </form>
        </div>

        {/* Logout section */}
        <div className="glass-strong rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">账号操作</h2>
          <button
            onClick={handleLogout}
            className="rounded-xl glass border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/10"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}