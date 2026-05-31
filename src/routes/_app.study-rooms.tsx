import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileText,
  Flame,
  Image as ImageIcon,
  PanelRightClose,
  PanelRightOpen,
  Mic,
  Paperclip,
  PhoneCall,
  Play,
  Plus,
  Search,
  Send,
  PhoneOff,
  Square,
  Timer,
  Trophy,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

type RemotePeer = {
  socketId: string;
  name: string;
  stream?: MediaStream;
};

export const Route = createFileRoute("/_app/study-rooms")({
  head: () => ({ meta: [{ title: "Study Rooms - AdaptiveAI" }] }),
  component: StudyRoomsPage,
});

type RoomActivity =
  | "Problem Solving"
  | "Mock Test"
  | "YouTube Watch"
  | "Rapid Fire"
  | "Discussion"
  | "AI Doubt"
  | "Pomodoro"
  | "Notes"
  | "Daily Challenge"
  | "Viva Practice"
  | "Let's Quiz"
  | "Whiteboard";

type StudyRoom = {
  id: string;
  name: string;
  subject: string;
  topic: string;
  activity: RoomActivity;
  mode: "Voice" | "Video" | "Text";
  invite_code: string;
  members: Array<{ user_id?: string; name: string; role?: string; status?: string }>;
  notes?: string;
  activity_state?: {
    pomodoro_minutes?: number;
    timer_running?: boolean;
    youtube_url?: string;
    youtube_time?: number;
    youtube_playing?: boolean;
    youtube_updated_at?: number;
    active_activity?: RoomActivity;
    active_activity_session_id?: string;
    activity_tiles?: RoomActivity[];
    activity_sessions?: RoomActivitySession[];
    youtube_sessions?: Record<string, YoutubeSessionState>;
    whiteboards?: Record<string, WhiteboardState>;
    activity_notice?: {
      id: string;
      user: string;
      activity: RoomActivity;
      title: string;
    };
    daily_challenge?: string;
    problem_prompt?: string;
    discussion_topic?: string;
    ai_doubt_prompt?: string;
    viva_prompt?: string;
    rapid_fire_question?: string;
    rapid_fire_score?: Record<string, number>;
    mock_progress?: Record<string, number> | number;
    lets_quiz?: LetsQuizState | null;
  };
  created_at: string;
};

type RoomActivitySession = {
  id: string;
  activity: RoomActivity;
  title: string;
  started_by: string;
  started_at: number;
};

type YoutubeSessionState = {
  url?: string;
  time?: number;
  playing?: boolean;
  updated_at?: number;
};

type WhiteboardPoint = {
  x: number;
  y: number;
};

type WhiteboardStroke = {
  id: string;
  author: string;
  color: string;
  width: number;
  points: WhiteboardPoint[];
};

type WhiteboardImage = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type WhiteboardState = {
  strokes: WhiteboardStroke[];
  images?: WhiteboardImage[];
  updated_by?: string;
  updated_at?: number;
};

type LetsQuizQuestion = {
  id: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  text: string;
  options: string[];
  correct_index: number;
  time_limit: number;
};

type LetsQuizAnswer = {
  answer_index?: number;
  bookmarked?: boolean;
  time_taken?: number;
};

type LetsQuizState = {
  status: "setup" | "waiting" | "running" | "finished";
  host: string;
  subject: string;
  question_count: number;
  questions: LetsQuizQuestion[];
  joined: string[];
  current_index: number;
  question_started_at: number;
  player_progress?: Record<string, { current_index: number; question_started_at: number; finished?: boolean; finished_at?: number }>;
  answers: Record<string, Record<string, LetsQuizAnswer>>;
  pdf_sent?: Record<string, boolean>;
  leaderboard_posted?: boolean;
};

type ChatMessage = {
  id: string;
  room_id: string;
  author_name: string;
  text: string;
  created_at: string;
  attachments?: ChatAttachment[];
};

type ChatAttachment = {
  name: string;
  type?: string;
  mime_type?: string;
  size: number;
  data_url: string;
};

