import Link from 'next/link';
import { LoginForm } from '@/app/login/login-form';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Log in to LafHack</h1>
      <p className="mt-2 text-sm text-ink-500">
        Sign in to access your sketches and profile.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-4 text-center text-sm text-ink-500">
        <Link href="/forgot-password" className="font-medium text-accent">
          Forgot your password?
        </Link>
      </p>

      <p className="mt-2 text-center text-sm text-ink-500">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-accent">
          Sign up
        </Link>
      </p>
    </div>
  );
}
