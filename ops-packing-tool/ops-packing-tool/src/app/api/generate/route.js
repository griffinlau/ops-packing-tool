import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const OPS_REPORT_PROMPT = `You are extracting data from ONE catering operations PDF report.

Return ONLY a valid JSON array.
Do not include markdown.
Do not include explanations.
Do not include comments.

Each JSON element must have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "time": "string like '8:30 AM' or null",
  "category": "serviceware | add-ons | alcohol | beverages | coffee",
  "items": [
    { "name": "string", "qty": number }
  ]
}

CRITICAL ACCURACY RULES:
- Extract ONLY from the actual table in this PDF.
- Do NOT use the delivery log internal ops notes.
- Do NOT infer or guess missing items.
- Do NOT create items from memory.
- If you cannot confidently read an item or quantity, skip that item.
- Use the order number as the primary key.
- Quantities must come only from the Qty column or from the serviceware quantity columns.
- Skip any item with blank quantity, zero quantity, or unreadable quantity.

SERVICEWARE REPORT RULES:
- If this PDF is the Serviceware report, the columns are:
  1. Plastic Tongs
  2. Spoon
  3. Bamboo U-tongs
  4. Utensil Single Pack
- Each row is one order.
- Only output quantities from those exact columns.
- Category must be "serviceware".
- Time must be null.
- Item names must be exactly:
  "Plastic Tongs"
  "Spoon"
  "Bamboo U-tongs"
  "Utensil Single Pack"
- Do not add serviceware items unless a positive quantity appears in that exact item's column.

ADD-ONS REPORT RULES:
- If this PDF is the Add-on report, category must be "add-ons".
- Use the item name from the Item column.
- If the item is "Custom Item" and there is an Item Note, include the note in the name like:
  "Custom Item - extra menus"
- Use Qty as the quantity.
- Use Kitchen Time as time when shown.

BEVERAGES REPORT RULES:
- If this PDF is the Beverages report, category must be "beverages".
- Use the item name from the Item column.
- Include the Variant in the name when it helps identify the item.
- Use Qty as the quantity.
- Use Kitchen Time as time when shown.

COFFEE REPORT RULES:
- If this PDF is the Coffee report, category must be "coffee".
- Use the item name from the Item column.
- Include the Variant in the name when it helps identify the item, for example:
  "Coffee To Go Box 48 servings"
- Use Qty as the quantity.
- Use Kitchen Time as time when shown.

ALCOHOL REPORT RULES:
- If this PDF is the Alcohol report, category must be "alcohol".
- Use the item name from the Item column.
- Use Qty as the quantity.
- Use Kitchen Time as time when shown.

Return ONLY the JSON array.`;

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

const SLOTS = ['serviceware', 'add-ons', 'beverages', 'coffee', 'alcohol'];

export async function POST(req) {
  try {
    const formData = await req.formData();

    const deliveryFile = formData.get('delivery-log');
    const deliveryMap = {};

    if (deliveryFile) {
      const deliveryEntries = await extractPdfJson(deliveryFile, DELIVERY_LOG_PROMPT, 'delivery log');

      for (const entry of deliveryEntries) {
        const orderNumber = normalizeOrderNumber(entry.order_number);

        if (!orderNumber) continue;

        deliveryMap[orderNumber] = {
          time: normalizeText(entry.delivery_window),
          customer_name: normalizeText(entry.customer_name),
          company: normalizeText(entry.company),
        };
      }
    }

    const results = {};

    for (const slot of SLOTS) {
      const file = formData.get(slot);
      if (!file) continue;

      const parsed = await extractPdfJson(file, OPS_REPORT_PROMPT, slot);
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
            customer_name: deliveryInfo?.customer_name || normalizeText(entry.customer_name),
            company: deliveryInfo?.company || null,
            time: deliveryInfo?.time || normalizeText(entry.time),
            categories: {},
          };
        }

        if (deliveryInfo?.time) {
          orderMap[orderNumber].time = deliveryInfo.time;
        } else if (entry.time && !orderMap[orderNumber].time) {
          orderMap[orderNumber].time = normalizeText(entry.time);
        }

        if (deliveryInfo?.customer_name) {
          orderMap[orderNumber].customer_name = deliveryInfo.customer_name;
        }

        if (deliveryInfo?.company) {
          orderMap[orderNumber].company = deliveryInfo.company;
        }

        const category = normalizeCategory(entry.category);
        if (!category) continue;

        if (!orderMap[orderNumber].categories[category]) {
          orderMap[orderNumber].categories[category] = [];
        }

        const cleanItems = cleanItemList(entry.items);

        for (const item of cleanItems) {
          addOrCombineItem(orderMap[orderNumber].categories[category], item);
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

async function extractPdfJson(file, prompt, label) {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5000,
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

  const text = String(value).trim();

  return text || null;
}

function normalizeCategory(value) {
  if (!value) return null;

  const text = String(value).trim().toLowerCase();

  const allowed = ['serviceware', 'add-ons', 'alcohol', 'beverages', 'coffee'];

  if (allowed.includes(text)) return text;

  if (text === 'addons' || text === 'add ons' || text === 'add-on') {
    return 'add-ons';
  }

  return null;
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
