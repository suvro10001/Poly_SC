import express from "express";
import fs from "fs";
import path from "path";
import type http from "http";
import { WebSocketServer, WebSocket } from "ws";

export interface CommNotification {
  id: string;
  title: string;
  message: string;
  type: "bill" | "challan" | "collection" | "expense" | "requisition" | "price" | "chat" | "call" | "system";
  branchName?: string;
  actorId?: string;
  actorName?: string;
  targetUserId?: string;
  readBy: string[];
  createdAt: string;
}

export interface CommGroup {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  isAllStaff?: boolean;
  createdById?: string;
  createdByName?: string;
  createdAt: string;
}

export interface CommMessage {
  id: string;
  tempId?: string;
  channelType: "dm" | "group";
  senderId: string;
  senderName: string;
  senderRole?: string;
  senderBranch?: string;
  targetUserId?: string;
  groupId?: string;
  text: string;
  kind?: "text" | "call_log" | "system";
  createdAt: string;
}

export interface ConnectedCommUser {
  ws: WebSocket;
  userId: string;
  username: string;
  name: string;
  role: string;
  branchName: string;
  designation?: string;
  connectedAt: number;
}

interface CommPersistedState {
  notifications: CommNotification[];
  groups: CommGroup[];
  messages: CommMessage[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const COMM_STATE_FILE = path.join(DATA_DIR, "comm_state.json");
const COMM_STATE_TEMP = path.join(DATA_DIR, "comm_state.tmp.json");

const DEFAULT_ALL_STAFF_GROUP: CommGroup = {
  id: "all-staff",
  name: "All Staff Team",
  description: "Company-wide live chat, announcements & team video calls",
  memberIds: [],
  isAllStaff: true,
  createdById: "system",
  createdByName: "System",
  createdAt: new Date(0).toISOString()
};

let commState: CommPersistedState = {
  notifications: [],
  groups: [DEFAULT_ALL_STAFF_GROUP],
  messages: []
};

const connectedClients = new Map<WebSocket, ConnectedCommUser>();
let wss: WebSocketServer | null = null;
let persistTimer: NodeJS.Timeout | null = null;

function ensureDefaultGroup(groups: CommGroup[]): CommGroup[] {
  const safeGroups = Array.isArray(groups) ? groups.filter((g) => g && g.id && g.name) : [];
  const hasDefault = safeGroups.some((g) => g.id === "all-staff");
  if (!hasDefault) {
    return [DEFAULT_ALL_STAFF_GROUP, ...safeGroups];
  }
  return safeGroups.map((g) => (g.id === "all-staff" ? { ...DEFAULT_ALL_STAFF_GROUP, ...g, isAllStaff: true } : g));
}

function loadCommState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(COMM_STATE_FILE)) {
      const raw = fs.readFileSync(COMM_STATE_FILE, "utf-8");
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          commState = {
            notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(0, 300) : [],
            groups: ensureDefaultGroup(parsed.groups),
            messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-1000) : []
          };
          return;
        }
      }
    }
  } catch (err) {
    console.warn("[CommServer] Failed to load comm_state.json, initializing clean state:", err);
  }
  commState = {
    notifications: [],
    groups: [DEFAULT_ALL_STAFF_GROUP],
    messages: []
  };
}

loadCommState();

function writeCommStateSync(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = JSON.stringify({
      notifications: commState.notifications.slice(0, 300),
      groups: ensureDefaultGroup(commState.groups),
      messages: commState.messages.slice(-1000)
    });
    fs.writeFileSync(COMM_STATE_TEMP, payload, "utf-8");
    fs.renameSync(COMM_STATE_TEMP, COMM_STATE_FILE);
  } catch (err) {
    console.error("[CommServer] Failed saving comm_state.json:", err);
  }
}

function schedulePersistCommState(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeCommStateSync();
  }, 100);
}

process.on("exit", () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
    writeCommStateSync();
  }
});

function getOnlineUsersSnapshot() {
  const byUserId = new Map<string, Omit<ConnectedCommUser, "ws">>();
  for (const client of connectedClients.values()) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    const key = String(client.userId || client.username).toLowerCase().trim();
    if (!key) continue;
    byUserId.set(key, {
      userId: client.userId,
      username: client.username,
      name: client.name,
      role: client.role,
      branchName: client.branchName,
      designation: client.designation,
      connectedAt: client.connectedAt
    });
  }
  return Array.from(byUserId.values());
}

function sendJson(ws: WebSocket, payload: Record<string, any>) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }
}

