import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

function getTitle(page) {
  const titleProp = page.properties?.Name;
  if (!titleProp || titleProp.type !== "title") return "";
  return titleProp.title?.map((t) => t.plain_text).join("") || "";
}

function mapPage(page) {
  return {
    id: page.id,
    name: getTitle(page),
    done: page.properties?.Done?.checkbox ?? false,
    category: page.properties?.Category?.select?.name ?? "",
    order: page.properties?.Order?.number ?? 999
  };
}

async function queryAllTasks() {
  const response = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    sorts: [
      { property: "Order", direction: "ascending" },
      { timestamp: "created_time", direction: "ascending" }
    ]
  });

  return response.results.map(mapPage);
}

async function createTask(name, category) {
  const all = await queryAllTasks();
  const sameCategory = all.filter((item) => item.category === category);
  const nextOrder =
    sameCategory.length > 0
      ? Math.max(...sameCategory.map((x) => x.order || 0)) + 1
      : 1;

  const created = await notion.pages.create({
    parent: {
      type: "data_source_id",
      data_source_id: DATA_SOURCE_ID
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: name
            }
          }
        ]
      },
      Done: {
        checkbox: false
      },
      Category: {
        select: {
          name: category
        }
      },
      Order: {
        number: nextOrder
      }
    }
  });

  return mapPage(created);
}

async function toggleTask(pageId, done) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Done: {
        checkbox: done
      }
    }
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({ ok: false, error: "NOTION_TOKEN 없음" });
  }

  if (!process.env.NOTION_DATA_SOURCE_ID) {
    return res.status(500).json({ ok: false, error: "NOTION_DATA_SOURCE_ID 없음" });
  }

  try {
    if (req.method === "GET") {
      const tasks = await queryAllTasks();
      return res.status(200).json({ ok: true, tasks });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      if (body.action === "toggle") {
        const { id, done } = body;

        if (!id || typeof done !== "boolean") {
          return res.status(400).json({ ok: false, error: "잘못된 toggle 요청" });
        }

        await toggleTask(id, done);
        return res.status(200).json({ ok: true });
      }

      if (body.action === "add") {
        const { name, category } = body;

        if (!name || !category) {
          return res.status(400).json({ ok: false, error: "이름/카테고리 필요" });
        }

        const item = await createTask(name, category);
        return res.status(200).json({ ok: true, item });
      }

      return res.status(400).json({ ok: false, error: "지원하지 않는 action" });
    }

    return res.status(405).json({ ok: false, error: "허용되지 않은 메서드" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: error?.body?.message || error?.message || "서버 오류"
    });
  }

}
