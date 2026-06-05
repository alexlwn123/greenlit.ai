import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import App from "./App"

describe("App", () => {
  it("renders the demo report path", () => {
    render(<App />)

    expect(screen.getByRole("button", { name: /open demo/i })).toBeInTheDocument()
    expect(screen.getByText(/readiness score/i)).toBeInTheDocument()
  })
})
