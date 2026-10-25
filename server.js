// Сервер: отдаёт сайт и пересылает заявки в Telegram. Без внешних библиотек (нужен Node 18+).
const http = require("http");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PORT = process.env.PORT || 3000;
if (!TOKEN || !CHAT_ID) {
  console.error("Задайте переменные BOT_TOKEN и CHAT_ID");
  process.exit(1);
}

const hits = new Map(); // защита от спама: не более 5 заявок в час с одного адреса
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}
const cut = (v, n) => String(v || "").trim().slice(0, n);

async function sendToTelegram(o) {
  const text =
    "Новая заявка\n\n" +
    "Имя: " + o.name + "\n" +
    "Услуга: " + o.service + "\n" +
    "Контакт: " + o.contact + "\n\n" +
    (o.message || "(без описания)");
  const r = await fetch("https://api.telegram.org/bot" + TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
  if (!r.ok) throw new Error("Telegram: " + r.status + " " + (await r.text()));
}

http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/order") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on("end", async () => {
      try {
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
        if (limited(ip)) { res.writeHead(429); return res.end(); }
        const d = JSON.parse(body);
        if (d.site) { res.writeHead(200); return res.end("{}"); } // скрытое поле для ботов
        const o = { name: cut(d.name, 100), service: cut(d.service, 100), contact: cut(d.contact, 100), message: cut(d.message, 2000) };
        if (!o.name || !o.contact) { res.writeHead(400); return res.end(); }
        await sendToTelegram(o);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } catch (e) {
        console.error(e.message);
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => console.log("Сайт запущен на порту " + PORT));
