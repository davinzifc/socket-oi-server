const { io } = require("socket.io-client");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const CLIENTS = parseInt(process.env.CLIENTS || "200", 10);
const SECTIONS = (process.env.SECTIONS || "home,feed,chat,settings")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CHANGE_EVERY_MS = parseInt(process.env.CHANGE_EVERY_MS || "0", 10); // 0 = no cambia

function now() {
  return new Date().toISOString();
}

console.log(`[${now()}] WS stress clients`);
console.log(`[${now()}] SERVER_URL=${SERVER_URL} CLIENTS=${CLIENTS}`);

let connected = 0;
let errors = 0;

const sockets = [];

for (let i = 0; i < CLIENTS; i++) {
  const userId = `stress_u${i}`;
  const sectionId = SECTIONS[i % SECTIONS.length];

  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    query: { userId, sectionId },
    timeout: 10000,
  });

  socket.on("connected", () => {
    connected++;
    if (connected % 50 === 0) {
      console.log(
        `[${now()}] connected=${connected}/${CLIENTS} errors=${errors}`,
      );
    }
  });
  socket.on("connect_error", () => {
    errors++;
  });
  sockets.push(socket);
}

let interval;
if (CHANGE_EVERY_MS > 0) {
  interval = setInterval(() => {
    for (let i = 0; i < sockets.length; i++) {
      const nextSection = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
      sockets[i].emit("presence:setSection", { sectionId: nextSection });
    }
  }, CHANGE_EVERY_MS);
}

const shutdown = () => {
  if (interval) clearInterval(interval);
  console.log(`[${now()}] closing sockets...`);
  for (const s of sockets) s.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
