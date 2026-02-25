import LoginForm from './LoginForm'

export const metadata = { title: 'Login — Airspace Deconfliction' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1120]">
      <LoginForm />
    </div>
  )
}
