import WebSocket, { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const wss = new WebSocketServer({ host, port });

const socketToPeer = new Map();
const peerToSocket = new Map();

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastExcept(sender, payload) {
  for (const client of wss.clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}

function listKnownPeers() {
  return Array.from(socketToPeer.values());
}

function removePeerForSocket(socket) {
  const peer = socketToPeer.get(socket);
  if (!peer) {
    return;
  }

  socketToPeer.delete(socket);
  peerToSocket.delete(peer.peerId);

  broadcastExcept(socket, {
    type: "peer-offline",
    peerId: peer.peerId,
    sentAt: Date.now(),
  });
}

wss.on("connection", (socket) => {
  const existing = listKnownPeers();
  for (const peer of existing) {
    safeSend(socket, {
      type: "announce",
      peerId: peer.peerId,
      displayName: peer.displayName,
      publicKey: peer.publicKey,
      sentAt: Date.now(),
    });
  }

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message?.type === "announce") {
      const peer = {
        peerId: String(message.peerId || ""),
        displayName: String(message.displayName || "Peer"),
        publicKey: String(message.publicKey || ""),
      };

      if (!peer.peerId) {
        return;
      }

      const previous = socketToPeer.get(socket);
      if (previous && previous.peerId !== peer.peerId) {
        peerToSocket.delete(previous.peerId);
      }

      socketToPeer.set(socket, peer);
      peerToSocket.set(peer.peerId, socket);

      broadcastExcept(socket, {
        type: "announce",
        peerId: peer.peerId,
        displayName: peer.displayName,
        publicKey: peer.publicKey,
        sentAt: Date.now(),
      });
      return;
    }

    if (message?.type === "signal" && message.signal?.toPeerId) {
      const target = peerToSocket.get(String(message.signal.toPeerId));
      if (!target) {
        return;
      }

      safeSend(target, {
        type: "signal",
        signal: message.signal,
      });
    }
  });

  socket.on("close", () => {
    removePeerForSocket(socket);
  });

  socket.on("error", () => {
    removePeerForSocket(socket);
  });
});

console.log(`LAN relay listening on ws://${host}:${port}`);
