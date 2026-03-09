"use client";

export const VERSION_CHECK_EVENT = "app:check-version";

export function requestVersionCheck() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(VERSION_CHECK_EVENT));
}
