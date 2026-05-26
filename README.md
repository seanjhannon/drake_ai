This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Dev tools — manual mention tagging

Use the annotate workspace when the scan missed a reference (e.g. a name on a line the model skipped).

**URL:** [http://localhost:3000/dev/annotate](http://localhost:3000/dev/annotate)

**From the main app:**

- Click **dev** in the header (under the album count), or
- On **Retrack**, open a song’s **annotate** link (only shown when that track has synced lyrics)

**Deep link to a song:**

```
http://localhost:3000/dev/annotate?song=Shabang&album=Iceman
```

**Workflow:**

1. Pick a song in the left column (songs without lyrics are disabled).
2. Click the lyric line that contains the mention.
3. Enter the friend’s full name and click **Add mention**.

Tags are written to `results.json` and `data/reviews.json` as confirmed (`correct`) reviews, so they appear in the main app and feed few-shot examples on future scans.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel (friends demo)

Production runs in **demo mode**: pre-loaded lyrics and scan results, with a **recorded scan replay** in the browser (no API keys or LLM cost on Vercel). Full scans stay local with `.env.local`.

See [DEPLOY.md](./DEPLOY.md) for architecture and maintenance.

### One-time setup

1. Commit demo assets (if not already on `main`):

   ```bash
   git add data/lyrics.json results.json public/data/demo-scan.jsonl
   git commit -m "Add demo data for Vercel"
   git push
   ```

2. [Import the repo](https://vercel.com/new) on Vercel (GitHub: `seanjhannon/drake_ai`).

3. **Environment variables** (Production only):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_DEMO_MODE` | `true` |
   | `DEMO_MODE` | `true` |

   Do **not** add `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`.

4. Deploy. Share the `*.vercel.app` URL.

### After changing the demo catalog

```bash
# Re-scan locally, then refresh committed artifacts:
npm run demo:scan   # regenerates public/data/demo-scan.jsonl
git add results.json data/lyrics.json public/data/demo-scan.jsonl
git commit && git push   # Vercel redeploys automatically
```
