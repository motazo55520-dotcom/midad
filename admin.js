import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const supabase = createClient(
  "https://dheazidcgmvjauchesey.supabase.co",
  "sb_publishable_eI6CH_F8ThW5qFpkVMEGbA_GMDis66s"
);

const $ = (id) => document.getElementById(id);
const fmt = (v) => new Intl.NumberFormat("ar-EG").format(v ?? 0);
const date = (v) => v ? new Date(v).toLocaleString("ar-EG") : "—";
const duration = (v) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours ? `${hours} س ${minutes} د` : minutes ? `${minutes} د ${secs} ث` : `${secs} ث`;
};
let currentContentId = null;
let liveChannel = null;

function message(id, text, good = false) {
  $(id).textContent = text;
  $(id).className = good ? "status success" : "status";
}

function showAuth() {
  $("auth").classList.remove("hidden");
  $("dashboard").classList.add("hidden");
  $("logout").classList.add("hidden");
  $("who").textContent = "";
}
function showDashboard(email) {
  $("auth").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("logout").classList.remove("hidden");
  $("who").textContent = email;
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showAuth();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return showAuth();
  if (user.app_metadata?.role !== "admin") {
    showAuth();
    $("authMsg").textContent = "الحساب مسجل. إذا كان هذا هو البريد الأساسي وأكدت عنوانه، اضغط زر تفعيل حساب المدير.";
    const canActivate = (user.email || "").toLowerCase() === "motazo55520@gmail.com" && !!user.email_confirmed_at;
    $("activateAdmin").classList.toggle("hidden", !canActivate);
    return;
  }
  $("activateAdmin").classList.add("hidden");
  showDashboard(user.email || "");
  await loadDashboard();
  subscribeLive();
}

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("authMsg").textContent = "جارٍ تسجيل الدخول…";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  if (error) { $("authMsg").textContent = error.message; return; }
  await checkSession();
});

$("activateAdmin").addEventListener("click", async () => {
  $("authMsg").textContent = "جارٍ التحقق من البريد وتفعيل الصلاحية…";
  $("activateAdmin").disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("سجّل الدخول أولًا");
    const { error } = await supabase.functions.invoke("bootstrap-admin");
    if (error) throw error;
    await supabase.auth.refreshSession();
    $("authMsg").textContent = "تم اعتماد حساب المدير. جارٍ فتح اللوحة…";
    await checkSession();
  } catch (error) {
    $("authMsg").textContent = error.message || "تعذر تفعيل حساب المدير";
  } finally {
    $("activateAdmin").disabled = false;
  }
});

$("signupBtn").addEventListener("click", async () => {
  $("authMsg").textContent = "جارٍ إنشاء الحساب…";
  const { data, error } = await supabase.auth.signUp({
    email: $("email").value.trim(),
    password: $("password").value,
    options: {
      emailRedirectTo: "https://midad-admin-preview.vercel.app/admin.html"
    }
  });
  if (error) { $("authMsg").textContent = error.message; return; }
  $("authMsg").textContent = data.session
    ? "تم إنشاء الحساب. انتظر اعتماد صلاحية الإدارة من مالك الموقع."
    : "تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. أكّد البريد ثم أرسل عنوانه لمالك الموقع لاعتماده.";
});

$("refresh").addEventListener("click", async () => {
  $("refresh").disabled = true;
  try { await loadDashboard(); } finally { $("refresh").disabled = false; }
});

$("logout").addEventListener("click", async () => {
  if (liveChannel) await supabase.removeChannel(liveChannel);
  await supabase.auth.signOut();
  showAuth();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) showAuth();
});

async function loadDashboard() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString();
  const thirtyDays = new Date(Date.now() - 30 * 86400000).toISOString();
  const [today, week, month, online] = await Promise.all([
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_name", "page_view").gte("occurred_at", startToday),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_name", "page_view").gte("occurred_at", sevenDays),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("event_name", "page_view").gte("occurred_at", thirtyDays),
    supabase.from("live_visitors").select("*", { count: "exact", head: true }).eq("is_active", true).gte("last_seen_at", new Date(Date.now() - 60000).toISOString())
  ]);
  $("today").textContent = fmt(today.count);
  $("week").textContent = fmt(week.count);
  $("month").textContent = fmt(month.count);
  $("online").textContent = fmt(online.count);
  await Promise.all([loadVisitors(), loadAnalytics(), loadContent(), loadSettings(), loadSubscriptions(), loadCommunity()]);
}