function broadcastAll(payload: Record<string, any>) {
  const raw = JSON.stringify(payload);
  for (const [ws] of connectedClients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(raw);
      } catch {}
    }
  }
}

function sendToUser(userId: string, payload: Record<string, any>) {
  const targetLow = String(userId || "").toLowerCase().trim();
  if (!targetLow) return;
  const raw = JSON.stringify(payload);
  for (const [ws, meta] of connectedClients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const uIdLow = String(meta.userId || "").toLowerCase().trim();
    const uNameLow = String(meta.username || "").toLowerCase().trim();
    if (uIdLow === targetLow || uNameLow === targetLow) {
      try {
        ws.send(raw);
      } catch {}
    }
  }
}

function sendToGroup(groupId: string, payload: Record<string, any>, excludeUserId?: string) {
  const group = commState.groups.find((g) => g.id === groupId);
  const excludeLow = excludeUserId ? excludeUserId.toLowerCase().trim() : "";
  const isAll = !group || group.isAllStaff || group.id === "all-staff";
  const memberSet = new Set((group?.memberIds || []).map((id) => String(id).toLowerCase().trim()));
  const raw = JSON.stringify(payload);

  for (const [ws, meta] of connectedClients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const uIdLow = String(meta.userId || "").toLowerCase().trim();
    const uNameLow = String(meta.username || "").toLowerCase().trim();
    if (excludeLow && (uIdLow === excludeLow || uNameLow === excludeLow)) continue;
    if (isAll || memberSet.has(uIdLow) || memberSet.has(uNameLow)) {
      try {
        ws.send(raw);
      } catch {}
    }
  }
}

function addNotification(input: Partial<CommNotification>): CommNotification {
  const notif: CommNotification = {
    id: input.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(input.title || "Notification").trim(),
    message: String(input.message || "").trim(),
    type: input.type || "system",
    branchName: input.branchName || undefined,
    actorId: input.actorId || undefined,
    actorName: input.actorName || undefined,
    targetUserId: input.targetUserId || undefined,
    readBy: Array.isArray(input.readBy)
      ? input.readBy
      : input.actorId
      ? [String(input.actorId)]
      : [],
    createdAt: input.createdAt || new Date().toISOString()
  };

  commState.notifications.unshift(notif);
  if (commState.notifications.length > 300) {
    commState.notifications = commState.notifications.slice(0, 300);
  }
  schedulePersistCommState();

  if (notif.targetUserId) {
    sendToUser(notif.targetUserId, { type: "comm:notification", notification: notif });
    if (notif.actorId && notif.actorId !== notif.targetUserId) {
      sendToUser(notif.actorId, { type: "comm:notification", notification: notif });
    }
  } else {
    broadcastAll({ type: "comm:notification", notification: notif });
  }
  return notif;
}

function addChatMessage(input: Partial<CommMessage>): { msg: CommMessage; isDuplicate: boolean } {
  if (input.tempId) {
    const existing = commState.messages.find((m) => m.tempId && m.tempId === input.tempId);
    if (existing) {
      return { msg: existing, isDuplicate: true };
    }
  }

  const channelType: "dm" | "group" = input.channelType === "dm" ? "dm" : "group";
  const msg: CommMessage = {
    id: input.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...(input.tempId ? { tempId: String(input.tempId) } : {}),
    channelType,
    senderId: String(input.senderId || "unknown"),
    senderName: String(input.senderName || "User"),
    senderRole: input.senderRole || undefined,
    senderBranch: input.senderBranch || undefined,
    targetUserId: channelType === "dm" ? String(input.targetUserId || "") : undefined,
    groupId: channelType === "group" ? String(input.groupId || "all-staff") : undefined,
    text: String(input.text || "").trim(),
    kind: input.kind || "text",
    createdAt: input.createdAt || new Date().toISOString()
  };

  if (!msg.text) {
    return { msg, isDuplicate: true };
  }

  commState.messages.push(msg);
  if (commState.messages.length > 1000) {
    commState.messages = commState.messages.slice(-1000);
  }
  schedulePersistCommState();

  if (msg.channelType === "dm" && msg.targetUserId) {
    sendToUser(msg.targetUserId, { type: "comm:message", message: msg });
    if (msg.senderId !== msg.targetUserId) {
      sendToUser(msg.senderId, { type: "comm:message", message: msg });
    }
  } else {
    sendToGroup(msg.groupId || "all-staff", { type: "comm:message", message: msg });
  }

  return { msg, isDuplicate: false };
}

