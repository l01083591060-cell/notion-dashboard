import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

const DATABASE_ID = process.env.NOTION_DATA_SOURCE_ID;

function getTitle(page) {
  const title = page.properties.Name.title;
  if (!title.length) return "";
  return title[0].plain_text;
}

function mapPage(page) {
  return {
    id: page.id,
    name: getTitle(page),
    done: page.properties.Done.checkbox,
    category: page.properties.Category.select?.name || "",
    order: page.properties.Order.number || 0
  };
}

async function getTasks() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID
  });

  return response.results.map(mapPage);
}

async function addTask(name, category) {
  const created = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      Name: {
        title: [{ text: { content: name } }]
      },
      Done: {
        checkbox: false
      },
      Category: {
        select: { name: category }
      },
      Order: {
        number: Date.now()
      }
    }
  });

  return mapPage(created);
}

async function toggleTask(id, done) {
  await notion.pages.update({
    page_id: id,
    properties: {
      Done: {
        checkbox: done
      }
    }
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const tasks = await getTasks();
    res.json({ ok: true, tasks });
    return;
  }

  if (req.method === "POST") {
    const body = req.body;

    if (body.action === "add") {
      const item = await addTask(body.name, body.category);
      res.json({ ok: true, item });
      return;
    }

    if (body.action === "toggle") {
      await toggleTask(body.id, body.done);
      res.json({ ok: true });
      return;
    }
  }

  res.status(400).json({ ok: false });
}