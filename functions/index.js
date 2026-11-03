
const {
    onRequest,
    onCall,
    HttpsError
} = require("firebase-functions/v2/https");

const { initializeApp } = require("firebase-admin/app");

const {
    getFirestore,
    FieldValue
} = require("firebase-admin/firestore");

const {
    defineSecret,
    defineString
} = require("firebase-functions/params");

const { Resend } = require("resend");

initializeApp();

const db = getFirestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const MAIL_FROM = defineString("MAIL_FROM");

const LOGIN_URL =
    "https://oud-platform-613fe.web.app/pages/login.html";

exports.sendCardIssuedEmail = onCall(
    { secrets: [RESEND_API_KEY] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "يجب تسجيل الدخول أولًا."
            );
        }

        const db = getFirestore();

        // التأكد من أن المستعمل عضو في الإدارة أو اللجنة
        const userDoc = await db
            .doc(`users/${request.auth.uid}`)
            .get();

        const role = userDoc.exists
            ? userDoc.data().role
            : null;

        if (!["admin", "committee"].includes(role)) {
            throw new HttpsError(
                "permission-denied",
                "هذه العملية مخصصة للإدارة واللجنة."
            );
        }

        const cardId = String(request.data?.cardId || "").trim();

        if (!cardId) {
            throw new HttpsError(
                "invalid-argument",
                "معرّف البطاقة غير صالح."
            );
        }

        // قراءة بيانات البطاقة من Firestore
        const cardRef = db.doc(`volunteerCards/${cardId}`);
        const cardSnapshot = await cardRef.get();

        if (!cardSnapshot.exists) {
            throw new HttpsError(
                "not-found",
                "لم يتم العثور على البطاقة."
            );
        }

        const card = cardSnapshot.data();

        if (
            card.status !== "active" ||
            !card.email ||
            !card.cardNumber
        ) {
            throw new HttpsError(
                "failed-precondition",
                "بيانات البطاقة غير مكتملة أو غير نشطة."
            );
        }

        if (card.issuanceEmailStatus === "sent") {
            throw new HttpsError(
                "already-exists",
                "سبق إرسال رسالة هذه البطاقة."
            );
        }

        // منع إرسال رسالتين للبطاقة نفسها في الوقت ذاته
        await db.runTransaction(async (transaction) => {
            const freshSnapshot = await transaction.get(cardRef);

            if (!freshSnapshot.exists) {
                throw new HttpsError(
                    "not-found",
                    "لم يتم العثور على البطاقة."
                );
            }

            const freshCard = freshSnapshot.data();

            if (freshCard.issuanceEmailStatus === "sent") {
                throw new HttpsError(
                    "already-exists",
                    "سبق إرسال رسالة هذه البطاقة."
                );
            }

            if (freshCard.issuanceEmailStatus === "sending") {
                throw new HttpsError(
                    "aborted",
                    "يجري إرسال رسالة هذه البطاقة بالفعل."
                );
            }

            transaction.update(cardRef, {
                issuanceEmailStatus: "sending",
                issuanceEmailAttemptedAt:
                    FieldValue.serverTimestamp()
            });
        });

        try {
            const resend = new Resend(RESEND_API_KEY.value());

            const isNewAccount = card.mustChangePassword === true;

            const loginInstructions = isNewAccount
                ? `
                    <p>
                        <strong>بيانات الدخول:</strong><br>
                        البريد الإلكتروني:
                        ${escapeHtml(card.email)}<br>
                        كلمة المرور الأولية هي رقم البطاقة نفسه:
                        <strong>${escapeHtml(card.cardNumber)}</strong>.
                        ننصحك بتغييرها بعد أول دخول.
                    </p>
                  `
                : `
                    <p>
                        يمكنك الدخول باستخدام بيانات حسابك الحالية.
                        لم يتم تغيير كلمة المرور.
                    </p>
                  `;

            const result = await resend.emails.send({
                from: MAIL_FROM.value(),
                to: [String(card.email).trim().toLowerCase()],
                subject:
                    "تم إنشاء بطاقة التطوع الخاصة بك في منصة عُضد",

                html: `
                    <div dir="rtl"
                         style="font-family:Arial,Tahoma,sans-serif;
                                line-height:1.9;
                                color:#20312d;
                                max-width:640px;
                                margin:auto">

                        <h2 style="color:#20594f">
                            تم إنشاء بطاقة عُضد الخاصة بك
                        </h2>

                        <p>
                            مرحبًا
                            <strong>
                                ${escapeHtml(card.fullName || "متطوع عُضد")}
                            </strong>،
                        </p>

                        <p>
                            نُعلمك بأنه تم إنشاء بطاقة التطوع الخاصة بك
                            في منصة عُضد.
                        </p>

                        <p style="padding:14px;
                                  background:#f1f7f5;
                                  border-radius:10px">
                            <strong>رقم البطاقة:</strong>
                            <span dir="ltr"
                                  style="font-size:18px;font-weight:bold">
                                ${escapeHtml(card.cardNumber)}
                            </span>
                        </p>

                        ${loginInstructions}

                        <p>
                            <strong>لاستكمال بطاقتك:</strong>
                            يرجى الرد على هذه الرسالة وإرفاق صورة شخصية
                            واضحة وحديثة حتى نتمكن من إضافتها إلى البطاقة.
                        </p>

                        <p>
                            <a href="${LOGIN_URL}">
                                الدخول إلى منصة عُضد
                            </a>
                        </p>

                        <p>
                            مع تحيات،<br>
                            فريق منصة عُضد
                        </p>
                    </div>
                `,

                text: `
مرحبًا ${card.fullName || "متطوع عُضد"}،

نُعلمك بأنه تم إنشاء بطاقة التطوع الخاصة بك في منصة عُضد.

رقم البطاقة: ${card.cardNumber}

${
    isNewAccount
        ? `البريد الإلكتروني: ${card.email}
كلمة المرور الأولية: رقم البطاقة نفسه.
ننصحك بتغييرها بعد أول دخول.`
        : "يمكنك الدخول باستخدام بيانات حسابك الحالية؛ لم يتم تغيير كلمة المرور."
}

يرجى الرد على هذه الرسالة وإرفاق صورة شخصية واضحة وحديثة لإكمال البطاقة.

رابط الدخول: ${LOGIN_URL}

مع تحيات فريق منصة عُضد
                `
            });

            if (result.error) {
                throw new Error(result.error.message);
            }

            await cardRef.update({
                issuanceEmailStatus: "sent",
                issuanceEmailSentAt: FieldValue.serverTimestamp()
            });

            return { success: true };

        } catch (error) {
            await cardRef.update({
                issuanceEmailStatus: "failed",
                issuanceEmailFailedAt: FieldValue.serverTimestamp(),
                issuanceEmailError:
                    String(error.message || "Email send failed").slice(0, 500)
            }).catch(() => {});

            console.error("Email sending failed:", error);

            throw new HttpsError(
                "internal",
                "تعذر إرسال البريد. تحققي من إعداد خدمة البريد."
            );
        }
    }
);

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


