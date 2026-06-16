import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import {
  emailToUsername,
  isValidUsername,
  normalizeUsername,
  registerWithUsername,
  signInWithUsername,
  signOutCurrentUser,
  subscribeToAuthState,
} from "../firebase-auth";
import {
  ensureUserProfile,
  subscribeToUserProfile,
  type UserProfileRecord,
  updateOwnDisplayNickname,
} from "../friendships";
import {
  recordDiagnosticEvent,
  recordUserAction,
  getDiagnosticEnvironment,
  installDiagnosticErrorListeners,
} from "../diagnostics";
import {
  createSystemLogOperationId,
  writeSystemLog,
  type SystemLogEntry,
} from "../system-logs";
import { useDiagnostics } from "./DiagnosticContext";

interface AuthContextType {
  currentUser: User | null;
  currentProfile: UserProfileRecord | null;
  authReady: boolean;
  loginUsername: string;
  setLoginUsername: (username: string) => void;
  loginPassword: string;
  setLoginPassword: (password: string) => void;
  showLoginPanel: boolean;
  setShowLoginPanel: (show: boolean) => void;
  showAccountMenu: boolean;
  setShowAccountMenu: (show: boolean) => void;
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  currentUsername: string;
  currentDisplayName: string;
  writeAppSystemLog: (
    entry: Omit<SystemLogEntry, "actorUid" | "actorUsername" | "actorDisplayName"> & {
      actorUid?: string | null;
      actorUsername?: string | null;
      actorDisplayName?: string | null;
    }
  ) => Promise<void>;
  signIn: () => Promise<void>;
  register: () => Promise<void>;
  signOut: (checkDirtyAndSave: () => Promise<boolean>) => Promise<void>;
  updateOwnNickname: (nickname: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { updateLoadCheckpoint } = useDiagnostics();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfileRecord | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPanel, setShowLoginPanel] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const activeAuthUidRef = useRef<string | null>(null);

  const currentUsername =
    currentProfile?.username ||
    currentUser?.displayName ||
    emailToUsername(currentUser?.email) ||
    "未登入";
  const currentDisplayName =
    currentProfile?.displayNickname?.trim() || currentUsername;

