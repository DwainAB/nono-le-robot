import { createServer } from "node:http";
import { config } from "./config.js";
import { handleChat } from "./chat-service.js";
import { listKnownLocations } from "./store-map.js";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(body));
}

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("JSON invalide"));
      }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "nono-robot-backend"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/locations") {
    sendJson(response, 200, {
      locations: listKnownLocations()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await collectRequestBody(request);
      const result = await handleChat(body);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  sendJson(response, 404, {
    error: "Route introuvable"
  });
});

server.listen(config.port, config.host, () => {
  console.log(`Backend en ecoute sur http://${config.host}:${config.port}`);
});
