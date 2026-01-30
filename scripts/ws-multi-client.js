const { io } = require("socket.io-client");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const USER_IDS = (process.env.USER_IDS || "user1,user2,user3")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EVENTS = (
  process.env.EVENTS || "new_message,system_announcement,order_update"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function now() {
  return new Date().toISOString();
}

console.log(`[${now()}] Starting WS multi-client test`);
console.log(`[${now()}] SERVER_URL=${SERVER_URL}`);
console.log(`[${now()}] USER_IDS=${USER_IDS.join(",")}`);
console.log(`[${now()}] EVENTS=${EVENTS.join(",")}`);

const sockets = [];

for (const userId of USER_IDS) {
  const socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    query: { userId },
    timeout: 10000,
  });

  socket.on("connect", () =>
    console.log(`[${now()}] [${userId}] connect: socketId=${socket.id}`),
  );
  socket.on("connected", (payload) =>
    console.log(`[${now()}] [${userId}] connected: ${JSON.stringify(payload)}`),
  );
  socket.on("disconnect", (reason) =>
    console.log(`[${now()}] [${userId}] disconnect: ${reason}`),
  );
  socket.on("connect_error", (err) =>
    console.log(`[${now()}] [${userId}] connect_error: ${err.message}`),
  );
  socket.on("error", (payload) =>
    console.log(`[${now()}] [${userId}] error: ${JSON.stringify(payload)}`),
  );

  for (const evt of EVENTS) {
    socket.on(evt, (data) => {
      console.log(
        `[${now()}] [${userId}] EVENT "${evt}": ${JSON.stringify(data)}`,
      );
    });
  }

  sockets.push(socket);
}

const shutdown = () => {
  console.log(`[${now()}] Shutting down sockets...`);
  for (const s of sockets) s.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
