import Link from 'next/link';
import { SignupForm } from '@/app/signup/signup-form';

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Create your account</h1>
      <p className="mt-2 text-sm text-ink-500">
        Sign up to upload and manage your Processing sketches.
      </p>

      <div className="mt-8">
        <SignupForm />
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent">
          Log in
        </Link>
      </p>
    </div>
  );
}
