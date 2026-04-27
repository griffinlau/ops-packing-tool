import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const OPS_REPORT_PROMPT = `Extract all order data from this catering operations report PDF.

Return ONLY a valid JSON array with no other text, markdown, or explanation.

Each element should have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "time": "string like '8:30 AM' or null",
  "category": "serviceware | add-ons | alcohol | beverages | coffee",
  "items": [{ "name": "string", "qty": number }]
}

Rules:
- Serviceware report: columns are item types like Plastic Tongs, Spoon, Bamboo Utongs, Utensil Single Pack. Each row = one order. Only include items with qty > 0. Category = "serviceware". Time = null.
- Add-ons, Alcohol, Beverages, and Coffee reports: group all items for the same order number into one element. Use the kitchen time shown if available.
- Skip rows with all blank or zero quantities.
- Return ONLY the JSON array.`;

const DELIVERY_LOG_PROMPT = `Extract the delivery window schedule from this delivery log PDF.

Return ONLY a valid JSON array with no other text, markdown, or explanation.

Each element should have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "company": "string or null",
  "delivery_window": "string like '7:00 am - 7:30 am'"
}

Rules:
- The delivery window appears as a bold/group header row, such as "7:00 am - 7:30 am".
- Every order listed under that window should receive that same delivery_window value.
- Use Order No. as order_number.
- Use Contact Name as customer_name.
- Use Company as company when present, otherwise null.
- Include every order in the delivery log.
- Return ONLY the JSON array.`;

const SLOTS = ['serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

export async function POST(req) {
  try {
    const formData = await req.formData();

    const deliveryFile = formData.get('delivery-log');
    const deliveryMap = {};

    if (deliveryFile) {
      const deliveryEntries = await extractPdfJson(deliveryFile, DELIVERY_LOG_PROMPT);

      for (const entry of deliveryEntries) {
        const orderNumber = normalizeOrderNumber(entry.order_number);

        if (!orderNumber) continue;

        deliveryMap[orderNumber] = {
          time: entry.delivery_window || null,
          customer_name: entry.customer_name || '',
          company: entry.company || null,
        };
      }
    }

    const results = {};

    for (const slot of SLOTS) {
      const file = formData.get(slot);
      if (!file) continue;

      const parsed = await extractPdfJson(file, OPS_REPORT_PROMPT);
      results[slot] = parsed;
    }

    const orderMap = {};

    for (const [, entries] of Object.entries(results)) {
      for (const entry of entries) {
        const orderNumber = normalizeOrderNumber(entry.order_number);
        if (!orderNumber) continue;

        const deliveryInfo = deliveryMap[orderNumber];

        if (!orderMap[orderNumber]) {
          orderMap[orderNumber] = {
            order_number: orderNumber,
            customer_name:
              deliveryInfo?.customer_name ||
              entry.customer_name ||
              '',
            company: deliveryInfo?.company || null,
            time: deliveryInfo?.time || entry.time || null,
            categories: {},
          };
        }

        if (deliveryInfo?.time) {
          orderMap[orderNumber].time = deliveryInfo.time;
        } else if (entry.time && !orderMap[orderNumber].time) {
          orderMap[orderNumber].time = entry.time;
        }

        if (deliveryInfo?.customer_name) {
          orderMap[orderNumber].customer_name = deliveryInfo.customer_name;
        }

        if (deliveryInfo?.company) {
          orderMap[orderNumber].company = deliveryInfo.company;
        }

        const category = entry.category;

        if (!category) continue;

        if (!orderMap[orderNumber].categories[category]) {
          orderMap[orderNumber].categories[category] = [];
        }

        if (entry.items?.length) {
          orderMap[orderNumber].categories[category].push(...entry.items);
        }
      }
    }

    const orders = Object.values(orderMap)
      .filter((order) => Object.keys(order.categories).length > 0)
      .sort((a, b) => parseTimeForSort(a.time) - parseTimeForSort(b.time));

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('Generate error:', err);

    return NextResponse.json(
      { error: err.message || 'Generation failed.' },
      { status: 500 }
    );
  }
}

async function extractPdfJson(file, prompt) {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const raw = message.content?.map((c) => c.text || '').join('') || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('JSON parse failed:', cleaned);
    throw new Error('Could not read one of the uploaded reports. Please check that the file is the correct PDF report.');
  }
}

function normalizeOrderNumber(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/[^\d]/g, '')
    .trim();
}

function parseTimeForSort(timeValue) {
  if (!timeValue) return Infinity;

  const text = String(timeValue).trim();

  const match = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);

  if (!match) return Infinity;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toLowerCase();

  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  return hour * 60 + minute;
}
