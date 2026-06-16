import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useFriends } from "../../context/FriendContext";
import { FriendRecord, FriendRequestRecord } from "../../friendships";

interface AccountTabProps {
  setMessage: (msg: string) => void;
}

function getFriendDisplayName(friend: FriendRecord) {
  return (
    friend.customNickname?.trim() ||
    friend.profileNickname?.trim() ||
    friend.username
  );
}

function getIncomingRequestDisplayName(request: FriendRequestRecord) {
  return request.fromDisplayName?.trim() || request.fromUsername;
}

function formatActivityDate(dateString: string | null): string {
  if (!dateString) {
    return "剛剛";
  }
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return "剛剛";
  }
  return parsed.toLocaleString("zh-TW");
}

function formatInviteExpiry(dateString: string | null): string {
  if (!dateString) {
    return "短效邀請";
  }
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return "短效邀請";
  }
  return `有效至 ${parsed.toLocaleString("zh-TW")}`;
}

export default function AccountTab({ setMessage }: AccountTabProps) {
  const {
    currentUser,
    currentUsername,
    updateOwnNickname,
  } = useAuth();

  const {
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    activeFriendInvite,
    friendInviteQrDataUrl,
    activeFriendInviteUrl,
    friendDraft,
    setFriendDraft,
    nicknameDraft,
    setNicknameDraft,
    friendNicknameDrafts,
    setFriendNicknameDrafts,
    expandedFriendUids,
    setExpandedFriendUids,
    addFriend,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    deleteFriend,
    createInvite,
    updateFriendNickname,
  } = useFriends();

  const handleSaveOwnNickname = async () => {
    if (!currentUser) {
      setMessage("請先登入，再設定暱稱。");
      return;
    }
    try {
      await updateOwnNickname(nicknameDraft);
      setMessage("已儲存你的暱稱設定。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存暱稱失敗。");
    }
  };

  const toggleFriendDetails = (friendUid: string) => {
    setExpandedFriendUids((current) =>
      current.includes(friendUid)
        ? current.filter((uid) => uid !== friendUid)
        : [...current, friendUid],
    );
  };

  const updateFriendNicknameDraft = (friendUid: string, value: string) => {
    setFriendNicknameDrafts((current) => ({
      ...current,
      [friendUid]: value,
    }));
  };

  const handleSaveFriendNickname = async (friend: FriendRecord) => {
    const draft = friendNicknameDrafts[friend.friendUid] ?? "";
    await updateFriendNickname(friend, draft, setMessage);
  };

  const handleResetFriendNickname = async (friend: FriendRecord) => {
    setFriendNicknameDrafts((current) => {
      const next = { ...current };
      delete next[friend.friendUid];
      return next;
    });
    await updateFriendNickname(friend, "", setMessage);
  };

  const renderIncomingFriendAlertCard = () => {
    if (!currentUser || incomingFriendRequests.length === 0) {
      return null;
    }

    return (
      <section className="friend-alert-card">
        <div className="friend-alert-card-head">
          <strong>有人送出好友邀請</strong>
          <span>{incomingFriendRequests.length} 筆待處理</span>
        </div>
        <div className="friend-alert-list">
          {incomingFriendRequests.map((request) => (
            <div className="friend-alert-item" key={request.id}>
              <div className="friend-alert-copy">
                <strong>{getIncomingRequestDisplayName(request)}</strong>
                <small>送出時間 {formatActivityDate(request.createdAt)}</small>
              </div>
              <div className="friend-row-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void acceptRequest(request, setMessage);
                  }}
                  type="button"
                >
                  同意
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void rejectRequest(request, setMessage);
                  }}
                  type="button"
                >
                  拒絕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>帳號管理</h2>
        </div>
      </div>
      {renderIncomingFriendAlertCard()}

      <div className="account-center-grid">
        <article className="account-card">
          <h3>基本資料</h3>
          <div className="auth-profile-grid">
            <div>
              <strong>帳號</strong>
              <div>{currentUser ? currentUsername : "尚未登入"}</div>
            </div>
            <div>
              <strong>我的暱稱</strong>
              {currentUser ? (
                <div className="friend-alias-form">
                  <input
                    onChange={(event) => setNicknameDraft(event.target.value)}
                    placeholder="例如 王老師、小熊教練"
                    type="text"
                    value={nicknameDraft}
                  />
                  <div className="friend-row-actions">
                    <button
                      className="primary-button"
                      onClick={() => {
                        void handleSaveOwnNickname();
                      }}
                      type="button"
                    >
                      儲存暱稱
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => setNicknameDraft("")}
                      type="button"
                    >
                      清空
                    </button>
                  </div>
                </div>
              ) : (
                <div>尚未登入</div>
              )}
            </div>
            <div>
              <strong>狀態</strong>
              <div>{currentUser ? "已登入" : "尚未登入"}</div>
            </div>
          </div>
        </article>

        <article className="account-card">
          <div className="account-card-head">
            <div>
              <h3>好友列表</h3>
            </div>
          </div>
          {!currentUser ? (
            <div className="friend-empty-state">
              <strong>尚未登入</strong>
              <p>登入後才會顯示你的好友列表。</p>
            </div>
          ) : friends.length === 0 ? (
            <div className="friend-empty-state">
              <strong>目前還沒有好友</strong>
              <p>可以先從上方輸入帳號送出邀請，等對方確認後會顯示在這裡。</p>
            </div>
          ) : (
            <div className="friend-list">
              {friends.map((friend) => {
                const isExpanded = expandedFriendUids.includes(friend.friendUid);
                return (
                  <div className="friend-row" key={friend.friendUid}>
                    <div className="friend-row-summary">
                      <strong>{getFriendDisplayName(friend)}</strong>
                      <button
                        className="secondary-button"
                        onClick={() => toggleFriendDetails(friend.friendUid)}
                        type="button"
                      >
                        {isExpanded ? "收合" : "展開"}
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="friend-row-main">
                        <div className="friend-identity">
                          <small>帳號：{friend.username}</small>
                          {friend.customNickname ? (
                            <small>
                              好友原本暱稱：
                              {friend.profileNickname || friend.username}
                            </small>
                          ) : null}
                        </div>
                        <div className="friend-alias-form">
                          <input
                            onChange={(event) =>
                              updateFriendNicknameDraft(
                                friend.friendUid,
                                event.target.value,
                              )
                            }
                            placeholder={friend.profileNickname || friend.username}
                            type="text"
                            value={friendNicknameDrafts[friend.friendUid] ?? ""}
                          />
                          <div className="friend-row-actions">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void handleSaveFriendNickname(friend);
                              }}
                              type="button"
                            >
                              儲存備註
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => {
                                void handleResetFriendNickname(friend);
                              }}
                              type="button"
                            >
                              恢復好友暱稱
                            </button>
                          </div>
                        </div>
                        <div className="friend-row-footer">
                          <small>
                            成為好友時間 {formatActivityDate(friend.addedAt)}
                          </small>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              void deleteFriend(friend, setMessage);
                            }}
                            type="button"
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="account-card">
          <div className="account-card-head">
            <div>
              <h3>好友邀請</h3>
            </div>
          </div>

          <div className="friend-section">
            <div className="friend-section-header">
              <h4>新增好友</h4>
              <button
                className="secondary-button"
                disabled={!currentUser}
                onClick={() => {
                  void createInvite(setMessage);
                }}
                type="button"
              >
                顯示行動條碼
              </button>
            </div>

            <div className="friend-toolbar">
              <input
                disabled={!currentUser}
                onChange={(event) => setFriendDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addFriend(setMessage);
                  }
                }}
                placeholder="輸入好友帳號，例如 coach.lin"
                type="text"
                value={friendDraft}
              />
              <button
                className="primary-button"
                disabled={!currentUser}
                onClick={() => {
                  void addFriend(setMessage);
                }}
                type="button"
              >
                送出邀請
              </button>
            </div>

            {activeFriendInvite && friendInviteQrDataUrl ? (
              <div className="friend-qr-card">
                <img
                  alt={`加 ${activeFriendInvite.issuedByUsername} 好友的 QR Code`}
                  className="friend-qr-image"
                  src={friendInviteQrDataUrl}
                />
                <div className="friend-qr-copy">
                  <strong>
                    {activeFriendInvite.issuedByDisplayName ||
                      activeFriendInvite.issuedByUsername}
                  </strong>
                  <small>{formatInviteExpiry(activeFriendInvite.expiresAt)}</small>
                  <p>讓對方掃描後登入自己的帳號，就能送出好友邀請給你。</p>
                  {activeFriendInviteUrl ? (
                    <a
                      className="friend-qr-link"
                      href={activeFriendInviteUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {activeFriendInviteUrl}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {!currentUser ? (
            <div className="friend-empty-state">
              <strong>尚未登入</strong>
              <p>登入後才會顯示你的好友列表，也才能送出好友邀請。</p>
            </div>
          ) : (
            <>
              <div className="friend-section">
                <h4>收到的邀請</h4>
                {incomingFriendRequests.length === 0 ? (
                  <div className="friend-empty-state">
                    <strong>目前沒有待確認邀請</strong>
                    <p>之後如果有老師加你好友，這裡會即時顯示。</p>
                  </div>
                ) : (
                  <div className="friend-list">
                    {incomingFriendRequests.map((request) => (
                      <div className="friend-row friend-row-alert" key={request.id}>
                        <div>
                          <strong>{getIncomingRequestDisplayName(request)}</strong>
                          <small>
                            送出時間 {formatActivityDate(request.createdAt)}
                          </small>
                        </div>
                        <div className="friend-row-actions">
                          <button
                            className="primary-button"
                            onClick={() => {
                              void acceptRequest(request, setMessage);
                            }}
                            type="button"
                          >
                            同意
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              void rejectRequest(request, setMessage);
                            }}
                            type="button"
                          >
                            拒絕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="friend-section">
                <h4>已送出的邀請</h4>
                {outgoingFriendRequests.length === 0 ? (
                  <div className="friend-empty-state">
                    <strong>目前沒有送出的邀請</strong>
                    <p>你送出的好友邀請會先留在這裡，等待對方確認。</p>
                  </div>
                ) : (
                  <div className="friend-list">
                    {outgoingFriendRequests.map((request) => (
                      <div className="friend-row" key={request.id}>
                        <div>
                          <strong>{request.toDisplayName || request.toUsername}</strong>
                          <small>
                            送出時間 {formatActivityDate(request.createdAt)}
                          </small>
                        </div>
                        <div className="friend-row-actions">
                          <span className="status-chip">等待對方確認</span>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              void cancelRequest(request, setMessage);
                            }}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
