'use client'

/**
 * Button (T-10.1).
 *
 * Five variants × three sizes, and one detail that matters more than any of
 * them: toggling `loading` must not change the button's width. A button that
 * shrinks when it starts working shifts everything beside it, and on a toolbar
 * that means the control the user was about to click moves out from under the
 * pointer.
 */

import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-inverse hover:bg-accent-hover active:bg-accent-pressed',
  secondary:
    'bg-surface-0 text-primary border border-strong hover:bg-surface-hover active:bg-surface-2',
  ghost: 'bg-transparent text-secondary hover:bg-surface-hover hover:text-primary',
  danger: 'bg-danger text-inverse hover:bg-danger active:bg-danger',
  // No height or padding: a link-button must sit on the text baseline of the
  // sentence around it, and a 36px box would break that.
  link: 'bg-transparent text-accent hover:underline',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-btn-sm px-3 text-sm',
  md: 'h-btn-md px-3.5 text-body-strong',
  lg: 'h-btn-lg px-4 text-body-strong',
}

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: 'h-btn-sm w-btn-sm px-0',
  md: 'h-btn-md w-btn-md px-0',
  lg: 'h-btn-lg w-btn-lg px-0',
}

const ICON_PX: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  iconOnly?: boolean
  fullWidth?: boolean
  /** Render as the single child element instead of a `<button>` — for links that look like buttons. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    iconOnly = false,
    fullWidth = false,
    disabled,
    className,
    children,
    asChild = false,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button'
  const iconSize = ICON_PX[size]

  /*
   * The leading slot is rendered whenever the button EITHER has a left icon or
   * can enter a loading state, and the spinner replaces the icon inside it.
   * Adding a spinner that was not there before is what changes the width.
   */
  const leading = loading ? (
    <Loader2
      size={iconSize}
      strokeWidth={2}
      className="shrink-0 animate-spin"
      aria-hidden="true"
      data-testid="button-spinner"
    />
  ) : (
    leftIcon
  )

  return (
    <Component
      ref={ref}
      /*
       * `type="button"` by default. HTML's default is `submit`, so a Button
       * inside a form submits it — which is never what a Cancel or a toolbar
       * control means. Overridable via props for the one button that IS the
       * submit.
       */
      type={asChild ? undefined : 'button'}
      // `aria-busy` rather than swapping the label: a screen reader should hear
      // "Save, busy", not lose the button's name mid-action.
      aria-busy={loading || undefined}
      // Disabled while loading, so a slow request cannot be fired twice.
      disabled={disabled || loading}
      data-loading={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors duration-fast',
        // `translateY` on press. Small enough to feel like a press rather than
        // a jump, and applied to the button only so its shadow does not follow.
        'active:translate-y-[0.5px]',
        // 50% opacity and not-allowed, uniform across every variant — a
        // disabled button that looks different per variant reads as a bug.
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        VARIANT[variant],
        variant === 'link' ? '' : iconOnly ? ICON_ONLY_SIZE[size] : SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {/*
        With `asChild`, ONLY the children are rendered.

        Radix's `Slot` clones a single child element, and this component
        normally renders three slots — leading, children, trailing. Two of them
        being `undefined` still counts as three children, so `Slot` threw
        `React.Children.only expected to receive a single React element child`
        and the route's error boundary swallowed it into "Something went wrong".

        A consumer using `asChild` composes its own icons inside the element it
        passes, which is the only thing that can work here.
      */}
      {asChild ? (
        children
      ) : (
        <>
          {leading}
          {/* `iconOnly` still renders its children into an sr-only span rather
              than dropping them, so the accessible name survives. */}
          {iconOnly ? <span className="sr-only">{children}</span> : children}
          {rightIcon}
        </>
      )}
    </Component>
  )
})
