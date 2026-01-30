const autocannon = require("autocannon");

/**
 * MODES:
 * - user     -> POST /notifications/send
 * - section  -> POST /notifications/send-section
 * - chat     -> POST /notifications/send-chat
 */
const MODE = (process.env.MODE || "user").toLowerCase();

const DEFAULT_URLS = {
  user: "http://localhost:3000/notifications/send",
  section: "http://localhost:3000/notifications/send-section",
  chat: "http://localhost:3000/notifications/send-chat",
};

const URL = process.env.URL || DEFAULT_URLS[MODE] || DEFAULT_URLS.user;
const CONNECTIONS = parseInt(process.env.CONNECTIONS || "50", 10);
const DURATION = parseInt(process.env.DURATION || "20", 10); // seconds
const PIPELINE = parseInt(process.env.PIPELINE || "1", 10);

const AUTH = process.env.AUTH || "Bearer dev";

function randUser() {
  const n = Math.floor(Math.random() * 10000);
  return `u${n}`;
}

function randSection() {
  const sections = (process.env.SECTIONS || "home,feed,chat,settings")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sections[Math.floor(Math.random() * sections.length)];
}

function randChat() {
  const chats = (process.env.CHATS || "room-1,room-2,room-3")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chats[Math.floor(Math.random() * chats.length)];
}

function body() {
  if (MODE === "section") {
    return JSON.stringify({
      sectionId: randSection(),
      event: "section_ping",
      data: { message: "stress" },
      priority: 4,
    });
  }

  if (MODE === "chat") {
    return JSON.stringify({
      chatId: randChat(),
      event: "chat_message",
      data: { text: "stress" },
      priority: 4,
    });
  }

  // default: MODE=user
  return JSON.stringify({
    userId: randUser(),
    event: "new_message",
    data: { message: "stress" },
    priority: 5,
  });
}

console.log(`Stress HTTP -> ${URL}`);
console.log(`mode=${MODE}`);
console.log(
  `connections=${CONNECTIONS} duration=${DURATION}s pipeline=${PIPELINE}`,
);

const instance = autocannon(
  {
    url: URL,
    connections: CONNECTIONS,
    duration: DURATION,
    pipelining: PIPELINE,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH,
    },
    body: body(),
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log("done");
  },
);

autocannon.track(instance, { renderProgressBar: true });
