import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ensureAbilityRulesConfig } from "../../domain/ability-cloud";
import { auth, db } from "../../services/firebase";

const USERNAME_EMAIL_DOMAIN = "fitness-test.local";
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function subscribeToAuthState(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(username));
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string | null | undefined): string {
  if (!email) {
    return "";
  }

  const suffix = `@${USERNAME_EMAIL_DOMAIN}`;
  if (email.endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }

  return email;
}

export async function signInWithUsername(
  username: string,
  password: string,
): Promise<User> {
  const result = await signInWithEmailAndPassword(
    auth,
    usernameToEmail(username),
    password,
  );
  return result.user;
}

export async function registerWithUsername(
  username: string,
  password: string,
): Promise<User> {
  const normalizedUsername = normalizeUsername(username);
  const result = await createUserWithEmailAndPassword(
    auth,
    usernameToEmail(normalizedUsername),
    password,
  );
  await updateProfile(result.user, {
    displayName: normalizedUsername,
  });
  await setDoc(
    doc(db, "users", result.user.uid),
    {
      username: normalizedUsername,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "active",
    },
    { merge: true },
  );
  await ensureAbilityRulesConfig(result.user.uid);
  return result.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}
