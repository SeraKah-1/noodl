import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface OverlayPortalProps {
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}

/**
 * Viewport overlays must live outside animated page wrappers. A transformed or
 * `will-change: transform` ancestor becomes the containing block for fixed
 * descendants, which makes an otherwise full-screen modal follow page scroll.
 */
export const OverlayPortal: React.FC<OverlayPortalProps> = ({ children, className, labelledBy }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={className}
    >
      {children}
    </div>,
    document.body
  );
};
