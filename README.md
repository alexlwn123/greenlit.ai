# greenlit.ai

MVP rebuild workspace for greenlit.ai.

## Local Setup

Install dependencies from the repo root:

```sh
pnpm install
```

Start the React app:

```sh
pnpm dev
```

Run the standard checks:

```sh
pnpm check
```

Convex is the planned backend boundary for saved work and analysis state. Once the project is configured, run the backend separately with:

```sh
pnpm dev:convex
```

Copy `.env.example` to `.env.local` and fill in provider credentials when working on real upload, storage, or AI analysis paths.
