
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updatePassword
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

// إنشاء حساب
async function registerVolunteer(fullName, email, password) {
    const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
        fullName,
        email,
        role: "volunteer",
        mustChangePassword: false,
        createdAt: serverTimestamp()
    });

    return user;
}

// تسجيل الدخول والتحقق من حالة الحساب
async function loginUser(email, password) {
    const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    const user = userCredential.user;
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!userSnapshot.exists()) {
        await signOut(auth);
        throw new Error("لا يوجد ملف مستخدم مرتبط بهذا الحساب.");
    }

    const userData = userSnapshot.data();

    // السماح للمتطوع الذي لديه بطاقة نشطة فقط بالدخول
    if (userData.role === "volunteer") {
        const cardNumber = userData.cardNumber;

        if (!cardNumber || userData.cardStatus !== "active") {
            await signOut(auth);
            throw new Error("لا توجد بطاقة متطوع نشطة مرتبطة بحسابك.");
        }

        // إذا كانت كلمة المرور أولية، تُعاد هذه الحالة لصفحة الدخول
        if (userData.mustChangePassword === true) {
            return {
                user,
                mustChangePassword: true,
                role: userData.role
            };
        }
    }

    return {
        user,
        mustChangePassword: false,
        role: userData.role
    };
}

// تغيير كلمة المرور الحالية للمستخدم المسجل دخوله
async function changeCurrentPassword(newPassword) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("يرجى تسجيل الدخول أولًا.");
    }

    if (!newPassword || newPassword.length < 6) {
        throw new Error("يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل.");
    }

    // تحديث كلمة المرور في Firebase Authentication
    await updatePassword(user, newPassword);

    // تحديث حالة الحساب في Firestore، دون تخزين كلمة المرور
    const userRef = doc(db, "users", user.uid);

    await setDoc(userRef, {
        mustChangePassword: false,
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

// تسجيل الخروج
async function logoutUser() {
    await signOut(auth);
}

export {
    registerVolunteer,
    loginUser,
    logoutUser,
    changeCurrentPassword
};