function upsertGroup(input: Partial<CommGroup>): CommGroup {
  const name = String(input.name || "").trim() || "Team Group";
  const groupId = input.id || `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const rawMembers = Array.isArray(input.memberIds) ? input.memberIds.map((x) => String(x).trim()).filter(Boolean) : [];
  if (input.createdById && !rawMembers.includes(String(input.createdById))) {
    rawMembers.push(String(input.createdById));
  }
  const uniqueMembers = Array.from(new Set(rawMembers));

  const group: CommGroup = {
    id: groupId,
    name,
    description: input.description ? String(input.description).trim() : undefined,
    memberIds: uniqueMembers,
    isAllStaff: groupId === "all-staff",
    createdById: input.createdById,
    createdByName: input.createdByName,
    createdAt: input.createdAt || new Date().toISOString()
  };

  const existingIdx = commState.groups.findIndex((g) => g.id === group.id);
  if (existingIdx !== -1) {
    commState.groups[existingIdx] = group;
  } else {
    commState.groups.push(group);
  }
  commState.groups = ensureDefaultGroup(commState.groups);
  schedulePersistCommState();

  broadcastAll({ type: "comm:group_created", group });
  return group;
}

export function attachCommRoutes(app: express.Express) {
  app.get("/api/comm/state", (_req, res) => {
    res.json({
      success: true,
      notifications: commState.notifications,
      groups: ensureDefaultGroup(commState.groups),
      messages: commState.messages,
      onlineUsers: getOnlineUsersSnapshot()
    });
  });

  app.post("/api/comm/notifications", (req, res) => {
    try {
      const body = req.body || {};
      const notif = addNotification(body);
      res.json({ success: true, notification: notif });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to create notification" });
    }
  });

  app.post("/api/comm/notifications/read", (req, res) => {
    try {
      const { userId, notificationId, all } = req.body || {};
      const uid = String(userId || "").trim();
      if (!uid) return res.json({ success: true });

      commState.notifications = commState.notifications.map((n) => {
        if (all || n.id === notificationId) {
          const readBy = Array.isArray(n.readBy) ? n.readBy : [];
          if (!readBy.includes(uid)) {
            return { ...n, readBy: [...readBy, uid] };
          }
        }
        return n;
      });
      schedulePersistCommState();
      broadcastAll({ type: "comm:notifications_read", userId: uid, notificationId: notificationId || null, all: Boolean(all) });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to update read status" });
    }
  });

  app.post("/api/comm/groups", (req, res) => {
    try {
      const group = upsertGroup(req.body || {});
      res.json({ success: true, group });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to save group" });
    }
  });

  app.post("/api/comm/messages", (req, res) => {
    try {
      const { msg } = addChatMessage(req.body || {});
      res.json({ success: true, message: msg });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Failed to send message" });
    }
  });
}

export function attachCommWebSocket(server: http.Server) {
  if (wss) {
    try {
      wss.close();
    } catch {}
    wss = null;
  }

  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = req.url || "";
    if (!reqUrl.startsWith("/ws/comm")) {
      socket.destroy();
      return;
    }

    wss?.handleUpgrade(req, socket, head, (ws) => {
      wss?.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (rawData) => {
      let data: any;
      try {
        data = JSON.parse(rawData.toString());
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;

      const msgType = String(data.type || "");

      if (msgType === "auth") {
        const userId = String(data.userId || data.username || `guest-${Date.now()}`).trim();
        const username = String(data.username || userId).trim();
        const name = String(data.name || username).trim();
        const role = String(data.role || "user").trim();
        const branchName = String(data.branchName || "").trim();
        const designation = data.designation ? String(data.designation).trim() : undefined;

        connectedClients.set(ws, {
          ws,
          userId,
          username,
          name,
          role,
          branchName,
          designation,
          connectedAt: Date.now()
        });

        sendJson(ws, {
          type: "comm:init",
          notifications: commState.notifications,
          groups: ensureDefaultGroup(commState.groups),
          messages: commState.messages,
          onlineUsers: getOnlineUsersSnapshot()
        });

        broadcastAll({
          type: "comm:presence",
          onlineUsers: getOnlineUsersSnapshot()
        });
        return;
      }

      const senderMeta = connectedClients.get(ws);

      if (msgType === "chat_send") {
        addChatMessage({
          tempId: data.tempId,
          channelType: data.channelType,
          senderId: senderMeta?.userId || data.senderId,
          senderName: senderMeta?.name || data.senderName,
          senderRole: senderMeta?.role || data.senderRole,
          senderBranch: senderMeta?.branchName || data.senderBranch,
          targetUserId: data.targetUserId,
          groupId: data.groupId,
          text: data.text,
          kind: data.kind || "text"
        });
        return;
      }

      if (msgType === "group_create") {
        upsertGroup({
          id: data.id,
          name: data.name,
          description: data.description,
          memberIds: data.memberIds,
          createdById: senderMeta?.userId || data.createdById,
          createdByName: senderMeta?.name || data.createdByName
        });
        return;
      }

      if (msgType === "notify_broadcast") {
        addNotification({
          title: data.title,
          message: data.message,
          type: data.notifType || "system",
          branchName: data.branchName || senderMeta?.branchName,
          actorId: senderMeta?.userId || data.actorId,
          actorName: senderMeta?.name || data.actorName,
          targetUserId: data.targetUserId
        });
        return;
      }

      if (msgType === "notifications_read") {
        const uid = String(data.userId || senderMeta?.userId || "").trim();
        if (!uid) return;
        commState.notifications = commState.notifications.map((n) => {
          if (data.all || n.id === data.notificationId) {
            const readBy = Array.isArray(n.readBy) ? n.readBy : [];
            if (!readBy.includes(uid)) {
              return { ...n, readBy: [...readBy, uid] };
            }
          }
          return n;
        });
        schedulePersistCommState();
        broadcastAll({
          type: "comm:notifications_read",
          userId: uid,
          notificationId: data.notificationId || null,
          all: Boolean(data.all)
        });
        return;
      }

      // WebRTC Call & Screen Share Signaling Relay
      if (msgType === "call_invite") {
        const fromUserId = senderMeta?.userId || data.fromUserId;
        const fromUserName = senderMeta?.name || data.fromUserName || "User";
        const fromBranch = senderMeta?.branchName || data.fromBranch || "";
        const relayPayload = {
          type: "comm:call_invite",
          callId: data.callId,
          mode: data.mode || "video",
          callType: data.callType || "dm",
          fromUserId,
          fromUserName,
          fromBranch,
          targetUserId: data.targetUserId,
          groupId: data.groupId,
          groupName: data.groupName
        };
        if (data.callType === "group" && data.groupId) {
          sendToGroup(data.groupId, relayPayload, fromUserId);
        } else if (data.targetUserId) {
          sendToUser(data.targetUserId, relayPayload);
        }
        return;
      }

      if (msgType === "call_accept" || msgType === "call_reject" || msgType === "call_end") {
        const fromUserId = senderMeta?.userId || data.fromUserId;
        const fromUserName = senderMeta?.name || data.fromUserName || "User";
        const relayPayload = {
          type: `comm:${msgType}`,
          callId: data.callId,
          mode: data.mode || "video",
          callType: data.callType || "dm",
          fromUserId,
          fromUserName,
          targetUserId: data.targetUserId,
          groupId: data.groupId,
          reason: data.reason
        };
        if (data.targetUserId) {
          sendToUser(data.targetUserId, relayPayload);
        } else if (data.callType === "group" && data.groupId) {
          sendToGroup(data.groupId, relayPayload, fromUserId);
        }
        return;
      }

      if (
        msgType === "webrtc_offer" ||
        msgType === "webrtc_answer" ||
        msgType === "webrtc_ice" ||
        msgType === "call_screen_state"
      ) {
        const fromUserId = senderMeta?.userId || data.fromUserId;
        const fromUserName = senderMeta?.name || data.fromUserName || "User";
        if (data.targetUserId) {
          sendToUser(data.targetUserId, {
            type: `comm:${msgType}`,
            callId: data.callId,
            fromUserId,
            fromUserName,
            targetUserId: data.targetUserId,
            sdp: data.sdp,
            candidate: data.candidate,
            isScreenSharing: data.isScreenSharing,
            hasVideo: data.hasVideo
          });
        }
        return;
      }
    });

    ws.on("close", () => {
      if (connectedClients.has(ws)) {
        connectedClients.delete(ws);
        broadcastAll({
          type: "comm:presence",
          onlineUsers: getOnlineUsersSnapshot()
        });
      }
    });

    ws.on("error", () => {
      if (connectedClients.has(ws)) {
        connectedClients.delete(ws);
        broadcastAll({
          type: "comm:presence",
          onlineUsers: getOnlineUsersSnapshot()
        });
      }
    });
  });

  console.log("[CommServer] Real-time WebSocket signaling server attached on /ws/comm");
}
