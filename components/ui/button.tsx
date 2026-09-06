import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-700',
  secondary: 'border border-ink-100 text-ink hover:bg-ink-50',
  ghost: 'text-ink-500 hover:text-ink',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}

interface ButtonLinkProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
  variant?: Variant;
}

export function ButtonLink({ href, variant = 'primary', className, ...props }: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