async function loadVisitors() {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const { data, error } = await supabase.from("live_visitors")
    .select("session_id,page_path,device_type,started_at,last_seen_at,referrer_domain")
    .eq("is_active", true).gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false }).limit(100);
  if (error) return;
  $("online").textContent = fmt(data.length);
  const body = $("visitors");
  body.replaceChildren();
  if (!data.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td"); td.colSpan = 6; td.className = "empty"; td.textContent = "لا يوجد زوار نشطون في هذه اللحظة";
    tr.append(td); body.append(tr); return;
  }
  for (const v of data) {
    const tr = document.createElement("tr");
    [v.page_path, v.device_type, date(v.started_at), duration(v.started_at), date(v.last_seen_at), v.referrer_domain || "مباشر"].forEach((val) => {
      const td = document.createElement("td"); td.textContent = val; tr.append(td);
    });
    body.append(tr);
  }
}

let lastAnalyticsExport = [];
async function loadAnalytics() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [eventsResult, sessionsResult] = await Promise.all([
    supabase.from("analytics_events")
      .select("page_path,referrer_domain,session_id,occurred_at,device_type")
      .eq("event_name", "page_view").gte("occurred_at", since)
      .order("occurred_at", { ascending: false }).limit(10000),
    supabase.from("live_visitors")
      .select("session_id,device_type,started_at,last_seen_at")
      .gte("started_at", since).order("started_at", { ascending: false }).limit(10000)
  ]);
  if (eventsResult.error) return message("analyticsMsg", "تعذر تحميل الزيارات: " + eventsResult.error.message);
  if (sessionsResult.error) return message("analyticsMsg", "تعذر تحميل بيانات الجلسات: " + sessionsResult.error.message);
  const data = eventsResult.data || [];
  const sessionsData = sessionsResult.data || [];
  lastAnalyticsExport = data;
  const pages = new Map(), sources = new Map(), devices = new Map(), sessions = new Set();
  for (const e of data) {
    sessions.add(e.session_id);
    pages.set(e.page_path, (pages.get(e.page_path) || 0) + 1);
    const source = e.referrer_domain || "مباشر";
    sources.set(source, (sources.get(source) || 0) + 1);
  }
  for (const s of sessionsData) {
    const device = s.device_type || "غير معروف";
    devices.set(device, (devices.get(device) || 0) + 1);
  }
  const unique = sessions.size;
  $("uniqueSessions").textContent = fmt(unique);
  $("avgViews").textContent = fmt(unique ? (data.length / unique).toFixed(1) : 0);
  const durations = sessionsData.map(s => Math.max(0, (new Date(s.last_seen_at) - new Date(s.started_at)) / 1000)).filter(Number.isFinite);
  const averageSeconds = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const mins = Math.floor(averageSeconds / 60), secs = Math.floor(averageSeconds % 60);
  $("avgDuration").textContent = mins ? `${fmt(mins)} د ${fmt(secs)} ث` : `${fmt(secs)} ث`;
  const topDevice = [...devices.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
  $("topDevice").textContent = ({mobile:"موبايل",tablet:"تابلت",desktop:"كمبيوتر",unknown:"غير معروف"})[topDevice] || topDevice;
  const table = (map) => {
    const t = document.createElement("table");
    const head = document.createElement("tr");
    ["العنصر", "العدد"].forEach(label => { const th = document.createElement("th"); th.textContent = label; head.append(th); });
    t.append(head);
    [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([key,value])=>{
      const tr=document.createElement("tr"); const a=document.createElement("td"); const b=document.createElement("td");
      a.textContent=key; b.textContent=fmt(value); tr.append(a,b); t.append(tr);
    });
    return t;
  };
  $("topPages").replaceChildren(table(pages));
  $("sources").replaceChildren(table(sources));
  $("devices").replaceChildren(table(devices));
  if ($("analyticsMsg")) message("analyticsMsg", `تم تحميل ${fmt(data.length)} مشاهدة و${fmt(sessionsData.length)} جلسة مسجلة`, true);
}
function exportAnalyticsCsv() {
  if (!lastAnalyticsExport.length) return message("analyticsMsg", "لا توجد بيانات لتصديرها");
  const rows = [["التاريخ","الصفحة","المصدر","الجهاز"], ...lastAnalyticsExport.map(e => [
    new Date(e.occurred_at).toISOString(), e.page_path || "/", e.referrer_domain || "مباشر", e.device_type || "غير معروف"
  ])];
  const csv = "\uFEFF" + rows.map(row => row.map(value => '"' + String(value).replace(/"/g,'""') + '"').join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url; link.download = "midad-analytics-last-30-days.csv";
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
$("exportAnalytics").addEventListener("click", exportAnalyticsCsv);

function subscribeLive() {
  if (liveChannel) supabase.removeChannel(liveChannel);
  liveChannel = supabase.channel("midad-live-visitors")
    .on("postgres_changes", { event: "*", schema: "public", table: "live_visitors" }, () => {
      loadVisitors();
      loadDashboardCounts();
    }).subscribe();
}
async function loadDashboardCounts() {
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const { count } = await supabase.from("live_visitors").select("*", { count:"exact", head:true })
    .eq("is_active", true).gte("last_seen_at", cutoff);
  $("online").textContent = fmt(count);
}

async function loadContent() {
  const { data, error } = await supabase.from("site_content").select("*").order("section").order("sort_order");
  if (error) return message("contentMsg", error.message);
  const body = $("contentRows"); body.replaceChildren();
  for (const item of data || []) {
    const tr = document.createElement("tr");
    [item.content_key,item.section,item.title,item.is_published?"منشور":"مسودة"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});
    const td=document.createElement("td"), edit=document.createElement("button"), del=document.createElement("button");
    edit.textContent="تعديل"; edit.className="secondary"; edit.addEventListener("click",()=>editContent(item));
    del.textContent="حذف"; del.className="danger"; del.addEventListener("click",()=>deleteContent(item.id));
    td.append(edit,del); tr.append(td); body.append(tr);
  }
}
function editContent(item) {
  currentContentId=item.id;
  $("contentKey").value=item.content_key; $("contentSection").value=item.section;
  $("contentTitle").value=item.title; $("contentOrder").value=item.sort_order;
  $("contentJson").value = item.content && typeof item.content === "object" && typeof item.content.text === "string"
    ? item.content.text
    : JSON.stringify(item.content, null, 2);
  $("contentPublished").checked=item.is_published;
}
function clearContent() {
  currentContentId=null;
  ["contentKey","contentSection","contentTitle"].forEach(id=>$(id).value="");
  $("contentOrder").value=0; $("contentJson").value="{}"; $("contentPublished").checked=false;
}
$("newContent").addEventListener("click",clearContent);
$("cancelContent").addEventListener("click",clearContent);
$("saveContent").addEventListener("click",async()=>{
  const rawContent = $("contentJson").value;
  let content;
  try { content = JSON.parse(rawContent); }
  catch (_) { content = { text: rawContent }; }
  if (typeof content === "string") content = { text: content };
  const row={content_key:$("contentKey").value.trim(),section:$("contentSection").value.trim()||"general",title:$("contentTitle").value.trim(),sort_order:Number($("contentOrder").value)||0,content,is_published:$("contentPublished").checked,updated_at:new Date().toISOString()};
  if(!row.content_key)return message("contentMsg","اكتب مفتاح المحتوى");
  const result=currentContentId
    ? await supabase.from("site_content").update(row).eq("id",currentContentId)
    : await supabase.from("site_content").insert(row);
  if(result.error)return message("contentMsg",result.error.message);
  message("contentMsg","تم الحفظ",true); clearContent(); await loadContent();
});
async function deleteContent(id) {
  if(!confirm("هل تريد حذف عنصر المحتوى؟"))return;
  const {error}=await supabase.from("site_content").delete().eq("id",id);
  if(error)return message("contentMsg",error.message);
  await loadContent();
}

async function loadSettings() {
  const {data,error}=await supabase.from("site_settings").select("*").order("setting_key");
  if(error)return message("settingMsg",error.message);
  const body=$("settingRows");body.replaceChildren();
  for(const item of data||[]){
    const tr=document.createElement("tr");
    const key=document.createElement("td");key.textContent=item.setting_key;
    const val=document.createElement("td");val.textContent=JSON.stringify(item.setting_value);
    const time=document.createElement("td");time.textContent=date(item.updated_at);
    const actions=document.createElement("td"),edit=document.createElement("button"),del=document.createElement("button");
    edit.textContent="تحميل";edit.className="secondary";edit.addEventListener("click",()=>{$("settingKey").value=item.setting_key;$("settingJson").value=JSON.stringify(item.setting_value,null,2)});
    del.textContent="حذف";del.className="danger";del.addEventListener("click",()=>deleteSetting(item.setting_key));
    actions.append(edit,del);tr.append(key,val,time,actions);body.append(tr);
  }
}
$("newSetting").addEventListener("click",()=>{$("settingKey").value="";$("settingJson").value="{}"});
$("saveSetting").addEventListener("click",async()=>{
  let value;try{value=JSON.parse($("settingJson").value)}catch(_){return message("settingMsg","صيغة JSON غير صحيحة")}
  const key=$("settingKey").value.trim();if(!key)return message("settingMsg","اكتب اسم الإعداد");
  const {error}=await supabase.from("site_settings").upsert({setting_key:key,setting_value:value,updated_at:new Date().toISOString()});
  if(error)return message("settingMsg",error.message);
  message("settingMsg","تم حفظ الإعداد",true);await loadSettings();
});
async function deleteSetting(key){
  if(!confirm("هل تريد حذف هذا الإعداد؟"))return;
  const {error}=await supabase.from("site_settings").delete().eq("setting_key",key);
  if(error)return message("settingMsg",error.message);
  await loadSettings();
}

document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===btn));
  ["visitors","analytics","content","settings","subscriptions","community"].forEach(tab=>$("tab-"+tab).classList.toggle("hidden",tab!==btn.dataset.tab));
}));

