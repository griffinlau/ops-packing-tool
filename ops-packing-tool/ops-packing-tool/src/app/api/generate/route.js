import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Extract all order data from this catering operations report PDF. Return ONLY a valid JSON array with no other text, markdown, or explanation.

Each element should have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "time": "string like '8:30 AM' or null",
  "category": "serviceware | add-ons | alcohol | beverages | coffee",
  "items": [{ "name": "string", "qty": number }]
}

Rules:
- Serviceware report: columns are item types (Plastic Tongs, Spoon, Bamboo Utongs, Utensil Single Pack). Each row = one order. Only include items with qty > 0. Category = "serviceware". Time = null.
- Add-ons/Alcohol/Beverages/Coffee reports: group all items for the same order number into one element. Use the kitchen time shown.
- Skip rows with all blank or zero quantities.
- Return ONLY the JSON array.`;

export async function POST(req) {
  try {
    const formData = await req.formData();
    const results = {};

    const slots = ['serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

    for (const slot of slots) {
      const file = formData.get(slot);
      if (!file) continue;

      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            { type: 'text', text: PROMPT }
          ]
        }]
      });

      const raw = message.content?.map(c => c.text || '').join('') || '';
      let parsed;
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      } catch {
        continue;
      }

      results[slot] = parsed;
    }

    // Merge all results by order number
    const map = {};
    for (const [, entries] of Object.entries(results)) {
      for (const entry of entries) {
        const key = String(entry.order_number);
        if (!map[key]) {
          map[key] = {
            order_number: key,
            customer_name: entry.customer_name,
            time: entry.time || null,
            categories: {}
          };
        }
        if (entry.time && !map[key].time) map[key].time = entry.time;
        const cat = entry.category;
        if (!map[key].categories[cat]) map[key].categories[cat] = [];
        if (entry.items?.length) map[key].categories[cat].push(...entry.items);
      }
    }

    const orders = Object.values(map)
      .filter(o => Object.keys(o.categories).length > 0)
      .sort((a, b) => parseTime(a.time) - parseTime(b.time));

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('Generate error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed.' }, { status: 500 });
  }
}

function parseTime(t) {
  if (!t) return Infinity;
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return Infinity;
  let h = parseInt(m[1]), min = parseInt(m[2]), p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}
