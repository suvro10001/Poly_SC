import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Bell,
  X,
  MessageSquare,
  Users,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  MonitorUp,
  Send,
  Volume2,
  VolumeX,
  CheckCheck,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  ShieldCheck,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { AuthUser, BranchLocation, Salesperson } from '../types';
import { getAllAdmins } from '../utils/branchAccess';
import { playTongSound, isSoundMuted, setSoundMuted, unlockAudio } from '../utils/soundNotifier';

export interface CommNotification {
  id: string;
  title: string;
  message: string;
  type: 'bill' | 'challan' | 'collection' | 'expense' | 'requisition' | 'price' | 'chat' | 'call' | 'system';
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
  channelType: 'dm' | 'group';
  senderId: string;
  senderName: string;
  senderRole?: string;
  senderBranch?: string;
  targetUserId?: string;
  groupId?: string;
  text: string;
  kind?: 'text' | 'call_log' | 'system';
  createdAt: string;
}

export interface OnlineCommUser {
  userId: string;
  username: string;
  name: string;
  role: string;
  branchName: string;
  designation?: string;
  connectedAt?: number;
}

export interface DirectoryUserItem {
  userId: string;
  username: string;
  name: string;
  role: string;
  designation?: string;
  branchName: string;
  isOnline: boolean;
}

export interface EmitErpNotificationInput {
  title: string;
  message: string;
  type?: CommNotification['type'];
  branchName?: string;
  actorId?: string;
  actorName?: string;
  targetUserId?: string;
}

