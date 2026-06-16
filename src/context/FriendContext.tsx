import React, { createContext, useContext, useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendInvite,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  sendFriendRequestFromInvite,
  subscribeToFriends,
  subscribeToIncomingFriendRequests,
  subscribeToOutgoingFriendRequests,
  updateFriendCustomNickname,
  type FriendRecord,
  type FriendInviteRecord,
  type FriendRequestRecord,
} from "../friendships";
import { recordUserAction, recordDiagnosticEvent } from "../diagnostics";
import { createSystemLogOperationId } from "../system-logs";
import { useAuth } from "./AuthContext";
import { useDiagnostics } from "./DiagnosticContext";

interface FriendInviteActionState {
  status: "idle" | "loading" | "success" | "error";
  detail: string;
}

interface FriendInviteTraceEntry {
  timestamp: string;
  status: "loading" | "success" | "error";
  detail: string;
}

interface FriendContextType {
  friends: FriendRecord[];
  incomingFriendRequests: FriendRequestRecord[];
  outgoingFriendRequests: FriendRequestRecord[];
  activeFriendInvite: FriendInviteRecord | null;
  setActiveFriendInvite: (invite: FriendInviteRecord | null) => void;
  friendInviteQrDataUrl: string;
  setFriendInviteQrDataUrl: (url: string) => void;
  activeFriendInviteUrl: string;
  setActiveFriendInviteUrl: (url: string) => void;
  scannedFriendInvite: FriendInviteRecord | null;
  setScannedFriendInvite: (invite: FriendInviteRecord | null) => void;
  friendInviteActionState: FriendInviteActionState;
  setFriendInviteActionState: (state: FriendInviteActionState) => void;
  friendInviteTraceEntries: FriendInviteTraceEntry[];
  setFriendInviteTraceEntries: React.Dispatch<React.SetStateAction<FriendInviteTraceEntry[]>>;
  friendDraft: string;
  setFriendDraft: (draft: string) => void;
  nicknameDraft: string;
  setNicknameDraft: (draft: string) => void;
  friendNicknameDrafts: Record<string, string>;
  setFriendNicknameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  expandedFriendUids: string[];
  setExpandedFriendUids: React.Dispatch<React.SetStateAction<string[]>>;
  pushFriendInviteTrace: (status: FriendInviteTraceEntry["status"], detail: string) => void;
  addFriend: (setMessage: (msg: string) => void) => Promise<void>;
  acceptRequest: (request: FriendRequestRecord, setMessage: (msg: string) => void) => Promise<void>;
  rejectRequest: (request: FriendRequestRecord, setMessage: (msg: string) => void) => Promise<void>;
  cancelRequest: (request: FriendRequestRecord, setMessage: (msg: string) => void) => Promise<void>;
  deleteFriend: (friend: FriendRecord, setMessage: (msg: string) => void) => Promise<void>;
  createInvite: (setMessage: (msg: string) => void) => Promise<void>;
  sendRequestFromQr: (setMessage: (msg: string) => void) => Promise<void>;
  updateFriendNickname: (friend: FriendRecord, nickname: string, setMessage: (msg: string) => void) => Promise<void>;
}

const FRIEND_INVITE_TRACE_STORAGE_KEY = "fitness-test-tool:friend-invite-trace";

function loadFriendInviteTrace(): FriendInviteTraceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(FRIEND_INVITE_TRACE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FriendInviteTraceEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.timestamp === "string" &&
        typeof entry.detail === "string" &&
        (entry.status === "loading" || entry.status === "success" || entry.status === "error"),
    );
  } catch {
    return [];
  }
}

function saveFriendInviteTrace(entries: FriendInviteTraceEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(
    FRIEND_INVITE_TRACE_STORAGE_KEY,
    JSON.stringify(entries.slice(0, 5)),
  );
}

const FriendContext = createContext<FriendContextType | undefined>(undefined);

