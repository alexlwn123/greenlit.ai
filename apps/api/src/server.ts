import { serve } from "@hono/node-server"
import { createApp } from "./app.js"

const port = Number(process.env.PORT ?? 8787)

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    console.log(`greenlit local API listening on http://localhost:${info.port}`)
  }
)