setInterval(()=>{if(!$("dashboard").classList.contains("hidden"))loadDashboard()},60000);
checkSession();


// الاشتراكات والمدفوعات — لا يتم تفعيل باقة من هذه الواجهة تلقائيًا.
const PAYMENTS_FN = "midad-payments";
const COMMUNITY_FN = "midad-community";
let cachedPlans = {};
async function callAdminFunction(name, action, extra = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body: { action, ...extra } });
  if (error) throw new Error(error.message || "تعذر الاتصال بالخدمة");
  if (data?.error) throw new Error(data.error);
  return data;
}
function addCell(row, value) {
  const td = document.createElement("td");
  td.textContent = value == null ? "—" : String(value);
  row.append(td);
  return td;
}
function showPlanForm() {
  const code = $("planCode").value;
  const plan = cachedPlans[code];
  if (!plan) return;
  $("planMonthly").value = Math.round(plan.monthly_price_piasters / 100);
  $("planYearly").value = Math.round(plan.yearly_price_piasters / 100);
  $("planStatus").value = plan.is_active ? "مفعّلة" : "مغلقة — الدفع متوقف";
}
async function loadSubscriptions() {
  try {
    const [info, list] = await Promise.all([
      callAdminFunction(PAYMENTS_FN, "payment_info"),
      callAdminFunction(PAYMENTS_FN, "admin_list_requests")
    ]);
    if (!info.is_admin) throw new Error("الحساب لا يملك صلاحية الإدارة");
    cachedPlans = Object.fromEntries((info.plans || []).map(p => [p.code, p]));
    $("activePlans").textContent = fmt((info.plans || []).filter(p => p.code !== "free" && p.is_active).length);
    $("pendingPayments").textContent = fmt((list.requests || []).filter(r => r.status === "pending").length);
    showPlanForm();
    const body = $("paymentRows");
    body.replaceChildren();
    const requests = list.requests || [];
    if (!requests.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 8; td.className = "empty"; td.textContent = "لا توجد طلبات دفع حتى الآن";
      tr.append(td); body.append(tr);
    }
    for (const request of requests) {
      const tr = document.createElement("tr");
      addCell(tr, request.email);
      addCell(tr, request.plan_code === "plus" ? "Plus" : "Pro");
      addCell(tr, request.billing_period === "yearly" ? "سنوي" : "شهري");
      addCell(tr, (request.amount_piasters / 100).toLocaleString("ar-EG") + " جنيه");
      addCell(tr, request.transfer_reference);
      addCell(tr, ({pending:"قيد المراجعة",approved:"مقبول",rejected:"مرفوض"})[request.status] || request.status);
      addCell(tr, date(request.created_at));
      const actions = document.createElement("td");
      if (request.status === "pending") {
        const approve = document.createElement("button");
        approve.textContent = "اعتماد"; approve.addEventListener("click", async () => {
          if (!confirm("تأكدت بنفسك من وصول المبلغ إلى المحفظة؟ اعتماد الطلب سيفعّل اشتراك المستخدم فورًا.")) return;
          approve.disabled = true;
          try {
            await callAdminFunction(PAYMENTS_FN, "admin_review_request", {request_id:request.id,decision:"approve"});
            message("planMsg", "تم اعتماد التحويل وتفعيل الاشتراك.", true);
            await loadSubscriptions();
          } catch (e) { message("planMsg", e.message); approve.disabled = false; }
        });
        const reject = document.createElement("button");
        reject.textContent = "رفض"; reject.className = "danger";
        reject.addEventListener("click", async () => {
          if (!confirm("هل تريد رفض طلب الدفع هذا؟")) return;
          reject.disabled = true;
          try {
            await callAdminFunction(PAYMENTS_FN, "admin_review_request", {request_id:request.id,decision:"reject"});
            message("planMsg", "تم رفض الطلب.");
            await loadSubscriptions();
          } catch (e) { message("planMsg", e.message); reject.disabled = false; }
        });
        actions.append(approve, reject);
      } else {
        actions.textContent = "تمت المراجعة";
      }
      tr.append(actions); body.append(tr);
    }
    message("planMsg", "تم تحميل الأسعار وطلبات الدفع.", true);
  } catch (e) {
    message("planMsg", "تعذر تحميل الاشتراكات: " + e.message);
  }
}
$("planCode").addEventListener("change", showPlanForm);
$("refreshSubscriptions").addEventListener("click", loadSubscriptions);
$("savePlan").addEventListener("click", async () => {
  const code = $("planCode").value;
  const monthly = Number($("planMonthly").value), yearly = Number($("planYearly").value);
  if (!Number.isInteger(monthly) || !Number.isInteger(yearly) || monthly < 1 || yearly < 1) return message("planMsg", "اكتب أسعارًا صحيحة بالجنيه.");
  $("savePlan").disabled = true;
  try {
    await callAdminFunction(PAYMENTS_FN, "admin_update_plan", {
      plan_code: code, monthly_price_egp: monthly, yearly_price_egp: yearly,
      is_active: Boolean(cachedPlans[code]?.is_active)
    });
    message("planMsg", "تم حفظ الأسعار مع الحفاظ على حالة التفعيل الحالية.", true);
    await loadSubscriptions();
  } catch (e) { message("planMsg", e.message); }
  finally { $("savePlan").disabled = false; }
});