export async function emitErpNotification(input: EmitErpNotificationInput): Promise<void> {
  try {
    await fetch('/api/comm/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
  } catch {
    // Ignore network failures silently; WS broadcast handles live peers when connected
  }
}

interface IncomingCallState {
  callId: string;
  mode: 'video' | 'audio' | 'screen';
  callType: 'dm' | 'group';
  fromUserId: string;
  fromUserName: string;
  fromBranch?: string;
  groupId?: string;
  groupName?: string;
}

interface ActiveCallState {
  callId: string;
  mode: 'video' | 'audio' | 'screen';
  callType: 'dm' | 'group';
  peerName: string;
  targetUserId?: string;
  groupId?: string;
  groupName?: string;
  status: 'calling' | 'connected';
  startedAt: number;
}

interface NotificationChatHubProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
  salespersons: Salesperson[];
  branches: BranchLocation[];
  onUnreadCountChange?: (count: number) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function getCurrentUserId(user: AuthUser): string {
  return String(user.id || user.username || user.name || 'user').trim();
}

function getNotifBadgeClass(type: CommNotification['type']): string {
  switch (type) {
    case 'bill':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
    case 'challan':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40';
    case 'collection':
      return 'bg-teal-500/20 text-teal-300 border-teal-400/40';
    case 'expense':
      return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
    case 'requisition':
      return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
    case 'price':
      return 'bg-rose-500/20 text-rose-300 border-rose-400/40';
    case 'call':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40';
    default:
      return 'bg-slate-500/20 text-slate-300 border-slate-400/40';
  }
}

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const VideoStreamTile: React.FC<{
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  subLabel?: string;
  isScreen?: boolean;
  isLocal?: boolean;
}> = ({ stream, muted = false, label, subLabel, isScreen, isLocal }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  const hasVideoTrack = Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));

  return (
    <div className="relative bg-[#041019] border border-cyan-500/30 rounded-2xl overflow-hidden aspect-video flex items-center justify-center shadow-lg">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted || isLocal}
        className={`w-full h-full ${isScreen ? 'object-contain bg-black' : 'object-cover'} ${
          hasVideoTrack ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
        }`}
      />
      {!hasVideoTrack && (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/30 to-teal-500/30 border border-cyan-400/40 flex items-center justify-center text-xl font-black text-cyan-200">
            {label.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-xs font-bold text-white">{label}</div>
          <div className="text-[10px] text-cyan-300/75">Audio Connected</div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
        <span className="px-2.5 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-bold text-white border border-white/15 truncate">
          {label} {isLocal ? '(You)' : ''}
        </span>
        {(subLabel || isScreen) && (
          <span className="px-2 py-0.5 rounded-lg bg-cyan-500/80 text-[#041019] text-[10px] font-black uppercase">
            {isScreen ? 'Screen Sharing' : subLabel}
          </span>
        )}
      </div>
    </div>
  );
};

export const NotificationChatHub: React.FC<NotificationChatHubProps> = ({
  isOpen,
  onClose,
  currentUser,
  salespersons,
  branches,
  onUnreadCountChange
}) => {
  const myUserId = useMemo(() => getCurrentUserId(currentUser), [currentUser]);
  const myName = useMemo(() => String(currentUser.name || currentUser.username || 'User').trim(), [currentUser]);

  const [activeTab, setActiveTab] = useState<'notifications' | 'users' | 'groups'>('notifications');
  const [notifications, setNotifications] = useState<CommNotification[]>([]);
  const [groups, setGroups] = useState<CommGroup[]>([]);
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineCommUser[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const [mutedSound, setMutedSound] = useState<boolean>(() => isSoundMuted());
  const [floatingAlert, setFloatingAlert] = useState<CommNotification | null>(null);

  // Chat Selection State
  const [userSearch, setUserSearch] = useState('');
  const [selectedDmUserId, setSelectedDmUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all-staff');
  const [chatInput, setChatInput] = useState('');
  const [unreadChannels, setUnreadChannels] = useState<Record<string, number>>({});

  // Create Group UI
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);

  // WebRTC & Call State
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [isCallExpanded, setIsCallExpanded] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream; name: string; isScreen?: boolean }>>({});
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  // Mutable Refs for Async WS / WebRTC Handlers
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerNamesRef = useRef<Map<string, string>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  const incomingCallRef = useRef<IncomingCallState | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);
  const activeTabRef = useRef(activeTab);
  const selectedDmRef = useRef(selectedDmUserId);
  const selectedGroupRef = useRef(selectedGroupId);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const knownMsgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  useEffect(() => {
    selectedDmRef.current = selectedDmUserId;
  }, [selectedDmUserId]);
  useEffect(() => {
    selectedGroupRef.current = selectedGroupId;
  }, [selectedGroupId]);

  // Clear unread channel count when viewing that thread
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'users' && selectedDmUserId) {
      const key = `dm:${selectedDmUserId.toLowerCase()}`;
      setUnreadChannels((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else if (activeTab === 'groups' && selectedGroupId) {
      const key = `group:${selectedGroupId}`;
      setUnreadChannels((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [isOpen, activeTab, selectedDmUserId, selectedGroupId]);

  // Scroll chat to bottom smoothly
  useEffect(() => {
    if (isOpen && (activeTab === 'users' || activeTab === 'groups')) {
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  }, [isOpen, activeTab, selectedDmUserId, selectedGroupId, messages.length]);

  // Sync unread counter up to parent dashboard buttons
  const unreadNotifCount = useMemo(() => {
    const myLow = myUserId.toLowerCase();
    const myUnameLow = String(currentUser.username || '').toLowerCase();
    return notifications.filter((n) => {
      if (n.targetUserId) {
        const tLow = n.targetUserId.toLowerCase();
        if (tLow !== myLow && tLow !== myUnameLow) return false;
      }
      const readSet = new Set((n.readBy || []).map((r) => String(r).toLowerCase()));
      return !readSet.has(myLow) && !readSet.has(myUnameLow);
    }).length;
  }, [notifications, myUserId, currentUser.username]);

  const unreadChatCount = useMemo(
    () => Object.values(unreadChannels).reduce((sum: number, c: number) => sum + Number(c || 0), 0),
    [unreadChannels]
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadNotifCount + unreadChatCount);
  }, [unreadNotifCount, unreadChatCount, onUnreadCountChange]);

  // Build Complete User Directory (Admins + Salespersons + Live Online Users)
  const directoryUsers = useMemo<DirectoryUserItem[]>(() => {
    const map = new Map<string, DirectoryUserItem>();
    const onlineLookup = new Map<string, OnlineCommUser>();

    for (const ou of onlineUsers) {
      if (ou.userId) onlineLookup.set(ou.userId.toLowerCase().trim(), ou);
      if (ou.username) onlineLookup.set(ou.username.toLowerCase().trim(), ou);
      if (ou.name) onlineLookup.set(ou.name.toLowerCase().trim(), ou);
    }

    const isUserOnline = (id?: string, username?: string, name?: string) => {
      return Boolean(
        (id && onlineLookup.has(id.toLowerCase().trim())) ||
          (username && onlineLookup.has(username.toLowerCase().trim())) ||
          (name && onlineLookup.has(name.toLowerCase().trim()))
      );
    };

    const addEntry = (entry: Omit<DirectoryUserItem, 'isOnline'>) => {
      const uid = String(entry.userId || entry.username || entry.name).trim();
      if (!uid) return;
      const key = uid.toLowerCase();
      // Skip self from selectable DM list? Wait: user asked "see all user", let's keep all others clearly and mark (You) if self or exclude self from DM target. Let's include everyone except duplicate entries and tag self cleanly or keep others clickable!
      const prev = map.get(key);
      const online = isUserOnline(uid, entry.username, entry.name);
      if (!prev) {
        map.set(key, { ...entry, userId: uid, isOnline: online });
      } else if (online && !prev.isOnline) {
        map.set(key, { ...prev, isOnline: true });
      }
    };

    // 1. Add Super Admin & Admins
    try {
      const admins = getAllAdmins(salespersons, branches);
      for (const adm of admins) {
        const isSuper =
          adm.adminUsername?.toLowerCase() === 'suvroadmin' ||
          adm.adminId?.toLowerCase().includes('suvro');
        addEntry({
          userId: adm.adminId || adm.adminUsername,
          username: adm.adminUsername || adm.adminId,
          name: adm.adminName || adm.adminUsername || 'Admin',
          role: isSuper ? 'Super Admin' : 'Admin',
          branchName: (adm.branches || []).map((b) => b.name).filter(Boolean).join(', ') || adm.adminZone || 'Head Office'
        });
      }
    } catch {}

    // 2. Add All Salespersons / Staff Users
    for (const sp of salespersons || []) {
      if (!sp || !sp.name) continue;
      if (sp.isBlocked) continue;
      const branchObj = branches.find((b) => b.id === sp.branchId);
      addEntry({
        userId: sp.id || sp.username || sp.code || sp.name,
        username: sp.username || sp.code || sp.id || sp.name,
        name: sp.name,
        role: sp.role || (sp.isInCharge ? 'In-Charge' : 'Staff'),
        designation: sp.designation,
        branchName: sp.branchName || branchObj?.name || ''
      });
    }

    // 3. Add any live connected user not in local list
    for (const ou of onlineUsers) {
      addEntry({
        userId: ou.userId || ou.username,
        username: ou.username || ou.userId,
        name: ou.name || ou.username,
        role: ou.role || 'User',
        designation: ou.designation,
        branchName: ou.branchName || ''
      });
    }

    const myLow = myUserId.toLowerCase();
    const myUnameLow = String(currentUser.username || '').toLowerCase();

    return Array.from(map.values())
      .filter((u) => u.userId.toLowerCase() !== myLow && u.username.toLowerCase() !== myUnameLow)
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [salespersons, branches, onlineUsers, myUserId, currentUser.username]);

  const filteredDirectoryUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return directoryUsers;
    return directoryUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.branchName || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q)
    );
  }, [directoryUsers, userSearch]);

  const selectedDmUser = useMemo(
    () => directoryUsers.find((u) => u.userId === selectedDmUserId || u.username === selectedDmUserId) || null,
    [directoryUsers, selectedDmUserId]
  );

  // Visible groups for current user
  const visibleGroups = useMemo(() => {
    const myLow = myUserId.toLowerCase();
    const myUnameLow = String(currentUser.username || '').toLowerCase();
    return groups.filter((g) => {
      if (g.isAllStaff || g.id === 'all-staff') return true;
      const membersLow = (g.memberIds || []).map((m) => String(m).toLowerCase());
      return membersLow.includes(myLow) || membersLow.includes(myUnameLow) || g.createdById?.toLowerCase() === myLow;
    });
  }, [groups, myUserId, currentUser.username]);

  const selectedGroup = useMemo(
    () => visibleGroups.find((g) => g.id === selectedGroupId) || visibleGroups[0] || null,
    [visibleGroups, selectedGroupId]
  );

  // Messages for currently selected DM or Group
  const activeThreadMessages = useMemo(() => {
    if (activeTab === 'users' && selectedDmUser) {
      const targetIds = new Set(
        [selectedDmUser.userId, selectedDmUser.username].filter(Boolean).map((x) => x.toLowerCase())
      );
      const myIds = new Set([myUserId, currentUser.username].filter(Boolean).map((x) => x.toLowerCase()));
      return messages.filter((m) => {
        if (m.channelType !== 'dm') return false;
        const sLow = String(m.senderId || '').toLowerCase();
        const tLow = String(m.targetUserId || '').toLowerCase();
        return (myIds.has(sLow) && targetIds.has(tLow)) || (targetIds.has(sLow) && myIds.has(tLow));
      });
    }
    if (activeTab === 'groups' && selectedGroup) {
      return messages.filter((m) => m.channelType === 'group' && (m.groupId || 'all-staff') === selectedGroup.id);
    }
    return [];
  }, [activeTab, selectedDmUser, selectedGroup, messages, myUserId, currentUser.username]);

  // Send JSON helper over WS
  const sendWs = useCallback((payload: Record<string, any>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  // Cleanup WebRTC & Media Resources
  const cleanupCallResources = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peerConnectionsRef.current.clear();
    pendingIceRef.current.clear();
    peerNamesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      cameraStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams({});
    setActiveCall(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
    setCallElapsedSec(0);
    setCallNotice(null);
    setIsCallExpanded(false);
  }, []);

  // Call timer
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'connected') return;
    const timer = setInterval(() => {
      setCallElapsedSec(Math.floor((Date.now() - activeCall.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  // Incoming call periodic "tong" ringtone
  useEffect(() => {
    if (!incomingCall) return;
    playTongSound('call');
    const ring = setInterval(() => {
      playTongSound('call');
    }, 2400);
    return () => clearInterval(ring);
  }, [incomingCall]);

  // Build / Retrieve RTCPeerConnection for a Peer
  const getOrCreatePeerConnection = useCallback(
    (peerUserId: string, peerName: string): RTCPeerConnection => {
      const existing = peerConnectionsRef.current.get(peerUserId);
      if (existing && existing.signalingState !== 'closed') {
        if (peerName) peerNamesRef.current.set(peerUserId, peerName);
        return existing;
      }

      peerNamesRef.current.set(peerUserId, peerName || peerUserId);
      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (localStreamRef.current) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWs({
            type: 'webrtc_ice',
            callId: activeCallRef.current?.callId,
            targetUserId: peerUserId,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((prev) => ({
          ...prev,
          [peerUserId]: {
            stream: remoteStream,
            name: peerNamesRef.current.get(peerUserId) || peerName || 'Participant',
            isScreen: prev[peerUserId]?.isScreen || false
          }
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : prev));
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
            const copy = { ...prev };
            delete copy[peerUserId];
            return copy;
          });
        }
      };

      peerConnectionsRef.current.set(peerUserId, pc);
      return pc;
    },
    [sendWs]
  );

  // Acquire local media (audio / video / screen share)
  const acquireCallMedia = useCallback(async (mode: 'video' | 'audio' | 'screen'): Promise<MediaStream> => {
    if (mode === 'screen') {
      let dispStream: MediaStream;
      try {
        dispStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch {
        setCallNotice('Screen sharing was cancelled. Switching to Audio call.');
        mode = 'audio';
        dispStream = new MediaStream();
      }
      if (mode === 'screen') {
        screenStreamRef.current = dispStream;
        setIsScreenSharing(true);
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          micStream.getAudioTracks().forEach((t) => dispStream.addTrack(t));
        } catch {
          setCallNotice('Microphone unavailable — sharing screen only.');
        }
        const screenVideoTrack = dispStream.getVideoTracks()[0];
        if (screenVideoTrack) {
          screenVideoTrack.onended = () => {
            stopScreenShareInternal();
          };
        }
        localStreamRef.current = dispStream;
        setLocalStream(dispStream);
        return dispStream;
      }
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video'
      });
      cameraStreamRef.current = media;
      localStreamRef.current = media;
      setLocalStream(media);
      setIsCameraOff(mode !== 'video');
      return media;
    } catch {
      if (mode === 'video') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          cameraStreamRef.current = audioOnly;
          localStreamRef.current = audioOnly;
          setLocalStream(audioOnly);
          setIsCameraOff(true);
          setCallNotice('Camera unavailable — joined with Audio only.');
          return audioOnly;
        } catch {}
      }
      const empty = new MediaStream();
      localStreamRef.current = empty;
      setLocalStream(empty);
      setIsMicMuted(true);
      setIsCameraOff(true);
      setCallNotice('Mic & Camera unavailable — listen-only / screen share ready.');
      return empty;
    }
  }, []);

  const stopScreenShareInternal = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getVideoTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    let camTrack: MediaStreamTrack | null = cameraStreamRef.current?.getVideoTracks()?.[0] || null;
    if (!camTrack && !isCameraOff) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        camTrack = cam.getVideoTracks()[0] || null;
        if (camTrack && localStreamRef.current) {
          localStreamRef.current.addTrack(camTrack);
        }
      } catch {}
    }

    peerConnectionsRef.current.forEach(async (pc, peerId) => {
      const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        try {
          await videoSender.replaceTrack(camTrack || null);
        } catch {}
      }
      sendWs({
        type: 'call_screen_state',
        callId: activeCallRef.current?.callId,
        targetUserId: peerId,
        isScreenSharing: false
      });
    });
  }, [isCameraOff, sendWs]);

  // Toggle Screen Share mid-call
  const handleToggleScreenShare = useCallback(async () => {
    if (!activeCallRef.current) return;

    if (isScreenSharing) {
      await stopScreenShareInternal();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenStreamRef.current = displayStream;
      setIsScreenSharing(true);

      const newPreview = new MediaStream([
        screenTrack,
        ...(localStreamRef.current ? localStreamRef.current.getAudioTracks() : [])
      ]);
      localStreamRef.current = newPreview;
      setLocalStream(newPreview);

      screenTrack.onended = () => {
        stopScreenShareInternal();
      };

      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, newPreview);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWs({
              type: 'webrtc_offer',
              callId: activeCallRef.current?.callId,
              targetUserId: peerId,
              sdp: offer
            });
          } catch {}
        }
        sendWs({
          type: 'call_screen_state',
          callId: activeCallRef.current?.callId,
          targetUserId: peerId,
          isScreenSharing: true
        });
      }
    } catch {
      setCallNotice('Screen share permission cancelled.');
    }
  }, [isScreenSharing, stopScreenShareInternal, sendWs]);

  // Start Outgoing Call (Single or Group; Video, Audio, or Screen Share)
  const startOutgoingCall = useCallback(
    async (opts: {
      mode: 'video' | 'audio' | 'screen';
      callType: 'dm' | 'group';
      peerName: string;
      targetUserId?: string;
      groupId?: string;
      groupName?: string;
    }) => {
      unlockAudio();
      if (activeCallRef.current) {
        cleanupCallResources();
      }
      const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setActiveCall({
        callId,
        mode: opts.mode,
        callType: opts.callType,
        peerName: opts.peerName,
        targetUserId: opts.targetUserId,
        groupId: opts.groupId,
        groupName: opts.groupName,
        status: 'calling',
        startedAt: Date.now()
      });

      await acquireCallMedia(opts.mode);

      sendWs({
        type: 'call_invite',
        callId,
        mode: opts.mode,
        callType: opts.callType,
        fromUserId: myUserId,
        fromUserName: myName,
        fromBranch: currentUser.branchName || '',
        targetUserId: opts.targetUserId,
        groupId: opts.groupId,
        groupName: opts.groupName
      });
    },
    [acquireCallMedia, cleanupCallResources, currentUser.branchName, myName, myUserId, sendWs]
  );

  // Accept Incoming Call
  const handleAcceptIncomingCall = useCallback(
    async (overrideMode?: 'video' | 'audio') => {
      const inc = incomingCallRef.current;
      if (!inc) return;
      unlockAudio();
      setIncomingCall(null);

      const finalMode = overrideMode || inc.mode;
      setActiveCall({
        callId: inc.callId,
        mode: finalMode,
        callType: inc.callType,
        peerName: inc.callType === 'group' ? inc.groupName || 'Group Call' : inc.fromUserName,
        targetUserId: inc.callType === 'dm' ? inc.fromUserId : undefined,
        groupId: inc.groupId,
        groupName: inc.groupName,
        status: 'connected',
        startedAt: Date.now()
      });

      await acquireCallMedia(finalMode);

      sendWs({
        type: 'call_accept',
        callId: inc.callId,
        mode: finalMode,
        callType: inc.callType,
        fromUserId: myUserId,
        fromUserName: myName,
        targetUserId: inc.callType === 'dm' ? inc.fromUserId : undefined,
        groupId: inc.groupId
      });
    },
    [acquireCallMedia, myName, myUserId, sendWs]
  );

  const handleDeclineIncomingCall = useCallback(() => {
    const inc = incomingCallRef.current;
    if (!inc) return;
    setIncomingCall(null);
    sendWs({
      type: 'call_reject',
      callId: inc.callId,
      callType: inc.callType,
      fromUserId: myUserId,
      fromUserName: myName,
      targetUserId: inc.fromUserId,
      groupId: inc.groupId,
      reason: 'Declined'
    });
  }, [myName, myUserId, sendWs]);

  const handleHangUp = useCallback(() => {
    const active = activeCallRef.current;
    if (active) {
      sendWs({
        type: 'call_end',
        callId: active.callId,
        callType: active.callType,
        fromUserId: myUserId,
        fromUserName: myName,
        targetUserId: active.targetUserId,
        groupId: active.groupId
      });
    }
    cleanupCallResources();
  }, [cleanupCallResources, myName, myUserId, sendWs]);

  // Toggle Mic / Camera during active call
  const handleToggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMicMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const handleToggleCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const nextOff = !isCameraOff;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length > 0) {
      videoTracks.forEach((t) => {
        t.enabled = !nextOff;
      });
      setIsCameraOff(nextOff);
    } else if (!nextOff) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const track = cam.getVideoTracks()[0];
        if (track) {
          cameraStreamRef.current = cam;
          const combined = new MediaStream([
            track,
            ...localStreamRef.current.getAudioTracks()
          ]);
          localStreamRef.current = combined;
          setLocalStream(combined);
          setIsCameraOff(false);
          for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              await sender.replaceTrack(track);
            } else {
              pc.addTrack(track, combined);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendWs({
                type: 'webrtc_offer',
                callId: activeCallRef.current?.callId,
                targetUserId: peerId,
                sdp: offer
              });
            }
          }
        }
      } catch {
        setCallNotice('Unable to access camera.');
      }
    }
  }, [isCameraOff, sendWs]);

  // Fetch Initial HTTP State & Maintain Real-Time WebSocket Connection
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    fetch('/api/comm/state')
      .then((r) => r.json())
      .then((data) => {
        if (disposed || !data?.success) return;
        if (Array.isArray(data.notifications)) {
          data.notifications.forEach((n: CommNotification) => knownNotifIdsRef.current.add(n.id));
          setNotifications(data.notifications);
        }
        if (Array.isArray(data.groups)) setGroups(data.groups);
        if (Array.isArray(data.messages)) {
          data.messages.forEach((m: CommMessage) => knownMsgIdsRef.current.add(m.id));
          setMessages(data.messages);
        }
        if (Array.isArray(data.onlineUsers)) setOnlineUsers(data.onlineUsers);
      })
      .catch(() => {});

    const connectWs = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/comm`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        reconnectTimer = setTimeout(connectWs, 3000);
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'auth',
            userId: myUserId,
            username: currentUser.username,
            name: myName,
            role: currentUser.role,
            branchName: currentUser.branchName || '',
            designation: currentUser.designation || ''
          })
        );
      };

      ws.onmessage = async (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
          case 'comm:init': {
            if (Array.isArray(data.notifications)) {
              data.notifications.forEach((n: CommNotification) => knownNotifIdsRef.current.add(n.id));
              setNotifications(data.notifications);
            }
            if (Array.isArray(data.groups)) setGroups(data.groups);
            if (Array.isArray(data.messages)) {
              data.messages.forEach((m: CommMessage) => knownMsgIdsRef.current.add(m.id));
              setMessages(data.messages);
            }
            if (Array.isArray(data.onlineUsers)) setOnlineUsers(data.onlineUsers);
            break;
          }

          case 'comm:presence': {
            if (Array.isArray(data.onlineUsers)) {
              setOnlineUsers(data.onlineUsers);
            }
            break;
          }

          case 'comm:notification': {
            const notif = data.notification as CommNotification;
            if (!notif?.id) break;
            const isNew = !knownNotifIdsRef.current.has(notif.id);
            knownNotifIdsRef.current.add(notif.id);
            setNotifications((prev) => [notif, ...prev.filter((p) => p.id !== notif.id)].slice(0, 300));

            const isFromSelf =
              notif.actorId &&
              (notif.actorId.toLowerCase() === myUserId.toLowerCase() ||
                notif.actorId.toLowerCase() === String(currentUser.username || '').toLowerCase());

            if (isNew && !isFromSelf) {
              playTongSound('notification');
              setFloatingAlert(notif);
              setTimeout(() => {
                setFloatingAlert((cur) => (cur?.id === notif.id ? null : cur));
              }, 6000);
            }
            break;
          }

          case 'comm:notifications_read': {
            const uid = String(data.userId || '').trim();
            if (!uid) break;
            setNotifications((prev) =>
              prev.map((n) => {
                if (data.all || n.id === data.notificationId) {
                  const rb = Array.isArray(n.readBy) ? n.readBy : [];
                  return rb.includes(uid) ? n : { ...n, readBy: [...rb, uid] };
                }
                return n;
              })
            );
            break;
          }

          case 'comm:group_created': {
            const grp = data.group as CommGroup;
            if (!grp?.id) break;
            setGroups((prev) => {
              const exists = prev.some((g) => g.id === grp.id);
              return exists ? prev.map((g) => (g.id === grp.id ? grp : g)) : [...prev, grp];
            });
            break;
          }

          case 'comm:message': {
            const msg = data.message as CommMessage;
            if (!msg?.id) break;
            const isNew = !knownMsgIdsRef.current.has(msg.id);
            knownMsgIdsRef.current.add(msg.id);

            setMessages((prev) => {
              const filtered = prev.filter(
                (p) => p.id !== msg.id && !(msg.tempId && p.tempId === msg.tempId)
              );
              return [...filtered, msg].slice(-1000);
            });

            const sLow = String(msg.senderId || '').toLowerCase();
            const isSelf =
              sLow === myUserId.toLowerCase() ||
              sLow === String(currentUser.username || '').toLowerCase();

            if (isNew && !isSelf) {
              playTongSound('message');

              // Increment unread channel badge unless user is currently viewing this exact thread
              const channelKey =
                msg.channelType === 'dm'
                  ? `dm:${sLow}`
                  : `group:${msg.groupId || 'all-staff'}`;
              const viewingDm =
                isOpenRef.current &&
                activeTabRef.current === 'users' &&
                selectedDmRef.current?.toLowerCase() === sLow;
              const viewingGroup =
                isOpenRef.current &&
                activeTabRef.current === 'groups' &&
                selectedGroupRef.current === (msg.groupId || 'all-staff');

              if (!viewingDm && !viewingGroup) {
                setUnreadChannels((prev) => ({
                  ...prev,
                  [channelKey]: (prev[channelKey] || 0) + 1
                }));
              }
            }
            break;
          }

          case 'comm:call_invite': {
            const fLow = String(data.fromUserId || '').toLowerCase();
            if (fLow === myUserId.toLowerCase()) break;
            setIncomingCall({
              callId: data.callId,
              mode: data.mode || 'video',
              callType: data.callType || 'dm',
              fromUserId: data.fromUserId,
              fromUserName: data.fromUserName || 'Staff Member',
              fromBranch: data.fromBranch || '',
              groupId: data.groupId,
              groupName: data.groupName
            });
            break;
          }

          case 'comm:call_accept': {
            const peerId = String(data.fromUserId || '');
            const peerName = String(data.fromUserName || 'User');
            if (!peerId || !activeCallRef.current) break;

            setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : prev));
            const pc = getOrCreatePeerConnection(peerId, peerName);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendWs({
                type: 'webrtc_offer',
                callId: activeCallRef.current.callId,
                targetUserId: peerId,
                sdp: offer
              });
            } catch {}
            break;
          }

          case 'comm:call_reject': {
            if (activeCallRef.current?.callType === 'dm') {
              setCallNotice(`${data.fromUserName || 'User'} declined the call.`);
              setTimeout(() => {
                cleanupCallResources();
              }, 1600);
            }
            break;
          }

          case 'comm:call_end': {
            const peerId = String(data.fromUserId || '');
            if (incomingCallRef.current?.callId === data.callId) {
              setIncomingCall(null);
              break;
            }
            if (activeCallRef.current?.callId === data.callId) {
              if (activeCallRef.current.callType === 'dm') {
                cleanupCallResources();
              } else if (peerId) {
                const pc = peerConnectionsRef.current.get(peerId);
                if (pc) {
                  try {
                    pc.close();
                  } catch {}
                  peerConnectionsRef.current.delete(peerId);
                }
                setRemoteStreams((prev) => {
                  const copy = { ...prev };
                  delete copy[peerId];
                  return copy;
                });
              }
            }
            break;
          }

          case 'comm:webrtc_offer': {
            const peerId = String(data.fromUserId || '');
            const peerName = String(data.fromUserName || 'User');
            if (!peerId || !data.sdp) break;
            const pc = getOrCreatePeerConnection(peerId, peerName);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const queued = pendingIceRef.current.get(peerId) || [];
              pendingIceRef.current.delete(peerId);
              for (const c of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendWs({
                type: 'webrtc_answer',
                callId: data.callId,
                targetUserId: peerId,
                sdp: answer
              });
            } catch {}
            break;
          }

          case 'comm:webrtc_answer': {
            const peerId = String(data.fromUserId || '');
            if (!peerId || !data.sdp) break;
            const pc = peerConnectionsRef.current.get(peerId);
            if (!pc) break;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const queued = pendingIceRef.current.get(peerId) || [];
              pendingIceRef.current.delete(peerId);
              for (const c of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
            } catch {}
            break;
          }

          case 'comm:webrtc_ice': {
            const peerId = String(data.fromUserId || '');
            if (!peerId || !data.candidate) break;
            const pc = peerConnectionsRef.current.get(peerId);
            if (!pc || !pc.remoteDescription) {
              const arr = pendingIceRef.current.get(peerId) || [];
              arr.push(data.candidate);
              pendingIceRef.current.set(peerId, arr);
            } else {
              pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
            }
            break;
          }

          case 'comm:call_screen_state': {
            const peerId = String(data.fromUserId || '');
            if (!peerId) break;
            setRemoteStreams((prev) => {
              if (!prev[peerId]) return prev;
              return {
                ...prev,
                [peerId]: {
                  ...prev[peerId],
                  isScreen: Boolean(data.isScreenSharing)
                }
              };
            });
            break;
          }
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          const delay = Math.min(8000, 1000 * Math.pow(1.5, attempt++));
          reconnectTimer = setTimeout(connectWs, delay);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {}
      cleanupCallResources();
    };
  }, [myUserId, currentUser.username, myName, currentUser.role, currentUser.branchName, currentUser.designation, cleanupCallResources, getOrCreatePeerConnection, sendWs]);

  // Mark notifications read
  const markNotificationsRead = useCallback(
    (notificationId?: string) => {
      const uid = myUserId;
      setNotifications((prev) =>
        prev.map((n) => {
          if (!notificationId || n.id === notificationId) {
            const rb = Array.isArray(n.readBy) ? n.readBy : [];
            return rb.includes(uid) ? n : { ...n, readBy: [...rb, uid] };
          }
          return n;
        })
      );
      if (!sendWs({ type: 'notifications_read', userId: uid, notificationId, all: !notificationId })) {
        fetch('/api/comm/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, notificationId, all: !notificationId })
        }).catch(() => {});
      }
    },
    [myUserId, sendWs]
  );

  // Send Chat Message (DM or Group)
  const handleSendMessage = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      unlockAudio();
      const text = chatInput.trim();
      if (!text) return;

      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (activeTab === 'users' && selectedDmUser) {
        const optimistic: CommMessage = {
          id: tempId,
          tempId,
          channelType: 'dm',
          senderId: myUserId,
          senderName: myName,
          senderRole: currentUser.role,
          senderBranch: currentUser.branchName,
          targetUserId: selectedDmUser.userId,
          text,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, optimistic]);
        setChatInput('');
        if (
          !sendWs({
            type: 'chat_send',
            tempId,
            channelType: 'dm',
            senderId: myUserId,
            senderName: myName,
            senderRole: currentUser.role,
            senderBranch: currentUser.branchName,
            targetUserId: selectedDmUser.userId,
            text
          })
        ) {
          fetch('/api/comm/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(optimistic)
          }).catch(() => {});
        }
      } else if (activeTab === 'groups' && selectedGroup) {
        const optimistic: CommMessage = {
          id: tempId,
          tempId,
          channelType: 'group',
          senderId: myUserId,
          senderName: myName,
          senderRole: currentUser.role,
          senderBranch: currentUser.branchName,
          groupId: selectedGroup.id,
          text,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, optimistic]);
        setChatInput('');
        if (
          !sendWs({
            type: 'chat_send',
            tempId,
            channelType: 'group',
            senderId: myUserId,
            senderName: myName,
            senderRole: currentUser.role,
            senderBranch: currentUser.branchName,
            groupId: selectedGroup.id,
            text
          })
        ) {
          fetch('/api/comm/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(optimistic)
          }).catch(() => {});
        }
      }
    },
    [activeTab, chatInput, currentUser.branchName, currentUser.role, myName, myUserId, selectedDmUser, selectedGroup, sendWs]
  );

  // Create Group
  const handleCreateGroup = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newGroupName.trim();
      if (!name) return;
      const memberIds = Array.from(new Set([myUserId, ...newGroupMemberIds]));
      const payload = {
        id: `grp-${Date.now()}`,
        name,
        memberIds,
        createdById: myUserId,
        createdByName: myName
      };
      if (!sendWs({ type: 'group_create', ...payload })) {
        fetch('/api/comm/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      }
      setSelectedGroupId(payload.id);
      setNewGroupName('');
      setNewGroupMemberIds([]);
      setIsCreatingGroup(false);
    },
    [myName, myUserId, newGroupMemberIds, newGroupName, sendWs]
  );

  const toggleSoundMute = () => {
    const next = !mutedSound;
    setMutedSound(next);
    setSoundMuted(next);
    if (!next) {
      unlockAudio();
      playTongSound('notification', true);
    }
  };

  const formattedCallTimer = useMemo(() => {
    const mins = Math.floor(callElapsedSec / 60);
    const secs = callElapsedSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [callElapsedSec]);

  return (
    <>
      {/* 1. Floating New Notification Alert Toast (when Hub is Closed) */}
      {floatingAlert && !isOpen && (
        <div
          onClick={() => {
            setFloatingAlert(null);
            window.dispatchEvent(new CustomEvent('polycables_open_comm_hub'));
          }}
          className="fixed top-16 right-4 z-[99990] max-w-sm w-full bg-[#071f2e]/95 backdrop-blur-xl border border-cyan-400/50 rounded-2xl p-3.5 text-white shadow-[0_14px_40px_rgba(0,0,0,0.55)] cursor-pointer hover:border-cyan-300 transition-all no-print"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-cyan-200 truncate">{floatingAlert.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFloatingAlert(null);
                  }}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-200/90 mt-0.5 line-clamp-2">{floatingAlert.message}</p>
              {floatingAlert.branchName && (
                <div className="text-[10px] text-amber-300/90 font-semibold mt-1">{floatingAlert.branchName}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Incoming Call Overlay (Always Visible Worldwide) */}
      {incomingCall && (
        <div className="fixed inset-0 z-[99995] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 no-print">
          <div className="bg-[#061c2a] border-2 border-cyan-400/60 rounded-3xl p-6 max-w-sm w-full text-center text-white shadow-[0_0_60px_rgba(34,211,238,0.35)]">
            <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 mb-3 animate-pulse">
              {incomingCall.mode === 'audio' ? <Phone className="w-7 h-7" /> : <Video className="w-7 h-7" />}
            </div>
            <div className="text-[11px] uppercase tracking-widest font-bold text-cyan-300">
              Incoming {incomingCall.callType === 'group' ? 'Group ' : ''}
              {incomingCall.mode === 'screen' ? 'Screen Share' : incomingCall.mode === 'audio' ? 'Audio' : 'Video'} Call
            </div>
            <h3 className="text-xl font-black text-white mt-1">{incomingCall.fromUserName}</h3>
            {(incomingCall.groupName || incomingCall.fromBranch) && (
              <p className="text-xs text-slate-300 mt-0.5">
                {incomingCall.groupName ? `Group: ${incomingCall.groupName}` : incomingCall.fromBranch}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                type="button"
                onClick={handleDeclineIncomingCall}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Decline</span>
              </button>
              <button
                type="button"
                onClick={() => handleAcceptIncomingCall('audio')}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Phone className="w-4 h-4" />
                <span>Audio</span>
              </button>
              <button
                type="button"
                onClick={() => handleAcceptIncomingCall('video')}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Video className="w-4 h-4" />
                <span>Video</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Active WebRTC Call & Screen Share Modal Overlay */}
      {activeCall && (
        <div
          className={`fixed z-[99994] bg-[#04121c]/95 backdrop-blur-2xl border border-cyan-400/50 shadow-[0_24px_80px_rgba(0,0,0,0.75)] text-white flex flex-col no-print transition-all ${
            isCallExpanded
              ? 'inset-3 rounded-3xl'
              : 'bottom-4 right-4 w-[95vw] sm:w-[640px] max-h-[82vh] rounded-2xl'
          }`}
        >
          {/* Call Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-cyan-500/25 bg-[#071f2f]/80 rounded-t-2xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-black text-white truncate">{activeCall.peerName}</div>
                <div className="text-[10px] text-cyan-300 font-semibold">
                  {activeCall.status === 'calling' ? 'Ringing...' : `Connected • ${formattedCallTimer}`}
                  {isScreenSharing ? ' • Sharing Your Screen' : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsCallExpanded((v) => !v)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
                title={isCallExpanded ? 'Restore size' : 'Expand'}
              >
                {isCallExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {callNotice && (
            <div className="px-4 py-1.5 bg-amber-500/20 border-b border-amber-400/30 text-[11px] text-amber-200 font-semibold">
              {callNotice}
            </div>
          )}

          {/* Video / Screen Share Grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(remoteStreams).map(([peerId, info]) => (
              <VideoStreamTile
                key={peerId}
                stream={info.stream}
                label={info.name}
                isScreen={info.isScreen}
              />
            ))}
            <VideoStreamTile
              stream={localStream}
              label={myName}
              isLocal={true}
              isScreen={isScreenSharing}
              muted={true}
            />
          </div>

          {/* Call Controls */}
          <div className="px-4 py-3 border-t border-cyan-500/25 bg-[#061826] rounded-b-2xl flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                isMicMuted
                  ? 'bg-rose-500/25 text-rose-200 border-rose-400/50'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
              }`}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isMicMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleCamera}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                isCameraOff
                  ? 'bg-slate-700/70 text-slate-300 border-slate-500/50'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
              }`}
            >
              {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              <span>{isCameraOff ? 'Cam Off' : 'Cam On'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleScreenShare}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                isScreenSharing
                  ? 'bg-cyan-500 text-[#04121c] border-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
                  : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-400/40'
              }`}
            >
              <MonitorUp className="w-4 h-4" />
              <span>{isScreenSharing ? 'Stop Screen' : 'Share Screen'}</span>
            </button>

            <button
              type="button"
              onClick={handleHangUp}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Main Notifications, Users, Single/Group Chat & Call Hub Drawer/Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 no-print">
          <div className="bg-[#061826] border border-cyan-500/35 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col text-white shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
            {/* Top Hub Header */}
            <div className="px-4 py-3 bg-[#082032] border-b border-cyan-500/25 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>Notifications & Team Connect</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        wsConnected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span>{onlineUsers.length} Online</span>
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-300/80">
                    Alerts with Tong sound • All users directory • Single & Group Chat • Video Call & Screen Share
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    playTongSound('notification', true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Test Tong notification sound"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tong Sound</span>
                </button>

                <button
                  type="button"
                  onClick={toggleSoundMute}
                  className={`p-1.5 rounded-xl border text-xs font-bold cursor-pointer flex items-center gap-1 ${
                    mutedSound
                      ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                      : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                  }`}
                  title={mutedSound ? 'Unmute Tong sound' : 'Mute Tong sound'}
                >
                  {mutedSound ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/30 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Hub Navigation Tabs */}
            <div className="px-4 py-2 bg-[#071b2a] border-b border-cyan-500/20 flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all whitespace-nowrap ${
                  activeTab === 'notifications'
                    ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/60'
                    : 'bg-[#061520]/80 text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Notifications</span>
                {unreadNotifCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-md bg-rose-500 text-white text-[10px] font-black">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/60'
                    : 'bg-[#061520]/80 text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Users & Direct Chat ({directoryUsers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('groups')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-all whitespace-nowrap ${
                  activeTab === 'groups'
                    ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/60'
                    : 'bg-[#061520]/80 text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Groups & Team Calls ({visibleGroups.length})</span>
              </button>
            </div>

            {/* Hub Body */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* TAB 1: NOTIFICATIONS FEED */}
              {activeTab === 'notifications' && (
                <div className="flex-1 flex flex-col p-4 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <div className="text-xs font-bold text-slate-300">
                      Recent System & Activity Notifications ({notifications.length})
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markNotificationsRead()}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark All Read</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto py-3 space-y-2">
                    {notifications.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 text-xs">
                        No notifications yet. Activity alerts (Bills, Challans, Expenses, Requisitions, Price Updates) will appear here with Tong sound.
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const myLow = myUserId.toLowerCase();
                        const myUnameLow = String(currentUser.username || '').toLowerCase();
                        const isUnread = !new Set((n.readBy || []).map((r) => String(r).toLowerCase())).has(myLow) &&
                          !new Set((n.readBy || []).map((r) => String(r).toLowerCase())).has(myUnameLow);
                        return (
                          <div
                            key={n.id}
                            onClick={() => isUnread && markNotificationsRead(n.id)}
                            className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                              isUnread
                                ? 'bg-cyan-950/50 border-cyan-400/50 shadow-sm'
                                : 'bg-[#081d2c]/60 border-white/10 opacity-80'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${getNotifBadgeClass(
                                    n.type
                                  )}`}
                                >
                                  {n.type}
                                </span>
                                <span className="text-xs font-black text-white">{n.title}</span>
                                {isUnread && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                              </div>
                              <p className="text-xs text-slate-200/90 mt-1">{n.message}</p>
                              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                                {n.actorName && <span>By: {n.actorName}</span>}
                                {n.branchName && <span className="text-amber-300/90">{n.branchName}</span>}
                                <span>{formatTimeShort(n.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: ALL USERS & DIRECT 1-TO-1 CHAT / CALL / SCREEN SHARE */}
              {activeTab === 'users' && (
                <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
                  {/* Left Sidebar: All Users Directory */}
                  <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-cyan-500/20 bg-[#05141f] flex flex-col max-h-56 md:max-h-none">
                    <div className="p-2.5 border-b border-white/10">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search users or sales center..."
                          className="w-full h-[34px] pl-8 pr-3 bg-[#061520]/90 text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl text-xs outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {filteredDirectoryUsers.map((u) => {
                        const isSelected = selectedDmUser?.userId === u.userId;
                        const unread = unreadChannels[`dm:${u.userId.toLowerCase()}`] || unreadChannels[`dm:${u.username.toLowerCase()}`] || 0;
                        return (
                          <button
                            key={u.userId}
                            type="button"
                            onClick={() => setSelectedDmUserId(u.userId)}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-400/60'
                                : 'bg-white/[0.02] hover:bg-white/[0.06] border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-xs font-black text-cyan-200">
                                  {u.name.slice(0, 2).toUpperCase()}
                                </div>
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#05141f] ${
                                    u.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                                  }`}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{u.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {u.designation || u.role} {u.branchName ? `• ${u.branchName}` : ''}
                                </div>
                              </div>
                            </div>
                            {unread > 0 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black shrink-0">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Thread Panel */}
                  <div className="flex-1 flex flex-col min-h-0 bg-[#061826]">
                    {selectedDmUser ? (
                      <>
                        {/* Chat Header with Audio / Video / Screen Share */}
                        <div className="px-4 py-2.5 border-b border-white/10 bg-[#082032]/70 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                selectedDmUser.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-black text-white truncate">{selectedDmUser.name}</div>
                              <div className="text-[10px] text-cyan-300/80 truncate">
                                {selectedDmUser.isOnline ? 'Online' : 'Offline'} • {selectedDmUser.role}
                                {selectedDmUser.branchName ? ` • ${selectedDmUser.branchName}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'audio',
                                  callType: 'dm',
                                  peerName: selectedDmUser.name,
                                  targetUserId: selectedDmUser.userId
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Audio</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'video',
                                  callType: 'dm',
                                  peerName: selectedDmUser.name,
                                  targetUserId: selectedDmUser.userId
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Video Call</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'screen',
                                  callType: 'dm',
                                  peerName: selectedDmUser.name,
                                  targetUserId: selectedDmUser.userId
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <MonitorUp className="w-3.5 h-3.5" />
                              <span>Screen Share</span>
                            </button>
                          </div>
                        </div>

                        {/* Message History */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                          {activeThreadMessages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">
                              Start a direct message, video call, or screen share with {selectedDmUser.name}.
                            </div>
                          ) : (
                            activeThreadMessages.map((m) => {
                              const isMine =
                                String(m.senderId).toLowerCase() === myUserId.toLowerCase() ||
                                String(m.senderId).toLowerCase() === String(currentUser.username || '').toLowerCase();
                              return (
                                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                  <div
                                    className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-xs border ${
                                      isMine
                                        ? 'bg-cyan-600/35 border-cyan-400/40 text-white'
                                        : 'bg-[#082032] border-white/10 text-slate-100'
                                    }`}
                                  >
                                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                    <div className="text-[9px] text-slate-300/70 mt-1 text-right">
                                      {formatTimeShort(m.createdAt)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatBottomRef} />
                        </div>

                        {/* Composer */}
                        <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-[#05141f] flex items-center gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder={`Message ${selectedDmUser.name}...`}
                            className="flex-1 h-[38px] px-3.5 bg-[#082032] text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl text-xs outline-none focus:ring-1 focus:ring-cyan-400"
                          />
                          <button
                            type="submit"
                            className="h-[38px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#04121c] font-black text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send</span>
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                        <ShieldCheck className="w-10 h-10 text-cyan-400/50 mb-2" />
                        <p className="text-sm font-bold text-white">Select any user to message or call</p>
                        <p className="text-xs text-slate-400 mt-1">
                          All company users are listed on the left with live online status.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: GROUPS & GROUP VIDEO CALL / SCREEN SHARE */}
              {activeTab === 'groups' && (
                <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
                  {/* Left Sidebar: Groups List & Group Creator */}
                  <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-cyan-500/20 bg-[#05141f] flex flex-col max-h-60 md:max-h-none">
                    <div className="p-2.5 border-b border-white/10 flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-200">Team Groups</span>
                      <button
                        type="button"
                        onClick={() => setIsCreatingGroup((v) => !v)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Group</span>
                      </button>
                    </div>

                    {isCreatingGroup && (
                      <form onSubmit={handleCreateGroup} className="p-2.5 border-b border-cyan-500/20 bg-[#082032]/70 space-y-2">
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="Group Name (e.g. Dhaka Team)"
                          className="w-full h-[32px] px-2.5 bg-[#061520] text-white border border-cyan-500/30 rounded-lg text-xs outline-none"
                          required
                        />
                        <div className="max-h-32 overflow-y-auto space-y-1 border border-white/10 rounded-lg p-1.5 bg-[#05141f]">
                          {directoryUsers.map((u) => {
                            const checked = newGroupMemberIds.includes(u.userId);
                            return (
                              <label
                                key={u.userId}
                                className="flex items-center gap-2 text-[11px] text-slate-200 px-1 py-0.5 cursor-pointer hover:bg-white/5 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setNewGroupMemberIds((prev) =>
                                      prev.includes(u.userId)
                                        ? prev.filter((id) => id !== u.userId)
                                        : [...prev, u.userId]
                                    )
                                  }
                                />
                                <span className="truncate">{u.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsCreatingGroup(false)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-300 text-[11px] font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-2.5 py-1 rounded-lg bg-emerald-500 text-[#04121c] text-[11px] font-black cursor-pointer flex items-center gap-1"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Create</span>
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {visibleGroups.map((g) => {
                        const isSelected = selectedGroup?.id === g.id;
                        const unread = unreadChannels[`group:${g.id}`] || 0;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setSelectedGroupId(g.id)}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-400/60'
                                : 'bg-white/[0.02] hover:bg-white/[0.06] border-transparent'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">{g.name}</div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {g.isAllStaff ? 'Everyone in Organization' : `${g.memberIds.length} members`}
                              </div>
                            </div>
                            {unread > 0 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black shrink-0">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Group Thread Panel */}
                  <div className="flex-1 flex flex-col min-h-0 bg-[#061826]">
                    {selectedGroup ? (
                      <>
                        <div className="px-4 py-2.5 border-b border-white/10 bg-[#082032]/70 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-white truncate">{selectedGroup.name}</div>
                            <div className="text-[10px] text-cyan-300/80 truncate">
                              {selectedGroup.isAllStaff
                                ? 'Company-wide group channel'
                                : `${selectedGroup.memberIds.length} members`}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'audio',
                                  callType: 'group',
                                  peerName: selectedGroup.name,
                                  groupId: selectedGroup.id,
                                  groupName: selectedGroup.name
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Group Audio</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'video',
                                  callType: 'group',
                                  peerName: selectedGroup.name,
                                  groupId: selectedGroup.id,
                                  groupName: selectedGroup.name
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Group Video</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                startOutgoingCall({
                                  mode: 'screen',
                                  callType: 'group',
                                  peerName: selectedGroup.name,
                                  groupId: selectedGroup.id,
                                  groupName: selectedGroup.name
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <MonitorUp className="w-3.5 h-3.5" />
                              <span>Screen Share</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                          {activeThreadMessages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">
                              No messages in {selectedGroup.name} yet. Send a message or start a Group Video / Screen Share call!
                            </div>
                          ) : (
                            activeThreadMessages.map((m) => {
                              const isMine =
                                String(m.senderId).toLowerCase() === myUserId.toLowerCase() ||
                                String(m.senderId).toLowerCase() === String(currentUser.username || '').toLowerCase();
                              return (
                                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                  <div
                                    className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-xs border ${
                                      isMine
                                        ? 'bg-cyan-600/35 border-cyan-400/40 text-white'
                                        : 'bg-[#082032] border-white/10 text-slate-100'
                                    }`}
                                  >
                                    {!isMine && (
                                      <div className="text-[10px] font-black text-cyan-300 mb-0.5">
                                        {m.senderName} {m.senderBranch ? `• ${m.senderBranch}` : ''}
                                      </div>
                                    )}
                                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                    <div className="text-[9px] text-slate-300/70 mt-1 text-right">
                                      {formatTimeShort(m.createdAt)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatBottomRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-[#05141f] flex items-center gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder={`Message ${selectedGroup.name}...`}
                            className="flex-1 h-[38px] px-3.5 bg-[#082032] text-white placeholder-slate-400 border border-cyan-500/30 rounded-xl text-xs outline-none focus:ring-1 focus:ring-cyan-400"
                          />
                          <button
                            type="submit"
                            className="h-[38px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#04121c] font-black text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send</span>
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
