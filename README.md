# مِداد — دليل النشر على GitHub Pages

## ١) ضبط الدومين (مرة واحدة)
بدّل `YOUR-DOMAIN.com` باسم دومينك الحقيقي في الملفات: `index.html` و `sitemap.xml` و `robots.txt` و `404.html` و `CNAME`.

أسهل طريقة (Mac / Linux / Git Bash على ويندوز):

    ./set-domain.sh midad.com

أو افتح الملفات في أي محرر واعمل Find & Replace، وفي `CNAME` اكتب الدومين فقط بدون https.

## ٢) الرفع على GitHub
1. أنشئ مستودعًا جديدًا (Repository) على GitHub، مثلًا `midad`.
2. ارفع كل ملفات هذا المجلد في جذر المستودع (ملف `index.html` لازم يكون في الجذر).
3. من **Settings ← Pages**: اختر Deploy from a branch، الفرع `main` والمجلد `/ (root)`، ثم Save.
4. تحت **Custom domain** اكتب دومينك واضغط Save، وفعّل **Enforce HTTPS** بعد ما يظهر.

## ٣) إعدادات DNS عند مزوّد الدومين
لدومين جذري مثل `midad.com` أضف سجلات A:

    185.199.108.153
    185.199.109.153
    185.199.110.153
    185.199.111.153

وسجلات AAAA (اختيارية للـ IPv6):

    2606:50c0:8000::153
    2606:50c0:8001::153
    2606:50c0:8002::153
    2606:50c0:8003::153

ولـ `www` أضف سجل CNAME يشير إلى `USERNAME.github.io`.
التفعيل بياخد من دقائق لحد ٢٤ ساعة. يُفضّل كمان توثيق الدومين من **Settings ← Pages ← Add a domain** في حسابك على GitHub.

## ٤) بعد ما الموقع يشتغل (SEO)
- سجّل الموقع في **Google Search Console** (خيار Domain)، ثم أرسل `https://دومينك/sitemap.xml`.
- كرر نفس الخطوة في **Bing Webmaster Tools**.
- جرّب رابط الموقع في أداة Rich Results Test للتأكد من بيانات `FAQPage` و `WebApplication`.
- شارك الرابط على واتساب أو فيسبوك للتأكد من ظهور صورة المعاينة (`og-image.jpg`). لو غيّرتها، فيه مواقع بتخزن القديمة وتحتاج وقت.

## محتويات المجلد
| الملف | وظيفته |
|---|---|
| `index.html` | التطبيق كامل + وسوم SEO + بيانات منظّمة (JSON-LD) + قسم «عن مِداد» |
| `sw.js` و `manifest.webmanifest` | تشغيل بدون إنترنت وتثبيت على الموبايل |
| `robots.txt` و `sitemap.xml` | إرشاد محركات البحث |
| `CNAME` | الدومين المخصص لـ GitHub Pages |
| `404.html` | صفحة الخطأ |
| `favicon.svg` و `icon-*.png` و `apple-touch-icon.png` | الأيقونات |
| `og-image.jpg` | صورة المعاينة عند المشاركة (١٢٠٠×٦٣٠) |

## تحديث الموقع لاحقًا
عدّل `index.html` وارفعه. لو غيّرت أي ملف يتخزّن أوفلاين، غيّر رقم النسخة في `sw.js` (`midad-v1` ← `midad-v2`) عشان المستخدمين ياخدوا التحديث.
