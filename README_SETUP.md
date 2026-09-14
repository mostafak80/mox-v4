# MOX-V2

نسخة MOX-V2 المحلية لإدارة عمليات المتجر والأرباح والمصاريف.

## الملفات
- `index.html` الواجهة
- `style.css` التصميم
- `app.js` المنطق والتخزين والتقارير
- `manifest.webmanifest` إعداد PWA
- `sw.js` كاش التطبيق
- `assets/logo.png` اللوجو

## التخزين
البيانات الأساسية محفوظة في IndexedDB داخل نفس المتصفح، مع ترحيل تلقائي من مفاتيح MOX القديمة في localStorage عند أول تشغيل.

## النسخ الاحتياطي
من الإعدادات > البيانات يمكنك تنزيل Backup بصيغة JSON أو استرجاعه. الموقع يحتفظ أيضًا بعدد محدود من Safety Snapshots محليًا قبل العمليات الخطرة.

## المصاريف الثابتة
- المصروف `شهري` يُحسب مرة لكل شهر داخل فترة التقرير.
- المصروف `سنوي` يُحسب مرة لكل سنة وفق تاريخ البداية.
- المصاريف الشهرية القديمة التي تم ترحيلها تُرجع تلقائيًا لأول شهر موجود في سجل العمليات حتى تظهر بشكل صحيح في تقارير الشهور السابقة والسنة.

## العروض السريعة
من شاشة إضافة يمكنك استخدام `تحديد متعدد` لاختيار عدة عروض وإضافتها كلها مرة واحدة بنفس تاريخ الإدخال.

## ملاحظات
- لا توجد مزامنة سحابية أو Firebase في هذه النسخة.
- لا يوجد قفل/قسم أمان داخل التطبيق.
- Excel يعمل بـ 8 أعمدة وبالأرقام الإنجليزية والتاريخ مثل `1/5`.

- سجل العمليات يحتوي الآن على: تعديل + أرشفة/استرجاع + حذف نهائي مع تأكيد، Safety Snapshot، وزر تراجع بعد الحذف.

## MOX Smart features
- Smart Offer Suggestion: ranks up to 3 offers for imported wallet messages, shows confidence, detects small customer overpayments, and uses previous sender history when available.
- Anomaly Detection: flags likely duplicate transactions, losses, very low margins, unusual profit, unusually large quantity, and large differences from the saved offer price.
- Smart Pricing: analyses the last 90 days and suggests price increases for high-volume / low-margin offers. Prices are never changed automatically; the user must confirm Apply.
- All smart analysis runs locally in the browser. No store data is sent to an external AI service.
