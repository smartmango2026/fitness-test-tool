import { test, expect } from "@playwright/test";
import { doc, getDoc } from "firebase/firestore";
import { registerWithUsername, signInWithUsername } from "../../src/firebase-auth";
import { sendFriendRequest } from "../../src/friendships";
import { db } from "../../src/firebase";

test.describe("Backend API & Firestore Integration Tests", () => {
  test("direct friendship request API test without browser UI", async ({}, testInfo) => {
    // Increase timeout for network API calls
    test.setTimeout(20000);

    const timestamp = Date.now();
    const usernameA = `api_teacher_a_${timestamp}`;
    const usernameB = `api_teacher_b_${timestamp}`;

    testInfo.annotations.push({
      type: "Test Purpose",
      description: "Directly verify backend APIs and Firestore document flow without UI simulation"
    });
    testInfo.annotations.push({
      type: "Test API Accounts",
      description: `User A: ${usernameA} | User B: ${usernameB}`
    });

    console.log(`[API Test] Registering User A: ${usernameA}...`);
    // 1. Register User A
    const userA = await registerWithUsername(usernameA, "test123456");
    expect(userA.uid).toBeTruthy();

    console.log(`[API Test] Registering User B: ${usernameB}...`);
    // 2. Register User B
    const userB = await registerWithUsername(usernameB, "test123456");
    expect(userB.uid).toBeTruthy();

    // Small delay to let users write settle
    await new Promise((r) => setTimeout(r, 1000));

    console.log(`[API Test] Signing in as User A to set auth context...`);
    await signInWithUsername(usernameA, "test123456");

    console.log(`[API Test] Sending Friend Request from User A to User B...`);
    // 3. Send friend request via backend API directly
    await sendFriendRequest({
      fromUid: userA.uid,
      fromUsername: usernameA,
      fromDisplayName: "API老師A",
      targetUsername: usernameB,
    });

    console.log(`[API Test] Verifying friendRequests collection...`);
    // 4. Directly read Firestore to assert document status
    const requestDocRef = doc(db, "friendRequests", `${userA.uid}__${userB.uid}`);
    const docSnap = await getDoc(requestDocRef);

    expect(docSnap.exists()).toBe(true);
    expect(docSnap.data()?.fromUsername).toBe(usernameA);
    expect(docSnap.data()?.toUsername).toBe(usernameB);
    expect(docSnap.data()?.status).toBe("pending");
    console.log(`[API Test] Verification successful! Friendship record found.`);
  });
});
