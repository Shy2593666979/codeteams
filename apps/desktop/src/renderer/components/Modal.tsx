import React from "react";
import * as Dialog from "@radix-ui/react-dialog";

/** Shared modal with focus trapping, Escape dismissal and focus restoration. */
export const Modal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onOpenChange, title, children }) => {
  const returnFocus = React.useRef<HTMLElement | null>(null);
  return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="ct-modal-overlay" />
      <Dialog.Content
        className="ct-modal-content"
        aria-describedby={undefined}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement; }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
  );
};