exports.publicVolunteerDirectory = onRequest(
  {
    region: "europe-west1",
    cors: true,
    maxInstances: 3,
  },
  async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");

    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed",
      });
    }

    try {
      const snapshot = await db
        .collection("participationRecords")
        .where("verified", "==", true)
        .get();

      const participants = new Map();

      snapshot.forEach((doc) => {
        const record = doc.data();

        if (record.verified !== true) return;

        const fullName = String(
          record.participantName || record.fullName || ""
        ).trim();

        if (!fullName) return;

        const personKey = record.userId
          ? `user:${record.userId}`
          : record.guestId
          ? `guest:${record.guestId}`
          : record.registrationId
          ? `registration:${record.registrationId}`
          : `record:${doc.id}`;

        if (!participants.has(personKey)) {
          participants.set(personKey, {
            fullName,
            category: String(record.category || ""),
            campaigns: new Map(),
          });
        }

        const person = participants.get(personKey);
        const campaignId = String(
          record.campaignId || record.campaignTitle || doc.id
        );

        const rawDate = record.date;
        let date = "";

        if (rawDate && typeof rawDate.toDate === "function") {
          date = rawDate.toDate().toISOString();
        } else if (typeof rawDate === "string") {
          date = rawDate;
        }

        const campaign = {
          title: String(record.campaignTitle || "حملة تطوعية"),
          date,
          hours: Math.max(0, Number(record.hours) || 0),
        };

        if (!person.campaigns.has(campaignId)) {
          person.campaigns.set(campaignId, campaign);
        } else {
          const old = person.campaigns.get(campaignId);

          if (date && (!old.date || date > old.date)) {
            old.date = date;
          }

          old.hours = Math.max(old.hours, campaign.hours);
        }
      });

      const result = [...participants.values()].map((person) => ({
        fullName: person.fullName,
        category: person.category,
        participatedCampaigns: [...person.campaigns.values()],
      }));

      return res.status(200).json({
        success: true,
        count: result.length,
        participants: result,
      });
    } catch (error) {
      console.error("Public directory error:", error);

      return res.status(500).json({
        success: false,
        error: "تعذر تحميل دليل المشاركين",
      });
    }
  }
);
