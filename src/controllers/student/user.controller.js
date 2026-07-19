const { db, admin } = require("../../services/firebase");
const { uploadFile } = require("../../services/storage");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const parseMaybeJson = (value, fallback = value) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeArray = (value) => {
  const parsed = parseMaybeJson(value, value);

  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  if (!parsed) return [];

  return String(parsed)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
};

const getProfileImageFile = (req) =>
  req.file ||
  req.files?.profileImage?.[0] ||
  req.files?.profilePhoto?.[0] ||
  null;

const uploadProfileImage = async (req) => {
  const file = getProfileImageFile(req);
  if (!file) return null;

  if (file.mimetype && !file.mimetype.startsWith("image/")) {
    const error = new Error("Profile image must be an image file");
    error.statusCode = 400;
    throw error;
  }

  return uploadFile(file, "users/profile-images");
};

const buildStudentProfilePayload = (body, base = {}) => ({
  phoneNumber: body.phoneNumber || body.phone || base.phoneNumber || "",
  displayName:
    body.displayName ||
    body.fullName ||
    body.name ||
    base.displayName ||
    (base.email ? base.email.split("@")[0] : ""),

  personalInfo: {
    dob: body.dob || base.personalInfo?.dob || "",
    gender: body.gender || base.personalInfo?.gender || "",
    languages:
      body.languages !== undefined
        ? normalizeArray(body.languages)
        : base.personalInfo?.languages || [],
    maritalStatus:
      body.maritalStatus || base.personalInfo?.maritalStatus || "",
  },

  address: {
    addressLine1:
      body.addressLine1 || body.addr_line1 || base.address?.addressLine1 || "",
    addressLine2:
      body.addressLine2 || body.addr_line2 || base.address?.addressLine2 || "",
    city: body.city || body.addr_city || base.address?.city || "",
    state: body.state || body.addr_state || base.address?.state || "",
    zipCode: body.zipCode || body.addr_zip || base.address?.zipCode || "",
  },

  interests: {
    hobbies:
      body.hobbies !== undefined
        ? normalizeArray(body.hobbies)
        : base.interests?.hobbies || [],
    interestedSkill:
      body.interestedSkill !== undefined || body.skill !== undefined
        ? normalizeArray(body.interestedSkill ?? body.skill)
        : base.interests?.interestedSkill || [],
    fitnessInterests:
      body.fitnessInterests !== undefined
        ? normalizeArray(body.fitnessInterests)
        : base.interests?.fitnessInterests || [],
    careerAspire: body.careerAspire || base.interests?.careerAspire || "",
    goalForLearning:
      body.goalForLearning || base.interests?.goalForLearning || "",
    learningMode: body.learningMode || base.interests?.learningMode || "",
  },

  career: {
    qualification: body.qualification || base.career?.qualification || "",
    employmentStatus:
      body.employmentStatus || body.employment || base.career?.employmentStatus || "",
    yearsOfExperience:
      body.yearsOfExperience || body.experience || base.career?.yearsOfExperience || "",
    designation: body.designation || base.career?.designation || "",
    industry: body.industry || base.career?.industry || "",
    expectedNextRole:
      body.expectedNextRole || body.expectedRole || base.career?.expectedNextRole || "",
    expectedSalary:
      body.expectedSalary || base.career?.expectedSalary || "",
    willingnessToReskill:
      body.willingnessToReskill !== undefined || body.willingToReskill !== undefined
        ? normalizeBoolean(body.willingnessToReskill ?? body.willingToReskill)
        : base.career?.willingnessToReskill || false,
    careerChangeDomain:
      body.careerChangeDomain || body.switchDomain || base.career?.careerChangeDomain || "",
  },

});



// exports.register = async (req, res) => {
//   try {
//     let {
//       email,
//       password,
//       phoneNumber,
//       displayName,

//       dob,
//       gender,
//       languages,
//       maritalStatus,

//       addressLine1,
//       addressLine2,
//       city,
//       state,
//       zipCode,

//       hobbies,
//       interestedSkill,
//       fitnessInterests,
//       careerAspire,
//       goalForLearning,
//       learningMode,