  // Global listeners initialization moved here or kept in App.tsx?
  // Kept here is fine, but App.tsx remains layout.
  useEffect(() => {
    recordDiagnosticEvent("app.start", "前端 App 已啟動。", {
      environment: getDiagnosticEnvironment(),
    });
    return installDiagnosticErrorListeners();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let lastLoggedAt = 0;
    const handleResize = () => {
      const now = Date.now();
      if (now - lastLoggedAt < 1000) {
        return;
      }

      lastLoggedAt = now;
      recordDiagnosticEvent("environment.resize", "瀏覽器版面大小改變。", {
        environment: getDiagnosticEnvironment(),
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Auth State Listener
  useEffect(() => {
    updateLoadCheckpoint("auth", "loading", "正在確認目前是否已登入。");

    const unsubscribe = subscribeToAuthState((user) => {
      const nextUid = user?.uid ?? null;
      if (activeAuthUidRef.current !== nextUid) {
        recordDiagnosticEvent("auth.uid-changed", "登入使用者 uid 已改變，重置目前檔案狀態。", {
          previousUid: activeAuthUidRef.current,
          nextUid,
          nextUsername: user ? emailToUsername(user.email) || user.displayName || null : null,
        });
        activeAuthUidRef.current = nextUid;
        // The reset of cloud session state will be triggered at top-level App or inside FileContext/FitnessDataContext!
      }

      setCurrentUser(user);
      setAuthReady(true);

      if (user) {
        recordDiagnosticEvent("auth.signed-in", "Firebase 回報目前已登入。", {
          uid: user.uid,
          email: user.email,
          username: emailToUsername(user.email),
          displayName: user.displayName,
        });
        void ensureUserProfile(user);
        updateLoadCheckpoint(
          "auth",
          "success",
          `已登入 ${emailToUsername(user.email) || user.displayName || "使用者"}，正在載入雲端資料。`,
        );
        updateLoadCheckpoint("profile", "loading", "正在載入使用者基本資料。");
        updateLoadCheckpoint("friends", "loading", "正在載入好友列表。");
        updateLoadCheckpoint("friendRequests", "loading", "正在載入好友邀請。");
        updateLoadCheckpoint("cloudFiles", "loading", "正在載入雲端檔案與共享檔案。");
        updateLoadCheckpoint("abilityRules", "loading", "正在載入能力值對應表。");
        updateLoadCheckpoint("restoreFile", "loading", "正在判斷要恢復哪一份檔案。");
      } else {
        setCurrentProfile(null);
        updateLoadCheckpoint("auth", "success", "目前未登入。");
        updateLoadCheckpoint("profile", "waiting", "登入後才會載入使用者基本資料。");
        updateLoadCheckpoint("friends", "waiting", "登入後才會載入好友資料。");
        updateLoadCheckpoint("friendRequests", "waiting", "登入後才會載入收到與送出的好友邀請。");
        updateLoadCheckpoint("cloudFiles", "waiting", "登入後才會載入你的檔案與共享檔案。");
        updateLoadCheckpoint("abilityRules", "waiting", "登入後才會載入能力值對應表。");
        updateLoadCheckpoint("restoreFile", "waiting", "登入後會嘗試恢復上次使用的檔案。");
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Profile Listener
  useEffect(() => {
    if (!currentUser) {
      setCurrentProfile(null);
      return;
    }

    const unsubscribeProfile = subscribeToUserProfile(currentUser.uid, (profile) => {
      setCurrentProfile(profile);
      if (profile) {
        updateLoadCheckpoint("profile", "success", "使用者基本資料已載入。");
      }
    });

    return () => {
      unsubscribeProfile();
    };
  }, [currentUser]);

  const writeAppSystemLog = async (
    entry: Omit<SystemLogEntry, "actorUid" | "actorUsername" | "actorDisplayName"> & {
      actorUid?: string | null;
      actorUsername?: string | null;
      actorDisplayName?: string | null;
    }
  ): Promise<void> => {
    await writeSystemLog({
      actorUid: entry.actorUid ?? currentUser?.uid ?? null,
      actorUsername: entry.actorUsername ?? currentUsername ?? null,
      actorDisplayName: entry.actorDisplayName ?? currentProfile?.displayNickname ?? null,
      ...entry,
    });
  };

  const signIn = async () => {
    if (!loginUsername.trim() || !loginPassword) {
      throw new Error("請輸入帳號與密碼。");
    }

    if (!isValidUsername(loginUsername)) {
      throw new Error("帳號請使用 3 到 32 碼的小寫英數，可包含 .、_、-。");
    }

    const operationId = createSystemLogOperationId();
    recordUserAction("按下「登入」按鈕。", {
      username: normalizeUsername(loginUsername.trim()),
    });
    recordDiagnosticEvent("auth.sign-in-clicked", "使用者嘗試登入。", {
      username: normalizeUsername(loginUsername.trim()),
    });

    try {
      const user = await signInWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");

      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_in",
        phase: "completed",
        actorUid: user.uid,
        actorUsername: normalizeUsername(loginUsername.trim()),
        actorDisplayName: user.displayName || normalizeUsername(loginUsername.trim()),
        targetUid: user.uid,
        targetUsername: normalizeUsername(loginUsername.trim()),
        message: "已登入帳號。",
      });
    } catch (error) {
      recordDiagnosticEvent("auth.sign-in-failed", "使用者登入失敗。", {
        username: normalizeUsername(loginUsername.trim()),
        error: String(error),
      });
      throw error;
    }
  };

  const register = async () => {
    if (!loginUsername.trim() || !loginPassword) {
      throw new Error("請輸入帳號與密碼。");
    }

    if (!isValidUsername(loginUsername)) {
      throw new Error("帳號請使用 3 到 32 碼的小寫英數，可包含 .、_、-。");
    }

    if (loginPassword.length < 6) {
      throw new Error("密碼至少需要 6 個字元。");
    }

    const operationId = createSystemLogOperationId();
    recordUserAction("按下「註冊」按鈕。", {
      username: normalizeUsername(loginUsername.trim()),
    });
    recordDiagnosticEvent("auth.register-clicked", "使用者嘗試註冊。", {
      username: normalizeUsername(loginUsername.trim()),
    });

    try {
      const user = await registerWithUsername(loginUsername.trim(), loginPassword);
      setShowLoginPanel(false);
      setLoginPassword("");
      setLoginUsername("");

      await writeAppSystemLog({
        operationId,
        actionType: "user_registered",
        phase: "completed",
        actorUid: user.uid,
        actorUsername: normalizeUsername(loginUsername.trim()),
        actorDisplayName: normalizeUsername(loginUsername.trim()),
        targetUid: user.uid,
        targetUsername: normalizeUsername(loginUsername.trim()),
        message: "已建立使用者帳號。",
      });
    } catch (error) {
      recordDiagnosticEvent("auth.register-failed", "使用者註冊失敗。", {
        username: normalizeUsername(loginUsername.trim()),
        error: String(error),
      });
      throw error;
    }
  };

  const signOut = async (checkDirtyAndSave: () => Promise<boolean>) => {
    const operationId = createSystemLogOperationId();
    recordUserAction("按下「登出」按鈕。", {
      username: currentUsername,
    });
    recordDiagnosticEvent("auth.sign-out-clicked", "使用者嘗試登出。", {
      uid: currentUser?.uid ?? null,
      username: currentUsername,
    });

    const isClean = await checkDirtyAndSave();
    if (!isClean) {
      return;
    }

    try {
      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_out",
        phase: "started",
        message: "開始登出帳號。",
      });
      await signOutCurrentUser();
      await writeAppSystemLog({
        operationId,
        actionType: "user_signed_out",
        phase: "completed",
        message: "已登出帳號。",
      });
    } catch (error) {
      console.error("Sign out failed:", error);
      throw error;
    }
  };

  const updateOwnNickname = async (nickname: string) => {
    if (!currentUser) return;
    const operationId = createSystemLogOperationId();
    recordUserAction("變更自己的顯示暱稱。", {
      nickname,
    });
    try {
      await updateOwnDisplayNickname({
        uid: currentUser.uid,
        username: currentUsername,
        displayNickname: nickname,
      });
      await writeAppSystemLog({
        operationId,
        actionType: "user_nickname_updated",
        phase: "completed",
        message: "已變更自己的顯示暱稱。",
      });
    } catch (error) {
      recordDiagnosticEvent("auth.update-nickname-failed", "更新暱稱失敗。", {
        error: String(error),
      });
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentProfile,
        authReady,
        loginUsername,
        setLoginUsername,
        loginPassword,
        setLoginPassword,
        showLoginPanel,
        setShowLoginPanel,
        showAccountMenu,
        setShowAccountMenu,
        authMode,
        setAuthMode,
        currentUsername,
        currentDisplayName,
        writeAppSystemLog,
        signIn,
        register,
        signOut,
        updateOwnNickname,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
