/* Midad public, admin-managed text content. Safe text-only rendering. */
(() => {
  "use strict";
  const PROJECT_URL = "https://dheazidcgmvjauchesey.supabase.co";
  const PUBLIC_KEY = "sb_publishable_eI6CH_F8ThW5qFpkVMEGbA_GMDis66s";
  const endpoint = PROJECT_URL + "/rest/v1/site_content?select=content_key,content&is_published=eq.true&order=sort_order.asc";
  async function applyPublishedContent() {
    try {
      const response = await fetch(endpoint, {
        headers: { apikey: PUBLIC_KEY },
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Content request failed: " + response.status);
      const rows = await response.json();
      const values = new Map((rows || []).map(row => [row.content_key, row.content]));
      document.querySelectorAll("[data-admin-key]").forEach(element => {
        const value = values.get(element.dataset.adminKey);
        if (typeof value === "string") element.textContent = value;
        else if (value && typeof value.text === "string") element.textContent = value.text;
      });
    } catch (error) {
      console.warn("[Midad] Admin-managed content was not loaded; default text remains visible.", error);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyPublishedContent, { once: true });
  else applyPublishedContent();
})();
