import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure committed JSON ships with serverless API routes on Vercel.
  outputFileTracingIncludes: {
    '/api/results': ['./results.json'],
    '/api/lyrics': ['./data/lyrics.json'],
    '/api/lyrics/track': ['./data/lyrics.json'],
    '/api/scan': ['./data/lyrics.json', './results.json', './data/reviews.json'],
    '/api/reviews': ['./data/reviews.json'],
    '/api/mentions/manual': ['./data/lyrics.json', './results.json', './data/reviews.json'],
    '/api/mentions/track': ['./data/lyrics.json', './results.json'],
  },
};

export default nextConfig;
