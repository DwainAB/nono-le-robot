import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { handleChat } from "./chat-service.js";
import { handleTranscription } from "./transcribe-service.js";
import { streamCartesiaTts } from "./cartesia-tts-service.js";
import { bootstrapDatabase, isDatabaseConfigured, testDatabaseConnection } from "./db.js";
import {
  listKnownLocations,
  listStoreInformation,
  replaceLocationItems,
  syncRobotLocations,
  upsertLocation,
  upsertStoreInformation
} from "./store-map.js";
import { getKillswitchState, setKillswitchState } from "./killswitch-service.js";

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
      service: "nono-robot-backend",
      databaseConfigured: isDatabaseConfigured()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/locations") {
    sendJson(response, 200, {
      locations: await listKnownLocations()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/store-info") {
    sendJson(response, 200, {
      entries: await listStoreInformation()
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

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    try {
      const body = await collectRequestBody(request);
      const result = await handleTranscription(body);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/robot/locations/sync") {
    try {
      const body = await collectRequestBody(request);
      const result = await syncRobotLocations(body.locations);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/locations/upsert") {
    try {
      const body = await collectRequestBody(request);
      const location = await upsertLocation(body);
      sendJson(response, 200, {
        location
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/location-items/replace") {
    try {
      const body = await collectRequestBody(request);
      const locations = await replaceLocationItems(body.locationId, body.items);
      sendJson(response, 200, {
        locations
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/store-info/upsert") {
    try {
      const body = await collectRequestBody(request);
      const entries = await upsertStoreInformation(body);
      sendJson(response, 200, {
        entries
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/killswitch") {
    try {
      sendJson(response, 200, await getKillswitchState());
    } catch (error) {
      sendJson(response, 400, {
        error: error.message || "Erreur inconnue"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/killswitch/set") {
    try {
      const body = await collectRequestBody(request);
      const state = await setKillswitchState(Boolean(body.enabled));
      sendJson(response, 200, state);
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

const ttsWebSocketServer = new WebSocketServer({ noServer: true });

ttsWebSocketServer.on("connection", (clientSocket) => {
  let activeGeneration = null;

  clientSocket.on("message", (raw) => {
    let request;
    try {
      request = JSON.parse(raw.toString());
    } catch {
      clientSocket.send(JSON.stringify({ type: "error", message: "JSON invalide" }));
      return;
    }

    const text = String(request.text || "").trim();
    const language = String(request.language || "fr");
    if (!text) {
      clientSocket.send(JSON.stringify({ type: "error", message: "Texte vide" }));
      return;
    }

    activeGeneration?.cancel();
    activeGeneration = streamCartesiaTts({
      text,
      language,
      onAudioChunk: (chunk) => {
        if (clientSocket.readyState === clientSocket.OPEN) {
          clientSocket.send(chunk, { binary: true });
        }
      },
      onDone: () => {
        if (clientSocket.readyState === clientSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: "done" }));
        }
      },
      onError: (error) => {
        if (clientSocket.readyState === clientSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: "error", message: error.message }));
        }
      }
    });
  });

  clientSocket.on("close", () => {
    activeGeneration?.cancel();
  });
});

server.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url || "/", `http://${request.headers.host}`);
  if (pathname === "/ws/tts") {
    ttsWebSocketServer.handleUpgrade(request, socket, head, (clientSocket) => {
      ttsWebSocketServer.emit("connection", clientSocket, request);
    });
  } else {
    socket.destroy();
  }
});

async function startServer() {
  server.listen(config.port, config.host, () => {
    console.log(`Backend en ecoute sur http://${config.host}:${config.port}`);
  });

  if (!isDatabaseConfigured()) {
    console.warn("Base MySQL non configuree");
    return;
  }

  try {
    await bootstrapDatabase();
    await testDatabaseConnection();
    console.log("Connexion MySQL OK");
  } catch (error) {
    console.error("Initialisation MySQL echouee:", error);
  }
}

startServer();
