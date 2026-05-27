import { configFromEnv, createMailer, type Mailer } from "@bomy/mailer"

let _mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (_mailer) return _mailer
  try {
    const config = configFromEnv(process.env)
    _mailer = createMailer(config, { info: (obj, msg) => console.log(msg, obj) })
  } catch (err) {
    console.error({
      event: "mailer_config_invalid",
      message: err instanceof Error ? err.message : String(err),
    })
    _mailer = createMailer(
      { enabled: false, host: "", port: 0, secure: false, from: "" },
      { info: (obj, msg) => console.log(msg, obj) },
    )
  }
  return _mailer
}

/** Test-only: clear the cached singleton between tests. */
export function resetMailerForTests(): void {
  _mailer = null
}
