import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut,
  updateProfile
} from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, updateDoc, limit
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { MessageCircle, Send, LogOut, Search, UserRound, ArrowRight, Phone, Check, LoaderCircle } from "lucide-react";

const normalizePhone = (value) => value.replace(/[^\d+]/g, "");
const readableError = (error) => {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-phone-number": "رقم الهاتف غير صحيح. اكتب الرقم مع مفتاح الدولة مثل +249.",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.",
    "auth/invalid-verification-code": "رمز التحقق غير صحيح.",
    "auth/code-expired": "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
    "permission-denied": "صلاحيات قاعدة البيانات تمنع هذه العملية. راجع قواعد Firestore.",
    "auth/network-request-failed": "تعذر الاتصال بالإنترنت."
  };
  return messages[code] || error?.message || "حدث خطأ غير متوقع.";
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState("+249");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState(null);
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
  const recaptchaRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => onAuthStateChanged(auth, async (current) => {
    setUser(current);
    setAuthReady(true);
    setError("");
    if (current) {
      const snap = await getDoc(doc(db, "profiles", current.uid));
      setProfile(snap.exists() ? snap.data() : null);
    } else {
      setProfile(null);
      setActiveChat(null);
    }
  }), []);

  useEffect(() => {
    if (!user || !profile) return;
    const q = query(collection(db, "chats"), where("members", "array-contains", user.uid));
    return onSnapshot(q, async (snapshot) => {
      const items = await Promise.all(snapshot.docs.map(async (chatDoc) => {
        const data = chatDoc.data();
        const otherId = data.members.find((id) => id !== user.uid);
        const otherSnap = await getDoc(doc(db, "profiles", otherId));
        return { id: chatDoc.id, ...data, otherId, other: otherSnap.exists() ? otherSnap.data() : { displayName: "مستخدم" } };
      }));
      items.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setChats(items);
    }, (e) => setError(readableError(e)));
  }, [user, profile]);

  useEffect(() => {
    if (!user || !profile) return;
    const q = query(collection(db, "profiles"), limit(100));
    return onSnapshot(q, (snapshot) => {
      setProfiles(snapshot.docs
        .filter((d) => d.id !== user.uid)
        .map((d) => ({ id: d.id, ...d.data() })));
    }, (e) => setError(readableError(e)));
  }, [user, profile]);

  useEffect(() => {
    if (!activeChat || !user) { setMessages([]); return; }
    const q = query(collection(db, "chats", activeChat.id, "messages"), orderBy("createdAt", "asc"), limit(300));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }, (e) => setError(readableError(e)));
  }, [activeChat, user]);

  const filteredProfiles = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return [];
    return profiles.filter((p) =>
      (p.displayName || "").toLowerCase().includes(term) ||
      (p.username || "").toLowerCase().includes(term)
    );
  }, [profiles, searchText]);

  async function requestCode(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const clean = normalizePhone(phone);
      if (!/^\+[1-9]\d{7,14}$/.test(clean)) throw new Error("اكتب رقم الهاتف بالصيغة الدولية، مثال: +249XXXXXXXXX");
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, clean, recaptchaRef.current);
      setConfirmation(result);
    } catch (e2) {
      setError(readableError(e2));
      if (recaptchaRef.current) { try { await recaptchaRef.current.clear(); } catch {} recaptchaRef.current = null; }
    } finally { setBusy(false); }
  }

  async function verifyCode(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { await confirmation.confirm(otp.trim()); }
    catch (e2) { setError(readableError(e2)); }
    finally { setBusy(false); }
  }

  async function saveProfile(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const cleanName = displayName.trim();
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
      if (cleanName.length < 2) throw new Error("اكتب اسماً من حرفين على الأقل.");
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) throw new Error("اسم المستخدم يجب أن يكون 3-20 حرفاً إنجليزياً أو رقماً أو _.");
      await setDoc(doc(db, "profiles", user.uid), {
        displayName: cleanName, username: cleanUsername, photoURL: "", createdAt: serverTimestamp()
      });
      await setDoc(doc(db, "users", user.uid), {
        phoneNumber: user.phoneNumber || "", createdAt: serverTimestamp()
      }, { merge: true });
      setProfile({ displayName: cleanName, username: cleanUsername, photoURL: "" });
    } catch (e2) { setError(readableError(e2)); }
    finally { setBusy(false); }
  }

  async function openChat(person) {
    setError(""); setBusy(true);
    try {
      const members = [user.uid, person.id].sort();
      const existingQuery = query(
        collection(db, "chats"),
        where("members", "array-contains", user.uid)
      );
      const existingSnapshot = await getDocs(existingQuery);
      const existing = existingSnapshot.docs.find((d) => {
        const list = d.data().members || [];
        return list.length === 2 && list.includes(person.id);
      });
      if (existing) {
        setActiveChat({ id: existing.id, ...existing.data(), otherId: person.id, other: person });
      } else {
        const ref = doc(collection(db, "chats"));
        const chatData = {
          members,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: ""
        };
        await setDoc(ref, chatData);
        setActiveChat({ id: ref.id, ...chatData, otherId: person.id, other: person });
      }
      setSearchText("");
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || !activeChat || busy) return;
    setMessageText(""); setBusy(true); setError("");
    try {
      await addDoc(collection(db, "chats", activeChat.id, "messages"), {
        senderId: user.uid, text, type: "text", createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "chats", activeChat.id), {
        lastMessage: text.slice(0, 120), updatedAt: serverTimestamp()
      });
    } catch (e2) { setMessageText(text); setError(readableError(e2)); }
    finally { setBusy(false); }
  }

  if (!authReady) return <div className="center"><LoaderCircle className="spin" /> جارٍ التحميل...</div>;

  if (!user) return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark"><MessageCircle size={34} /></div>
        <h1>سوداشات</h1><p className="muted">تواصل مع أهلك وأصدقائك</p>
        {!confirmation ? (
          <form onSubmit={requestCode}>
            <label>رقم الهاتف بالصيغة الدولية</label>
            <div className="field"><Phone size={18}/><input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+249..." required /></div>
            <button className="primary" disabled={busy}>{busy ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}</button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label>رمز التحقق المكوّن من 6 أرقام</label>
            <input className="otp" dir="ltr" inputMode="numeric" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            <button className="primary" disabled={busy}>{busy ? "جارٍ التحقق..." : "تأكيد الرقم"}</button>
            <button type="button" className="link-button" onClick={() => { setConfirmation(null); setOtp(""); }}>تغيير رقم الهاتف</button>
          </form>
        )}
        <div id="recaptcha-container"></div>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );

  if (!profile) return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark"><UserRound size={34}/></div>
        <h1>أكمل ملفك الشخصي</h1>
        <p className="muted">اختر اسماً واسم مستخدم ليتمكن الآخرون من العثور عليك.</p>
        <form onSubmit={saveProfile}>
          <label>الاسم الظاهر</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسمك" required />
          <label>اسم المستخدم</label>
          <input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required />
          <button className="primary" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ ومتابعة"}</button>
        </form>
        <button className="link-button" onClick={() => signOut(auth)}>تسجيل الخروج</button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-inline"><div className="small-mark"><MessageCircle size={20}/></div><strong>سوداشات</strong></div>
        <div className="account"><span>{profile.displayName}</span><button title="تسجيل الخروج" onClick={() => signOut(auth)}><LogOut size={19}/></button></div>
      </header>
      <div className="workspace">
        <aside className={`sidebar ${activeChat ? "mobile-hidden" : ""}`}>
          <div className="sidebar-heading"><h2>المحادثات</h2><span className="online-dot" /></div>
          <div className="search-box"><Search size={18}/><input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ابحث عن اسم أو اسم مستخدم" /></div>
          {searchText.trim() ? (
            <div className="people-list">
              <p className="section-label">نتائج البحث</p>
              {filteredProfiles.map((p) => <button className="person-row" key={p.id} onClick={() => openChat(p)}>
                <div className="avatar">{(p.displayName || "?").slice(0,1)}</div>
                <div className="person-info"><b>{p.displayName}</b><small>@{p.username}</small></div>
                <MessageCircle size={18}/>
              </button>)}
              {!filteredProfiles.length && <p className="empty-note">لا توجد نتائج مطابقة.</p>}
            </div>
          ) : (
            <div className="chat-list">
              {chats.map((chat) => <button key={chat.id} className={`chat-row ${activeChat?.id === chat.id ? "selected" : ""}`} onClick={() => setActiveChat(chat)}>
                <div className="avatar">{(chat.other?.displayName || "?").slice(0,1)}</div>
                <div className="person-info"><b>{chat.other?.displayName || "مستخدم"}</b><small>{chat.lastMessage || "ابدأ المحادثة"}</small></div>
              </button>)}
              {!chats.length && <div className="empty-state"><MessageCircle size={32}/><p>لا توجد محادثات بعد</p><small>ابحث عن شخص لبدء محادثة جديدة</small></div>}
            </div>
          )}
          <div className="my-profile"><div className="avatar self">{profile.displayName.slice(0,1)}</div><div><b>{profile.displayName}</b><small>@{profile.username}</small></div><Check size={17}/></div>
        </aside>
        <section className={`conversation ${!activeChat ? "no-chat" : ""}`}>
          {activeChat ? <>
            <div className="conversation-header">
              <button className="back-button" onClick={() => setActiveChat(null)}><ArrowRight size={20}/></button>
              <div className="avatar">{(activeChat.other?.displayName || "?").slice(0,1)}</div>
              <div><b>{activeChat.other?.displayName || "مستخدم"}</b><small>@{activeChat.other?.username || ""}</small></div>
            </div>
            <div className="messages-area">
              {messages.map((m) => <div key={m.id} className={`message ${m.senderId === user.uid ? "mine" : "theirs"}`}>
                <p>{m.text}</p><small>{m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "..."}</small>
              </div>)}
              {!messages.length && <div className="first-message">هذه بداية محادثتك مع {activeChat.other?.displayName}</div>}
              <div ref={messagesEndRef}/>
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="اكتب رسالتك..." maxLength="5000" />
              <button className="send-button" disabled={!messageText.trim() || busy} aria-label="إرسال"><Send size={20}/></button>
            </form>
          </> : <div className="welcome"><div className="welcome-icon"><MessageCircle size={52}/></div><h2>مرحباً بك في سوداشات</h2><p>اختر محادثة أو ابحث عن مستخدم لبدء التواصل.</p></div>}
        </section>
      </div>
      {error && <div className="toast" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
    </main>
  );
}