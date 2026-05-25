export function parseOpsEmails(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string[] {
  return (env["OPS_ALERT_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
}