function StudyRoomsPage() {
  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const lastActivityNoticeRef = useRef("");
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [activity] = useState<RoomActivity>("Problem Solving");
  const [chatText, setChatText] = useState("");
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [suggestedActivitiesOpen, setSuggestedActivitiesOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [activitiesView, setActivitiesView] = useState<"picker" | "activity">("picker");
  const [callSetupMode, setCallSetupMode] = useState<"choose" | null>(null);
  const [callMode, setCallMode] = useState<"voice" | "video" | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [timerMinutes, setTimerMinutes] = useState(25);

  const activeRoom = rooms.find((room) => room.id === activeRoomId) || null;
  const currentUserName = user?.display_name || user?.email?.split("@")[0] || "Learner";
  const roomMessages = useMemo(
    () => messages.filter((message) => message.room_id === activeRoom?.id),
    [activeRoom?.id, messages],
  );
  const showChatOnly = Boolean(activeRoom && !callMode);
  const layoutClass = callMode
    ? chatCollapsed
      ? "lg:grid-cols-[300px_minmax(0,1fr)_56px]"
      : "lg:grid-cols-[300px_minmax(0,1fr)_360px]"
    : "lg:grid-cols-[300px_minmax(0,1fr)]";
  const activityNotice = activeRoom?.activity_state?.activity_notice;

  useEffect(() => {
    void fetchRooms(true);
    const interval = window.setInterval(() => void fetchRooms(false), 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeRoom?.id) return;
    setTimerMinutes(activeRoom.activity_state?.pomodoro_minutes || 25);
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!activeRoom?.id) return;
    void fetchRoomMessages(activeRoom.id);
    const interval = window.setInterval(() => {
      void fetchRoom(activeRoom.id);
      void fetchRoomMessages(activeRoom.id);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeRoom?.id]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    localStreamRef.current = localStream;
  }, [localStream, callMode]);

  useEffect(() => {
    if (!activityNotice?.id || lastActivityNoticeRef.current === activityNotice.id) return;
    lastActivityNoticeRef.current = activityNotice.id;
    const starter = activityNotice.user === currentUserName ? "You" : activityNotice.user;
    toast.message(`${starter} started ${activityNotice.title || activityNotice.activity}`);
  }, [activityNotice?.id, activityNotice?.user, activityNotice?.title, activityNotice?.activity, currentUserName]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionsRef.current.forEach((connection) => connection.close());
      socketRef.current?.disconnect();
    };
  }, []);

  async function fetchRooms(showLoader = false) {
    if (showLoader) setLoadingRooms(true);
    try {
      const nextRooms = await api.studyRooms();
      setRooms(nextRooms);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load study rooms");
    } finally {
      if (showLoader) setLoadingRooms(false);
    }
  }

  async function fetchRoom(roomId: string) {
    try {
      const room = await api.studyRoom(roomId);
      setRooms((items) => items.map((item) => (item.id === room.id ? room : item)));
    } catch {
      // Keep current state if a refresh misses.
    }
  }

  async function fetchRoomMessages(roomId: string) {
    try {
      const nextMessages = await api.studyRoomMessages(roomId);
      setMessages((items) => [
        ...items.filter((item) => item.room_id !== roomId),
        ...nextMessages,
      ]);
    } catch {
      // Keep current chat visible.
    }
  }

  async function createRoom() {
    try {
      const room = await api.createStudyRoom({ name: roomName, subject, topic, activity });
      setRooms((items) => [room, ...items.filter((item) => item.id !== room.id)]);
      setActiveRoomId(room.id);
      setCreateOpen(false);
      toast.success("Study room created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create room");
    }
  }

  async function joinRoom() {
    if (!inviteCode.trim()) return;
    try {
      const room = await api.joinStudyRoom(inviteCode);
      setRooms((items) => [room, ...items.filter((item) => item.id !== room.id)]);
      setActiveRoomId(room.id);
      setInviteCode("");
      setJoinOpen(false);
      toast.success("Joined study room");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join room");
    }
  }

  async function sendMessage() {
    const text = chatText.trim();
    if (!activeRoom || (!text && chatAttachments.length === 0)) return;
    try {
      const message = await api.sendStudyRoomMessage(activeRoom.id, text, chatAttachments);
      setMessages((items) => [...items, message]);
      setChatText("");
      setChatAttachments([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message");
    }
  }

  async function attachChatFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, 3);
    const maxBytes = 6 * 1024 * 1024;
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    const next: ChatAttachment[] = [];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name} is not a supported study file`);
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name} is larger than 6 MB`);
        continue;
      }
      next.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data_url: await readFileAsDataUrl(file),
      });
    }

    if (next.length) setChatAttachments((items) => [...items, ...next].slice(0, 3));
  }

  function openRoom(room: StudyRoom) {
    setActiveRoomId(room.id);
  }

  function copyInvite() {
    if (!activeRoom) return;
    void navigator.clipboard?.writeText(activeRoom.invite_code);
    toast.success(`Invite copied: ${activeRoom.invite_code}`);
  }

  async function saveTimer(minutes: number) {
    setTimerMinutes(minutes);
    if (!activeRoom) return;
    try {
      const room = await api.updateStudyRoom(activeRoom.id, {
        activity_state: { ...(activeRoom.activity_state || {}), pomodoro_minutes: minutes },
      });
      setRooms((items) => items.map((item) => (item.id === room.id ? room : item)));
    } catch {
      // Slider stays responsive during missed sync.
    }
  }

  async function updateActiveRoom(updates: Partial<StudyRoom>) {
    if (!activeRoom) return null;
    const optimistic = { ...activeRoom, ...updates };
    setRooms((items) => items.map((item) => (item.id === activeRoom.id ? optimistic : item)));
    try {
      const room = await api.updateStudyRoom(activeRoom.id, updates);
      setRooms((items) => items.map((item) => (item.id === room.id ? room : item)));
      return room as StudyRoom;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update room activity");
      void fetchRoom(activeRoom.id);
      return null;
    }
  }

  async function updateActivityState(patch: NonNullable<StudyRoom["activity_state"]>) {
    if (!activeRoom) return;
    await updateActiveRoom({
      activity_state: { ...(activeRoom.activity_state || {}), ...patch },
    });
  }

  async function selectActivity(nextActivity: RoomActivity) {
    if (!activeRoom) return;
    const state = activeRoom.activity_state || {};
    const activityTiles = state.activity_tiles || [];
    const activitySessions = state.activity_sessions || [];
    const sameActivityCount = activitySessions.filter((item) => item.activity === nextActivity).length;
    const session: RoomActivitySession = {
      id: `${activitySlug(nextActivity)}-${Date.now()}`,
      activity: nextActivity,
      title: sameActivityCount ? `${nextActivity} ${sameActivityCount + 1}` : nextActivity,
      started_by: currentUserName,
      started_at: Date.now(),
    };
    await updateActivityState({
      active_activity: nextActivity,
      active_activity_session_id: session.id,
      activity_sessions: [...activitySessions, session],
      activity_tiles: activityTiles.includes(nextActivity)
        ? activityTiles
        : [...activityTiles, nextActivity],
      activity_notice: {
        id: session.id,
        user: currentUserName,
        activity: nextActivity,
        title: session.title,
      },
    });
    setActivitiesView("activity");
  }

  async function openActivityTile(nextActivity: RoomActivity, sessionId?: string) {
    if (sessionId) {
      await updateActivityState({
        active_activity: nextActivity,
        active_activity_session_id: sessionId,
      });
    } else {
      await selectActivity(nextActivity);
    }
    setSuggestedActivitiesOpen(false);
    setActivitiesView("activity");
    setActivitiesOpen(true);
  }

  function openActivityPicker() {
    setSuggestedActivitiesOpen(false);
    setActivitiesView("picker");
    setActivitiesOpen(true);
  }

  function openSuggestedActivities() {
    setSuggestedActivitiesOpen((open) => !open);
  }

  async function startCall(nextMode: "voice" | "video") {
    if (!activeRoom) {
      toast.message("Select a study room first");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Your browser does not support camera/mic access.");
      return;
    }
    try {
      localStream?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: nextMode === "video",
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCallMode(nextMode);
      setCallSetupMode(null);
      setMicEnabled(true);
      setCameraEnabled(nextMode === "video");
      connectToStudyCall(activeRoom, stream);
      toast.success(nextMode === "video" ? "Video call started" : "Voice call joined");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not access camera/mic");
    }
  }

  function connectToStudyCall(room: StudyRoom, stream: MediaStream) {
    socketRef.current?.disconnect();
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
    setRemotePeers([]);

    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("study-call:join", {
        roomId: room.id,
        userName: currentUserName,
      });
    });

    socket.on("study-call:peers", async (peers: Array<{ socketId: string; name: string }>) => {
      for (const peer of peers) {
        addRemotePeer(peer.socketId, peer.name);
        const connection = createPeerConnection(peer.socketId, peer.name, localStreamRef.current || stream, true);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket.emit("study-call:signal", {
          to: peer.socketId,
          signal: { type: "offer", sdp: offer },
        });
      }
    });

    socket.on("study-call:user-joined", (peer: { socketId: string; name: string }) => {
      addRemotePeer(peer.socketId, peer.name);
    });

    socket.on(
      "study-call:signal",
      async ({
        from,
        name,
        signal,
      }: {
        from: string;
        name: string;
        signal: { type: "offer" | "answer" | "candidate"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      }) => {
        try {
          const connection = createPeerConnection(from, name, localStreamRef.current || stream);

          if (signal.type === "offer" && signal.sdp) {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            socket.emit("study-call:signal", {
              to: from,
              signal: { type: "answer", sdp: answer },
            });
          }

          if (signal.type === "answer" && signal.sdp) {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }

          if (signal.type === "candidate" && signal.candidate) {
            await connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch (error) {
          console.error("WebRTC signal failed", error);
        }
      },
    );

    socket.on("study-call:user-left", ({ socketId }: { socketId: string }) => {
      peerConnectionsRef.current.get(socketId)?.close();
      peerConnectionsRef.current.delete(socketId);
      setRemotePeers((items) => items.filter((item) => item.socketId !== socketId));
    });
  }

  function createPeerConnection(
    peerId: string,
    peerName: string,
    stream: MediaStream,
    receiveRemoteVideo = false,
  ) {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    if (receiveRemoteVideo && !stream.getVideoTracks().length) {
      connection.addTransceiver("video", { direction: "recvonly" });
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      socketRef.current?.emit("study-call:signal", {
        to: peerId,
        signal: { type: "candidate", candidate: event.candidate },
      });
    };

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemotePeers((items) => {
        const exists = items.some((item) => item.socketId === peerId);
        if (exists) {
          return items.map((item) =>
            item.socketId === peerId ? { ...item, name: peerName, stream: remoteStream } : item,
          );
        }
        return [...items, { socketId: peerId, name: peerName, stream: remoteStream }];
      });
    };

    connection.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(connection.connectionState)) {
        peerConnectionsRef.current.delete(peerId);
        setRemotePeers((items) => items.filter((item) => item.socketId !== peerId));
      }
    };

    peerConnectionsRef.current.set(peerId, connection);
    addRemotePeer(peerId, peerName);
    return connection;
  }

  function addRemotePeer(socketId: string, name: string) {
    setRemotePeers((items) => {
      if (items.some((item) => item.socketId === socketId)) return items;
      return [...items, { socketId, name }];
    });
  }

  async function toggleMic() {
    if (!localStream) return;
    const enabled = !micEnabled;
    const audioTracks = localStream.getAudioTracks();

    if (enabled && audioTracks.every((track) => track.readyState === "ended")) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const [audioTrack] = audioStream.getAudioTracks();
        if (!audioTrack) return;
        replaceLocalTrack("audio", audioTrack);
        const nextStream = new MediaStream([
          ...localStream.getTracks().filter((track) => track.kind !== "audio"),
          audioTrack,
        ]);
        localStreamRef.current = nextStream;
        setLocalStream(nextStream);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not turn microphone on");
        return;
      }
    } else {
      audioTracks.forEach((track) => {
        track.enabled = enabled;
      });
    }

    setMicEnabled(enabled);
  }

  async function toggleCamera() {
    if (!localStream) return;
    const enabled = !cameraEnabled;
    const videoTracks = localStream.getVideoTracks();

    if (!enabled) {
      videoTracks.forEach((track) => {
        track.enabled = false;
      });
      setCameraEnabled(false);
      return;
    }

    const liveTrack = videoTracks.find((track) => track.readyState === "live");
    if (liveTrack) {
      liveTrack.enabled = true;
      setCameraEnabled(true);
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const [videoTrack] = videoStream.getVideoTracks();
      if (!videoTrack) return;
      replaceLocalTrack("video", videoTrack);
      const nextStream = new MediaStream([
        ...localStream.getTracks().filter((track) => track.kind !== "video"),
        videoTrack,
      ]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setCameraEnabled(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn camera on");
    }
  }

  function replaceLocalTrack(kind: "audio" | "video", track: MediaStreamTrack) {
    peerConnectionsRef.current.forEach((connection, peerId) => {
      const transceiver = connection
        .getTransceivers()
        .find((item) => item.sender.track?.kind === kind || item.receiver.track.kind === kind);

      if (transceiver) {
        const needsRenegotiation = transceiver.direction === "recvonly" || transceiver.direction === "inactive";
        if (needsRenegotiation) transceiver.direction = "sendrecv";
        void transceiver.sender.replaceTrack(track);
        if (needsRenegotiation) void renegotiatePeer(peerId, connection);
        return;
      }

      connection.addTrack(track, localStreamRef.current || new MediaStream([track]));
      void renegotiatePeer(peerId, connection);
    });
  }

  async function renegotiatePeer(peerId: string, connection: RTCPeerConnection) {
    if (connection.signalingState !== "stable") return;
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socketRef.current?.emit("study-call:signal", {
        to: peerId,
        signal: { type: "offer", sdp: offer },
      });
    } catch (error) {
      console.error("WebRTC renegotiation failed", error);
    }
  }

  async function clearCallActivities() {
    if (!activeRoom) return;
    await updateActivityState({
      activity_sessions: [],
      active_activity_session_id: "",
      youtube_sessions: {},
      whiteboards: {},
      youtube_url: "",
      youtube_time: 0,
      youtube_playing: false,
      youtube_updated_at: Date.now(),
    });
  }

  function leaveCall() {
    void clearCallActivities();
    socketRef.current?.emit("study-call:leave");
    socketRef.current?.disconnect();
    socketRef.current = null;
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current.clear();
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    localStreamRef.current = null;
    setRemotePeers([]);
    setCallMode(null);
    setSuggestedActivitiesOpen(false);
    setActivitiesOpen(false);
    setMicEnabled(true);
    setCameraEnabled(true);
  }

  return (
    <div className={`grid h-dvh min-h-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-background/40 lg:grid-rows-none ${layoutClass}`}>
      <RoomSidebar
        rooms={rooms}
        activeRoomId={activeRoom?.id || ""}
        loading={loadingRooms}
        openRoom={openRoom}
        openCreate={() => setCreateOpen(true)}
        openJoin={() => setJoinOpen(true)}
      />
      <main className="relative flex min-h-0 flex-col overflow-hidden border-r border-border/50 lg:h-dvh">
        {showChatOnly && activeRoom ? (
          <>
            <RoomTitle
              room={activeRoom}
              copyInvite={copyInvite}
              openCall={() => setCallSetupMode("choose")}
              inCall={false}
            />
            <StudyChat
              room={activeRoom}
              messages={roomMessages}
              chatText={chatText}
              setChatText={setChatText}
              attachments={chatAttachments}
              setAttachments={setChatAttachments}
              attachFiles={attachChatFiles}
              sendMessage={sendMessage}
              fullWidth
            />
          </>
        ) : activeRoom ? (
          <>
            <RoomTitle
              room={activeRoom}
              copyInvite={copyInvite}
              openCall={() => setCallSetupMode("choose")}
              inCall={Boolean(callMode)}
            />
            {callMode && (
              <StudyCallPanel
                mode={callMode}
                videoRef={localVideoRef}
                stream={localStream}
                micEnabled={micEnabled}
                cameraEnabled={cameraEnabled}
                hasVideo={Boolean(localStream?.getVideoTracks().length)}
                minutes={timerMinutes}
                setMinutes={saveTimer}
                remotePeers={remotePeers}
                activitySessions={activeRoom.activity_state?.activity_sessions || []}
                activeActivitySessionId={activeRoom.activity_state?.active_activity_session_id || ""}
                openActivitySession={(session) => void openActivityTile(session.activity, session.id)}
                toggleMic={toggleMic}
                toggleCamera={toggleCamera}
                openActivities={openSuggestedActivities}
                leaveCall={leaveCall}
              />
            )}
          </>
        ) : (
          <EmptyStudyRoomState openCreate={() => setCreateOpen(true)} openJoin={() => setJoinOpen(true)} />
        )}
      </main>
      {activeRoom && callMode && !chatCollapsed ? (
        <StudyChat
          room={activeRoom}
          messages={roomMessages}
          chatText={chatText}
          setChatText={setChatText}
          attachments={chatAttachments}
          setAttachments={setChatAttachments}
          attachFiles={attachChatFiles}
          sendMessage={sendMessage}
          collapsed={false}
          onCollapse={() => setChatCollapsed(true)}
        />
      ) : activeRoom && callMode && chatCollapsed ? (
        <CollapsedChatRail expand={() => setChatCollapsed(false)} unreadCount={roomMessages.length} />
      ) : !activeRoom ? (
        <EmptySidePanel />
      ) : (
        null
      )}
      {createOpen && (
        <CreateRoomModal
          roomName={roomName}
          setRoomName={setRoomName}
          subject={subject}
          setSubject={setSubject}
          topic={topic}
          setTopic={setTopic}
          close={() => setCreateOpen(false)}
          createRoom={createRoom}
        />
      )}
      {joinOpen && (
        <JoinRoomModal
          inviteCode={inviteCode}
          setInviteCode={setInviteCode}
          close={() => setJoinOpen(false)}
          joinRoom={joinRoom}
        />
      )}
      {callSetupMode && (
        <CallSetupModal
          minutes={timerMinutes}
          setMinutes={saveTimer}
          close={() => setCallSetupMode(null)}
          start={(nextMode) => void startCall(nextMode)}
        />
      )}
      {suggestedActivitiesOpen && activeRoom && callMode && (
        <RoomActivityBoard
          room={activeRoom}
          openActivities={openActivityPicker}
          goToActivity={(activity) => void openActivityTile(activity)}
          close={() => setSuggestedActivitiesOpen(false)}
        />
      )}
      {activitiesOpen && (
        <ActivitiesModal
          room={activeRoom}
          timerMinutes={timerMinutes}
          setTimerMinutes={saveTimer}
          updateRoom={updateActiveRoom}
          updateActivityState={updateActivityState}
          view={activitiesView}
          setView={setActivitiesView}
          close={() => setActivitiesOpen(false)}
          currentUserName={currentUserName}
          selectActivity={(nextActivity) => void selectActivity(nextActivity)}
        />
      )}
    </div>
  );
}

