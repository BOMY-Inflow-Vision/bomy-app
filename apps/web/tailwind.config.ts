import typography from "@tailwindcss/typography"
import type { Config } from "tailwindcss"
import { fontFamily } from "tailwindcss/defaultTheme"

const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        reward: {
          DEFAULT: "hsl(var(--reward))",
          foreground: "hsl(var(--reward-foreground))",
        },
        subtle: "hsl(var(--border-subtle))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        control: "var(--radius-control)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
        mono: ["var(--font-mono)", ...fontFamily.mono],
      },
      transitionTimingFunction: {
        // Sampled spring (stiffness 600, damping 25, mass 1); settles in ~500ms.
        spring:
          "linear(0, 0.107, 0.347, 0.619, 0.856, 1.025, 1.121, 1.154, 1.144, 1.109, 1.067, 1.029, 1, 0.983, 0.976, 0.977, 0.982, 0.988, 0.995, 0.999, 1.002, 1.004, 1.004, 1.003, 1)",
      },
      keyframes: {
        "toast-in": {
          from: { opacity: "0", transform: "translateX(50px) scale(0.8)" },
          to: { opacity: "1", transform: "none" },
        },
        "toast-out": {
          from: { opacity: "1", transform: "none" },
          to: { opacity: "0", transform: "translateX(50px) scale(0.8)" },
        },
        "copy-pop": {
          from: { opacity: "0", transform: "scale(0.5)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "select-in": {
          from: { opacity: "0", transform: "scale(0.95) translateY(-4px)" },
          to: { opacity: "1", transform: "none" },
        },
        "select-out": {
          from: { opacity: "1", transform: "none" },
          to: { opacity: "0", transform: "scale(0.95) translateY(-4px)" },
        },
        "select-item-in": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "wheel-roll-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        "step-pulse": {
          from: { opacity: "0.5", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(1.6)" },
        },
        "avatar-pop-in": {
          from: { opacity: "0", transform: "scale(0.5)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "toast-in": "toast-in 250ms cubic-bezier(0.22, 1, 0.36, 1)",
        "toast-out": "toast-out 150ms ease-in forwards",
        "copy-pop": "copy-pop 200ms cubic-bezier(0.22, 1, 0.36, 1)",
        "select-in": "select-in 150ms cubic-bezier(0.22, 1, 0.36, 1)",
        "select-out": "select-out 100ms ease-in forwards",
        "select-item-in": "select-item-in 150ms cubic-bezier(0.22, 1, 0.36, 1) both",
        // animation-timing-function can't reference the ease-spring *utility class* —
        // it needs the raw easing function, so the spring curve is duplicated here.
        "wheel-roll-in":
          "wheel-roll-in 500ms linear(0, 0.107, 0.347, 0.619, 0.856, 1.025, 1.121, 1.154, 1.144, 1.109, 1.067, 1.029, 1, 0.983, 0.976, 0.977, 0.982, 0.988, 0.995, 0.999, 1.002, 1.004, 1.004, 1.003, 1)",
        "step-pulse": "step-pulse 600ms cubic-bezier(0.23, 1, 0.32, 1) forwards",
        "avatar-pop-in":
          "avatar-pop-in 400ms linear(0, 0.107, 0.347, 0.619, 0.856, 1.025, 1.121, 1.154, 1.144, 1.109, 1.067, 1.029, 1, 0.983, 0.976, 0.977, 0.982, 0.988, 0.995, 0.999, 1.002, 1.004, 1.004, 1.003, 1) both",
      },
    },
  },
  plugins: [typography],
} satisfies Config

export default config
