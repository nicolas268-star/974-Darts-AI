export function safeReturnPath(value: string | null): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return null;
  try {
    const url = new URL(value, "https://return.invalid");
    return url.origin === "https://return.invalid"
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}