// متابعة مجتمع مِداد من لوحة الإدارة.
async function loadCommunity() {
  try {
    const data = await callAdminFunction(COMMUNITY_FN, "admin_dashboard");
    $("communityChallenges").textContent = fmt(data.stats.challenges);
    $("communityParticipants").textContent = fmt(data.stats.participants);
    $("communityCheckins").textContent = fmt(data.stats.checkins);
    $("communityMembers").textContent = fmt(data.stats.members);
    const rows = $("communityRows"); rows.replaceChildren();
    if (!data.challenges.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 5; td.className = "empty"; td.textContent = "لا توجد تحديات حتى الآن";
      tr.append(td); rows.append(tr);
    }
    for (const challenge of data.challenges) {
      const tr = document.createElement("tr");
      addCell(tr, challenge.title);
      addCell(tr, ({active:"نشط",completed:"مكتمل",cancelled:"ملغي"})[challenge.status] || challenge.status);
      addCell(tr, date(challenge.starts_at));
      addCell(tr, date(challenge.ends_at));
      const td = document.createElement("td");
      if (challenge.status === "active") {
        const cancel = document.createElement("button"); cancel.className = "danger"; cancel.textContent = "إيقاف التحدي";
        cancel.addEventListener("click", async () => {
          if (!confirm("هل تريد إيقاف هذا التحدي؟ لن يستطيع المشاركون تسجيل إنجازات جديدة.")) return;
          cancel.disabled = true;
          try { await callAdminFunction(COMMUNITY_FN, "admin_cancel_challenge", {challenge_id:challenge.id}); message("communityMsg", "تم إيقاف التحدي.", true); await loadCommunity(); }
          catch (e) { message("communityMsg", e.message); cancel.disabled = false; }
        });
        td.append(cancel);
      } else td.textContent = "—";
      tr.append(td); rows.append(tr);
    }
    const top = $("communityTop"); top.replaceChildren();
    (data.leaderboard || []).forEach((member, index) => {
      const tr = document.createElement("tr");
      addCell(tr, index + 1); addCell(tr, member.display_name);
      addCell(tr, member.level); addCell(tr, fmt(member.points_total));
      top.append(tr);
    });
    message("communityMsg", "تم تحديث إحصائيات المجتمع.", true);
    await loadCoinPurchaseRequests();
  } catch (e) {
    message("communityMsg", "تعذر تحميل المجتمع: " + e.message);
  }
}

