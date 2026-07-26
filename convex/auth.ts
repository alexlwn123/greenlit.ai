import { convexAuth, getAuthUserId } from "@convex-dev/auth/server"
import { query } from "./_generated/server"
import { GreenlitPassword } from "./GreenlitPassword"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GreenlitPassword],
})

export const currentUserId = query({
  args: {},
  handler: async (ctx) => await getAuthUserId(ctx),
})
