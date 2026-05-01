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
- Do NOT use Internal ops notes to create item quantities.
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

IMPORTANT:
For Serviceware, do NOT return item names.
Return fixed numeric fields only.

Each JSON element must have this exact shape:
{
  "order_number": "string",
  "customer_name": "string",
  "plastic_tongs": number,
  "spoon": number,
  "bamboo_u_tongs": number,
  "utensil_single_pack": number
}

CRITICAL ACCURACY RULES:
- Extract ONLY from the actual Serviceware table in this PDF.
- The Serviceware report is the ONLY source for serviceware items.
- Do NOT guess.
- Do NOT infer missing items.
- Do NOT use delivery log notes.
- Do NOT use customer name similarity to copy items.
- Do NOT copy quantities from the row above.
- Do NOT copy quantities from the row below.
- Do NOT carry a quantity forward from a previous row.
- Do NOT shift a quantity left or right into the wrong column.
- Each row is one order.
- Each order number must be treated as completely separate.
- Use Order No as order_number.
- Use Customer Name as customer_name.
- If a serviceware cell is blank, return 0 for that field.
- If a serviceware cell has a positive number, return that exact number in the matching field.
- If all four serviceware columns are blank for a row, return all four fields as 0.

The serviceware columns are exactly, from left to right:
1. Plastic Tongs
2. Spoon
3. Bamboo U-tongs
4. Utensil Single Pack

FIELD MAPPING:
- The Plastic Tongs column maps ONLY to plastic_tongs.
- The Spoon column maps ONLY to spoon.
- The Bamboo U-tongs column maps ONLY to bamboo_u_tongs.
- The Utensil Single Pack column maps ONLY to utensil_single_pack.
- Never move a number from one column to another.
- Never treat Bamboo U-tongs as Spoon.
- Never treat Bamboo U-tongs as Utensil Single Pack.
- Never treat Utensil Single Pack as Bamboo U-tongs.
- Never treat Spoon as Bamboo U-tongs.
- Never treat Spoon as Plastic Tongs.
- Never treat Plastic Tongs as Spoon.

SIMILAR NAME RULES:
- Similar customer names must not be merged.
- Similar order names must not be blended.
- Same customer names on different order numbers must still be treated as separate orders.
- "Operations SF 1" and "Operations SF 2" are separate customers.
- Order #80624 and Order #80625 are separate orders.
- Do NOT copy any item from #80624 to #80625.
- Do NOT copy any item from #80625 to #80624.

SPECIFIC KNOWN ROW EXAMPLES:
- If Order #80427 Marianna Stark has 1 under Bamboo U-tongs and blank Utensil Single Pack, return:
  {
    "order_number": "80427",
    "customer_name": "Marianna Stark",
    "plastic_tongs": 0,
    "spoon": 0,
    "bamboo_u_tongs": 1,
    "utensil_single_pack": 0
  }
- If Order #80624 Operations SF 1 has 3 under Bamboo U-tongs, return:
  {
    "order_number": "80624",
    "customer_name": "Operations SF 1",
    "plastic_tongs": 0,
    "spoon": 0,
    "bamboo_u_tongs": 3,
    "utensil_single_pack": 0
  }
- If Order #80625 Operations SF 2 has blank Plastic Tongs, blank Spoon, blank Bamboo U-tongs, and blank Utensil Single Pack, return:
  {
    "order_number": "80625",
    "customer_name": "Operations SF 2",
    "plastic_tongs": 0,
    "spoon": 0,
    "bamboo_u_tongs": 0,
    "utensil_single_pack": 0
  }

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
- Similar customer names must not be merged.
- Similar order names must not be blended.
- Each order number must be treated as completely separate.
- Do NOT copy quantities from the row above.
- Do NOT copy quantities from the row below.
- Do NOT carry a quantity forward from a previous row.

