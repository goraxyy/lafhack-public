import { ResetPasswordForm } from '@/app/reset-password/reset-password-form';

export const metadata = { title: 'Set a new password' };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>
      <p className="mt-2 text-sm text-ink-500">
        Choose a new password for your account.
      </p>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
