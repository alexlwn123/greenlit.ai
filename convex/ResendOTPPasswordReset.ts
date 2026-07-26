import Resend from "@auth/core/providers/resend"
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random"
import { Resend as ResendAPI } from "resend"

export const ResendOTPPasswordReset = Resend({
  id: "resend-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(
          new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
        )
      },
    }
    return generateRandomString(random, "0123456789", 8)
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    if (!provider.apiKey) throw new Error("Password reset email is not configured.")
    const resend = new ResendAPI(provider.apiKey)
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "Greenlit <onboarding@resend.dev>",
      to: [email],
      subject: "Reset your Greenlit password",
      text: `Your Greenlit password reset code is ${token}. It expires shortly. If you did not request this, you can ignore this email.`,
    })
    if (error) throw new Error("Could not send password reset email.")
  },
})