//       qualification,
//       employmentStatus,
//       yearsOfExperience,
//       designation,
//       industry,
//       expectedNextRole,
//       expectedSalary,
//       willingnessToReskill,
//       careerChangeDomain,
//     } = req.body;

//     // ── Presence checks ──────────────────────────────────────────────
//     if (!email || !password || !phoneNumber) {
//       return res.status(400).json({
//         success: false,
//         message: "Email, password, and phone number are required",
//       });
//     }

//     // ── Normalize input ──────────────────────────────────────────────
//     email = String(email).trim().toLowerCase();
//     phoneNumber = String(phoneNumber).trim();
//     displayName = displayName ? String(displayName).trim() : "";

//     // ── Format validation ────────────────────────────────────────────
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) {
//       return res.status(400).json({
//         success: false,
//         message: "Please enter a valid email address",
//       });
//     }

//     const phoneRegex = /^\+?[0-9]{7,15}$/;
//     if (!phoneRegex.test(phoneNumber)) {
//       return res.status(400).json({
//         success: false,
//         message: "Please enter a valid phone number",
//       });
//     }

//     if (typeof password !== "string" || password.length < 6) {
//       return res.status(400).json({
//         success: false,
//         message: "Password must be at least 6 characters",
//       });
//     }

//     if (!process.env.JWT_SECRET) {
//       console.error("JWT_SECRET is not configured");
//       return res.status(500).json({
//         success: false,
//         message: "Server configuration error",
//       });
//     }

//     // ── Prepare refs ─────────────────────────────────────────────────
//     const usersRef = db.collection("users");
//     // Dedicated index collections act as atomic uniqueness locks —
//     // Firestore has no native unique-constraint feature, so the doc ID
//     // itself (email / phone) is the constraint.
//     const emailIndexRef = db.collection("emailIndex").doc(email);
//     const phoneIndexRef = db.collection("phoneIndex").doc(phoneNumber);
//     const counterRef = db.collection("system").doc("counters");
//     const userRef = usersRef.doc();
//     const uid = userRef.id;

//     // Hash outside the transaction — bcrypt is slow/async and Firestore
//     // transactions should stay short and retry-safe.
//     const hashedPassword = await bcrypt.hash(password, 10);

//     let studentId;

//     // ── Atomic transaction: uniqueness + counter + create ───────────
//     await db.runTransaction(async (tx) => {
//       const [emailDoc, phoneDoc, counterDoc] = await Promise.all([
//         tx.get(emailIndexRef),
//         tx.get(phoneIndexRef),
//         tx.get(counterRef),
//       ]);

//       if (emailDoc.exists) {
//         throw { code: "EMAIL_EXISTS" };
//       }
//       if (phoneDoc.exists) {
//         throw { code: "PHONE_EXISTS" };
//       }

//       const studentNumber = counterDoc.exists
//         ? counterDoc.data().studentCounter + 1
//         : 100001;
//       studentId = `STU_${studentNumber}`;

//       tx.set(counterRef, { studentCounter: studentNumber }, { merge: true });
//       tx.set(emailIndexRef, { uid });
//       tx.set(phoneIndexRef, { uid });

//       tx.set(userRef, {
//         uid,
//         studentId,
//         email,
//         password: hashedPassword,
//         phoneNumber,
//         displayName: displayName || email.split("@")[0],

//         role: "student",

//         personalInfo: {
//           dob: dob || "",
//           gender: gender || "",
//           languages: Array.isArray(languages)
//             ? languages
//             : languages
//             ? [languages]
//             : [],
//           maritalStatus: maritalStatus || "",
//         },

//         address: {
//           addressLine1: addressLine1 || "",
//           addressLine2: addressLine2 || "",
//           city: city || "",
//           state: state || "",
//           zipCode: zipCode || "",
//         },

//         interests: {
//           hobbies: Array.isArray(hobbies)
//             ? hobbies
//             : hobbies
//             ? [hobbies]
//             : [],
//           interestedSkill: interestedSkill || "",
//           fitnessInterests: fitnessInterests || "",
//           careerAspire: careerAspire || "",
//           goalForLearning: goalForLearning || "",
//           learningMode: learningMode || "",
//         },

//         career: {
//           qualification: qualification || "",
//           employmentStatus: employmentStatus || "",
//           yearsOfExperience: yearsOfExperience || "",
//           designation: designation || "",
//           industry: industry || "",
//           expectedNextRole: expectedNextRole || "",
//           expectedSalary: expectedSalary || "",
//           willingnessToReskill: !!willingnessToReskill,
//           careerChangeDomain: careerChangeDomain || "",
//         },

//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//         updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//       });
//     });

//     // ── Issue token ───────────────────────────────────────────────────
//     const token = jwt.sign(
//       {
//         uid,
//         studentId,
//         email,
//         role: "student",
//       },
//       process.env.JWT_SECRET,
//       {
//         expiresIn: "7d",
//       },
//     );

//     return res.status(201).json({
//       success: true,
//       message: "User registered successfully",
//       token,
//       user: {
//         uid,
//         studentId,
//         email,
//         phoneNumber,
//         displayName: displayName || email.split("@")[0],
//         role: "student",
//       },
//     });
//   } catch (error) {
//     if (error && error.code === "EMAIL_EXISTS") {
//       return res.status(409).json({
//         success: false,
//         message: "Email already exists",
//       });
//     }
//     if (error && error.code === "PHONE_EXISTS") {
//       return res.status(409).json({
//         success: false,
//         message: "Phone number already exists",
//       });
//     }

//     console.error("Register error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Something went wrong. Please try again later.",
//     });
//   }
// };
exports.register = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    const usersRef = db.collection("users");
    let email;
    let password;
    let decoded = null;
    let authProvider = "password";

    if (idToken) {
      try {
        decoded = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        console.error("Invalid Google ID token:", err);
        return res.status(401).json({
          success: false,
          message: "Invalid or expired Google sign-in. Please try again.",
        });
      }

      email = (decoded.email || "").trim().toLowerCase();
      authProvider = "google";

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "This Google account has no email address",
        });
      }

      if (decoded.email_verified === false) {
        return res.status(403).json({
          success: false,
          message: "Please verify your Google account's email first",
        });
      }
    } else {
      email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      password = req.body.password;

      const phoneNumber = String(req.body.phoneNumber || req.body.phone || "").trim();

      if (!email || !password || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: "Email, password, and phone number are required",
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address",
        });
      }

      if (!/^\+?[0-9]{7,15}$/.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid phone number",
        });
      }

      if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }
    }

    const existing = await usersRef.where("email", "==", email).limit(1).get();
    let uploadedProfileImage = null;

    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      const userData = existingDoc.data();

      if (!idToken) {
        if (!userData.password) {
          return res.status(400).json({
            success: false,
            message: "This account cannot be updated with a password signup request.",
          });
        }

        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) {
          return res.status(400).json({
            success: false,
            message: "Invalid email or password",
          });
        }
      }

      uploadedProfileImage = await uploadProfileImage(req);
      const profilePayload = buildStudentProfilePayload(req.body, userData);
      const existingUpdateData = {
        ...profilePayload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (uploadedProfileImage) {
        existingUpdateData.profileImage = uploadedProfileImage;
        userData.profileImage = uploadedProfileImage;
      }

      await existingDoc.ref.update(existingUpdateData);

      const token = jwt.sign(
        {
          uid: userData.uid,
          studentId: userData.studentId || undefined,
          email: userData.email,
          role: userData.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        token,
        user: {
          uid: userData.uid,
          studentId: userData.studentId || null,
          email: userData.email,
          phoneNumber: profilePayload.phoneNumber || "",
          displayName: profilePayload.displayName || email.split("@")[0],
          profileImage: uploadedProfileImage || userData.profileImage || "",
          role: userData.role,
        },
      });
    }

    if (!idToken) {
      // Email verification now happens client-side (EmailJS OTP) before this
      // request is sent; the frontend asserts the result here.
      if (req.body.emailVerified !== true && req.body.emailVerified !== "true") {
        return res.status(403).json({
          success: false,
          message: "Please verify your email with the code we sent before creating an account.",
        });
      }
    }

    uploadedProfileImage = await uploadProfileImage(req);

    const emailIndexRef = db.collection("emailIndex").doc(email);
    const phoneNumber = String(req.body.phoneNumber || req.body.phone || "").trim();
    const phoneIndexRef = phoneNumber
      ? db.collection("phoneIndex").doc(phoneNumber)
      : null;
    const counterRef = db.collection("system").doc("counters");
    const userRef = usersRef.doc();
    const uid = userRef.id;
    const profilePayload = buildStudentProfilePayload(req.body, {
      email,
      displayName: decoded?.name || email.split("@")[0],
    });
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const referredByUid = req.body.referredBy ? String(req.body.referredBy).trim() : null;
    const referrerRef = referredByUid ? usersRef.doc(referredByUid) : null;
    let studentId;

    await db.runTransaction(async (tx) => {
      const reads = [tx.get(emailIndexRef), tx.get(counterRef)];
      if (phoneIndexRef) reads.splice(1, 0, tx.get(phoneIndexRef));
      if (referrerRef) reads.push(tx.get(referrerRef));

      const results = await Promise.all(reads);
      const emailDoc = results[0];
      const phoneDoc = phoneIndexRef ? results[1] : null;
      const counterDoc = phoneIndexRef ? results[2] : results[1];
      const referrerDoc = referrerRef ? results[results.length - 1] : null;
      const validReferredBy = referrerDoc?.exists ? referredByUid : null;

      if (emailDoc.exists) throw { code: "EMAIL_EXISTS" };
      if (phoneDoc?.exists) throw { code: "PHONE_EXISTS" };

      const studentNumber = counterDoc.exists
        ? counterDoc.data().studentCounter + 1
        : 100001;
      studentId = `STU_${studentNumber}`;

      tx.set(counterRef, { studentCounter: studentNumber }, { merge: true });
      tx.set(emailIndexRef, { uid });
      if (phoneIndexRef) tx.set(phoneIndexRef, { uid });

      if (validReferredBy) {
        tx.update(referrerRef, {
          referralCount: admin.firestore.FieldValue.increment(1),
        });
      }

      tx.set(userRef, {
        uid,
        studentId,
        email,
        referredBy: validReferredBy,
        referralCount: 0,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        ...profilePayload,
        role: "student",
        authProvider,
        ...(decoded?.uid ? { firebaseUid: decoded.uid } : {}),
        profileImage: uploadedProfileImage || "",
        // Reaching this point means the email was already verified — either
        // via the client-side EmailJS OTP gate above, or (Google sign-in)
        // Firebase's own email_verified claim.
        verification: { emailVerified: true, phoneVerified: false },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (!idToken) {
      // Creates a real Firebase Auth user (matching Firestore's uid) so
      // Firebase's own sendEmailVerification/sendPasswordResetEmail work for
      // this account going forward. Best-effort: signup already succeeded
      // above, so a hiccup here shouldn't fail the whole request.
      try {
        await admin.auth().createUser({ uid, email, password, emailVerified: true });
      } catch (err) {
        if (err.code === "auth/uid-already-exists") {
          await admin.auth().updateUser(uid, { email, password, emailVerified: true });
        } else if (err.code !== "auth/email-already-exists") {
          console.error("Firebase Auth user creation failed:", err);
        }
      }
    }

    const token = jwt.sign(
      { uid, studentId, email, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(201).json({
      success: true,
      message: "Account created and logged in successfully",
      token,
      user: {
        uid,
        studentId,
        email,
        phoneNumber: profilePayload.phoneNumber || "",
        displayName: profilePayload.displayName,
        profileImage: uploadedProfileImage || "",
        role: "student",
      },
    });
  } catch (error) {
    if (error && error.code === "EMAIL_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }
    if (error && error.code === "PHONE_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    console.error("Register error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 400
          ? error.message
          : "Something went wrong. Please try again later.",
    });
  }
};
 

exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    // This check was missing — without it, a request with no `email` field
    // reaches the Firestore query as `undefined`, which Firestore rejects.
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    email = String(email).trim().toLowerCase();

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    const snapshot = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = snapshot.docs[0].data();

    if (!user.password) {
      // e.g. account was created via Google sign-in and has no password set
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        uid: user.uid,
        studentId: user.studentId,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        uid: user.uid,
        studentId: user.studentId,
        email: user.email,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const uid = req.user.uid;

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: userDoc.data(),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const uid = req.user.uid;

    const updateData = {};
    const uploadedProfileImage = await uploadProfileImage(req);

    // Basic Info
    if (req.body.displayName !== undefined)
      updateData.displayName = req.body.displayName;

    if (req.body.fullName !== undefined)
      updateData.displayName = req.body.fullName;

    if (req.body.name !== undefined)
      updateData.displayName = req.body.name;

    if (req.body.phoneNumber !== undefined)
      updateData.phoneNumber = req.body.phoneNumber;

    if (req.body.phone !== undefined)
      updateData.phoneNumber = req.body.phone;

    if (uploadedProfileImage) updateData.profileImage = uploadedProfileImage;

    // Personal Info
    if (req.body.dob !== undefined)
      updateData["personalInfo.dob"] = req.body.dob;

    if (req.body.gender !== undefined)
      updateData["personalInfo.gender"] = req.body.gender;

    if (req.body.languages !== undefined)
      updateData["personalInfo.languages"] = normalizeArray(req.body.languages);

    if (req.body.maritalStatus !== undefined)
      updateData["personalInfo.maritalStatus"] = req.body.maritalStatus;

    // Address
    if (req.body.addressLine1 !== undefined)
      updateData["address.addressLine1"] = req.body.addressLine1;

    if (req.body.addressLine2 !== undefined)
      updateData["address.addressLine2"] = req.body.addressLine2;

    if (req.body.city !== undefined) updateData["address.city"] = req.body.city;

    if (req.body.state !== undefined)
      updateData["address.state"] = req.body.state;

    if (req.body.country !== undefined)
      updateData["address.country"] = req.body.country;

    if (req.body.zipCode !== undefined)
      updateData["address.zipCode"] = req.body.zipCode;

    if (req.body.addr_line1 !== undefined)
      updateData["address.addressLine1"] = req.body.addr_line1;

    if (req.body.addr_line2 !== undefined)
      updateData["address.addressLine2"] = req.body.addr_line2;

    if (req.body.addr_city !== undefined)
      updateData["address.city"] = req.body.addr_city;

    if (req.body.addr_state !== undefined)
      updateData["address.state"] = req.body.addr_state;

    if (req.body.addr_zip !== undefined)
      updateData["address.zipCode"] = req.body.addr_zip;

    // Interests
    if (req.body.hobbies !== undefined)
      updateData["interests.hobbies"] = normalizeArray(req.body.hobbies);

    if (req.body.interestedSkill !== undefined)
      updateData["interests.interestedSkill"] = normalizeArray(
        req.body.interestedSkill,
      );

    if (req.body.skill !== undefined)
      updateData["interests.interestedSkill"] = normalizeArray(req.body.skill);

    if (req.body.fitnessInterests !== undefined)
      updateData["interests.fitnessInterests"] = normalizeArray(
        req.body.fitnessInterests,
      );

    if (req.body.careerAspire !== undefined)
      updateData["interests.careerAspire"] = req.body.careerAspire;

    if (req.body.goalForLearning !== undefined)
      updateData["interests.goalForLearning"] = req.body.goalForLearning;

    if (req.body.learningMode !== undefined)
      updateData["interests.learningMode"] = req.body.learningMode;

    // Career
    if (req.body.qualification !== undefined)
      updateData["career.qualification"] = req.body.qualification;

    if (req.body.employmentStatus !== undefined)
      updateData["career.employmentStatus"] = req.body.employmentStatus;

    if (req.body.employment !== undefined)
      updateData["career.employmentStatus"] = req.body.employment;

    if (req.body.yearsOfExperience !== undefined)
      updateData["career.yearsOfExperience"] = req.body.yearsOfExperience;

    if (req.body.experience !== undefined)
      updateData["career.yearsOfExperience"] = req.body.experience;

    if (req.body.designation !== undefined)
      updateData["career.designation"] = req.body.designation;

    if (req.body.industry !== undefined)
      updateData["career.industry"] = req.body.industry;

    if (req.body.expectedNextRole !== undefined)
      updateData["career.expectedNextRole"] = req.body.expectedNextRole;

    if (req.body.expectedRole !== undefined)
      updateData["career.expectedNextRole"] = req.body.expectedRole;

    if (req.body.expectedSalary !== undefined)
      updateData["career.expectedSalary"] = req.body.expectedSalary;

    if (req.body.willingnessToReskill !== undefined)
      updateData["career.willingnessToReskill"] = normalizeBoolean(
        req.body.willingnessToReskill,
      );

    if (req.body.willingToReskill !== undefined)
      updateData["career.willingnessToReskill"] = normalizeBoolean(
        req.body.willingToReskill,
      );

    if (req.body.careerChangeDomain !== undefined)
      updateData["career.careerChangeDomain"] = req.body.careerChangeDomain;

    if (req.body.switchDomain !== undefined)
      updateData["career.careerChangeDomain"] = req.body.switchDomain;

    // Verification
    if (req.body.emailVerified !== undefined)
      updateData["verification.emailVerified"] = normalizeBoolean(
        req.body.emailVerified,
      );

    if (req.body.phoneVerified !== undefined)
      updateData["verification.phoneVerified"] = normalizeBoolean(
        req.body.phoneVerified,
      );

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("users").doc(uid).update(updateData);

    const updatedDoc = await db.collection("users").doc(uid).get();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedDoc.data(),
    });
  } catch (error) {
    console.error("Update Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Something went wrong. Please try again later.",
    });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const uid = req.user.uid;

    const userRef = db.collection("users").doc(uid);

    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await userRef.update({
      isDeleted: true,
      deletedAt: db.Timestamp.now(),
      updatedAt: db.Timestamp.now(),
    });

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const uid = req.user.uid;

    await db.collection("users").doc(uid).delete();

    // await admin.auth().deleteUser(uid);

    return res.status(200).json({
      success: true,
      message: "Account deleted permanently",
    });
  } catch (error) {
    console.error("Delete Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();

    const users = [];

    snapshot.forEach((doc) => {
      const user = doc.data();

      users.push({
        uid: user.uid,
        studentId: user.studentId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,

        personalInfo: user.personalInfo,
        address: user.address,
        interests: user.interests,
        career: user.career,

        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getStuId = async (req, res) => {
  try {
    const uid = req.user.uid;

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = userDoc.data();

    return res.status(200).json({
      success: true,
      studentId: userData.studentId || null,
    });
  } catch (error) {
    console.error("Get Student ID Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Prefix-searches students by their studentId (e.g. "STU_1000") so the chat
 * UI's "Global" search can find someone to start a conversation with,
 * without exposing the unauthenticated/unscoped dump that GET /all-users is.
 * GET /api/users/search-student?studentId=STU_1000
 */
exports.searchStudentByStudentId = async (req, res) => {
  try {
    const query = String(req.query.studentId || req.query.q || "")
      .trim()
      .toUpperCase();

    if (!query) {
      return res.status(200).json({ success: true, data: [] });
    }

    const snapshot = await db
      .collection("users")
      .where("role", "==", "student")
      .where("studentId", ">=", query)
      .where("studentId", "<", `${query}`)
      .limit(10)
      .get();

    const results = snapshot.docs
      .map((doc) => doc.data())
      .filter((user) => user.uid !== req.user.uid)
      .map((user) => ({
        uid: user.uid,
        studentId: user.studentId,
        displayName: user.displayName || user.studentId,
        profileImage: user.profileImage || "",
      }));

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Search Student Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
