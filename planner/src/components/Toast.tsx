"use client";

import { usePlanner } from "./store";

export function Toast() {
  const { toast, dismissToast, mutate } = usePlanner();
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            const undo = toast.undo!;
            dismissToast();
            void mutate(undo);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
