import { handle } from "hono/vercel"

import { createApp } from "./app.js"

export const runtime = "nodejs"
export const maxDuration = 60

const app = createApp()

export const GET = handle(app)
export const POST = handle(app)
export const DELETE = handle(app)
export const OPTIONS = handle(app)