async function loadCoinPurchaseRequests(){
 const body=$("coinRequestRows");if(!body)return;body.replaceChildren();
 try{
  const {data:requests,error}=await supabase.from("coin_purchase_requests").select("id,user_id,package_code,coins,amount_piasters,transfer_reference,status,created_at").order("created_at",{ascending:false}).limit(100);
  if(error)throw error;
  if(!requests?.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;td.textContent="لا توجد طلبات شراء كوينز";tr.append(td);body.append(tr);return;}
  for(const req of requests){const tr=document.createElement("tr");addCell(tr,req.user_id.slice(0,8));addCell(tr,req.package_code);addCell(tr,req.coins);addCell(tr,(req.amount_piasters/100)+" جنيه");addCell(tr,req.transfer_reference);addCell(tr,req.status==="pending"?"قيد المراجعة":req.status==="approved"?"مقبول":"مرفوض");const td=document.createElement("td");
   if(req.status==="pending"){for(const [label,decision] of [["اعتماد","approve"],["رفض","reject"]]){const b=document.createElement("button");b.textContent=label;b.className=decision==="reject"?"danger":"";b.addEventListener("click",async()=>{if(!confirm(decision==="approve"?"تأكدت من وصول التحويل فعلًا؟ سيتم إضافة الكوينز فورًا.":"رفض طلب شراء الكوينز؟"))return;b.disabled=true;try{const {error}=await supabase.rpc("midad_review_coin_purchase",{p_request_id:req.id,p_decision:decision});if(error)throw error;await loadCoinPurchaseRequests();}catch(e){alert(e.message);b.disabled=false;}});td.append(b);}}
   else td.textContent="تمت المراجعة";tr.append(td);body.append(tr);
  }
 }catch(e){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;td.textContent="تعذر تحميل طلبات الكوينز: "+e.message;tr.append(td);body.append(tr);}
}

$("refreshCommunity").addEventListener("click", loadCommunity);