export function FriendProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, currentUsername, currentDisplayName, writeAppSystemLog } = useAuth();
  const { updateLoadCheckpoint } = useDiagnostics();

  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequestRecord[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequestRecord[]>([]);
  const [activeFriendInvite, setActiveFriendInvite] = useState<FriendInviteRecord | null>(null);
  const [friendInviteQrDataUrl, setFriendInviteQrDataUrl] = useState("");
  const [activeFriendInviteUrl, setActiveFriendInviteUrl] = useState("");
  const [scannedFriendInvite, setScannedFriendInvite] = useState<FriendInviteRecord | null>(null);
  const [friendInviteActionState, setFriendInviteActionState] = useState<FriendInviteActionState>({
    status: "idle",
    detail: "",
  });
  const [friendInviteTraceEntries, setFriendInviteTraceEntries] = useState<FriendInviteTraceEntry[]>(() =>
    loadFriendInviteTrace(),
  );

  const [friendDraft, setFriendDraft] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [friendNicknameDrafts, setFriendNicknameDrafts] = useState<Record<string, string>>({});
  const [expandedFriendUids, setExpandedFriendUids] = useState<string[]>([]);

  // Friends & Requests Subscriptions
  useEffect(() => {
    if (!currentUser) {
      setFriends([]);
      setIncomingFriendRequests([]);
      setOutgoingFriendRequests([]);
      setFriendDraft("");
      setNicknameDraft("");
      setFriendNicknameDrafts({});
      return;
    }

    let incomingLoaded = false;
    let outgoingLoaded = false;

    const markFriendRequestsLoaded = () => {
      if (incomingLoaded && outgoingLoaded) {
        updateLoadCheckpoint("friendRequests", "success", "好友邀請資料已載入。");
      }
    };

    const unsubscribeFriends = subscribeToFriends(currentUser.uid, (nextFriends) => {
      setFriends(nextFriends);
      updateLoadCheckpoint("friends", "success", `好友列表已載入，共 ${nextFriends.length} 位好友。`);
    });

    const unsubscribeIncoming = subscribeToIncomingFriendRequests(currentUser.uid, (requests) => {
      setIncomingFriendRequests(requests);
      incomingLoaded = true;
      markFriendRequestsLoaded();
    });

    const unsubscribeOutgoing = subscribeToOutgoingFriendRequests(currentUser.uid, (requests) => {
      setOutgoingFriendRequests(requests);
      outgoingLoaded = true;
      markFriendRequestsLoaded();
    });

    return () => {
      unsubscribeFriends();
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [currentUser]);

  // Sync session storage invite trace
  useEffect(() => {
    saveFriendInviteTrace(friendInviteTraceEntries);
  }, [friendInviteTraceEntries]);

  // Generate QR Code when activeFriendInvite changes
  useEffect(() => {
    if (!activeFriendInvite) {
      setFriendInviteQrDataUrl("");
      setActiveFriendInviteUrl("");
      return;
    }

    const nextUrl = `${window.location.origin}${window.location.pathname}?invite=${activeFriendInvite.id}`;
    setActiveFriendInviteUrl(nextUrl);

    QRCode.toDataURL(nextUrl, { width: 256, margin: 2 })
      .then((dataUrl) => {
        setFriendInviteQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("Failed to generate friend invite QR code:", error);
        setFriendInviteQrDataUrl("");
      });
  }, [activeFriendInvite]);

  const pushFriendInviteTrace = (status: FriendInviteTraceEntry["status"], detail: string) => {
    const nextEntry: FriendInviteTraceEntry = {
      timestamp: new Date().toISOString(),
      status,
      detail,
    };
    setFriendInviteTraceEntries((current) => [nextEntry, ...current].slice(0, 10));
  };

  const addFriend = async (setMessage: (msg: string) => void) => {
    if (!currentUser) {
      setMessage("請先登入，再新增好友。");
      return;
    }

    const nextUsername = friendDraft.trim().toLowerCase();
    if (!nextUsername) {
      setMessage("請先輸入好友帳號。");
      return;
    }

    if (nextUsername === currentUsername) {
      setMessage("不能把自己加入好友列表。");
      return;
    }

    if (friends.some((friend) => friend.username === nextUsername)) {
      setMessage(`好友 ${nextUsername} 已經在列表中。`);
      return;
    }

    if (outgoingFriendRequests.some((request) => request.toUsername === nextUsername)) {
      setMessage(`已送出給 ${nextUsername} 的好友邀請，請等待對方確認。`);
      return;
    }

    if (incomingFriendRequests.some((request) => request.fromUsername === nextUsername)) {
      setMessage(`對方已送出好友邀請，請直接在下方按同意。`);
      return;
    }

    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "started",
        targetUsername: nextUsername,
        message: "開始送出好友邀請。",
        payload: { source: "manual" },
      });
      await sendFriendRequest({
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        fromDisplayName: currentDisplayName,
        targetUsername: nextUsername,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "completed",
        targetUsername: nextUsername,
        message: "已送出好友邀請。",
        payload: { source: "manual" },
      });
      setFriendDraft("");
      setMessage(`已送出給 ${nextUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "送出好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_created",
        phase: "failed",
        targetUsername: nextUsername,
        message: nextMessage,
        payload: { source: "manual" },
      });
      setMessage(nextMessage);
    }
  };

  const acceptRequest = async (request: FriendRequestRecord, setMessage: (msg: string) => void) => {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_accepted",
        phase: "started",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "開始同意好友邀請。",
      });
      await acceptFriendRequest(request);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_accepted",
        phase: "completed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "已同意好友邀請。",
      });
      setMessage(`已和 ${request.fromUsername} 成為好友。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "同意好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_accepted",
        phase: "failed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  const rejectRequest = async (request: FriendRequestRecord, setMessage: (msg: string) => void) => {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_rejected",
        phase: "started",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "開始拒絕好友邀請。",
      });
      await rejectFriendRequest(request.id);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_rejected",
        phase: "completed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: "已拒絕好友邀請。",
      });
      setMessage(`已拒絕 ${request.fromUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "拒絕好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_rejected",
        phase: "failed",
        targetUid: request.fromUid,
        targetUsername: request.fromUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  const cancelRequest = async (request: FriendRequestRecord, setMessage: (msg: string) => void) => {
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_cancelled",
        phase: "started",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: "開始取消已送出的好友邀請。",
      });
      await cancelFriendRequest(request.id);
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_cancelled",
        phase: "completed",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: "已取消已送出的好友邀請。",
      });
      setMessage(`已取消送給 ${request.toUsername} 的好友邀請。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "取消好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_cancelled",
        phase: "failed",
        targetUid: request.toUid,
        targetUsername: request.toUsername,
        requestId: request.id,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  const deleteFriend = async (friend: FriendRecord, setMessage: (msg: string) => void) => {
    if (!currentUser) return;
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_removed",
        phase: "started",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "開始移除好友。",
      });
      await removeFriend({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_removed",
        phase: "completed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "已移除好友。",
      });
      setMessage(`已移除好友 ${friend.username}。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "移除好友失敗。";
      await writeAppSystemLog({
        actionType: "friend_removed",
        phase: "failed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  const createInvite = async (setMessage: (msg: string) => void) => {
    if (!currentUser) return;
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_invite_created",
        phase: "started",
        message: "開始建立加好友邀請。",
      });
      const invite = await createFriendInvite({
        issuedByUid: currentUser.uid,
        issuedByUsername: currentUsername,
        issuedByDisplayName: currentDisplayName,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_invite_created",
        phase: "completed",
        inviteId: invite.id,
        message: "已建立加好友邀請。",
      });
      setActiveFriendInvite(invite);
      setMessage("已產生新的加好友 QR Code。");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "產生加好友 QR Code 失敗。";
      await writeAppSystemLog({
        actionType: "friend_invite_created",
        phase: "failed",
        message: nextMessage,
      });
      setMessage(nextMessage);
    }
  };

  const sendRequestFromQr = async (setMessage: (msg: string) => void) => {
    if (!currentUser || !scannedFriendInvite) return;
    try {
      setFriendInviteActionState({
        status: "loading",
        detail: "正在送出好友邀請...",
      });
      pushFriendInviteTrace("loading", "正在送出好友邀請...");

      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "started",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: "透過行動條碼送出好友邀請。",
        payload: { source: "invite" },
      });

      await sendFriendRequestFromInvite({
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        fromDisplayName: currentDisplayName,
        inviteId: scannedFriendInvite.id,
      });

      await writeAppSystemLog({
        operationId,
        actionType: "friend_request_created",
        phase: "completed",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: "已透過行動條碼送出好友邀請。",
        payload: { source: "invite" },
      });

      setFriendInviteActionState({
        status: "success",
        detail: `已成功向 ${scannedFriendInvite.issuedByUsername} 送出好友邀請！`,
      });
      pushFriendInviteTrace("success", `已向 ${scannedFriendInvite.issuedByUsername} 送出好友邀請。`);
      setMessage(`已向 ${scannedFriendInvite.issuedByUsername} 送出好友邀請。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "透過條碼送出好友邀請失敗。";
      await writeAppSystemLog({
        actionType: "friend_request_created",
        phase: "failed",
        targetUid: scannedFriendInvite.issuedByUid,
        targetUsername: scannedFriendInvite.issuedByUsername,
        inviteId: scannedFriendInvite.id,
        message: nextMessage,
        payload: { source: "invite" },
      });

      setFriendInviteActionState({
        status: "error",
        detail: nextMessage,
      });
      pushFriendInviteTrace("error", nextMessage);
      setMessage(nextMessage);
    }
  };

  const updateFriendNickname = async (friend: FriendRecord, nickname: string, setMessage: (msg: string) => void) => {
    if (!currentUser) return;
    try {
      const operationId = createSystemLogOperationId();
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_updated",
        phase: "started",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "開始變更好友暱稱。",
        payload: { nextNickname: nickname },
      });
      await updateFriendCustomNickname({
        currentUid: currentUser.uid,
        friendUid: friend.friendUid,
        customNickname: nickname.trim(),
      });
      await writeAppSystemLog({
        operationId,
        actionType: "friend_nickname_updated",
        phase: "completed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: "已變更好友暱稱。",
        payload: { nextNickname: nickname },
      });
      setMessage(`已更新好友 ${friend.username} 的暱稱。`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "變更好友暱稱失敗。";
      await writeAppSystemLog({
        actionType: "friend_nickname_updated",
        phase: "failed",
        targetUid: friend.friendUid,
        targetUsername: friend.username,
        message: nextMessage,
        payload: { nextNickname: nickname },
      });
      setMessage(nextMessage);
    }
  };

  return (
    <FriendContext.Provider
      value={{
        friends,
        incomingFriendRequests,
        outgoingFriendRequests,
        activeFriendInvite,
        setActiveFriendInvite,
        friendInviteQrDataUrl,
        setFriendInviteQrDataUrl,
        activeFriendInviteUrl,
        setActiveFriendInviteUrl,
        scannedFriendInvite,
        setScannedFriendInvite,
        friendInviteActionState,
        setFriendInviteActionState,
        friendInviteTraceEntries,
        setFriendInviteTraceEntries,
        friendDraft,
        setFriendDraft,
        nicknameDraft,
        setNicknameDraft,
        friendNicknameDrafts,
        setFriendNicknameDrafts,
        expandedFriendUids,
        setExpandedFriendUids,
        pushFriendInviteTrace,
        addFriend,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        deleteFriend,
        createInvite,
        sendRequestFromQr,
        updateFriendNickname,
      }}
    >
      {children}
    </FriendContext.Provider>
  );
}

export function useFriends() {
  const context = useContext(FriendContext);
  if (!context) {
    throw new Error("useFriends must be used within a FriendProvider");
  }
  return context;
}
