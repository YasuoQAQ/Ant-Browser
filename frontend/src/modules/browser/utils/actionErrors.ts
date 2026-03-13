export function resolveActionErrorMessage(error: unknown, fallback: string): string {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : ''

  const normalized = message.trim()
  if (normalized) {
    return normalized
  }

  return `${fallback}，但系统没有返回明确原因。请在实例详情中查看最近错误，或检查应用日志。`
}
