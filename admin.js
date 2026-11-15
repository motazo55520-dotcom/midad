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
    $("authMsg").textContent = "الحساب اتسجل بنجاح لكنه لم يحصل على صلاحية الإدارة بعد. ابعت بريد الحساب لمالك الموقع لاعتماده.";
    return;
  }
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

$("signupBtn").addEventListener("click", async () => {
  $("authMsg").textContent = "جارٍ إنشاء الحساب…";
  const { data, error } = await supabase.auth.signUp({
    email: $("email").value.trim(),
    password: $("password").value
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
  await Promise.all([loadVisitors(), loadAnalytics(), loadContent(), loadSettings()]);
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

async function loadAnalytics() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase.from("analytics_events")
    .select("page_path,referrer_domain,session_id,occurred_at")
    .eq("event_name", "page_view").gte("occurred_at", since)
    .order("occurred_at", { ascending: false }).limit(5000);
  if (error) return;
  const pages = new Map(), sources = new Map(), sessions = new Set();
  for (const e of data || []) sessions.add(e.session_id);
  const unique = sessions.size;
  const views = (data || []).length;
  $("uniqueSessions").textContent = fmt(unique);
  $("avgViews").textContent = fmt(unique ? (views / unique).toFixed(1) : 0);
  for (const e of data || []) {
    pages.set(e.page_path, (pages.get(e.page_path) || 0) + 1);
    const s = e.referrer_domain || "مباشر";
    sources.set(s, (sources.get(s) || 0) + 1);
  }
  const table = (map) => {
    const t = document.createElement("table");
    const h = document.createElement("tr");
    ["العنصر", "الزيارات"].forEach(x => { const th = document.createElement("th"); th.textContent = x; h.append(th); });
    t.append(h);
    [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v])=>{
      const tr=document.createElement("tr"); const a=document.createElement("td"); const b=document.createElement("td");
      a.textContent=k; b.textContent=fmt(v); tr.append(a,b); t.append(tr);
    });
    return t;
  };
  $("topPages").replaceChildren(table(pages));
  $("sources").replaceChildren(table(sources));
}

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
  $("contentJson").value=JSON.stringify(item.content,null,2);
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
  let content; try{content=JSON.parse($("contentJson").value)}catch(_){return message("contentMsg","صيغة JSON غير صحيحة")}
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
  ["visitors","analytics","content","settings"].forEach(tab=>$("tab-"+tab).classList.toggle("hidden",tab!==btn.dataset.tab));
}));

setInterval(()=>{if(!$("dashboard").classList.contains("hidden"))loadDashboard()},60000);
checkSession();
