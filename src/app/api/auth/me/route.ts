import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserDisplayName, updateUserPassword } from '@/lib/db';
import {
  getAuthenticatedUserId,
  hashPassword,
  verifyPassword,
  validatePassword,
} from '@/lib/auth';

export const runtime = 'nodejs';

// GET is already in route.ts, adding PATCH for updates
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();

    // Update display name
    if (typeof body.displayName === 'string') {
      await updateUserDisplayName(userId, body.displayName);
      const user = await getUserById(userId);
      return NextResponse.json({ user });
    }

    // Update password
    if (body.currentPassword && body.newPassword) {
      const user = await getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }

      // Get full user with password hash
      const { getUserByUsername } = await import('@/lib/db');
      const fullUser = await getUserByUsername(user.username);
      if (!fullUser) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }

      // Verify current password
      const isValid = await verifyPassword(body.currentPassword, fullUser.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: '当前密码错误' }, { status: 400 });
      }

      // Validate new password
      const validation = validatePassword(body.newPassword);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Update password
      const newPasswordHash = await hashPassword(body.newPassword);
      await updateUserPassword(userId, newPasswordHash);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '无效的请求' }, { status: 400 });
  } catch (error) {
    console.error('Settings PATCH error:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}