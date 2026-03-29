import { NextRequest, NextResponse } from 'next/server';
import { getUserByUsername, updateLastLogin } from '@/lib/db';
import { verifyPassword, generateToken, setAuthCookie, validateUsername } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json({ error: usernameValidation.error }, { status: 400 });
    }

    // Check if user exists
    const user = await getUserByUsername(username);
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    // Update last login
    await updateLastLogin(user.id);

    // Generate token and set cookie
    const token = await generateToken(user.id);
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}