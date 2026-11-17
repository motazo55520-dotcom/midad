(() => {
"use strict";
const URL = "https://dheazidcgmvjauchesey.supabase.co";
const KEY = "sb_publishable_eI6CH_F8ThW5qFpkVMEGbA_GMDis66s";
const ENDPOINT = URL + "/functions/v1/midad-social";
const client = window.supabase.createClient(URL, KEY);
const $ = id => document.getElementById(id);
let started = false, activeRoomId = null, heartbeatTimer = null, pollTimer = null, clockTimer = null, currentRoomState = null;

function safe(parent, tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value == null ? "" : String(value);
  parent.append(node);
  return node;
}
function message(id, value, error) {
  const el = $(id);
  if (!el) return;
  el.textContent = value || "";
  el.style.color = error ? "#ff8d9f" : "";
}
async function api(action, extra) {
  const { data: { session } } = await client.auth.getSession();
  if (!session || !session.access_token) throw new Error("سجّل الدخول بحساب Plus أو Pro أولًا.");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + session.access_token },
    body: JSON.stringify(Object.assign({ action }, extra || {}))
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب.");
  return result;
}
function dateText(value) {
  return new Date(value).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function timeText(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
async function loadRooms() {
  const root = $("roomsList");
  try {
    const result = await api("rooms");
    root.replaceChildren();
    if (!result.rooms.length) {
      safe(root, "div", "مفيش غرف نشطة دلوقتي. أنشئ غرفتك وابدأ مع أصحابك.", "social-empty");
      return;
    }
    result.rooms.forEach(room => {
      const card = document.createElement("article");
      card.className = "social-card";
      const top = document.createElement("div");
      top.className = "social-card-top";
      const details = document.createElement("div");
      safe(details, "b", room.title);
      safe(details, "div", room.duration_minutes + " دقيقة · " + room.member_count + " / 12 مشارك", "social-muted");
      safe(details, "div", room.is_public ? "غرفة عامة" : "غرفة خاصة", "social-muted");
      top.append(details);
      if (room.joined) safe(top, "span", room.invite_code, "social-code");
      card.append(top);
      const button = safe(card, "button", room.joined ? "متابعة الغرفة" : "انضم للغرفة", "btn " + (room.joined ? "green" : "primary"));
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (!room.joined) await api("join_room", { invite_code: room.invite_code });
          await openRoom(room.id);
          await loadRooms();
        } catch (e) { message("roomNotice", e.message, true); }
        finally { button.disabled = false; }
      });
      root.append(card);
    });
  } catch (e) {
    root.replaceChildren();
    safe(root, "div", e.message, "social-empty");
  }
}
function renderRoom(state) {
  currentRoomState = state;
  const room = state.room;
  $("roomCurrent").hidden = false;
  $("roomCurrentTitle").textContent = room.title;
  $("roomCurrentMeta").textContent = room.duration_minutes + " دقيقة · " + (room.is_public ? "غرفة عامة" : "غرفة خاصة");
  $("roomCurrentCode").textContent = room.invite_code || "";
  $("roomCurrentCode").title = "اضغط لنسخ كود الدعوة";
  $("roomCurrentCode").onclick = async () => {
    try { await navigator.clipboard.writeText(room.invite_code); message("roomNotice", "تم نسخ كود الغرفة."); }
    catch (_) { message("roomNotice", "كود الغرفة: " + room.invite_code); }
  };
  $("roomStatusText").textContent = room.status === "completed" ? "انتهى وقت الجلسة. تقدر تراجع تقدم المشاركين." : "الغرفة شغالة — ركّز وخد وقتك.";
  const members = $("roomMembers");
  members.replaceChildren();
  state.members.forEach(member => {
    const row = document.createElement("div");
    row.className = "social-member";
    const top = document.createElement("div");
    top.className = "social-card-top";
    safe(top, "b", member.display_name + (member.is_me ? " (أنت)" : ""));
    safe(top, "span", member.is_active ? "متصل الآن" : "غير نشط", "social-muted");
    row.append(top);
    const progress = document.createElement("div");
    progress.className = "social-progress";
    const fill = document.createElement("span");
    fill.style.width = member.progress + "%";
    progress.append(fill);
    row.append(progress);
    safe(row, "div", timeText(member.focus_seconds) + " تركيز · " + member.progress + "%", "social-muted");
    members.append(row);
  });
  $("leaveRoom").disabled = false;
  $("leaveRoom").textContent = room.status === "completed" ? "إغلاق الغرفة" : "إنهاء مشاركتي";
  updateCountdown();
}
function updateCountdown() {
  if (!currentRoomState) return;
  const end = new Date(currentRoomState.room.ends_at).getTime();
  const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
  $("roomCountdown").textContent = timeText(remaining);
  if (remaining <= 0 && currentRoomState.room.status === "active") {
    $("roomStatusText").textContent = "انتهى الوقت — جارٍ تحديث حالة الغرفة.";
    refreshRoom().catch(() => {});
  }
}
async function refreshRoom() {
  if (!activeRoomId) return;
  const state = await api("room_state", { room_id: activeRoomId });
  renderRoom(state);
  if (state.room.status === "completed") stopRoomTimers();
}
function stopRoomTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  heartbeatTimer = pollTimer = clockTimer = null;
}
async function openRoom(id) {
  stopRoomTimers();
  activeRoomId = id;
  await refreshRoom();
  message("roomNotice", "أنت داخل الغرفة. التقدم بيتحدث تلقائيًا.");
  heartbeatTimer = setInterval(async () => {
    try { await api("heartbeat", { room_id: activeRoomId }); } catch (e) { message("roomNotice", e.message, true); }
  }, 15000);
  pollTimer = setInterval(() => refreshRoom().catch(e => message("roomNotice", e.message, true)), 12000);
  clockTimer = setInterval(updateCountdown, 1000);
}
async function loadWeekly() {
  const root = $("weeklyLeaderboard");
  try {
    const result = await api("leaderboard_weekly");
    root.replaceChildren();
    $("weeklyMeta").textContent = "الأسبوع بدأ " + dateText(result.week_starts_at);
    if (!result.leaderboard.length) {
      safe(root, "div", "لسه مفيش نقاط مسجلة الأسبوع ده. ابدأ أول إنجاز!", "social-empty");
      return;
    }
    result.leaderboard.forEach((person, index) => {
      const row = document.createElement("div");
      row.className = "social-week-rank";
      safe(row, "span", String(index + 1), "social-rank-no");
      const name = document.createElement("div");
      safe(name, "b", person.display_name + (person.is_me ? " (أنت)" : ""));
      safe(name, "div", "المستوى " + person.level, "social-muted");
      row.append(name);
      safe(row, "b", person.weekly_points + " نقطة");
      root.append(row);
    });
  } catch (e) {
    root.replaceChildren();
    safe(root, "div", e.message, "social-empty");
  }
}
function renderFeed(posts) {
  const root = $("socialFeed");
  root.replaceChildren();
  if (!posts.length) {
    safe(root, "div", "لسه مفيش إنجازات منشورة. شارك أول إنجاز ليك!", "social-empty");
    return;
  }
  posts.forEach(post => {
    const card = document.createElement("article");
    card.className = "social-post";
    const top = document.createElement("div");
    top.className = "social-card-top";
    const identity = document.createElement("div");
    safe(identity, "b", post.display_name);
    safe(identity, "div", dateText(post.created_at), "social-muted");
    top.append(identity);
    const right = document.createElement("div");
    safe(right, "span", post.visibility === "private" ? "خاص بيك" : "للمجتمع", "social-muted");
    if (post.is_mine) {
      const remove = safe(right, "button", "حذف", "btn");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!confirm("تحذف المنشور؟")) return;
        try { await api("delete_post", { post_id: post.id }); await loadFeed(); }
        catch (e) { message("feedNotice", e.message, true); }
      });
    }
    top.append(right);
    card.append(top);
    safe(card, "p", post.body, "social-post-body");
    const actions = document.createElement("div");
    actions.className = "social-actions";
    const like = safe(actions, "button", (post.liked_by_me ? "♥" : "♡") + " إعجاب · " + post.likes_count, "btn");
    like.type = "button";
    like.addEventListener("click", async () => {
      like.disabled = true;
      try { await api("toggle_like", { post_id: post.id }); await loadFeed(); }
      catch (e) { message("feedNotice", e.message, true); like.disabled = false; }
    });
    card.append(actions);
    const comments = document.createElement("div");
    (post.comments || []).forEach(comment => {
      const line = document.createElement("div");
      line.className = "social-comment";
      safe(line, "b", comment.display_name + ": ");
      line.append(document.createTextNode(comment.body));
      comments.append(line);
    });
    card.append(comments);
    const form = document.createElement("form");
    form.className = "social-comment-form";
    const input = document.createElement("input");
    input.className = "field";
    input.maxLength = 300;
    input.required = true;
    input.placeholder = "اكتب تعليقًا مشجعًا…";
    const submit = safe(form, "button", "تعليق", "btn green");
    submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      submit.disabled = true;
      try { await api("comment", { post_id: post.id, body: input.value }); await loadFeed(); }
      catch (e) { message("feedNotice", e.message, true); submit.disabled = false; }
    });
    card.append(form);
    root.append(card);
  });
}
async function loadFeed() {
  try {
    const result = await api("feed");
    renderFeed(result.posts || []);
  } catch (e) {
    $("socialFeed").replaceChildren();
    safe($("socialFeed"), "div", e.message, "social-empty");
  }
}
async function init() {
  if (started) return;
  started = true;
  $("roomCreateForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    message("roomNotice", "جارٍ إنشاء الغرفة…");
    try {
      const result = await api("create_room", {
        title: $("roomTitle").value.trim(),
        duration_minutes: Number($("roomDuration").value),
        is_public: $("roomPublic").checked
      });
      $("roomCreateForm").reset();
      await openRoom(result.room.id);
      await loadRooms();
      message("roomNotice", "تم إنشاء الغرفة. شارك الكود مع أصحابك.");
    } catch (e) { message("roomNotice", e.message, true); }
    finally { button.disabled = false; }
  });
  $("roomJoinForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const result = await api("join_room", { invite_code: $("roomCode").value.trim().toUpperCase() });
      $("roomCode").value = "";
      await openRoom(result.room.id);
      await loadRooms();
      message("roomNotice", result.message);
    } catch (e) { message("roomNotice", e.message, true); }
    finally { button.disabled = false; }
  });
  $("leaveRoom").addEventListener("click", async () => {
    if (!activeRoomId) return;
    try {
      await api("leave_room", { room_id: activeRoomId });
      stopRoomTimers();
      activeRoomId = null;
      $("roomCurrent").hidden = true;
      message("roomNotice", "أنهيت مشاركتك في الغرفة.");
      await loadRooms();
    } catch (e) { message("roomNotice", e.message, true); }
  });
  $("postForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await api("create_post", { body: $("postBody").value.trim(), visibility: $("postVisibility").value });
      $("postBody").value = "";
      await loadFeed();
      message("feedNotice", "تم نشر إنجازك.");
    } catch (e) { message("feedNotice", e.message, true); }
    finally { button.disabled = false; }
  });
  $("refreshFeed").addEventListener("click", loadFeed);
  $("refreshWeekly").addEventListener("click", loadWeekly);
  await Promise.all([loadRooms(), loadWeekly(), loadFeed()]);
  setInterval(() => {
    if (!activeRoomId) loadRooms();
    loadFeed();
    loadWeekly();
  }, 60000);
}
window.addEventListener("midad-community-ready", init);
})();