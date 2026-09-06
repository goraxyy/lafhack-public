import Link from 'next/link';
import { ForgotPasswordForm } from '@/app/forgot-password/forgot-password-form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-500">
        Enter the email you signed up with and we&apos;ll send you a link to set a new
        password.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm initialError={searchParams.error} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent">
          Log in
        </Link>
      </p>
    </div>
  );
}
