import { Password } from "@convex-dev/auth/providers/Password"
import { ConvexError } from "convex/values"
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset"

export const GreenlitPassword = Password({
  reset: ResendOTPPasswordReset,
  profile(params) {
    const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Enter a valid email address.")
    }

    const allowlist = new Set(
      (process.env.GREENLIT_ALLOWED_EMAILS ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
    if (allowlist.size > 0 && !allowlist.has(email)) {
      throw new ConvexError("Account creation is not available for this email address.")
    }
    return { email }
  },
  validatePasswordRequirements(password) {
    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new ConvexError("Use at least 12 characters with uppercase, lowercase, and a number.")
    }
  },
})