function EmptyStudyRoomState({
  openCreate,
  openJoin,
}: {
  openCreate: () => void;
  openJoin: () => void;
}) {
  return (
    <div className="grid min-h-full place-items-center px-4 py-8 text-center sm:px-6">
      <div className="max-w-xl">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Users className="h-7 w-7" />
        </div>
        <h2 className="mt-6 font-display text-3xl font-bold sm:text-4xl">Pick a room. Protect your focus.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Create a study room or join one with an invite code. Your classroom stays clean until
          you choose where to study.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            Create room
          </button>
          <button
            type="button"
            onClick={openJoin}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
          >
            <UserPlus className="h-4 w-4" />
            Join with code
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptySidePanel() {
  return (
    <aside className="hidden min-h-dvh flex-col border-l border-border/50 bg-background/30 p-4 lg:flex">
      <div className="rounded-2xl border border-border bg-card/35 p-4">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Classroom status
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Select a room to open study chat, invites, voice, and video.
        </p>
      </div>
    </aside>
  );
}

function CollapsedChatRail({ expand, unreadCount }: { expand: () => void; unreadCount: number }) {
  return (
    <aside className="hidden min-h-dvh border-l border-border/50 bg-background/30 p-2 lg:flex lg:flex-col lg:items-center">
      <button
        type="button"
        onClick={expand}
        title="Expand chat"
        aria-label="Expand chat"
        className="relative mt-3 grid h-11 w-11 place-items-center rounded-xl border border-border bg-card/50 text-muted-foreground hover:border-primary/60 hover:text-primary"
      >
        <PanelRightOpen className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>
      <div className="mt-4 writing-mode-vertical text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground [writing-mode:vertical-rl]">
        Chat
      </div>
    </aside>
  );
}

function RoomSidebar({
  rooms,
  activeRoomId,
  loading,
  openRoom,
  openCreate,
  openJoin,
}: {
  rooms: StudyRoom[];
  activeRoomId: string;
  loading: boolean;
  openRoom: (room: StudyRoom) => void;
  openCreate: () => void;
  openJoin: () => void;
}) {
  return (
    <aside className="flex max-h-[34dvh] min-h-0 flex-col overflow-hidden border-b border-border/50 bg-sidebar/60 p-3 lg:h-dvh lg:max-h-none lg:border-b-0 lg:border-r lg:p-4">
      <div className="mb-3 flex items-center gap-2 lg:mb-5">
        <Users className="h-5 w-5 text-secondary" />
        <h1 className="font-display text-xl font-bold">Study Rooms</h1>
      </div>
      <div className="mb-3 grid grid-cols-[1fr_44px] gap-2 lg:mb-4">
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-3 py-2.5 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Create room
        </button>
        <button
          type="button"
          onClick={openJoin}
          title="Join with invite code"
          aria-label="Join with invite code"
          className="grid place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary hover:border-primary"
        >
          <UserPlus className="h-5 w-5" />
        </button>
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground lg:mb-3">
        Rooms and groups
      </div>
      <RoomList rooms={rooms} activeRoomId={activeRoomId} loading={loading} openRoom={openRoom} />
    </aside>
  );
}

function RoomList({
  rooms,
  activeRoomId,
  loading,
  openRoom,
}: {
  rooms: StudyRoom[];
  activeRoomId: string;
  loading: boolean;
  openRoom: (room: StudyRoom) => void;
}) {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {loading && (
        <p className="rounded-xl border border-border bg-background/35 p-3 text-sm text-muted-foreground">
          Loading rooms...
        </p>
      )}
      {!loading && rooms.length === 0 && (
        <p className="rounded-xl border border-border bg-background/35 p-3 text-sm text-muted-foreground">
          No joined rooms yet.
        </p>
      )}
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          onClick={() => openRoom(room)}
          className={`w-full rounded-xl border p-3 text-left transition ${
            activeRoomId === room.id
              ? "border-primary bg-primary/15"
              : "border-border bg-background/35 hover:border-primary/50"
          }`}
        >
          <div className="line-clamp-1 text-sm font-bold">{room.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{room.subject}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
            <span className="rounded bg-secondary/15 px-2 py-1 text-secondary">{room.activity}</span>
            <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
              {room.members.length} members
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function RoomTitle({
  room,
  copyInvite,
  openCall,
  inCall,
}: {
  room: StudyRoom;
  copyInvite: () => void;
  openCall: () => void;
  inCall: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-3 py-3 sm:px-6 sm:py-4">
      <div className="min-w-0">
        <h2 className="truncate font-display text-xl font-bold">{room.name}</h2>
        <div className="mt-1 text-xs text-muted-foreground">{room.subject}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!inCall && (
          <button
            type="button"
            onClick={openCall}
            title="Start call"
            aria-label="Start call"
            className="grid h-11 w-11 place-items-center rounded-full border border-success/40 bg-success/10 text-success transition hover:border-success"
          >
            <PhoneCall className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={copyInvite}
          className="rounded-xl border border-border bg-background/40 px-3 py-2 text-sm font-bold hover:border-primary/60"
        >
          <Copy className="mr-2 inline h-4 w-4 text-secondary" />
          Invite
        </button>
      </div>
    </header>
  );
}

function RoomActivityBoard({
  room,
  openActivities,
  goToActivity,
  close,
}: {
  room: StudyRoom;
  openActivities: () => void;
  goToActivity: (activity: RoomActivity, sessionId?: string) => void;
  close: () => void;
}) {
  const tiles = room.activity_state?.activity_tiles || [];
  const activeActivity = room.activity_state?.active_activity || room.activity || "Problem Solving";
  const visibleActivities = (tiles.length > 0 ? tiles : roomActivities.map((item) => item.title))
    .slice(0, 4)
    .map((activity) => ({
      key: activity,
      activity,
      label: activity,
      selected: tiles.includes(activity) || activeActivity === activity,
    }));

  return (
    <div className="fixed inset-0 z-[110]" onClick={close}>
      <section
        style={{ top: "max(8rem, calc(100dvh - 16.5rem))" }}
        className="glass gradient-border fixed left-1/2 max-h-44 w-fit max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl p-3 shadow-elevated"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <Trophy className="h-4 w-4 text-secondary" />
            Suggested activities
          </div>
          <button
            type="button"
            onClick={openActivities}
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.16em] text-primary hover:text-primary/80"
          >
            See all
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex max-w-full gap-3 overflow-x-auto pb-1">
          {visibleActivities.map((item, index) => (
            <ActivityTilePreview
              key={item.key}
              activity={item.activity}
              label={item.label}
              index={index}
              selected={item.selected}
              onClick={() => goToActivity(item.activity)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ActivityTilePreview({
  activity,
  label,
  index,
  selected,
  onClick,
}: {
  activity: RoomActivity;
  label?: string;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={activityDescription(activity)}
      className={`group relative h-20 w-36 shrink-0 overflow-hidden rounded-2xl border text-left shadow-elevated transition hover:border-primary/70 ${
        selected ? "border-primary" : "border-border hover:border-primary/50"
      } ${activityPreviewClass(index)}`}
    >
      <div className="absolute inset-0 bg-background/5 transition group-hover:bg-transparent" />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-2.5">
        <div className="line-clamp-2 text-sm font-bold leading-tight text-foreground">{label || activity}</div>
      </div>
      {selected && (
        <div className="absolute right-2 top-2 rounded-full border border-primary/40 bg-background/70 p-1 text-primary backdrop-blur">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </button>
  );
}

function activityPreviewClass(index: number) {
  const classes = [
    "bg-[linear-gradient(135deg,hsl(var(--primary)/0.28),hsl(var(--card)/0.92))]",
    "bg-[linear-gradient(135deg,hsl(var(--secondary)/0.28),hsl(var(--card)/0.92))]",
    "bg-[linear-gradient(135deg,hsl(var(--success)/0.24),hsl(var(--card)/0.92))]",
    "bg-[linear-gradient(135deg,hsl(var(--warning)/0.24),hsl(var(--card)/0.92))]",
    "bg-[linear-gradient(135deg,hsl(var(--accent)/0.26),hsl(var(--card)/0.92))]",
  ];
  return classes[index % classes.length];
}

function activitySlug(activity: RoomActivity) {
  return activity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function RoomActivityStage({
  room,
  timerMinutes,
  setTimerMinutes,
  updateRoom,
  updateActivityState,
  openActivities,
}: {
  room: StudyRoom;
  timerMinutes: number;
  setTimerMinutes: (minutes: number) => void;
  updateRoom: (updates: Partial<StudyRoom>) => Promise<StudyRoom | null>;
  updateActivityState: (patch: NonNullable<StudyRoom["activity_state"]>) => Promise<void>;
  openActivities: () => void;
}) {
  const state = room.activity_state || {};
  const sessions = state.activity_sessions || [];
  const activeSessionId = state.active_activity_session_id || "";
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const activeActivity = activeSession?.activity || state.active_activity || room.activity || "Problem Solving";
  const youtubeSessions = state.youtube_sessions || {};
  const activeYoutubeState = activeSessionId ? youtubeSessions[activeSessionId] || {} : {};
  const youtubeUrl = activeSessionId ? activeYoutubeState.url || "" : state.youtube_url || "";
  const dailyChallenge =
    state.daily_challenge ||
    `Solve one ${room.topic || room.subject} question and explain your approach in the chat.`;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <section className="rounded-2xl border border-border bg-card/35 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">
              Active activity
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold">{activeActivity}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {room.subject} / {room.topic}
            </p>
          </div>
          <button
            type="button"
            onClick={openActivities}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:border-primary"
          >
            <Trophy className="h-4 w-4" />
            Change activity
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-2xl border border-border bg-background/35 p-5">
          {activeActivity === "Pomodoro" && (
            <PomodoroActivity
              minutes={timerMinutes}
              running={Boolean(state.timer_running)}
              setMinutes={setTimerMinutes}
              setRunning={(running) => void updateActivityState({ timer_running: running })}
            />
          )}
          {activeActivity === "YouTube Watch" && (
            <YouTubeActivity
              url={youtubeUrl}
              playing={Boolean(activeSessionId ? activeYoutubeState.playing : state.youtube_playing)}
              currentTime={activeSessionId ? activeYoutubeState.time || 0 : state.youtube_time || 0}
              updatedAt={activeSessionId ? activeYoutubeState.updated_at || 0 : state.youtube_updated_at || 0}
              saveSession={(url) =>
                void updateActivityState({
                  youtube_sessions: activeSessionId
                    ? {
                        ...youtubeSessions,
                        [activeSessionId]: {
                          ...activeYoutubeState,
                          url,
                          time: 0,
                          playing: true,
                          updated_at: Date.now(),
                        },
                      }
                    : youtubeSessions,
                  youtube_url: url,
                  youtube_time: 0,
                  youtube_playing: true,
                  youtube_updated_at: Date.now(),
                })
              }
              setPlayback={(playing, currentTime) =>
                void updateActivityState({
                  youtube_sessions: activeSessionId
                    ? {
                        ...youtubeSessions,
                        [activeSessionId]: {
                          ...activeYoutubeState,
                          url: activeYoutubeState.url || youtubeUrl,
                          playing,
                          time: currentTime,
                          updated_at: Date.now(),
                        },
                      }
                    : youtubeSessions,
                  youtube_playing: playing,
                  youtube_time: currentTime,
                  youtube_updated_at: Date.now(),
                })
              }
            />
          )}
          {activeActivity === "Notes" && (
            <NotesActivity
              notes={room.notes || ""}
              saveNotes={(notes) => void updateRoom({ notes })}
            />
          )}
          {activeActivity === "Daily Challenge" && (
            <DailyChallengeActivity
              challenge={dailyChallenge}
              saveChallenge={(challenge) => void updateActivityState({ daily_challenge: challenge })}
            />
          )}
          {activeActivity === "Rapid Fire" && <SimpleActivity title="Rapid Fire Quiz Battle" body="Start topic-based questions in chat, answer fast, and track scores manually for this room." />}
          {activeActivity === "Mock Test" && <SimpleActivity title="Live Mock Test Room" body="Use this room to attempt the same test together. Share progress in chat and keep the shared timer running." />}
          {activeActivity === "Problem Solving" && <SimpleActivity title="Shared Problem Solving" body="Use chat, attachments, and calls to solve the same question together. Whiteboard sync can plug into this activity next." />}
          {activeActivity === "Discussion" && <SimpleActivity title="Topic Discussion" body="Discuss one topic, collect doubts, and save final conclusions in collaborative notes." />}
          {activeActivity === "AI Doubt" && <SimpleActivity title="AI Doubt Room" body="Ask doubts together, then paste the best explanation into notes for the whole room." />}
          {activeActivity === "Viva Practice" && <SimpleActivity title="Viva / Interview Practice" body="Take turns asking short technical questions and answering aloud in voice/video." />}
        </section>

        <section className="rounded-2xl border border-border bg-card/35 p-5">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Room focus
          </div>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <p>Invite code: <span className="font-mono text-foreground">{room.invite_code}</span></p>
            <p>Members: {room.members.length}</p>
            <p>Timer: {timerMinutes}:00</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function PomodoroActivity({
  minutes,
  running,
  setMinutes,
  setRunning,
}: {
  minutes: number;
  running: boolean;
  setMinutes: (minutes: number) => void;
  setRunning: (running: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Timer className="h-6 w-6 text-secondary" />
        <h2 className="font-display text-2xl font-bold">Shared Focus Timer</h2>
      </div>
      <div className="mt-6 font-display text-6xl font-bold">{minutes}:00</div>
      <input
        type="range"
        min={10}
        max={120}
        step={5}
        value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))}
        className="mt-5 w-full accent-primary"
      />
      <button
        type="button"
        onClick={() => setRunning(!running)}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground"
      >
        {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {running ? "Stop focus session" : "Start focus session"}
      </button>
    </div>
  );
}

type YoutubeRoomVideo = {
  id: string;
  title: string;
  channel?: string;
  views?: string;
  age?: string;
  duration?: string;
  thumbnail?: string;
};

function safelyDestroyYouTubePlayer(player: YouTubePlayer | null) {
  if (!player) return;
  try {
    player.destroy();
  } catch {
    // YouTube replaces its mount node; React may already have cleaned the wrapper.
  }
}

function YouTubeActivity({
  url,
  playing,
  currentTime,
  updatedAt,
  saveSession,
  setPlayback,
}: {
  url: string;
  playing: boolean;
  currentTime: number;
  updatedAt: number;
  saveSession: (url: string) => void;
  setPlayback: (playing: boolean, currentTime: number) => void;
}) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const applyingRoomStateRef = useRef(false);
  const lastBroadcastRef = useRef(0);
  const lastAppliedStateRef = useRef("");
  const [draft, setDraft] = useState(url);
  const [videos, setVideos] = useState<YoutubeRoomVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [activeFeed, setActiveFeed] = useState("Trending");
  const videoId = getYouTubeVideoId(url);
  const currentVideo = videos.find((video) => video.id === videoId);
  const selectedVideo = currentVideo || videos[0] || null;
  const feedTabs = ["Trending", "GATE CSE", "Operating Systems", "DBMS", "Coding", "Aptitude"];
  const sideVideos = videos.filter((video) => video.id !== videoId).slice(0, 8);

  useEffect(() => setDraft(url), [url]);

  useEffect(() => {
    void searchRealYouTube("study programming education");
  }, []);

  useEffect(() => {
    if (!playerHostRef.current || !videoId) return;
    let cancelled = false;
    const mount = playerHostRef.current;

    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !window.YT || !mount) return;

      safelyDestroyYouTubePlayer(playerRef.current);
      playerRef.current = null;
      mount.textContent = "";
      const playerNode = document.createElement("div");
      playerNode.className = "h-full w-full";
      mount.appendChild(playerNode);

      playerRef.current = new window.YT.Player(playerNode, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          start: Math.floor(getSyncedYouTubeTime(currentTime, playing, updatedAt)),
        },
        events: {
          onReady: () => applyRoomPlaybackState(videoId, playing, currentTime, updatedAt),
          onStateChange: (event) => {
            if (applyingRoomStateRef.current || !window.YT || !playerRef.current) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setPlayback(true, playerRef.current.getCurrentTime());
            }
            if (
              event.data === window.YT.PlayerState.PAUSED ||
              event.data === window.YT.PlayerState.ENDED
            ) {
              setPlayback(false, playerRef.current.getCurrentTime());
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      safelyDestroyYouTubePlayer(playerRef.current);
      playerRef.current = null;
      mount.textContent = "";
    };
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    applyRoomPlaybackState(videoId, playing, currentTime, updatedAt);
  }, [videoId, playing, currentTime, updatedAt]);

  useEffect(() => {
    if (!videoId || !playing) return;
    const interval = window.setInterval(() => {
      if (!playerRef.current || applyingRoomStateRef.current || !window.YT) return;
      if (playerRef.current.getPlayerState() !== window.YT.PlayerState.PLAYING) return;

      const now = Date.now();
      if (now - lastBroadcastRef.current < 4500) return;
      lastBroadcastRef.current = now;
      setPlayback(true, playerRef.current.getCurrentTime());
    }, 5000);

    return () => window.clearInterval(interval);
  }, [videoId, playing, setPlayback]);

  function applyRoomPlaybackState(
    nextVideoId: string,
    nextPlaying: boolean,
    nextCurrentTime: number,
    nextUpdatedAt: number,
  ) {
    const player = playerRef.current;
    if (!player) return;

    const targetTime = getSyncedYouTubeTime(nextCurrentTime, nextPlaying, nextUpdatedAt);
    const stateKey = `${nextVideoId}:${nextPlaying}:${Math.floor(targetTime)}:${nextUpdatedAt}`;
    if (lastAppliedStateRef.current === stateKey) return;
    lastAppliedStateRef.current = stateKey;
    applyingRoomStateRef.current = true;

    player.seekTo(targetTime, true);
    if (nextPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }

    window.setTimeout(() => {
      applyingRoomStateRef.current = false;
    }, 900);
  }

  function toggleRoomPlayback() {
    const playerTime = playerRef.current?.getCurrentTime();
    setPlayback(!playing, Number.isFinite(playerTime) ? Number(playerTime) : currentTime);
  }

  function playRoomVideo(nextVideo: YoutubeRoomVideo) {
    const nextUrl = `https://www.youtube.com/watch?v=${nextVideo.id}`;
    setDraft(nextVideo.title);
    saveSession(nextUrl);
  }

  async function searchRealYouTube(query: string) {
    const searchQuery = query.trim() || "study programming education";
    setVideosLoading(true);
    setVideosError("");
    try {
      const results = await api.youtubeSearch(searchQuery);
      setVideos(results.filter((video) => video.id));
      if (results.length === 0) setVideosError("No YouTube videos found for this search.");
    } catch (error) {
      setVideosError(error instanceof Error ? error.message : "Could not search YouTube");
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }

  function startFromSearch() {
    const pastedVideoId = getYouTubeVideoId(draft);
    if (pastedVideoId) {
      saveSession(`https://www.youtube.com/watch?v=${pastedVideoId}`);
      return;
    }

    void searchRealYouTube(draft);
  }

  function openFeed(feed: string) {
    const feedQuery =
      feed === "Trending" ? "study programming education" : `${feed} exam preparation tutorial`;
    setActiveFeed(feed);
    setDraft(feedQuery);
    void searchRealYouTube(feedQuery);
  }

  if (feedTabs.length > 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-[#070914] text-foreground shadow-elevated">
        <div className="flex max-h-[76dvh] min-h-[560px]">
          <aside className="hidden w-56 shrink-0 border-r border-border bg-background/35 p-4 lg:block">
            <div className="mb-5 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-red-500/15 text-red-400">
                <Play className="h-5 w-5 fill-current" />
              </div>
              <div>
                <p className="text-sm font-black">YouTube Watch</p>
                <p className="text-xs text-muted-foreground">Room activity</p>
              </div>
            </div>
            <div className="space-y-2">
              {feedTabs.map((feed) => (
                <button
                  key={feed}
                  type="button"
                  onClick={() => openFeed(feed)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                    activeFeed === feed
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                  }`}
                >
                  {feed}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-border bg-card/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Room Sync
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">
                {playing ? "Playing together" : "Paused for everyone"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search, pick a video, and playback updates for the room.
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 border-b border-border bg-[#070914]/95 px-4 py-4 backdrop-blur md:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-secondary/40 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary">
                  You are hosting
                </div>
                <div className="flex min-w-[240px] max-w-3xl flex-1 overflow-hidden rounded-full border border-border bg-background/70">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") startFromSearch();
                    }}
                    placeholder="Search YouTube or paste a YouTube URL"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={startFromSearch}
                    className="grid w-16 place-items-center bg-primary/20 text-primary transition hover:bg-primary/30"
                    aria-label="Search or play video"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                </div>
                {url && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      playing ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {playing ? "Playing for room" : "Paused"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {feedTabs.map((feed) => (
                  <button
                    key={feed}
                    type="button"
                    onClick={() => openFeed(feed)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
                      activeFeed === feed
                        ? "border-primary/60 bg-primary/20 text-primary"
                        : "border-border bg-card/45 text-muted-foreground"
                    }`}
                  >
                    {feed}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 p-4 md:p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <main className="min-w-0">
                <section className="overflow-hidden rounded-2xl border border-border bg-background/45">
                  <div className="aspect-video bg-black">
                    {videoId ? (
                      <div ref={playerHostRef} className="h-full w-full" />
                    ) : selectedVideo ? (
                      <button
                        type="button"
                        onClick={() => playRoomVideo(selectedVideo)}
                        className="group relative h-full w-full overflow-hidden text-left"
                      >
                        <img
                          src={
                            selectedVideo.thumbnail ||
                            `https://img.youtube.com/vi/${selectedVideo.id}/maxresdefault.jpg`
                          }
                          alt=""
                          className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-105 group-hover:opacity-95"
                        />
                        <span className="absolute inset-0 grid place-items-center bg-background/25">
                          <span className="grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                            <Play className="h-9 w-9 fill-current" />
                          </span>
                        </span>
                      </button>
                    ) : (
                      <div className="grid h-full place-items-center p-8 text-center">
                        <div>
                          <Search className="mx-auto h-10 w-10 text-muted-foreground" />
                          <p className="mt-3 text-sm font-bold text-muted-foreground">
                            Search YouTube to start room watch.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-xl font-black">
                          {currentVideo?.title || selectedVideo?.title || "Room YouTube Watch"}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {currentVideo || selectedVideo
                            ? `${(currentVideo || selectedVideo)?.channel || "YouTube"} / ${
                                (currentVideo || selectedVideo)?.views || "Room video"
                              }`
                            : "Browse and play videos together inside this room."}
                        </p>
                      </div>
                      {videoId && (
                        <button
                          type="button"
                          onClick={toggleRoomPlayback}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow"
                        >
                          {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          {playing ? "Pause for room" : "Play for room"}
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                <section className="mt-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-secondary" />
                      <h3 className="text-lg font-black">{activeFeed} Videos</h3>
                    </div>
                    {videosLoading && (
                      <span className="rounded-full bg-card/60 px-3 py-1 text-xs font-bold text-muted-foreground">
                        Searching...
                      </span>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {videos.map((video) => (
                      <YoutubeVideoCard
                        key={video.id}
                        video={video}
                        active={video.id === videoId}
                        playRoomVideo={playRoomVideo}
                      />
                    ))}
                  </div>
                  {!videosLoading && videosError && (
                    <div className="mt-4 rounded-2xl border border-border bg-card/45 p-8 text-center text-sm text-muted-foreground">
                      {videosError}
                    </div>
                  )}
                  {!videosLoading && !videosError && videos.length === 0 && (
                    <div className="rounded-2xl border border-border bg-card/45 p-8 text-center text-sm text-muted-foreground">
                      Search YouTube or paste a YouTube URL to play it in the room.
                    </div>
                  )}
                </section>
              </main>

              <aside className="min-w-0 space-y-4">
                <section className="rounded-2xl border border-border bg-background/45 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black">Up next</h3>
                    <span className="text-xs font-bold text-muted-foreground">{sideVideos.length}</span>
                  </div>
                  <div className="space-y-3">
                    {sideVideos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => playRoomVideo(video)}
                        className="group grid w-full grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-xl p-2 text-left transition hover:bg-card/70"
                      >
                        <div className="relative aspect-video overflow-hidden rounded-lg bg-card">
                          <img
                            src={video.thumbnail || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
                            alt=""
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 py-0.5 text-[10px] font-bold">
                            {video.duration}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-bold leading-tight">{video.title}</p>
                          <p className="mt-1 truncate text-xs font-bold text-secondary">{video.channel}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {video.views} / {video.age}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                    Shared Playback
                  </p>
                  <h3 className="mt-2 text-lg font-black">
                    {playing ? "Everyone is watching" : "Ready when you are"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choosing a video saves it as the room video and starts it for everyone in the activity.
                  </p>
                  {videoId && (
                    <button
                      type="button"
                      onClick={toggleRoomPlayback}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                    >
                      {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {playing ? "Pause room video" : "Play room video"}
                    </button>
                  )}
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/35">
      <div className="border-b border-border bg-background/45 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="rounded-full border border-secondary/40 bg-secondary/10 px-4 py-2 text-sm font-bold text-secondary">
            You are hosting
          </div>
          <div className="flex min-w-[280px] max-w-2xl flex-1 overflow-hidden rounded-xl border border-border bg-background/60">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") startFromSearch();
              }}
              placeholder="Search or paste YouTube URL"
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={startFromSearch}
              className="grid w-16 place-items-center bg-primary/15 text-primary hover:bg-primary/25"
              aria-label="Search or play video"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
          {url && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${playing ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {playing ? "Playing for room" : "Paused"}
            </span>
          )}
        </div>
      </div>

      <div className="max-h-[72dvh] overflow-y-auto p-5">
        {videoId && (
          <section>
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
            <div ref={playerHostRef} className="h-full w-full" />
          </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold">
                  {currentVideo?.title || "Room YouTube video"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentVideo ? `${currentVideo.channel} • ${currentVideo.views}` : "Shared room playback"}
                </p>
              </div>
            <button
              type="button"
              onClick={toggleRoomPlayback}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause for room" : "Play for room"}
            </button>
            </div>
          </section>
        )}

        <section className={videoId ? "mt-8" : ""}>
          <div className="mb-4 flex items-center gap-2">
            <Flame className="h-5 w-5 text-secondary" />
            <h3 className="text-lg font-bold">YouTube Results</h3>
          </div>
          {videosLoading && (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
              Searching YouTube...
            </div>
          )}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {videos.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => playRoomVideo(video)}
                className="group text-left"
              >
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-background/40">
                  <img
                    src={video.thumbnail || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs font-bold text-foreground">
                    {video.duration}
                  </span>
                </div>
                <h4 className="mt-3 line-clamp-2 text-sm font-bold leading-tight text-foreground">
                  {video.title}
                </h4>
                <p className="mt-1 text-sm font-bold text-secondary">{video.channel}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {video.views} • {video.age}
                </p>
              </button>
            ))}
          </div>
          {!videosLoading && videosError && (
            <div className="mt-4 rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
              {videosError}
            </div>
          )}
          {!videosLoading && !videosError && videos.length === 0 && (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
              Search YouTube or paste a YouTube URL to play it in the room.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function YoutubeVideoCard({
  video,
  active,
  playRoomVideo,
}: {
  video: YoutubeRoomVideo;
  active: boolean;
  playRoomVideo: (video: YoutubeRoomVideo) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => playRoomVideo(video)}
      className={`group min-w-0 rounded-2xl border p-2 text-left transition ${
        active
          ? "border-primary/70 bg-primary/10"
          : "border-transparent bg-transparent hover:border-border hover:bg-card/45"
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-card">
        <img
          src={video.thumbnail || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-xs font-bold text-foreground">
          {video.duration}
        </span>
        {active && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground">
            Now playing
          </span>
        )}
      </div>
      <h4 className="mt-3 line-clamp-2 text-sm font-black leading-tight text-foreground">
        {video.title}
      </h4>
      <p className="mt-1 truncate text-sm font-bold text-secondary">{video.channel}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {video.views} / {video.age}
      </p>
    </button>
  );
}

function NotesActivity({ notes, saveNotes }: { notes: string; saveNotes: (notes: string) => void }) {
  const [draft, setDraft] = useState(notes);
  useEffect(() => setDraft(notes), [notes]);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Collaborative Notes</h2>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-4 min-h-[340px] w-full resize-none rounded-2xl border border-border bg-background/60 p-4 text-sm leading-relaxed outline-none focus:border-primary/70"
        placeholder="Write shared notes, formulas, final conclusions, or doubts..."
      />
      <button
        type="button"
        onClick={() => saveNotes(draft)}
        className="mt-3 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
      >
        Save notes
      </button>
    </div>
  );
}

function DailyChallengeActivity({
  challenge,
  saveChallenge,
}: {
  challenge: string;
  saveChallenge: (challenge: string) => void;
}) {
  const [draft, setDraft] = useState(challenge);
  useEffect(() => setDraft(challenge), [challenge]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 text-success" />
        <h2 className="font-display text-2xl font-bold">Daily Challenge</h2>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-4 min-h-40 w-full resize-none rounded-2xl border border-border bg-background/60 p-4 text-sm leading-relaxed outline-none focus:border-primary/70"
      />
      <button
        type="button"
        onClick={() => saveChallenge(draft)}
        className="mt-3 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
      >
        Save challenge
      </button>
    </div>
  );
}

function SimpleActivity({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-[340px] place-items-center text-center">
      <div className="max-w-lg">
        <h2 className="font-display text-3xl font-bold">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function StudyChat({
  room,
  messages,
  chatText,
  setChatText,
  attachments,
  setAttachments,
  attachFiles,
  sendMessage,
  fullWidth = false,
  collapsed = false,
  onCollapse,
}: {
  room: StudyRoom;
  messages: ChatMessage[];
  chatText: string;
  setChatText: (value: string) => void;
  attachments: ChatAttachment[];
  setAttachments: (value: ChatAttachment[]) => void;
  attachFiles: (files: FileList | null) => void;
  sendMessage: () => void;
  fullWidth?: boolean;
  collapsed?: boolean;
  onCollapse?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, attachments.length]);

  return (
    <aside
      className={`flex min-h-0 flex-col bg-background/30 ${
        fullWidth ? "flex-1 overflow-hidden" : "hidden h-dvh border-l border-border/50 lg:flex"
      } ${collapsed ? "hidden" : ""}`}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 p-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold">Room Chat</h3>
          <p className="mt-1 text-xs text-muted-foreground">{room.members.length} members in room</p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse chat"
            aria-label="Collapse chat"
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-primary"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
      </div>
      <div
        ref={messagesRef}
        onWheel={(event) => {
          const node = messagesRef.current;
          if (!node) return;
          node.scrollTop += event.deltaY;
          event.stopPropagation();
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        {messages.length === 0 && (
          <div className="rounded-xl border border-border bg-background/35 p-3 text-sm text-muted-foreground">
            Start a study-only discussion inside this room.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="rounded-xl border border-border bg-card/35 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-secondary">{message.author_name}</span>
              <span className="text-muted-foreground">{formatTime(message.created_at)}</span>
            </div>
            {message.text && <p className="mt-2 text-sm leading-relaxed">{message.text}</p>}
            {Boolean(message.attachments?.length) && (
              <div className="mt-3 space-y-2">
                {message.attachments?.map((file, index) => (
                  <AttachmentCard key={`${file.name}-${index}`} file={file} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-border/50 bg-background/80 p-4 backdrop-blur">
        {attachments.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {attachments.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex min-w-48 max-w-64 items-center justify-between gap-2 rounded-xl border border-border bg-background/35 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold">{file.name}</div>
                  <div className="text-muted-foreground">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachments(attachments.filter((_, itemIndex) => itemIndex !== index))}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              void attachFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background/50 text-muted-foreground hover:border-primary/60 hover:text-primary"
            aria-label="Attach PDF, document, or image"
            title="Attach PDF, document, or image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={chatText}
            onChange={(event) => setChatText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") sendMessage();
            }}
            placeholder="Ask a doubt or share a study step..."
            className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
          />
          <button
            type="button"
            onClick={sendMessage}
            className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary text-primary-foreground"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function AttachmentCard({ file }: { file: ChatAttachment }) {
  const fileType = file.type || file.mime_type || "";
  const isImage = fileType.startsWith("image/");

  return (
    <a
      href={file.data_url}
      download={file.name}
      target="_blank"
      rel="noreferrer"
      className="block max-w-sm rounded-xl border border-border bg-background/45 p-3 transition hover:border-primary/60"
    >
      {isImage && (
        <div className="mb-3 max-h-48 overflow-hidden rounded-lg border border-border bg-card/40">
          <img
            src={file.data_url}
            alt={file.name}
            className="h-full max-h-48 w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{file.name}</div>
          <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
        </div>
      </div>
    </a>
  );
}

function CreateRoomModal({
  roomName,
  setRoomName,
  subject,
  setSubject,
  topic,
  setTopic,
  close,
  createRoom,
}: {
  roomName: string;
  setRoomName: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  topic: string;
  setTopic: (value: string) => void;
  close: () => void;
  createRoom: () => void;
}) {
  return (
    <ModalShell title="Create Study Room" close={close}>
      <div className="space-y-3">
        <Input label="Room name" value={roomName} onChange={setRoomName} placeholder="GATE OS Deadlock Sprint" />
        <Input label="Subject" value={subject} onChange={setSubject} placeholder="Operating Systems" />
        <Input label="Topic" value={topic} onChange={setTopic} placeholder="Deadlock and Banker's Algorithm" />
        <button
          type="button"
          onClick={createRoom}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Create room
        </button>
      </div>
    </ModalShell>
  );
}

function JoinRoomModal({
  inviteCode,
  setInviteCode,
  close,
  joinRoom,
}: {
  inviteCode: string;
  setInviteCode: (value: string) => void;
  close: () => void;
  joinRoom: () => void;
}) {
  return (
    <ModalShell title="Join With Invite Code" close={close}>
      <div className="space-y-3">
        <input
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
          placeholder="STUDY-ABCD-1234"
          className="w-full rounded-xl border border-border bg-background/60 px-3 py-3 text-sm uppercase outline-none focus:border-primary/70"
        />
        <button
          type="button"
          onClick={joinRoom}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
        >
          <UserPlus className="h-4 w-4" />
          Join room
        </button>
      </div>
    </ModalShell>
  );
}

const roomActivities: Array<{
  title: RoomActivity;
  description: string;
}> = [
  { title: "Problem Solving", description: "Solve shared questions with chat, files, and calls." },
  { title: "Pomodoro", description: "Run a shared focus timer for the room." },
  { title: "Notes", description: "Write collaborative notes and final takeaways." },
  { title: "YouTube Watch", description: "Save an educational YouTube video for the room." },
  { title: "Let's Quiz", description: "Run a live room MCQ quiz with timers and leaderboard." },
  { title: "Whiteboard", description: "One writer teaches while everyone else watches the board live." },
  { title: "Daily Challenge", description: "Set one difficult problem for everyone." },
  { title: "Mock Test", description: "Attempt a test together and track progress." },
  { title: "Rapid Fire", description: "Fast quiz rounds for topic recall." },
  { title: "Discussion", description: "Discuss one subject or doubt deeply." },
  { title: "AI Doubt", description: "Use the room to collect and resolve doubts." },
  { title: "Viva Practice", description: "Practice oral/interview-style technical answers." },
];

function activityDescription(activity: RoomActivity) {
  return roomActivities.find((item) => item.title === activity)?.description || "Open this room activity.";
}

function ActivitiesModal({
  room,
  timerMinutes,
  setTimerMinutes,
  updateRoom,
  updateActivityState,
  view,
  setView,
  close,
  currentUserName,
  selectActivity,
}: {
  room: StudyRoom | null;
  timerMinutes: number;
  setTimerMinutes: (minutes: number) => void;
  updateRoom: (updates: Partial<StudyRoom>) => Promise<StudyRoom | null>;
  updateActivityState: (patch: NonNullable<StudyRoom["activity_state"]>) => Promise<void>;
  view: "picker" | "activity";
  setView: (view: "picker" | "activity") => void;
  close: () => void;
  currentUserName: string;
  selectActivity: (activity: RoomActivity) => void;
}) {
  const state = room?.activity_state || {};
  const sessions = state.activity_sessions || [];
  const activeSessionId = state.active_activity_session_id || "";
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const current = activeSession?.activity || state.active_activity || room?.activity || "Problem Solving";
  const youtubeSessions = state.youtube_sessions || {};
  const activeYoutubeState = activeSessionId ? youtubeSessions[activeSessionId] || {} : {};
  const youtubeUrl = activeSessionId ? activeYoutubeState.url || "" : state.youtube_url || "";
  const whiteboards = state.whiteboards || {};
  const activeWhiteboard = activeSessionId ? whiteboards[activeSessionId] || { strokes: [] } : { strokes: [] };
  const [activitySearch, setActivitySearch] = useState("");
  const recentActivities =
    sessions.length
      ? sessions.slice(-4).reverse().map((session) => session.activity)
      : state.activity_tiles?.length
      ? state.activity_tiles.slice(0, 4)
      : (["YouTube Watch", "Pomodoro", "Rapid Fire", "Notes"] as RoomActivity[]);
  const filteredActivities = roomActivities.filter((activity) => {
    const query = activitySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      activity.title.toLowerCase().includes(query) ||
      activity.description.toLowerCase().includes(query)
    );
  });

  if (view === "picker") {
    return (
      <ModalShell title="Activities" close={close} wide>
        <div className="max-h-[76dvh] overflow-y-auto rounded-2xl border border-border bg-card/35 p-5">
          <label className="flex h-12 items-center gap-3 rounded-xl border border-primary/60 bg-background/60 px-4">
            <Search className="h-5 w-5 text-primary" />
            <input
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <section className="mt-5">
            <h3 className="text-lg font-bold">Recents</h3>
            <div className="mt-3 flex gap-4 overflow-x-auto pb-1">
              {recentActivities.map((activity, index) => (
                <button
                  key={`${activity}-${index}`}
                  type="button"
                  onClick={() => selectActivity(activity)}
                  title={activity}
                  className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl border text-xs font-bold text-foreground shadow-elevated ${
                    state.activity_tiles?.includes(activity) ? "border-primary" : "border-border"
                  } ${activityPreviewClass(index)}`}
                >
                  {activityShortName(activity)}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-lg font-bold">Activities</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {filteredActivities.map((activity, index) => {
                const selected = state.activity_tiles?.includes(activity.title);
                return (
                  <button
                    key={activity.title}
                    type="button"
                    onClick={() => selectActivity(activity.title)}
                    className={`overflow-hidden rounded-2xl border bg-background/45 text-left shadow-elevated transition hover:-translate-y-0.5 ${
                      selected ? "border-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`relative h-40 ${activityPreviewClass(index)}`}>
                      {(index === 0 || index === 2 || index === 4) && (
                        <span className="absolute right-3 top-3 rounded-full bg-secondary/15 px-3 py-0.5 text-xs font-bold uppercase text-secondary">
                          Promoted
                        </span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4 text-2xl font-bold uppercase tracking-wide text-foreground drop-shadow">
                        {activity.title}
                      </div>
                    </div>
                    <div className="flex gap-3 p-4">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border text-sm font-bold text-foreground ${activityPreviewClass(index + 2)}`}>
                        {activityShortName(activity.title)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-lg font-bold text-foreground">{activity.title}</h4>
                          {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {activity.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {filteredActivities.length === 0 && (
              <div className="mt-4 rounded-xl border border-border p-4 text-sm text-muted-foreground">
                No matching activities found.
              </div>
            )}
          </section>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={current} close={close} wide>
      <button
        type="button"
        onClick={() => setView("picker")}
        className="mb-4 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary/60 hover:text-primary"
      >
        Back to activities
      </button>
      <div className="max-h-[76dvh] overflow-y-auto rounded-2xl border border-border bg-background/35 p-5">
          {current === "Pomodoro" && (
            <PomodoroActivity
              minutes={timerMinutes}
              running={Boolean(state.timer_running)}
              setMinutes={setTimerMinutes}
              setRunning={(running) => void updateActivityState({ timer_running: running })}
            />
          )}
          {current === "YouTube Watch" && (
            <YouTubeActivity
              url={youtubeUrl}
              playing={Boolean(activeSessionId ? activeYoutubeState.playing : state.youtube_playing)}
              currentTime={activeSessionId ? activeYoutubeState.time || 0 : state.youtube_time || 0}
              updatedAt={activeSessionId ? activeYoutubeState.updated_at || 0 : state.youtube_updated_at || 0}
              saveSession={(url) =>
                void updateActivityState({
                  youtube_sessions: activeSessionId
                    ? {
                        ...youtubeSessions,
                        [activeSessionId]: {
                          ...activeYoutubeState,
                          url,
                          time: 0,
                          playing: true,
                          updated_at: Date.now(),
                        },
                      }
                    : youtubeSessions,
                  youtube_url: url,
                  youtube_time: 0,
                  youtube_playing: true,
                  youtube_updated_at: Date.now(),
                })
              }
              setPlayback={(playing, currentTime) =>
                void updateActivityState({
                  youtube_sessions: activeSessionId
                    ? {
                        ...youtubeSessions,
                        [activeSessionId]: {
                          ...activeYoutubeState,
                          url: activeYoutubeState.url || youtubeUrl,
                          playing,
                          time: currentTime,
                          updated_at: Date.now(),
                        },
                      }
                    : youtubeSessions,
                  youtube_playing: playing,
                  youtube_time: currentTime,
                  youtube_updated_at: Date.now(),
                })
              }
            />
          )}
          {current === "Notes" && (
            <NotesActivity notes={room?.notes || ""} saveNotes={(notes) => void updateRoom({ notes })} />
          )}
          {current === "Daily Challenge" && (
            <DailyChallengeActivity
              challenge={
                state.daily_challenge ||
                `Solve one ${room?.topic || room?.subject || "study"} question and explain your approach.`
              }
              saveChallenge={(daily_challenge) => void updateActivityState({ daily_challenge })}
            />
          )}
          {current === "Problem Solving" && (
            <TextSaveActivity
              title="Shared Problem Solving"
              label="Problem or solving target"
              value={state.problem_prompt || `Solve one ${room?.topic || "GATE"} problem together.`}
              save={(problem_prompt) => void updateActivityState({ problem_prompt })}
            />
          )}
          {current === "Discussion" && (
            <TextSaveActivity
              title="Topic Discussion"
              label="Discussion topic"
              value={state.discussion_topic || room?.topic || "Today's study discussion"}
              save={(discussion_topic) => void updateActivityState({ discussion_topic })}
            />
          )}
          {current === "AI Doubt" && (
            <TextSaveActivity
              title="AI Doubt Room"
              label="Shared doubt prompt"
              value={state.ai_doubt_prompt || "Write the doubt the group wants the AI tutor to explain."}
              save={(ai_doubt_prompt) => void updateActivityState({ ai_doubt_prompt })}
            />
          )}
          {current === "Viva Practice" && (
            <TextSaveActivity
              title="Viva / Interview Practice"
              label="Current viva question"
              value={state.viva_prompt || `Explain ${room?.topic || "this topic"} in 60 seconds.`}
              save={(viva_prompt) => void updateActivityState({ viva_prompt })}
            />
          )}
          {current === "Mock Test" && (
            <MockTestActivity
              progress={typeof state.mock_progress === "number" ? state.mock_progress : 0}
              saveProgress={(mock_progress) => void updateActivityState({ mock_progress })}
            />
          )}
          {current === "Rapid Fire" && (
            <RapidFireActivity
              question={state.rapid_fire_question || `Ask a fast ${room?.topic || "study"} MCQ.`}
              score={state.rapid_fire_score?.Room || 0}
              save={(patch) => void updateActivityState(patch)}
            />
          )}
          {current === "Let's Quiz" && (
            <LetsQuizActivity
              room={room}
              quiz={state.lets_quiz}
              currentUserName={currentUserName}
              updateActivityState={updateActivityState}
            />
          )}
          {current === "Whiteboard" && (
            <WhiteboardActivity
              board={activeWhiteboard}
              ownerName={activeSession?.started_by || currentUserName}
              currentUserName={currentUserName}
              saveBoard={(board) =>
                void updateActivityState({
                  whiteboards: activeSessionId
                    ? {
                        ...whiteboards,
                        [activeSessionId]: board,
                      }
                    : whiteboards,
                })
              }
            />
          )}
      </div>
    </ModalShell>
  );
}

function activityShortName(activity: RoomActivity) {
  const words = activity.split(" ");
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function TextSaveActivity({
  title,
  label,
  value,
  save,
}: {
  title: string;
  label: string;
  value: string;
  save: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <label className="mt-4 block">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-48 w-full resize-none rounded-2xl border border-border bg-background/60 p-4 text-sm leading-relaxed outline-none focus:border-primary/70"
        />
      </label>
      <button
        type="button"
        onClick={() => save(draft)}
        className="mt-3 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
      >
        Save activity
      </button>
    </div>
  );
}

function MockTestActivity({
  progress,
  saveProgress,
}: {
  progress: number;
  saveProgress: (progress: number) => void;
}) {
  const [draft, setDraft] = useState(progress);
  useEffect(() => setDraft(progress), [progress]);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Live Mock Test Room</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Track shared completion while everyone attempts the same test.
      </p>
      <div className="mt-6 font-display text-5xl font-bold">{draft}%</div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        className="mt-5 w-full accent-primary"
      />
      <button
        type="button"
        onClick={() => saveProgress(draft)}
        className="mt-3 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
      >
        Save mock progress
      </button>
    </div>
  );
}

function RapidFireActivity({
  question,
  score,
  save,
}: {
  question: string;
  score: number;
  save: (patch: NonNullable<StudyRoom["activity_state"]>) => void;
}) {
  const [draft, setDraft] = useState(question);
  useEffect(() => setDraft(question), [question]);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Rapid Fire Quiz Battle</h2>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-4 min-h-32 w-full resize-none rounded-2xl border border-border bg-background/60 p-4 text-sm leading-relaxed outline-none focus:border-primary/70"
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save({ rapid_fire_question: draft })}
          className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Save question
        </button>
        <button
          type="button"
          onClick={() => save({ rapid_fire_score: { Room: Math.max(0, score - 1) } })}
          className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:border-primary/60"
        >
          -1
        </button>
        <div className="rounded-xl border border-border bg-card/40 px-4 py-2 text-sm font-bold">
          Score: {score}
        </div>
        <button
          type="button"
          onClick={() => save({ rapid_fire_score: { Room: score + 1 } })}
          className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:border-primary/60"
        >
          +1
        </button>
      </div>
    </div>
  );
}

function WhiteboardActivity({
  board,
  ownerName,
  currentUserName,
  saveBoard,
}: {
  board: WhiteboardState;
  ownerName: string;
  currentUserName: string;
  saveBoard: (board: WhiteboardState) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fullSvgRef = useRef<SVGSVGElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [draftStroke, setDraftStroke] = useState<WhiteboardStroke | null>(null);
  const [imageDrag, setImageDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [color, setColor] = useState("#8b5cf6");
  const [width, setWidth] = useState(5);
  const [fullPage, setFullPage] = useState(false);
  const strokes = Array.isArray(board.strokes) ? board.strokes : [];
  const images = Array.isArray(board.images) ? board.images : [];
  const canWrite = ownerName === currentUserName;

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1200, ((event.clientX - rect.left) / rect.width) * 1200)),
      y: Math.max(0, Math.min(720, ((event.clientY - rect.top) / rect.height) * 720)),
    };
  }

  function startDraw(event: ReactPointerEvent<SVGSVGElement>) {
    if (!canWrite || imageDrag) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDraftStroke({
      id: `stroke-${Date.now()}`,
      author: currentUserName,
      color,
      width,
      points: [pointFromEvent(event, target)],
    });
  }

  function moveDraw(event: ReactPointerEvent<SVGSVGElement>) {
    if (canWrite && imageDrag) {
      const point = pointFromEvent(event, event.currentTarget);
      const nextImages = images.map((image) =>
        image.id === imageDrag.id
          ? {
              ...image,
              x: Math.max(0, Math.min(1200 - image.width, point.x - imageDrag.offsetX)),
              y: Math.max(0, Math.min(720 - image.height, point.y - imageDrag.offsetY)),
            }
          : image,
      );

      saveBoard({
        strokes,
        images: nextImages,
        updated_by: currentUserName,
        updated_at: Date.now(),
      });
      return;
    }

    if (!canWrite || !draftStroke) return;
    const target = event.currentTarget;
    const point = pointFromEvent(event, target);
    setDraftStroke((stroke) =>
      stroke ? { ...stroke, points: [...stroke.points, point] } : stroke,
    );
  }

  function endDraw() {
    if (imageDrag) {
      setImageDrag(null);
      return;
    }
    if (!canWrite || !draftStroke) return;
    if (draftStroke.points.length > 1) {
      saveBoard({
        strokes: [...strokes, draftStroke],
        images,
        updated_by: currentUserName,
        updated_at: Date.now(),
      });
    }
    setDraftStroke(null);
  }

  function clearBoard() {
    if (!canWrite) return;
    saveBoard({ strokes: [], images: [], updated_by: currentUserName, updated_at: Date.now() });
  }

  function uploadImage(files: FileList | null) {
    if (!canWrite) return;
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src) return;
      const image = new Image();
      image.onload = () => {
        const maxWidth = 700;
        const maxHeight = 420;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const nextWidth = Math.max(120, image.width * scale);
        const nextHeight = Math.max(90, image.height * scale);

        saveBoard({
          strokes,
          images: [
            ...images,
            {
              id: `image-${Date.now()}`,
              src,
              x: (1200 - nextWidth) / 2,
              y: (720 - nextHeight) / 2,
              width: nextWidth,
              height: nextHeight,
            },
          ],
          updated_by: currentUserName,
          updated_at: Date.now(),
        });
      };
      image.src = src;
    };
    reader.readAsDataURL(file);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function renderStroke(stroke: WhiteboardStroke) {
    const points = stroke.points.map((point) => `${point.x},${point.y}`).join(" ");
    return (
      <polyline
        key={stroke.id}
        points={points}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  function startImageDrag(
    event: ReactPointerEvent<SVGImageElement>,
    image: WhiteboardImage,
    full: boolean,
  ) {
    if (!canWrite) return;
    const target = full ? fullSvgRef.current : svgRef.current;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, target);
    setDraftStroke(null);
    setImageDrag({
      id: image.id,
      offsetX: point.x - image.x,
      offsetY: point.y - image.y,
    });
  }

  function boardTools(compact = false) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "rounded-2xl border border-border bg-background/90 p-2 shadow-elevated backdrop-blur" : ""}`}>
        {canWrite && (
          <>
            {["#8b5cf6", "#06b6d4", "#10b981", "#f97316", "#ef4444", "#111827"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setColor(item)}
                aria-label={`Use ${item}`}
                className={`h-8 w-8 rounded-full border-2 ${color === item ? "border-foreground" : "border-border"}`}
                style={{ backgroundColor: item }}
              />
            ))}
            <input
              type="range"
              min={2}
              max={14}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              className="w-28 accent-primary"
              aria-label="Brush size"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-primary/60 hover:text-primary"
            >
              <ImageIcon className="h-4 w-4" />
              Image
            </button>
            <button
              type="button"
              onClick={clearBoard}
              className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:border-destructive/60 hover:text-destructive"
            >
              Clear
            </button>
          </>
        )}
        {!compact && (
          <button
            type="button"
            onClick={() => setFullPage(true)}
            className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Full page
          </button>
        )}
      </div>
    );
  }

  function boardSurface(ref: RefObject<SVGSVGElement | null>, full = false) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 1200 720"
        className={`w-full touch-none bg-white shadow-elevated ${
          full ? "h-full rounded-none border-0" : "aspect-video rounded-2xl border border-border"
        } ${canWrite ? "cursor-crosshair" : "cursor-default"}`}
        onPointerDown={startDraw}
        onPointerMove={moveDraw}
        onPointerUp={endDraw}
        onPointerCancel={endDraw}
      >
        <defs>
          <pattern id={full ? "whiteboard-grid-full" : "whiteboard-grid"} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1200" height="720" fill={`url(#${full ? "whiteboard-grid-full" : "whiteboard-grid"})`} />
        {images.map((image) => (
          <image
            key={image.id}
            href={image.src}
            x={image.x}
            y={image.y}
            width={image.width}
            height={image.height}
            preserveAspectRatio="xMidYMid meet"
            className={canWrite ? "cursor-move" : ""}
            onPointerDown={(event) => startImageDrag(event, image, full)}
          />
        ))}
        {strokes.map(renderStroke)}
        {draftStroke && renderStroke(draftStroke)}
      </svg>
    );
  }

  return (
    <div>
      {canWrite && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => uploadImage(event.target.files)}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Whiteboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "You have write access. Others can watch live."
              : `${ownerName} has write access. You can view the board live.`}
          </p>
        </div>
        {boardTools()}
      </div>

      {boardSurface(svgRef)}

      {fullPage && (
        <div className="fixed inset-0 z-[180] bg-white">
          {boardSurface(fullSvgRef, true)}
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2">
            {boardTools(true)}
            <button
              type="button"
              onClick={() => setFullPage(false)}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-background/90 text-muted-foreground shadow-elevated backdrop-blur hover:border-primary/60 hover:text-primary"
              aria-label="Close full page whiteboard"
              title="Back to half page"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LetsQuizActivity({
  room,
  quiz,
  currentUserName,
  updateActivityState,
}: {
  room: StudyRoom | null;
  quiz?: LetsQuizState;
  currentUserName: string;
  updateActivityState: (patch: NonNullable<StudyRoom["activity_state"]>) => Promise<void>;
}) {
  const [subject, setSubject] = useState(room?.subject || room?.topic || "Operating Systems");
  const [questionCount, setQuestionCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const postedLeaderboardsRef = useRef<Set<string>>(new Set());
  const quizQuestions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const quizJoined = Array.isArray(quiz?.joined) ? quiz.joined : [];
  const quizAnswers = quiz?.answers || {};
  const quizProgress = quiz?.player_progress || {};
  const myProgress = quizProgress[currentUserName] || {
    current_index: Math.max(0, Number(quiz?.current_index || 0)),
    question_started_at: quiz?.question_started_at || Date.now(),
    finished: quiz?.status === "finished",
  };
  const currentIndex = Math.max(0, Number(myProgress.current_index || 0));
  const currentQuestion = quizQuestions[currentIndex];
  const isHost = quiz?.host === currentUserName;
  const userAnswers = quizAnswers[currentUserName] || {};
  const currentAnswer = currentQuestion ? userAnswers[currentQuestion.id] : undefined;
  const remainingSeconds = currentQuestion
    ? Math.max(0, Math.ceil((myProgress.question_started_at + currentQuestion.time_limit * 1000 - now) / 1000))
    : 0;
  const leaderboard = quiz ? buildLetsQuizLeaderboard(quiz) : [];
  const allPlayersFinished = Boolean(quiz && quizJoined.length > 0 && quizJoined.every((player) => quizProgress[player]?.finished));
  const myResult = quiz ? buildLetsQuizLeaderboard({ ...quiz, joined: [currentUserName] })[0] : null;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!quiz || quiz.status !== "running" || myProgress.finished || !currentQuestion || remainingSeconds > 0) return;
    advanceQuestion();
  }, [quiz?.status, currentIndex, myProgress.finished, currentQuestion?.id, remainingSeconds]);

  useEffect(() => {
    if (!room || !quiz || !allPlayersFinished || quiz.leaderboard_posted) return;
    if (currentUserName !== quizJoined[0]) return;
    const leaderboardKey = `${room.id}:${quiz.subject}:${quiz.question_started_at}`;
    if (postedLeaderboardsRef.current.has(leaderboardKey)) return;
    postedLeaderboardsRef.current.add(leaderboardKey);
    const text = buildLetsQuizLeaderboardMessage(quiz);
    void sendLetsQuizFinalReports(room.id, quiz)
      .then(() => api.sendStudyRoomMessage(room.id, text))
      .then(() =>
        updateActivityState({
          lets_quiz: {
            ...quiz,
            status: "finished",
            pdf_sent: Object.fromEntries(quizJoined.map((player) => [player, true])),
            leaderboard_posted: true,
          },
        }),
      );
  }, [room?.id, allPlayersFinished, quiz?.leaderboard_posted, currentUserName, quizJoined[0]]);

  async function startQuiz() {
    const safeCount = Math.min(20, Math.max(3, Number(questionCount) || 5));
    setGenerating(true);
    try {
      const questions = await generateLetsQuizQuestions(subject, safeCount);
      await updateActivityState({
        lets_quiz: {
          status: "waiting",
          host: currentUserName,
          subject,
          question_count: safeCount,
          questions,
          joined: [currentUserName],
          current_index: 0,
          question_started_at: Date.now(),
          player_progress: {},
          answers: {},
          pdf_sent: {},
          leaderboard_posted: false,
        },
      });
      toast.success("Quiz created. Waiting for one more player.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create quiz");
    } finally {
      setGenerating(false);
    }
  }

  async function joinQuiz() {
    if (!quiz || quizJoined.includes(currentUserName)) return;
    await updateActivityState({
      lets_quiz: {
        ...quiz,
        joined: [...quizJoined, currentUserName],
      },
    });
  }

  async function beginQuiz() {
    if (!quiz) return;
    if (quizJoined.length < 2) {
      toast.message("Wait for at least one more player to join.");
      return;
    }
    await updateActivityState({
      lets_quiz: {
        ...quiz,
        status: "running",
        current_index: 0,
        question_started_at: Date.now(),
        player_progress: Object.fromEntries(
          quizJoined.map((player) => [
            player,
            { current_index: 0, question_started_at: Date.now(), finished: false },
          ]),
        ),
      },
    });
  }

  async function answerQuestion(answerIndex: number) {
    if (!quiz || !currentQuestion || quiz.status !== "running") return;
    const elapsed = Math.min(
      currentQuestion.time_limit,
      Math.max(0, Math.round((Date.now() - myProgress.question_started_at) / 1000)),
    );
    await updateActivityState({
      lets_quiz: {
        ...quiz,
        answers: {
          ...quizAnswers,
          [currentUserName]: {
            ...(quizAnswers[currentUserName] || {}),
            [currentQuestion.id]: {
              ...(quizAnswers[currentUserName]?.[currentQuestion.id] || {}),
              answer_index: answerIndex,
              time_taken: elapsed,
            },
          },
        },
      },
    });
  }

  async function toggleBookmark() {
    if (!quiz || !currentQuestion) return;
    await updateActivityState({
      lets_quiz: {
        ...quiz,
        answers: {
          ...quizAnswers,
          [currentUserName]: {
            ...(quizAnswers[currentUserName] || {}),
            [currentQuestion.id]: {
              ...(quizAnswers[currentUserName]?.[currentQuestion.id] || {}),
              bookmarked: !currentAnswer?.bookmarked,
            },
          },
        },
      },
    });
  }

  async function advanceQuestion() {
    if (!quiz) return;
    const finished = currentIndex >= quizQuestions.length - 1;
    await updateActivityState({
      lets_quiz: {
        ...quiz,
        status: "running",
        player_progress: {
          ...quizProgress,
          [currentUserName]: {
            current_index: finished ? currentIndex : currentIndex + 1,
            question_started_at: Date.now(),
            finished,
            finished_at: finished ? Date.now() : undefined,
          },
        },
      },
    });
  }

  async function resetQuiz() {
    await updateActivityState({ lets_quiz: null });
  }

  if (!quiz) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Let's Quiz</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Host a live MCQ battle. Questions move from easy to medium, hard, then expert.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Subject
            </span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none focus:border-primary/70"
              placeholder="Operating Systems"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Number of questions
            </span>
            <input
              type="number"
              min={3}
              max={20}
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none focus:border-primary/70"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={startQuiz}
          disabled={generating}
          className="mt-5 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {generating ? "Generating quiz..." : "Start Let's Quiz"}
        </button>
      </div>
    );
  }

  if (quiz.status === "waiting") {
    const joined = quizJoined.includes(currentUserName);
    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Waiting Room</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {quiz.host} started a {quiz.question_count}-question {quiz.subject} quiz.
        </p>
        <div className="mt-5 rounded-2xl border border-border bg-card/40 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Joined players
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {quizJoined.map((player) => (
              <span key={player} className="rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">
                {player}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {!joined && (
            <button
              type="button"
              onClick={joinQuiz}
              className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Join quiz
            </button>
          )}
          {isHost && (
            <button
              type="button"
              onClick={beginQuiz}
              className="rounded-xl border border-success/50 bg-success/10 px-4 py-2 text-sm font-bold text-success"
            >
              Begin when ready
            </button>
          )}
          {isHost && (
            <button
              type="button"
              onClick={resetQuiz}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:border-destructive/60 hover:text-destructive"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    );
  }

  if (quiz.status === "finished" || allPlayersFinished) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Final Leaderboard</h2>
        <LeaderboardTable rows={leaderboard} />
        {isHost && (
          <button
            type="button"
            onClick={resetQuiz}
            className="mt-5 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:border-primary/60 hover:text-primary"
          >
            Start another quiz
          </button>
        )}
      </div>
    );
  }

  if (myProgress.finished) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Your Quiz Result</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your report PDF is being sent to the room chat. The global leaderboard appears when everyone finishes.
        </p>
        {myResult && (
          <div className="mt-5 rounded-2xl border border-primary/40 bg-primary/10 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your score</div>
            <div className="mt-2 font-display text-5xl font-bold">{myResult.score.toFixed(2)}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {myResult.correct} correct / {myResult.wrong} wrong / {myResult.time}s
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">
            Question {currentIndex + 1} / {quizQuestions.length} - {currentQuestion.difficulty}
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">{quiz.subject}</h2>
        </div>
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-5 py-3 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Timer</div>
          <div className="font-display text-3xl font-bold">{remainingSeconds}s</div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card/40 p-5">
        <p className="text-lg font-bold leading-relaxed">{currentQuestion.text}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => answerQuestion(index)}
              className={`rounded-xl border p-4 text-left text-sm font-bold transition ${
                currentAnswer?.answer_index === index
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background/45 hover:border-primary/50"
              }`}
            >
              {String.fromCharCode(65 + index)}. {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleBookmark}
          className={`rounded-xl border px-4 py-2 text-sm font-bold ${
            currentAnswer?.bookmarked
              ? "border-warning/60 bg-warning/10 text-warning"
              : "border-border text-muted-foreground hover:border-warning/50 hover:text-warning"
          }`}
        >
          {currentAnswer?.bookmarked ? "Bookmarked" : "Bookmark question"}
        </button>
        <button
          type="button"
          onClick={advanceQuestion}
          className="rounded-xl bg-gradient-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {currentIndex >= quizQuestions.length - 1 ? "Finish quiz" : "Next question"}
        </button>
      </div>
    </div>
  );
}

function LeaderboardTable({
  rows,
  compact = false,
}: {
  rows: ReturnType<typeof buildLetsQuizLeaderboard>;
  compact?: boolean;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      {rows.map((row, index) => (
        <div
          key={row.player}
          className="grid grid-cols-[48px_minmax(0,1fr)_80px_80px] items-center gap-3 border-b border-border bg-background/35 px-4 py-3 last:border-b-0"
        >
          <div className="font-display text-xl font-bold text-primary">#{index + 1}</div>
          <div className="min-w-0">
            <div className="truncate font-bold">{row.player}</div>
            {!compact && (
              <div className="text-xs text-muted-foreground">
                {row.correct} correct / {row.wrong} wrong / {row.bookmarked} bookmarked
              </div>
            )}
          </div>
          <div className="text-sm font-bold">{row.score.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">{row.time}s</div>
        </div>
      ))}
    </div>
  );
}

async function sendLetsQuizPdfReport(roomId: string, quiz: LetsQuizState, player: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  const rows = buildLetsQuizLeaderboard({ ...quiz, joined: [player] });
  const result = rows[0];
  const answers = quiz.answers?.[player] || {};
  const date = new Date();
  const dateText = date.toLocaleDateString();
  const fileDate = date.toISOString().slice(0, 10);
  const safeSubject = safeReportName(quiz.subject || "quiz");
  const safePlayer = safeReportName(player || "player");
  const fileName = `${safePlayer}-${safeSubject}-${fileDate}.pdf`;

  let y = 18;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Let's Quiz Report", 14, y);
  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Player: ${player}`, 14, y);
  y += 7;
  pdf.text(`Subject: ${quiz.subject}`, 14, y);
  y += 7;
  pdf.text(`Date: ${dateText}`, 14, y);
  y += 7;
  if (result) {
    pdf.text(
      `Score: ${result.score.toFixed(2)} | Correct: ${result.correct} | Wrong: ${result.wrong} | Time: ${result.time}s`,
      14,
      y,
    );
    y += 10;
  }

  quiz.questions.forEach((question, index) => {
    if (y > 250) {
      pdf.addPage();
      y = 18;
    }
    const answer = answers[question.id];
    const selected = answer?.answer_index;
    const correct = question.correct_index;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(20, 20, 30);
    const questionLines = pdf.splitTextToSize(`${index + 1}. ${question.text}`, 180);
    pdf.text(questionLines, 14, y);
    y += questionLines.length * 6 + 2;

    question.options.forEach((option, optionIndex) => {
      const isCorrect = optionIndex === correct;
      const isWrongSelected = optionIndex === selected && selected !== correct;
      if (isCorrect) pdf.setTextColor(0, 150, 90);
      else if (isWrongSelected) pdf.setTextColor(220, 40, 60);
      else pdf.setTextColor(70, 75, 95);
      pdf.setFont("helvetica", isCorrect || isWrongSelected ? "bold" : "normal");
      const prefix = `${String.fromCharCode(65 + optionIndex)}. `;
      const lines = pdf.splitTextToSize(`${prefix}${option}`, 176);
      pdf.text(lines, 18, y);
      y += lines.length * 5 + 1;
    });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(95, 100, 120);
    pdf.text(
      `Your answer: ${selected === undefined ? "Not answered" : String.fromCharCode(65 + selected)} | Correct: ${String.fromCharCode(65 + correct)}`,
      18,
      y,
    );
    y += 10;
  });

  const dataUrl = pdf.output("datauristring");
  const base64 = dataUrl.split(",")[1] || "";
  const byteSize = Math.max(1, Math.ceil((base64.length * 3) / 4));

  await api.sendStudyRoomMessage(roomId, `${player}'s Let's Quiz report for ${quiz.subject}`, [
    {
      name: fileName,
      type: "application/pdf",
      size: byteSize,
      data_url: dataUrl,
    },
  ]);
}

async function sendLetsQuizFinalReports(roomId: string, quiz: LetsQuizState) {
  const players = Array.isArray(quiz.joined) ? quiz.joined : [];
  for (const player of players) {
    await sendLetsQuizPdfReport(roomId, quiz, player);
  }
}

function safeReportName(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "quiz";
}

async function generateLetsQuizQuestions(subject: string, count: number) {
  const prompt = `Generate exactly ${count} MCQ questions for a live quiz on "${subject}". Return only JSON array. Each item must have text, options array of 4 strings, correct_index 0-3. Difficulty must progress from Easy to Medium to Hard to Expert.`;
  try {
    const response = await api.askTutor([{ role: "user", content: prompt }]);
    const parsed = parseLetsQuizQuestions(response.content, count);
    if (parsed.length) return parsed;
  } catch {
    // Fallback keeps the room quiz usable when AI/network output is not valid JSON.
  }
  return fallbackLetsQuizQuestions(subject, count);
}

function parseLetsQuizQuestions(content: string, count: number): LetsQuizQuestion[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const items = JSON.parse(match[0]);
    if (!Array.isArray(items)) return [];
    return items.slice(0, count).map((item, index) => normalizeLetsQuizQuestion(item, index, count));
  } catch {
    return [];
  }
}

function normalizeLetsQuizQuestion(item: any, index: number, count: number): LetsQuizQuestion {
  const difficulty = letsQuizDifficulty(index, count);
  const options = Array.isArray(item.options) ? item.options.map(String).slice(0, 4) : [];
  while (options.length < 4) options.push(`Option ${options.length + 1}`);
  return {
    id: `q-${index + 1}-${Date.now()}`,
    difficulty,
    text: String(item.text || item.question || `Question ${index + 1}`),
    options,
    correct_index: Math.min(3, Math.max(0, Number(item.correct_index ?? item.answer_index ?? 0))),
    time_limit: letsQuizTimeLimit(difficulty),
  };
}

function fallbackLetsQuizQuestions(subject: string, count: number): LetsQuizQuestion[] {
  return Array.from({ length: count }, (_, index) => {
    const difficulty = letsQuizDifficulty(index, count);
    return {
      id: `fallback-${index + 1}-${Date.now()}`,
      difficulty,
      text: `${difficulty}: Which statement best matches a core concept of ${subject}?`,
      options: [
        `${subject} concepts should be applied with definitions and examples.`,
        `${subject} questions never require analysis.`,
        `${subject} has no relation to exams.`,
        `${subject} can be answered without reading the question.`,
      ],
      correct_index: 0,
      time_limit: letsQuizTimeLimit(difficulty),
    };
  });
}

function letsQuizDifficulty(index: number, count: number): LetsQuizQuestion["difficulty"] {
  const progress = index / Math.max(1, count - 1);
  if (progress < 0.3) return "Easy";
  if (progress < 0.6) return "Medium";
  if (progress < 0.85) return "Hard";
  return "Expert";
}

function letsQuizTimeLimit(difficulty: LetsQuizQuestion["difficulty"]) {
  if (difficulty === "Easy") return 30;
  if (difficulty === "Medium") return 45;
  if (difficulty === "Hard") return 60;
  return 75;
}

function buildLetsQuizLeaderboard(quiz: LetsQuizState) {
  const joined = Array.isArray(quiz.joined) ? quiz.joined : [];
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const allAnswers = quiz.answers || {};
  return joined
    .map((player) => {
      const answers = allAnswers[player] || {};
      let score = 0;
      let correct = 0;
      let wrong = 0;
      let time = 0;
      let bookmarked = 0;
      questions.forEach((question) => {
        const answer = answers[question.id];
        if (answer?.bookmarked) bookmarked += 1;
        if (typeof answer?.time_taken === "number") time += answer.time_taken;
        if (answer?.answer_index === undefined) return;
        if (answer.answer_index === question.correct_index) {
          score += 1;
          correct += 1;
        } else {
          score -= 0.25;
          wrong += 1;
        }
      });
      return { player, score, correct, wrong, time, bookmarked };
    })
    .sort((a, b) => b.score - a.score || a.time - b.time || a.player.localeCompare(b.player));
}

function buildLetsQuizLeaderboardMessage(quiz: LetsQuizState) {
  const rows = buildLetsQuizLeaderboard(quiz);
  return [
    `Let's Quiz leaderboard - ${quiz.subject}`,
    ...rows.map(
      (row, index) =>
        `${index + 1}. ${row.player} - ${row.score.toFixed(2)} pts (${row.correct} correct, ${row.wrong} wrong, ${row.time}s)`,
    ),
  ].join("\n");
}

function CallSetupModal({
  minutes,
  setMinutes,
  close,
  start,
}: {
  minutes: number;
  setMinutes: (value: number) => void;
  close: () => void;
  start: (mode: "voice" | "video") => void;
}) {
  return (
    <ModalShell title="Join Call" close={close}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-background/35 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Focus time
          </div>
          <div className="mt-3 font-display text-4xl font-bold">{minutes}:00</div>
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="mt-4 w-full accent-primary"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => start("voice")}
            className="rounded-2xl border border-border bg-background/45 p-4 text-left transition hover:border-success/70 hover:bg-success/10"
          >
            <Mic className="h-6 w-6 text-success" />
            <div className="mt-3 font-display text-lg font-bold">Join with voice</div>
            <p className="mt-1 text-sm text-muted-foreground">Use microphone only.</p>
          </button>
          <button
            type="button"
            onClick={() => start("video")}
            className="rounded-2xl border border-border bg-background/45 p-4 text-left transition hover:border-primary/70 hover:bg-primary/10"
          >
            <Video className="h-6 w-6 text-primary" />
            <div className="mt-3 font-display text-lg font-bold">Join with video</div>
            <p className="mt-1 text-sm text-muted-foreground">Use camera and microphone.</p>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function streamHasVideo(stream?: MediaStream) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
}

function StudyCallPanel({
  mode,
  videoRef,
  stream,
  micEnabled,
  cameraEnabled,
  hasVideo,
  minutes,
  setMinutes,
  remotePeers,
  activitySessions,
  activeActivitySessionId,
  openActivitySession,
  toggleMic,
  toggleCamera,
  openActivities,
  leaveCall,
}: {
  mode: "voice" | "video";
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  hasVideo: boolean;
  minutes: number;
  setMinutes: (value: number) => void;
  remotePeers: RemotePeer[];
  activitySessions: RoomActivitySession[];
  activeActivitySessionId: string;
  openActivitySession: (session: RoomActivitySession) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  openActivities: () => void;
  leaveCall: () => void;
}) {
  const visiblePeers = remotePeers.slice(0, 5);
  const showVideoLayout =
    mode === "video" ||
    Boolean(stream?.getVideoTracks().length) ||
    visiblePeers.some((peer) => streamHasVideo(peer.stream));
  const activeSessions = activitySessions.slice(-5).reverse();
  const activityRail = activeSessions.length ? (
    <ActiveActivityRail
      sessions={activeSessions}
      activeSessionId={activeActivitySessionId}
      openActivitySession={openActivitySession}
    />
  ) : null;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-card/20 p-3 pb-32 sm:p-5 sm:pb-28">
      <div className="mb-3">
        <div>
          <div className="font-display text-lg font-bold">
            {mode === "video" ? "Video classroom" : "Voice focus room"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Shared focus timer: {minutes}:00</div>
        </div>
      </div>

      {showVideoLayout ? (
        <div className={`grid flex-1 gap-3 ${activityRail ? "xl:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative min-h-[180px] overflow-hidden rounded-2xl border border-primary/40 bg-black shadow-elevated sm:min-h-[230px]">
              {hasVideo && stream ? (
                <>
                  <LocalVideoTile stream={stream} videoRef={videoRef} visible={cameraEnabled} />
                  {!cameraEnabled && <VideoPlaceholder name="You" icon={Video} />}
                </>
              ) : (
                <VideoPlaceholder name="You" icon={Video} />
              )}
              <TileBadge name="You" status={cameraEnabled ? "Camera on" : "Camera off"} />
            </div>
            {visiblePeers.map((peer) => {
              const peerHasVideo = streamHasVideo(peer.stream);
              return (
                <div
                  key={peer.socketId}
                  className="relative min-h-[180px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card/80 to-background/70 sm:min-h-[230px]"
                >
                  {peer.stream && peerHasVideo ? (
                    <RemoteVideoTile stream={peer.stream} />
                  ) : (
                    <VideoPlaceholder name={peer.name} icon={Users} />
                  )}
                  <TileBadge
                    name={peer.name}
                    status={peerHasVideo ? "Camera on" : peer.stream ? "Voice only" : "connecting"}
                  />
                </div>
              );
            })}
          </div>
          {activityRail}
        </div>
      ) : (
        <div className={`grid flex-1 gap-3 pt-4 ${activityRail ? "xl:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
          <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <VoiceTile name="You" active={micEnabled} />
            {visiblePeers.map((peer) => (
              <VoiceTile key={peer.socketId} name={peer.name} active={Boolean(peer.stream)} />
            ))}
          </div>
          {activityRail}
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 flex w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-background/80 px-3 py-3 shadow-elevated backdrop-blur-md sm:bottom-5 sm:w-auto sm:gap-3 sm:px-4">
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="w-24 accent-primary sm:w-32"
          aria-label="Focus timer minutes"
        />
        <CallControlButton
          label={micEnabled ? "Turn microphone off" : "Turn microphone on"}
          icon={Mic}
          active={micEnabled}
          onClick={toggleMic}
        />
        <CallControlButton
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          icon={cameraEnabled ? Camera : CameraOff}
          active={cameraEnabled}
          onClick={toggleCamera}
        />
        <CallControlButton
          label="Activities"
          icon={Trophy}
          active
          onClick={openActivities}
        />
        <CallControlButton
          label="Leave call"
          icon={PhoneOff}
          danger
          onClick={leaveCall}
        />
      </div>
    </section>
  );
}

function ActiveActivityRail({
  sessions,
  activeSessionId,
  openActivitySession,
}: {
  sessions: RoomActivitySession[];
  activeSessionId: string;
  openActivitySession: (session: RoomActivitySession) => void;
}) {
  return (
    <aside className="min-w-0 rounded-2xl border border-border bg-background/45 p-3 shadow-elevated">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Trophy className="h-4 w-4 text-secondary" />
        Started activities
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:max-h-[520px] xl:space-y-2 xl:overflow-y-auto xl:pb-0">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => openActivitySession(session)}
            className={`min-w-44 rounded-xl border p-3 text-left transition xl:w-full ${
              activeSessionId === session.id
                ? "border-primary bg-primary/15"
                : "border-border bg-card/45 hover:border-primary/60"
            }`}
          >
            <div className="line-clamp-1 text-sm font-black text-foreground">{session.title}</div>
            <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              Started by {session.started_by}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function LocalVideoTile({
  stream,
  videoRef,
  visible,
}: {
  stream: MediaStream;
  videoRef: RefObject<HTMLVideoElement | null>;
  visible: boolean;
}) {
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, videoRef, visible]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={`absolute inset-0 h-full min-h-[230px] w-full object-cover transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function RemoteVideoTile({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline className="h-full min-h-[230px] w-full object-cover" />;
}

function CallControlButton({
  label,
  icon: Icon,
  active = false,
  danger = false,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const classes = danger
    ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
    : active
      ? "border-success/50 bg-success/10 text-success hover:bg-success/15"
      : "border-border bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-12 w-12 place-items-center rounded-full border transition ${classes}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function VideoPlaceholder({
  name,
  icon: Icon,
}: {
  name: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="grid h-full min-h-[230px] place-items-center bg-[radial-gradient(circle_at_center,oklch(0.58_0.22_280_/_0.26),transparent_62%)]">
      <div className="grid place-items-center gap-3">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
          <Icon className="h-8 w-8" />
        </div>
        <div className="text-sm font-bold text-muted-foreground">{name}</div>
      </div>
    </div>
  );
}

function TileBadge({ name, status }: { name: string; status: string }) {
  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs backdrop-blur-md">
      <span className="font-bold text-white">{name}</span>
      <span className="text-white/70">{status}</span>
    </div>
  );
}

function VoiceTile({ name, active }: { name: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/35 p-4">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary">
        <Mic className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{name}</div>
        <div className={active ? "text-xs text-success" : "text-xs text-muted-foreground"}>
          {active ? "Connected" : "Waiting"}
        </div>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className={`glass gradient-border w-full rounded-2xl p-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          <button
            type="button"
            onClick={close}
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background/50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/70"
      />
    </label>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

let youtubeIframeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise<void>((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

function getSyncedYouTubeTime(currentTime: number, playing: boolean, updatedAt: number) {
  const baseTime = Math.max(0, Number(currentTime) || 0);
  if (!playing || !updatedAt) return baseTime;
  return Math.max(0, baseTime + (Date.now() - updatedAt) / 1000);
}

function getYouTubeVideoId(url: string) {
  const value = url.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    let id = "";
    if (parsed.hostname.includes("youtu.be")) {
      id = parsed.pathname.replace("/", "");
    } else if (parsed.hostname.includes("youtube.com")) {
      id = parsed.searchParams.get("v") || "";
      if (!id && parsed.pathname.includes("/embed/")) id = parsed.pathname.split("/embed/")[1] || "";
      if (!id && parsed.pathname.includes("/shorts/")) id = parsed.pathname.split("/shorts/")[1] || "";
    }
    return id ? id.split(/[?&/]/)[0] : "";
  } catch {
    return "";
  }
}
