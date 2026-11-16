import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL = "https://dheazidcgmvjauchesey.supabase.co";
const SUPABASE_KEY = "sb_publishable_eI6CH_F8ThW5qFpkVMEGbA_GMDis66s";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (id) => document.getElementById(id);
const savedTheme = (() => {
  try { return JSON.parse(localStorage.getItem("theme")); } catch { return null; }
})();
if (savedTheme === "dark" || savedTheme === "light") {
  document.documentElement.dataset.theme = savedTheme;
}

let mode = "login";
let busy = false;
let quotaState = null;

function authMessage(text, good = false) {
  $("authMessage").textContent = text;
  $("authMessage").style.color = good ? "var(--green)" : "var(--red)";
}
function chatMessage(text) { $("chatStatus").textContent = text || ""; }
function setAuthMode(next) {
  mode = next;
  $("authTitle").textContent = mode === "login" ? "سجّل دخولك وابدأ" : "اعمل حسابك في مِداد";
  $("authHint").textContent = mode === "login" ? "استخدم حساب مِداد للوصول إلى مساعدك التعليمي." : "حساب واحد يفتح لك مساحة التعلّم ومميزات مِداد.";
  $("authSubmit").innerHTML = mode === "login" ? 'دخول إلى مساحة التعلّم <span>←</span>' : 'إنشاء حساب <span>←</span>';
  $("switchText").textContent = mode === "login" ? "لسه معندكش حساب؟" : "عندك حساب بالفعل؟";
  $("switchAuth").textContent = mode === "login" ? "إنشاء حساب" : "تسجيل الدخول";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  authMessage("");
}
function showWorkspace(user) {
  $("authPanel").classList.add("hidden");
  $("chatPanel").classList.remove("hidden");
  $("signOut").classList.remove("hidden");
  $("messageInput").disabled = false;
  $("sendButton").disabled = false;
  $("messageInput").focus();
  loadQuota();
}
function showAuth() {
  $("authPanel").classList.remove("hidden");
  $("chatPanel").classList.add("hidden");
  $("signOut").classList.add("hidden");
  $("messageInput").disabled = true;
  $("sendButton").disabled = true;
}
async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) { showAuth(); return; }
  showWorkspace(session.user);
}
async function loadQuota() {
  // The server returns authoritative quota after a successful AI response.
  // Do not infer subscription limits or usage from browser-side data.
  if (!quotaState) {
    $("quotaRemaining").textContent = "جاهز";
    $("quotaPlan").textContent = "رصيدك يظهر بعد أول إجابة";
    $("quotaBar").style.width = "0%";
    $("quotaMeta").textContent = "كل باقة لها حد استخدام شهري";
  }
}
function updateQuota(q) {
  if (!q || typeof q.remaining !== "number") return;
  quotaState = q;
  $("quotaRemaining").textContent = new Intl.NumberFormat("ar-EG").format(q.remaining);
  $("quotaPlan").textContent = "طلب متبقٍ";
  const limit = Math.max(1, Number(q.limit) || 1);
  const used = Math.max(0, Number(q.used) || 0);
  $("quotaBar").style.width = Math.min(100, used / limit * 100) + "%";
  const planNames = { free: "المجانية", plus: "بلس", pro: "برو" };
  $("quotaMeta").textContent = "باقة " + (planNames[q.plan] || q.plan || "مِداد") + " · " +
    new Intl.NumberFormat("ar-EG").format(used) + " من " + new Intl.NumberFormat("ar-EG").format(limit);
}
function addMessage(role, text) {
  $("welcome").classList.add("hidden");
  const row = document.createElement("div");
  row.className = "message " + role;
  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  avatar.textContent = role === "user" ? "أنت" : "م";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.append(avatar, bubble);
  $("messages").append(row);
  $("messages").scrollTop = $("messages").scrollHeight;
  return row;
}
function resetChat() {
  $("messages").replaceChildren();
  const welcome = document.createElement("div");
  welcome.id = "welcome";
  welcome.className = "welcome";
  welcome.innerHTML = '<div class="welcome-symbol">✳</div><span class="section-kicker">أهلًا بيك في مساحة مِداد</span><h2>نبدأ منين النهارده؟</h2><p>اختار اللي محتاجه أو اكتب سؤالك بطريقتك.</p><div class="prompt-grid"><button class="prompt-card" data-prompt="اشرح لي درسًا صعبًا بطريقة بسيطة مع أمثلة." type="button"><span>01</span><b>اشرحلي درس</b><small>نفهم المعلومة من أولها</small></button><button class="prompt-card" data-prompt="اختبر فهمي في موضوع أدرسه، واسألني سؤالًا واحدًا كل مرة." type="button"><span>02</span><b>اختبر فهمي</b><small>تحدّي صغير يثبت المعلومة</small></button><button class="prompt-card" data-prompt="ساعدني في حل مسألة خطوة بخطوة، واشرح سبب كل خطوة." type="button"><span>03</span><b>حل معايا</b><small>نفكّ المسألة واحدة واحدة</small></button><button class="prompt-card" data-prompt="لخّص لي هذا الموضوع في نقاط سهلة للمراجعة." type="button"><span>04</span><b>لخّصلي</b><small>ورقة مراجعة مرتبة</small></button></div>';
  $("messages").append(welcome);
  chatMessage("");
}
async function sendPrompt(raw) {
  const message = String(raw || "").trim();
  if (!message || busy) return;
  if (message.length > 5000) { chatMessage("السؤال طويل جدًا. اختصره إلى 5000 حرف."); return; }

  busy = true;
  $("messageInput").value = "";
  $("sendButton").disabled = true;
  $("messageInput").disabled = true;
  chatMessage("");
  addMessage("user", message);
  $("thinking").classList.remove("hidden");
  $("messages").scrollTop = $("messages").scrollHeight;

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error("تعذر التحقق من جلسة الدخول. حدّث الصفحة وسجّل الدخول.");
    if (!session?.access_token) {
      showAuth();
      throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);
    let response;
    try {
      response = await fetch(SUPABASE_URL + "/functions/v1/midad-ai", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({ message })
      });
    } finally {
      clearTimeout(timeoutId);
    }

    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      if (payload?.quota) updateQuota(payload.quota);
      throw new Error(payload?.error || "تعذر الرد (رمز " + response.status + "). حاول مرة أخرى.");
    }
    if (!payload?.answer) throw new Error("وصل رد غير مكتمل من المساعد. حاول مرة أخرى.");
    addMessage("assistant", payload.answer);
    updateQuota(payload.quota);
  } catch (err) {
    const msg = err?.name === "AbortError"
      ? "الرد اتأخر أكثر من 35 ثانية. جرّب سؤالًا أقصر."
      : (err?.message || "تعذر إرسال السؤال الآن.");
    addMessage("assistant", "مش قادر أرد عليك دلوقتي. " + msg);
    chatMessage(msg);
  } finally {
    $("thinking").classList.add("hidden");
    busy = false;
    $("messageInput").disabled = false;
    $("sendButton").disabled = false;
    $("messageInput").focus();
  }
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("authSubmit").disabled = true;
  authMessage(mode === "login" ? "جارٍ تسجيل الدخول…" : "جارٍ إنشاء الحساب…");
  const email = $("email").value.trim();
  const password = $("password").value;
  try {
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authMessage("تم تسجيل الدخول بنجاح", true);
      await checkSession();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        authMessage("تم إنشاء حسابك بنجاح", true);
        await checkSession();
      } else {
        authMessage("راجع بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.", true);
        setAuthMode("login");
      }
    }
  } catch (error) {
    authMessage(error.message || "تعذر إكمال العملية. حاول مرة أخرى.");
  } finally { $("authSubmit").disabled = false; }
});
$("switchAuth").addEventListener("click", () => setAuthMode(mode === "login" ? "signup" : "login"));
$("signOut").addEventListener("click", async () => {
  await supabase.auth.signOut();
  quotaState = null;
  showAuth();
  setAuthMode("login");
});
$("composer").addEventListener("submit", (event) => {
  event.preventDefault();
  sendPrompt($("messageInput").value);
});
$("messageInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
});
$("messages").addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (button) sendPrompt(button.dataset.prompt);
});
$("newChat").addEventListener("click", resetChat);
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) showWorkspace(session.user);
  else showAuth();
});
checkSession();
