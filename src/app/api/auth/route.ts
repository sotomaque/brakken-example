import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string }

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'APP_PASSWORD not configured on server' }, { status: 500 })
  }

  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('app_auth', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return response
}
