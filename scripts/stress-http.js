const autocannon = require("autocannon");

const URL = process.env.URL || "http://localhost:3000/notifications/send";
const CONNECTIONS = parseInt(process.env.CONNECTIONS || "50", 10);
const DURATION = parseInt(process.env.DURATION || "20", 10); // seconds
const PIPELINE = parseInt(process.env.PIPELINE || "1", 10);

const AUTH = process.env.AUTH || "Bearer dev";

function randUser() {
  const n = Math.floor(Math.random() * 10000);
  return `u${n}`;
}

function body() {
  return JSON.stringify({
    userId: randUser(),
    event: "new_message",
    data: { message: "stress" },
    priority: 5,
  });
}

console.log(`Stress HTTP -> ${URL}`);
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
