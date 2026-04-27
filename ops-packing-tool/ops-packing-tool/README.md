# Ops Bag Packing Tool

A Next.js app that consolidates Bi-Rite catering ops reports into one packing sheet, sorted by pickup time.

## Setup

1. Install dependencies:
```
npm install
```

2. Create a `.env.local` file in the root with your Anthropic API key:
```
ANTHROPIC_API_KEY=your_api_key_here
```

3. Run the dev server:
```
npm run dev
```

4. Open http://localhost:3000

## How it works

- Upload any combination of the 5 report types: Serviceware, Add-ons, Beverages, Coffee, Alcohol
- Click "Generate packing sheet"
- Get one consolidated sheet sorted by pickup time
- Download as HTML or print

## Deploy

Works the same as the Coffee Schedule tool — deploy to Vercel or any Node.js host.
Set `ANTHROPIC_API_KEY` as an environment variable.
