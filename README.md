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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
