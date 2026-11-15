import { useEffect, useRef, useState } from "react";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  limit,
  startAt,
  endAt
} from "firebase/firestore";

import { auth, db } from "./firebase";

import {
  MessageCircle,
  Send,
  LogOut,
  Search,
  UserRound,
  ArrowRight,
  Check,
  LoaderCircle,
  Mail,
  Lock
} from "lucide-react";

const PROJECT_ID = auth.app.options.projectId;

function readableError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use": "هذا البريد مسجل بالفعل.",
    "auth/invalid-email": "البريد الإلكتروني غير صحيح.",
    "auth/weak-password": "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/operation-not-allowed": "Firebase رفض طريقة تسجيل الدخول. راجع إعداد مزود المصادقة في المشروع.",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.",
    "auth/network-request-failed": "تعذر الاتصال بالإنترنت.",
    "auth/unauthorized-domain": "نطاق الموقع غير مسموح به في Firebase Authentication.",
    "permission-denied": "قواعد Firestore لا تسمح بهذه العملية.",
    "failed-precondition": "تحقق من إعدادات Firestore أو الفهرس المطلوب."
  };

  return messages[code] || error?.message || "حدث خطأ غير معروف.";
}

function errorDetails(error) {
  return `${readableError(error)} | الرمز: ${error?.code || "غير معروف"} | المشروع: ${PROJECT_ID}`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);

  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");

  const [profiles, setProfiles] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);

  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);
  const authEventRef = useRef(0);

  // استعادة جلسة المستخدم وتحميل ملفه الشخصي
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const eventId = ++authEventRef.current;

      setAuthReady(false);
      setError("");
      setUser(currentUser);
      setProfile(null);

      if (!currentUser) {
        setActiveChat(null);
        setChats([]);
        setProfiles([]);
        setMessages([]);
        setAuthReady(true);
        return;
      }

      try {
        const profileRef = doc(db, "profiles", currentUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (eventId !== authEventRef.current) return;

        if (profileSnap.exists()) {
          setProfile(profileSnap.data());
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (eventId !== authEventRef.current) return;

        setProfile(null);
        setError(errorDetails(err));
      } finally {
        if (eventId === authEventRef.current) {
          setAuthReady(true);
        }
      }
    });

    return () => {
      authEventRef.current++;
      unsubscribe();
    };
  }, []);

  // تحميل المحادثات
  useEffect(() => {
    if (!user || !profile) {
      setChats([]);
      return;
    }

    const chatsQuery = query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid)
    );

    return onSnapshot(
      chatsQuery,
      async (snapshot) => {
        try {
          const results = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const data = chatDoc.data();
              const members = data.members || [];
              const otherId = members.find((id) => id !== user.uid);

              if (!otherId) return null;

              const otherSnap = await getDoc(
                doc(db, "profiles", otherId)
              );

              return {
                id: chatDoc.id,
                ...data,
                otherId,
                other: otherSnap.exists()
                  ? otherSnap.data()
                  : { displayName: "مستخدم", username: "" }
              };
            })
          );

          results.sort(
            (a, b) =>
              (b?.updatedAt?.seconds || 0) -
              (a?.updatedAt?.seconds || 0)
          );

          setChats(results.filter(Boolean));
        } catch (err) {
          setError(errorDetails(err));
        }
      },
      (err) => setError(errorDetails(err))
    );
  }, [user, profile]);

  // البحث المباشر في Firestore
  useEffect(() => {
    if (!user || !profile) {
      setProfiles([]);
      return;
    }

    const term = searchText.trim().replace(/^@/, "");

    if (term.length < 2) {
      setProfiles([]);
      return;
    }

    let cancelled = false;

    async function searchUsers() {
      try {
        const usernameTerm = term.toLowerCase();

        const usernameQuery = query(
          collection(db, "profiles"),
          orderBy("username"),
          startAt(usernameTerm),
          endAt(usernameTerm + "\uf8ff"),
          limit(30)
        );

        const nameQuery = query(
          collection(db, "profiles"),
          orderBy("displayName"),
          startAt(term),
          endAt(term + "\uf8ff"),
          limit(30)
        );

        const [usernameSnapshot, nameSnapshot] = await Promise.all([
          getDocs(usernameQuery),
          getDocs(nameQuery)
        ]);

        const combined = new Map();

        [...usernameSnapshot.docs, ...nameSnapshot.docs].forEach((item) => {
          if (item.id !== user.uid) {
            combined.set(item.id, {
              id: item.id,
              ...item.data()
            });
          }
        });

        if (!cancelled) {
          setProfiles([...combined.values()]);
        }
      } catch (err) {
        if (!cancelled) {
          setProfiles([]);
          setError(errorDetails(err));
        }
      }
    }

    searchUsers();

    return () => {
      cancelled = true;
    };
  }, [user, profile, searchText]);

  // تحميل رسائل المحادثة المحددة
  useEffect(() => {
    if (!activeChat || !user) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, "chats", activeChat.id, "messages"),
      orderBy("createdAt", "asc"),
      limit(300)
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );
      },
      (err) => setError(errorDetails(err))
    );
  }, [activeChat, user]);

  // النزول إلى آخر رسالة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  // تسجيل الدخول أو إنشاء حساب
  async function handleAuth(event) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail || !password) {
        throw new Error("أدخل البريد الإلكتروني وكلمة المرور.");
      }

      await setPersistence(auth, browserLocalPersistence);

      if (authMode === "register") {
        if (password.length < 6) {
          throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
        }

        await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
      }
    } catch (err) {
      setError(errorDetails(err));
    } finally {
      setBusy(false);
    }
  }

  // استعادة كلمة المرور
  async function resetPassword() {
    setError("");
    setBusy(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail) {
        throw new Error("اكتب بريدك الإلكتروني أولاً.");
      }

      await sendPasswordResetEmail(auth, cleanEmail);

      setError("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.");
    } catch (err) {
      setError(errorDetails(err));
    } finally {
      setBusy(false);
    }
  }

  // حفظ الملف الشخصي مع التحقق من عدم تكرار اسم المستخدم
  async function saveProfile(event) {
    event.preventDefault();

    if (!user) return;

    setBusy(true);
    setError("");

    try {
      const cleanName = displayName.trim();

      const cleanUsername = username
        .trim()
        .toLowerCase()
        .replace(/^@/, "");

      if (cleanName.length < 2) {
        throw new Error("اكتب اسماً من حرفين على الأقل.");
      }

      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        throw new Error(
          "اسم المستخدم يجب أن يكون 3-20 حرفاً إنجليزياً أو رقماً أو _."
        );
      }

      // التحقق من أن اسم المستخدم غير مأخوذ من قبل شخص آخر
      const usernameCheckQuery = query(
        collection(db, "profiles"),
        where("username", "==", cleanUsername),
        limit(1)
      );
      const existingUserSnap = await getDocs(usernameCheckQuery);
      if (!existingUserSnap.empty && existingUserSnap.docs[0].id !== user.uid) {
        throw new Error("اسم المستخدم هذا مستخدم بالفعل، اختر اسمًا آخر.");
      }

      const profileData = {
        displayName: cleanName,
        username: cleanUsername,
        photoURL: "",
        createdAt: serverTimestamp()
      };

      await setDoc(
        doc(db, "profiles", user.uid),
        profileData
      );

      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email || "",
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      const savedProfile = await getDoc(
        doc(db, "profiles", user.uid)
      );

      if (!savedProfile.exists()) {
        throw new Error("لم يتم العثور على الملف الشخصي بعد الحفظ.");
      }

      setProfile(savedProfile.data());
      setError("");
    } catch (err) {
      setError(errorDetails(err));
    } finally {
      setBusy(false);
    }
  }

  // فتح محادثة مع مستخدم
  async function openChat(person) {
    if (!user || !person?.id || busy) return;

    setBusy(true);
    setError("");

    try {
      const members = [user.uid, person.id].sort();

      const existingQuery = query(
        collection(db, "chats"),
        where("members", "array-contains", user.uid)
      );

      const existingSnapshot = await getDocs(existingQuery);

      const existingChat = existingSnapshot.docs.find((item) => {
        const chatMembers = item.data().members || [];

        return (
          chatMembers.length === 2 &&
          chatMembers.includes(person.id)
        );
      });

      if (existingChat) {
        setActiveChat({
          id: existingChat.id,
          ...existingChat.data(),
          otherId: person.id,
          other: person
        });
      } else {
        const chatRef = doc(collection(db, "chats"));

        const chatData = {
          members,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: ""
        };

        await setDoc(chatRef, chatData);

        setActiveChat({
          id: chatRef.id,
          ...chatData,
          otherId: person.id,
          other: person
        });
      }

      setSearchText("");
    } catch (err) {
      setError(errorDetails(err));
    } finally {
      setBusy(false);
    }
  }

  // إرسال رسالة
  async function sendMessage(event) {
    event.preventDefault();

    const text = messageText.trim();

    if (!text || !activeChat || !user || busy) return;

    setBusy(true);
    setError("");

    try {
      await addDoc(
        collection(db, "chats", activeChat.id, "messages"),
        {
          senderId: user.uid,
          text,
          type: "text",
          createdAt: serverTimestamp()
        }
      );

      await updateDoc(
        doc(db, "chats", activeChat.id),
        {
          lastMessage: text.slice(0, 120),
          updatedAt: serverTimestamp()
        }
      );

      setMessageText("");
    } catch (err) {
      setError(errorDetails(err));
    } finally {
      setBusy(false);
    }
  }

  // تسجيل الخروج
  async function handleSignOut() {
    setError("");

    try {
      await signOut(auth);
      setActiveChat(null);
    } catch (err) {
      setError(errorDetails(err));
    }
  }

  if (!authReady) {
    return (
      <div className="center">
        <LoaderCircle className="spin" />
        جارٍ تحميل حسابك...
      </div>
    );
  }

  // شاشة تسجيل الدخول
  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <MessageCircle size={34} />
          </div>

          <h1>سوداشات</h1>
          <p className="muted">تواصل مع أهلك وأصدقائك</p>

          <h2>
            {authMode === "register"
              ? "إنشاء حساب جديد"
              : "تسجيل الدخول"}
          </h2>

          <form onSubmit={handleAuth}>
            <label>البريد الإلكتروني</label>

            <div className="field">
              <Mail size={18} />

              <input
                type="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="example@gmail.com"
                autoComplete="email"
                required
              />
            </div>

            <label>كلمة المرور</label>

            <div className="field">
              <Lock size={18} />

              <input
                type="password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6 أحرف على الأقل"
                autoComplete={
                  authMode === "register"
                    ? "new-password"
                    : "current-password"
                }
                minLength={6}
                required
              />
            </div>

            <button className="primary" disabled={busy}>
              {busy
                ? "يرجى الانتظار..."
                : authMode === "register"
                  ? "إنشاء حساب"
                  : "تسجيل الدخول"}
            </button>
          </form>

          {authMode === "login" && (
            <button
              type="button"
              className="link-button"
              onClick={resetPassword}
              disabled={busy}
            >
              نسيت كلمة المرور؟
            </button>
          )}

          <button
            type="button"
            className="link-button"
            onClick={() => {
              setAuthMode(
                authMode === "login" ? "register" : "login"
              );
              setError("");
            }}
          >
            {authMode === "login"
              ? "ليس لديك حساب؟ أنشئ حساباً جديداً"
              : "لديك حساب بالفعل؟ سجّل الدخول"}
          </button>

          {error && <p className="error">{error}</p>}

          <small className="muted">
            مشروع Firebase: {PROJECT_ID}
          </small>
        </section>
      </main>
    );
  }

  // شاشة إكمال الملف الشخصي
  if (!profile) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">
            <UserRound size={34} />
          </div>

          <h1>أكمل ملفك الشخصي</h1>

          <p className="muted">
            اختر اسماً واسم مستخدم ليتمكن الآخرون من العثور عليك.
          </p>

          <form onSubmit={saveProfile}>
            <label>الاسم الظاهر</label>

            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="اسمك"
              required
            />

            <label>اسم المستخدم</label>

            <input
              dir="ltr"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              required
            />

            <button className="primary" disabled={busy}>
              {busy ? "جارٍ الحفظ..." : "حفظ ومتابعة"}
            </button>
          </form>

          <button
            type="button"
            className="link-button"
            onClick={handleSignOut}
          >
            تسجيل الخروج
          </button>

          {error && <p className="error">{error}</p>}

          <small className="muted">
            مشروع Firebase: {PROJECT_ID}
          </small>
        </section>
      </main>
    );
  }

  // واجهة التطبيق الرئيسية
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-inline">
          <div className="small-mark">
            <MessageCircle size={20} />
          </div>

          <strong>سوداشات</strong>
        </div>

        <div className="account">
          <span>{profile.displayName}</span>

          <button
            type="button"
            title="تسجيل الخروج"
            onClick={handleSignOut}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${activeChat ? "mobile-hidden" : ""}`}>
          <div className="sidebar-heading">
            <h2>المحادثات</h2>
            <span className="online-dot" />
          </div>

          <div className="search-box">
            <Search size={18} />

            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ابحث باسم المستخدم أو الاسم"
            />
          </div>

          {searchText.trim() ? (
            <div className="people-list">
              <p className="section-label">نتائج البحث</p>

              {profiles.map((person) => (
                <button
                  type="button"
                  className="person-row"
                  key={person.id}
                  onClick={() => openChat(person)}
                  disabled={busy}
                >
                  <div className="avatar">
                    {(person.displayName || "?").slice(0, 1)}
                  </div>

                  <div className="person-info">
                    <b>{person.displayName || "مستخدم"}</b>
                    <small>@{person.username || ""}</small>
                  </div>

                  <MessageCircle size={18} />
                </button>
              ))}

              {!profiles.length && (
                <p className="empty-note">
                  لا توجد نتائج مطابقة.
                </p>
              )}
            </div>
          ) : (
            <div className="chat-list">
              {chats.map((chat) => (
                <button
                  type="button"
                  key={chat.id}
                  className={`chat-row ${
                    activeChat?.id === chat.id ? "selected" : ""
                  }`}
                  onClick={() => setActiveChat(chat)}
                >
                  <div className="avatar">
                    {(chat.other?.displayName || "?").slice(0, 1)}
                  </div>

                  <div className="person-info">
                    <b>{chat.other?.displayName || "مستخدم"}</b>
                    <small>{chat.lastMessage || "ابدأ المحادثة"}</small>
                  </div>
                </button>
              ))}

              {!chats.length && (
                <div className="empty-state">
                  <MessageCircle size={32} />
                  <p>لا توجد محادثات بعد</p>
                  <small>ابحث عن شخص لبدء محادثة جديدة</small>
                </div>
              )}
            </div>
          )}

          <div className="my-profile">
            <div className="avatar self">
              {(profile.displayName || "?").slice(0, 1)}
            </div>

            <div>
              <b>{profile.displayName}</b>
              <small>@{profile.username}</small>
            </div>

            <Check size={17} />
          </div>
        </aside>

        <section className={`conversation ${!activeChat ? "no-chat" : ""}`}>
          {activeChat ? (
            <>
              <div className="conversation-header">
                <button
                  type="button"
                  className="back-button"
                  onClick={() => setActiveChat(null)}
                >
                  <ArrowRight size={20} />
                </button>

                <div className="avatar">
                  {(activeChat.other?.displayName || "?").slice(0, 1)}
                </div>

                <div>
                  <b>{activeChat.other?.displayName || "مستخدم"}</b>
                  <small>@{activeChat.other?.username || ""}</small>
                </div>
              </div>

              <div className="messages-area">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${
                      message.senderId === user.uid ? "mine" : "theirs"
                    }`}
                  >
                    <p>{message.text}</p>

                    <small>
                      {message.createdAt?.toDate
                        ? message.createdAt.toDate().toLocaleTimeString(
                            "ar",
                            {
                              hour: "2-digit",
                              minute: "2-digit"
                            }
                          )
                        : "..."}
                    </small>
                  </div>
                ))}

                {!messages.length && (
                  <div className="first-message">
                    هذه بداية محادثتك مع {activeChat.other?.displayName}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="اكتب رسالتك..."
                  maxLength={5000}
                />

                <button
                  className="send-button"
                  disabled={!messageText.trim() || busy}
                  aria-label="إرسال"
                >
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="welcome">
              <div className="welcome-icon">
                <MessageCircle size={52} />
              </div>

              <h2>مرحباً بك في سوداشات</h2>

              <p>
                اختر محادثة أو ابحث عن مستخدم لبدء التواصل.
              </p>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="toast" role="alert">
          {error}

          <button
            type="button"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
