const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static("public"));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let espClient = null;

wss.on("connection", (ws) => {
  console.log("Client Connected");

  ws.on("message", (message) => {
    const msg = message.toString();

    console.log("Received:", msg);

    try {
      const data = JSON.parse(msg);

      if (data.type === "esp") {
        espClient = ws;
        console.log("ESP Registered");
      }

      if (data.type === "web") {
        if (espClient) {
          espClient.send(
            JSON.stringify({
              command: data.command,
            }),
          );
        }
      }
    } catch (err) {
      console.log(err);
    }
  });

  ws.on("close", () => {
    if (ws === espClient) {
      espClient = null;
    }

    console.log("Disconnected");
  });
});

server.listen(3000, () => {
  console.log("Server Running");
});
