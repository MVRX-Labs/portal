type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 0;

function emit(type: ToastType, message: string) {
  const toast: Toast = { id: String(++nextId), type, message };
  listeners.forEach((fn) => fn(toast));
}

export const toast = {
  error: (message: string) => emit("error", message),
  success: (message: string) => emit("success", message),
  info: (message: string) => emit("info", message),
  subscribe: (fn: Listener) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
