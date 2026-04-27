import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DELIVERY_LOG_PROMPT = `You are extracting schedule information from a catering delivery log PDF.

Return ONLY a valid JSON array.
Do not include markdown.
Do not include explanations.
Do not include comments.

Each JSON element must have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "company": "string or null",
  "delivery_window": "string like '7:00 am - 7:30 am'"
}

CRITICAL RULES:
- This delivery log is ONLY for time windows and customer/order matching.
- Do NOT extract packing items from Internal ops notes.
- Do NOT create serviceware, coffee, beverages, alcohol, or add-on items from this report.
- The delivery window appears as a group/header row, such as "7:00 am - 7:30 am".
- Every order listed below that window belongs to that same delivery_window until the next time window appears.
- Use Order No. as order_number.
- Use Contact Name as customer_name.
- Use Company as company when present, otherwise null.
- Include every order that has an order number.
- Return ONLY the JSON array.`;

const SERVICEWARE_PROMPT = `You are extracting data from the Serviceware PDF report.

Return ONLY a valid JSON array.
Do not include markdown.
Do not include explanations.
Do not include comments.

Each JSON element must have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "time": null,
  "items": [
    { "name": "string", "qty": number }
  ]
}

CRITICAL ACCURACY RULES:
- Extract ONLY from the actual Serviceware table in this PDF.
- Do NOT guess.
- Do NOT infer missing items.
- Do NOT use delivery log notes.
- Each row is one order.
- Use Order No as order_number.
- Use Customer Name as customer_name.
- Time must always be null.

The serviceware columns are exactly:
1. Plastic Tongs
2. Spoon
3. Bamboo U-tongs
4. Utensil Single Pack

Only output an item when that exact column has a positive quantity.
Use these exact item names:
- "Plastic Tongs"
- "Spoon"
- "Bamboo U-tongs"
- "Utensil Single Pack"

Return ONLY the JSON array.`;

const GENERIC_OPS_REPORT_PROMPT = `You are extracting data from ONE catering operations production report PDF.

Return ONLY a valid JSON array.
Do not include markdown.
Do not include explanations.
Do not include comments.

Each JSON element must have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "time": "string like '8:30 AM' or null",
  "items": [
    { "name": "string", "qty": number }
  ]
}

CRITICAL ACCURACY RULES:
- Extract ONLY from the actual table in this PDF.
- Do NOT use delivery log internal ops notes.
- Do NOT infer or guess missing items.
- Do NOT create items from memory.
- If you cannot confidently read an item or quantity, skip that item.
- Use the order number as the primary key.
- Quantities must come only from the Qty column.
- Skip any item with blank quantity, zero quantity, or unreadable quantity.
- Use Kitchen Time as time when shown.

ITEM NAME RULES:
- Use the item name from the Item column.
- Include the Variant in the name when it helps identify the item.
- Example: if Item is "Coffee To Go Box" and Variant is "48 servings", name should be "Coffee To Go Box 48 servings".
- If the item is "Custom Item" and there is an Item Note, include the note in the name like "Custom Item - extra menus".

Return ONLY the JSON array.`;

const REPORT_SLOTS = [
  { slot: 'serviceware', category: 'serviceware', prompt: SERVICEWARE_PROMPT },
  { slot: 'add-ons', category: 'add-ons', prompt: GENERIC_OPS_REPORT_PROMPT },
  { slot: 'beverages', category: 'beverages', prompt: GENERIC_OPS_REPORT_PROMPT },
  { slot: 'coffee', category: 'coffee', prompt: GENERIC_OPS_REPORT_PROMPT },
  { slot: 'alcohol', category: 'alcohol', prompt: GENERIC_OPS_REPORT_PROMPT },
];

export async function POST(req) {
  try {
    const formData = await req.formData();

    const deliveryMap = await buildDeliveryMap(formData);
    const orderMap = {};

    for (const report of REPORT_SLOTS) {
      const file = formData.get(report.slot);
      if (!file) continue;

      const entries = await extractPdfJson(file, report.prompt, report.slot);

      for (const entry of entries) {
        const orderNumber = normalizeOrderNumber(entry.order_number);
        if (!orderNumber) continue;

        const deliveryInfo = deliveryMap[orderNumber];

        if (!orderMap[orderNumber]) {
          orderMap[orderNumber] = {
            order_number: orderNumber,
            customer_name: deliveryInfo?.customer_name || normalizeText(entry.customer_name) || '',
            company: deliveryInfo?.company || null,
            time: deliveryInfo?.time || normalizeText(entry.time) || null,
            categories: {
              serviceware: [],
              'add-ons': [],
              beverages: [],
              coffee: [],
              alcohol: [],
            },
          };
        }

        if (deliveryInfo?.time) {
          orderMap[orderNumber].time = deliveryInfo.time;
        } else if (entry.time && !orderMap[orderNumber].time) {
          orderMap[orderNumber].time = normalizeText(entry.time);
        }

        if (deliveryInfo?.customer_name) {
          orderMap[orderNumber].customer_name = deliveryInfo.customer_name;
        } else if (entry.customer_name && !orderMap[orderNumber].customer_name) {
          orderMap[orderNumber].customer_name = normalizeText(entry.customer_name);
        }

        if (deliveryInfo?.company) {
          orderMap[orderNumber].company = deliveryInfo.company;
        }

        const cleanItems = cleanItemList(entry.items);

        for (const item of cleanItems) {
          addOrCombineItem(orderMap[orderNumber].categories[report.category], item);
        }
      }
    }

    const orders = Object.values(orderMap)
      .filter((order) => hasAnyItems(order.categories))
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

async function buildDeliveryMap(formData) {
  const deliveryFile = formData.get('delivery-log');
  const deliveryMap = {};

  if (!deliveryFile) return deliveryMap;

  const deliveryEntries = await extractPdfJson(
    deliveryFile,
    DELIVERY_LOG_PROMPT,
    'delivery log'
  );

  for (const entry of deliveryEntries) {
    const orderNumber = normalizeOrderNumber(entry.order_number);
    if (!orderNumber) continue;

    deliveryMap[orderNumber] = {
      time: normalizeText(entry.delivery_window),
      customer_name: normalizeText(entry.customer_name),
      company: normalizeText(entry.company),
    };
  }

  return deliveryMap;
}

async function extractPdfJson(file, prompt, label) {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
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
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      throw new Error('Parsed result was not an array.');
    }

    return parsed;
  } catch (err) {
    console.error(`JSON parse failed for ${label}:`, cleaned);

    throw new Error(
      `Could not accurately read the ${label} report. Please confirm the correct PDF was uploaded.`
    );
  }
}

function normalizeOrderNumber(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/[^\d]/g, '')
    .trim();
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).replace(/\s+/g, ' ').trim();

  return text || null;
}

function cleanItemList(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const name = normalizeText(item?.name);
      const qty = Number(item?.qty);

      if (!name) return null;
      if (!Number.isFinite(qty)) return null;
      if (qty <= 0) return null;

      return {
        name,
        qty,
      };
    })
    .filter(Boolean);
}

function addOrCombineItem(list, newItem) {
  const existing = list.find(
    (item) => item.name.trim().toLowerCase() === newItem.name.trim().toLowerCase()
  );

  if (existing) {
    existing.qty += newItem.qty;
  } else {
    list.push({ ...newItem });
  }
}

function hasAnyItems(categories) {
  return Object.values(categories).some((items) => Array.isArray(items) && items.length > 0);
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