VERY IMPORTANT MULTI-ITEM RULES:
- These reports are grouped by item section.
- The same order number may appear multiple times in the same report under different item sections.
- If the same order appears multiple times, extract EVERY row for that order.
- Do NOT stop after the first item for an order.
- Do NOT overwrite an earlier item when the same order appears again later in the report.
- Do NOT merge different item names together.
- Each row with a positive Qty should become an item for that order.
- If an order appears under beverage items and also later under coffee-related beverage items, include BOTH.
- If an order appears under coffee items and also later under decaf or tea items, include ALL of them.
- Repeated order numbers are expected and must not be treated as duplicates unless the item name is exactly the same.

BEVERAGE / MILK / CREAM ACCURACY RULES:
- The Beverages report may include regular beverages and coffee-related beverage items.
- Coffee-related beverage items can include Clover Organic Half & Half (Pint), Califia Oat Barista Blend (Quart), or similar milk/cream items.
- These items MUST be extracted when they appear in the Beverages report.
- Do NOT skip Clover Organic Half & Half because the order already appeared earlier under another beverage item.
- Do NOT skip Clover Organic Half & Half because the order also appears in the Coffee report.
- If an order has coffee items in the Coffee report, still extract milk/cream items from the Beverages report when they are listed there.
- Do NOT automatically invent half & half if it is not listed in the Beverages report.

SPECIFIC EXAMPLES:
- If Order #80684 Maureen Boyer appears under "Happy Moose Organic Cali Orange Juice" with Qty 1 and also later under "Clover Organic Half & Half (Pint)" with Qty 1, the output for Order #80684 must include BOTH items.
- If Order #79571 appears once under "Assorted Tea To-Go Box" with Qty 3 and again under "Coffee To Go Box 48 servings" with Qty 3, the output for Order #79571 must include BOTH items.
- If Order #80540 appears once under "Assorted Tea To-Go Box" with Qty 2 and again under "Coffee To Go Box 48 servings" with Qty 1, the output for Order #80540 must include BOTH items.
- If Order #79072 appears multiple times under different beverage, milk, coffee, or tea items, include every item and quantity listed for that order.

ITEM NAME RULES:
- Use the item name from the Item column.
- Include the Variant in the name when it helps identify the item.
- Example: if Item is "Coffee To Go Box" and Variant is "48 servings", name should be "Coffee To Go Box 48 servings".
- Example: if Item is "Coffee To Go Box" and Variant is "12 servings", name should be "Coffee To Go Box 12 servings".
- Example: if Item is "Decaf Coffee To Go Box" and Variant is "12 servings", name should be "Decaf Coffee To Go Box 12 servings".
- Example: if Item is "Clover Organic Half & Half" and Variant is "(Pint)", name should be "Clover Organic Half & Half (Pint)".
- Example: if Item is "Califia Oat Barista Blend" and Variant is "(Quart)", name should be "Califia Oat Barista Blend (Quart)".
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

        const cleanItems =
          report.category === 'serviceware'
            ? servicewareFieldsToItems(entry)
            : cleanItemList(entry.items);

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
    max_tokens: 8000,
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

function servicewareFieldsToItems(entry) {
  const items = [];

  const plasticTongs = safePositiveNumber(entry?.plastic_tongs);
  const spoon = safePositiveNumber(entry?.spoon);
  const bambooUTongs = safePositiveNumber(entry?.bamboo_u_tongs);
  const utensilSinglePack = safePositiveNumber(entry?.utensil_single_pack);

  if (plasticTongs > 0) {
    items.push({ name: 'Plastic Tongs', qty: plasticTongs });
  }

  if (spoon > 0) {
    items.push({ name: 'Spoon', qty: spoon });
  }

  if (bambooUTongs > 0) {
    items.push({ name: 'Bamboo U-tongs', qty: bambooUTongs });
  }

  if (utensilSinglePack > 0) {
    items.push({ name: 'Utensil Single Pack', qty: utensilSinglePack });
  }

  return items;
}

function safePositiveNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;
  if (number <= 0) return 0;

  return number;
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
