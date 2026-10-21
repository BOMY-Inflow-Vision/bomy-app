// @vitest-environment jsdom
// R5c-2: what /auth/sign-in renders, pinned on the old markup first (words, links, banners, which
// sections exist with email delivery on and off). The sign-in action and the magic-link form are not touched.
// Looks are asserted in the "R5c look" block added with the restyle.
import { prerender } from "react-dom/static"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/auth", () => ({ signIn: vi.fn() }))
vi.mock("@/components/toast-on-mount", () => ({
  ToastOnMount: (p: { type: string; message: string }) => (
    <span data-testid="toast" data-type={p.type} data-message={p.message} />
  ),
}))
vi.mock("@/app/auth/sign-in/magic-link-form", () => ({
  MagicLinkForm: () => <div data-testid="magic-form" />,
}))

async function load(emailEnabled: boolean) {
  vi.resetModules()
  if (emailEnabled) vi.stubEnv("EMAIL_DELIVERY_ENABLED", "true")
  else vi.stubEnv("EMAIL_DELIVERY_ENABLED", "false")
  return (await import("@/app/auth/sign-in/page")).default
}

async function render(
  emailEnabled: boolean,
  search: { consent?: string; error?: string | string[] } = {},
) {
  const SignInPage = await load(emailEnabled)
  const { prelude } = await prerender(<SignInPage searchParams={Promise.resolve(search)} />)
  const html = await new Response(prelude).text()
  return new DOMParser().parseFromString(html, "text/html")
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe("sign-in page: words and sections", () => {
  it("email off: Google only, no divider, no magic-link form", async () => {
    const d = await render(false)
    expect(d.querySelector("h1")!.textContent).toBe("Sign in to BOMY")
    expect(d.body.textContent).toContain("Continue with your Google account")
    expect(d.body.textContent).toContain("Continue with Google")
    expect(d.body.textContent).not.toContain("Choose how you'd like to sign in")
    expect(d.querySelector('[data-testid="magic-form"]')).toBeNull()
    expect(Array.from(d.querySelectorAll("span")).some((s) => s.textContent === "or")).toBe(false)
  })

  it("email on: subtitle changes, the divider and the magic-link form appear", async () => {
    const d = await render(true)
    expect(d.body.textContent).toContain("Choose how you'd like to sign in")
    expect(d.body.textContent).toContain("Continue with Google")
    expect(d.querySelector('[data-testid="magic-form"]')).not.toBeNull()
    expect(Array.from(d.querySelectorAll("span")).some((s) => s.textContent === "or")).toBe(true)
  })

  it("terms and privacy links keep their hrefs", async () => {
    const d = await render(false)
    expect(d.querySelector('a[href="/terms"]')!.textContent).toBe("Terms of Service")
    expect(d.querySelector('a[href="/privacy"]')!.textContent).toBe("Privacy Policy")
    expect(d.body.textContent).toContain("By continuing you agree to our")
  })
})

describe("sign-in page: banners", () => {
  it("shows no banner by default", async () => {
    const d = await render(false)
    expect(d.querySelector('[role="alert"]')).toBeNull()
    expect(d.querySelector('[data-testid="toast"]')).toBeNull()
  })

  it("?error= shows the mapped message inline and as an error toast", async () => {
    const d = await render(false, { error: "Verification" })
    const alert = d.querySelector('[role="alert"]')!
    expect(alert.textContent).toBe(
      "That sign-in link has expired or was already used. Request a new one.",
    )
    const toast = d.querySelector('[data-testid="toast"]')!
    expect(toast.getAttribute("data-type")).toBe("error")
    expect(toast.getAttribute("data-message")).toBe(alert.textContent)
  })

  it("an unknown ?error= code shows the generic message; an array uses the first value", async () => {
    const d = await render(false, { error: ["Nope", "Verification"] })
    expect(d.querySelector('[role="alert"]')!.textContent).toBe("Sign-in failed. Please try again.")
  })

  it("?consent=declined shows the warning banner and a warning toast", async () => {
    const d = await render(false, { consent: "declined" })
    expect(d.body.textContent).toContain(
      "You must accept the Terms and Privacy Policy to use BOMY.",
    )
    const toast = d.querySelector('[data-testid="toast"]')!
    expect(toast.getAttribute("data-type")).toBe("warning")
  })
})
