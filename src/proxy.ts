import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get('app_auth')

  if (authCookie?.value === 'authenticated') {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!api/auth|login|_next/static|_next/image|favicon\\.ico|icons/).*)',
  ],
}
