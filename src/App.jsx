
import { useEffect, useMemo, useRef, useState } from "react";

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

const readableError = (error) => {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use": "هذا البريد مسجل بالفعل.",
    "auth/invalid-email": "البريد الإلكتروني غير صحيح.",
    "auth/weak-password": "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.",
    "auth/too-many-requests": "محاولات كثيرة. حاول لاحقاً.",
    "auth/network-request-failed": "تحقق من اتصال الإنترنت.",
    "permission-denied": "لا توجد صلاحيات كافية في Firestore.",
    "failed-precondition": "هناك مشكلة في إعدادات قاعدة البيانات."
  };

  return messages[code] || error?.message || "حدث خطأ غير متوقع.";
};

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

  // متابعة حالة تسجيل الدخول
  useEffect(() => {
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      setAuthReady(true);
      setError("");

      if (current) {
        try {
          const snap = await getDoc(
            doc(db, "profiles", current.uid)
          );

          setProfile(snap.exists() ? snap.data() : null);
        } catch (e) {
          setError(readableError(e));
        }
      } else {
        setProfile(null);
        setActiveChat(null);
        setChats([]);
        setProfiles([]);
      }
    });
  }, []);

  // تحميل المحادثات
  useEffect(() => {
    if (!user || !profile) return;

    const q = query(
      collection(db, "chats"),
      where("members", "array-contains", user.uid)
    );

    return onSnapshot(
      q,
      async (snapshot) => {
        try {
          const items = await Promise.all(
            snapshot.docs.map(async (chatDoc) => {
              const data = chatDoc.data();

              const otherId = data.members.find(
                (id) => id !== user.uid
              );

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
                  : { displayName: "مستخدم" }
              };
            })
          );

          const validItems = items.filter(Boolean);

          validItems.sort(
            (a, b) =>
              (b.updatedAt?.seconds || 0) -
              (a.updatedAt?.seconds || 0)
          );

          setChats(validItems);
        } catch (e) {
          setError(readableError(e));
        }
      },
      (e) => setError(readableError(e))
    );
  }, [user, profile]);

  // البحث عن المستخدمين مباشرة في Firestore
  useEffect(() => {
    if (!user || !profile) return;

    const term = searchText.trim();

    if (term.length < 2) {
      setProfiles([]);
      return;
    }

    let cancelled = false;

    async function searchProfiles() {
      try {
        const cleanTerm = term.replace(/^@/, "");

        const usernameQuery = query(
          collection(db, "profiles"),
          orderBy("username"),
          startAt(cleanTerm.toLowerCase()),
          endAt(cleanTerm.toLowerCase() + "\uf8ff"),
          limit(30)
        );

        const nameQuery = query(
          collection(db, "profiles"),
          orderBy("displayName"),
          startAt(cleanTerm),
          endAt(cleanTerm + "\uf8ff"),
          limit(30)
        );

        const [usernameResults, nameResults] =
          await Promise.all([
            getDocs(usernameQuery),
            getDocs(nameQuery)
          ]);

        const combined = new Map();

        [
          ...usernameResults.docs,
          ...nameResults.docs
        ].forEach((d) => {
          if (d.id !== user.uid) {
            combined.set(d.id, {
              id: d.id,
              ...d.data()
            });
          }
        });

        if (!cancelled) {
          setProfiles([...combined.values()]);
        }
      } catch (e) {
        if (!cancelled) {
          setProfiles([]);
          setError(readableError(e));
        }
      }
    }

    searchProfiles();

    return () => {
      cancelled = true;
    };
  }, [user, profile, searchText]);

  // تحميل الرسائل
  useEffect(() => {
    if (!activeChat || !user) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(
        db,
        "chats",
        activeChat.id,
        "messages"
      ),
      orderBy("createdAt", "asc"),
      limit(300)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data()
          }))
        );

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
          });
        }, 50);
      },
      (e) => setError(readableError(e))
    );
  }, [activeChat, user]);

  const filteredProfiles = useMemo(() => {
    return profiles;
  }, [profiles]);

  // تسجيل الدخول وإنشاء الحساب
  async function handleAuth(e) {
    e.preventDefault();

    setBusy(true);
    setError("");

    try {
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanEmail || !password) {
        throw new Error(
          "أدخل البريد الإلكتروني وكلمة المرور."
        );
      }

      // حفظ جلسة تسجيل الدخول في المتصفح
      await setPersistence(
        auth,
        browserLocalPersistence
      );

      if (authMode === "register") {
        if (password.length < 6) {
          throw new Error(
            "كلمة المرور يجب أن تكون 6 أحرف على الأقل."
          );
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
    } catch (e2) {
      setError(readableError(e2));
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
        throw new Error(
          "اكتب بريدك الإلكتروني أولاً."
        );
      }

      await sendPasswordResetEmail(
        auth,
        cleanEmail
      );

      setError(
        "تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني."
      );
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  // حفظ الملف الشخصي
  async function saveProfile(e) {
    e.preventDefault();

    setBusy(true);
    setError("");

    try {
      const cleanName = displayName.trim();

      const cleanUsername = username
        .trim()
        .toLowerCase()
        .replace(/^@/, "");

      if (cleanName.length < 2) {
        throw new Error(
          "اكتب اسماً من حرفين على الأقل."
        );
      }

      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        throw new Error(
          "اسم المستخدم يجب أن يكون 3-20 حرفاً إنجليزياً أو رقماً أو _."
        );
      }

      const profileData = {
        displayName: cleanName,
        username: cleanUsername,
        email: user.email || "",
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
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      setProfile({
        displayName: cleanName,
        username: cleanUsername,
        email: user.email || "",
        photoURL: ""
      });
    } catch (e2) {
      setError(readableError(e2));
    } finally {
      setBusy(false);
    }
  }

  // فتح محادثة
  async function openChat(person) {
    setError("");
    setBusy(true);

    try {
      const members = [user.uid, person.id].sort();

      const existingQuery = query(
        collection(db, "chats"),
        where("members", "array-contains", user.uid)
      );

      const existingSnapshot = await getDocs(
        existingQuery
      );

      const existing = existingSnapshot.docs.find(
        (d) => {
          const list = d.data().members || [];

          return (
            list.length === 2 &&
            list.includes(person.id)
          );
        }
      );

      if (existing) {
        setActiveChat({
          id: existing.id,
          ...existing.data(),
          otherId: person.id,
          other: person
        });
      } else {
        const ref = doc(collection(db, "chats"));

        const chatData = {
          members,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: ""
        };

        await setDoc(ref, chatData);

        setActiveChat({
          id: ref.id,
          ...chatData,
          otherId: person.id,
          other: person
        });
      }

      setSearchText("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  // إرسال رسالة
  async function sendMessage(e) {
    e.preventDefault();

    const text = messageText.trim();

    if (!text || !activeChat || busy) return;

    setMessageText("");
    setBusy(true);
    setError("");

    try {
      await addDoc(
        collection(
          db,
          "chats",
          activeChat.id,
          "messages"
        ),
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
    } catch (e2) {
      setMessageText(text);
      setError(readableError(e2));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <div className="center">
        <LoaderCircle className="spin" />
        جارٍ التحميل...
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

          <p className="muted">
            تواصل مع أهلك وأصدقائك
          </p>

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
                onChange={(e) =>
                  setEmail(e.target.value)
                }
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
                onChange={(e) =>
                  setPassword(e.target.value)
                }
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

            <button
              className="primary"
              disabled={busy}
            >
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
                authMode === "login"
                  ? "register"
                  : "login"
              );

              setError("");
            }}
          >
            {authMode === "login"
              ? "ليس لديك حساب؟ أنشئ حساباً جديداً"
              : "لديك حساب بالفعل؟ سجّل الدخول"}
          </button>

          {error && (
            <p className="error">{error}</p>
          )}

        </section>
      </main>
    );
  }

  // إكمال الملف الشخصي
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
              onChange={(e) =>
                setDisplayName(e.target.value)
              }
              placeholder="اسمك"
              required
            />

            <label>اسم المستخدم</label>

            <input
              dir="ltr"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              placeholder="username"
              required
            />

            <button
              className="primary"
              disabled={busy}
            >
              {busy
                ? "جارٍ الحفظ..."
                : "حفظ ومتابعة"}
            </button>

          </form>

          <button
            className="link-button"
            onClick={() => signOut(auth)}
          >
            تسجيل الخروج
          </button>

          {error && (
            <p className="error">{error}</p>
          )}

        </section>
      </main>
    );
  }

  // واجهة التطبيق
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
            title="تسجيل الخروج"
            onClick={() => signOut(auth)}
          >
            <LogOut size={19} />
          </button>
        </div>

      </header>

      <div className="workspace">

        <aside
          className={`sidebar ${
            activeChat ? "mobile-hidden" : ""
          }`}
        >

          <div className="sidebar-heading">
            <h2>المحادثات</h2>
            <span className="online-dot" />
          </div>

          <div className="search-box">
            <Search size={18} />

            <input
              value={searchText}
              onChange={(e) =>
                setSearchText(e.target.value)
              }
              placeholder="ابحث عن اسم أو اسم مستخدم"
            />
          </div>

          {searchText.trim() ? (

            <div className="people-list">

              <p className="section-label">
                نتائج البحث
              </p>

              {filteredProfiles.map((p) => (
                <button
                  className="person-row"
                  key={p.id}
                  onClick={() => openChat(p)}
                >
                  <div className="avatar">
                    {(p.displayName || "?").slice(0, 1)}
                  </div>

                  <div className="person-info">
                    <b>{p.displayName}</b>
                    <small>@{p.username}</small>
                  </div>

                  <MessageCircle size={18} />
                </button>
              ))}

              {!filteredProfiles.length && (
                <p className="empty-note">
                  لا توجد نتائج مطابقة.
                </p>
              )}

            </div>

          ) : (

            <div className="chat-list">

              {chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-row ${
                    activeChat?.id === chat.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setActiveChat(chat)}
                >
                  <div className="avatar">
                    {(chat.other?.displayName || "?").slice(0, 1)}
                  </div>

                  <div className="person-info">
                    <b>
                      {chat.other?.displayName || "مستخدم"}
                    </b>

                    <small>
                      {chat.lastMessage || "ابدأ المحادثة"}
                    </small>
                  </div>

                </button>
              ))}

              {!chats.length && (
                <div className="empty-state">
                  <MessageCircle size={32} />
                  <p>لا توجد محادثات بعد</p>
                  <small>
                    ابحث عن شخص لبدء محادثة جديدة
                  </small>
                </div>
              )}

            </div>
          )}

          <div className="my-profile">

            <div className="avatar self">
              {profile.displayName.slice(0, 1)}
            </div>

            <div>
              <b>{profile.displayName}</b>
              <small>@{profile.username}</small>
            </div>

            <Check size={17} />

          </div>

        </aside>

        <section
          className={`conversation ${
            !activeChat ? "no-chat" : ""
          }`}
        >

          {activeChat ? (

            <>

              <div className="conversation-header">

                <button
                  className="back-button"
                  onClick={() => setActiveChat(null)}
                >
                  <ArrowRight size={20} />
                </button>

                <div className="avatar">
                  {(activeChat.other?.displayName || "?").slice(0, 1)}
                </div>

                <div>
                  <b>
                    {activeChat.other?.displayName || "مستخدم"}
                  </b>

                  <small>
                    @{activeChat.other?.username || ""}
                  </small>
                </div>

              </div>

              <div className="messages-area">

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message ${
                      m.senderId === user.uid
                        ? "mine"
                        : "theirs"
                    }`}
                  >

                    <p>{m.text}</p>

                    <small>
                      {m.createdAt?.toDate
                        ? m.createdAt
                            .toDate()
                            .toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                        : "..."}
                    </small>

                  </div>
                ))}

                {!messages.length && (
                  <div className="first-message">
                    هذه بداية محادثتك مع{" "}
                    {activeChat.other?.displayName}
                  </div>
                )}

                <div ref={messagesEndRef} />

              </div>

              <form
                className="composer"
                onSubmit={sendMessage}
              >

                <input
                  value={messageText}
                  onChange={(e) =>
                    setMessageText(e.target.value)
                  }
                  placeholder="اكتب رسالتك..."
                  maxLength="5000"
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

          <button onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

    </main>
  );
}
