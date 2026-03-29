import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByUsername } from '@/lib/db';
import {
  hashPassword,
  generateToken,
  setAuthCookie,
  validateUsername,
  validatePassword,
} from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : undefined;

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json({ error: usernameValidation.error }, { status: 400 });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
    }

    // Check if username already exists
    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await createUser(username, passwordHash, displayName);

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
    console.error('Register API error:', error);
    return NextResponse.json({ error: '注册失败' }, { status: 500 });
  }
}