const jwt = require("jsonwebtoken");
const { admin, db } = require("../../services/firebase");
const { uploadFile } = require("../../services/storage");
const bcrypt = require("bcryptjs");
const extractCoordinates = require("../../utils/extractCoordinates");
const { createActivity } = require("../activity/activity.controller");

exports.registerInstitute = async (req, res) => {
  try {
    let { name, email, phoneNumber, password, confirmPassword } = req.body;

    // ── Presence checks ──────────────────────────────────────────────
    if (!name || !email || !phoneNumber || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ── Normalize input ──────────────────────────────────────────────
    name = String(name).trim();
    email = String(email).trim().toLowerCase();
    phoneNumber = String(phoneNumber).trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    // Accept either E.164 (+...) or 10-digit local numbers; normalize local numbers to +91
    let normalizedPhone;
    if (/^\d{10}$/.test(phoneNumber)) {
      normalizedPhone = `+91${phoneNumber}`;
    } else if (/^\+[1-9]\d{9,14}$/.test(phoneNumber)) {
      normalizedPhone = phoneNumber;
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Phone number must be E.164 (e.g. +919876543210) or 10-digit local (e.g. 9876543210)",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    // Email verification now happens client-side (EmailJS OTP) before this
    // request is sent; the frontend asserts the result here.
    if (req.body.emailVerified !== true && req.body.emailVerified !== "true") {
      return res.status(403).json({
        success: false,
        message: "Please verify your email with the code we sent before creating an account.",
      });
    }

    // ── Prepare refs ─────────────────────────────────────────────────
    const usersRef = db.collection("users");
    const emailIndexRef = db.collection("emailIndex").doc(email);
    const phoneIndexRef = db.collection("phoneIndex").doc(normalizedPhone);
    const userRef = usersRef.doc();
    const uid = userRef.id;

    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Atomic transaction: uniqueness + create ──────────────────────
    await db.runTransaction(async (tx) => {
      const [emailDoc, phoneDoc] = await Promise.all([
        tx.get(emailIndexRef),
        tx.get(phoneIndexRef),
      ]);

      if (emailDoc.exists) {
        throw { code: "EMAIL_EXISTS" };
      }
      if (phoneDoc.exists) {
        throw { code: "PHONE_EXISTS" };
      }

      tx.set(emailIndexRef, { uid });
      tx.set(phoneIndexRef, { uid });

      tx.set(userRef, {
        uid,
        name,
        email,
        phoneNumber: normalizedPhone,
        role: "institute",
        displayName: name,
        password: hashedPassword,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    try {
      await admin.auth().createUser({ uid, email, password, emailVerified: true });
    } catch (err) {
      if (err.code === "auth/uid-already-exists") {
        await admin.auth().updateUser(uid, { email, password, emailVerified: true });
      } else if (err.code !== "auth/email-already-exists") {
        console.error("Firebase Auth user creation failed:", err);
      }
    }

    const token = jwt.sign(
      { uid, email, role: "institute" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Never spread the stored doc into the response — build the public
    // shape explicitly so a stray field (like the password hash) can't leak.
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        uid,
        name,
        email,
        phoneNumber: normalizedPhone,
        displayName: name,
        role: "institute",
      },
    });
  } catch (error) {
    if (error && error.code === "EMAIL_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }
    if (error && error.code === "PHONE_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    console.error("Institute registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

// exports.createInstitute = async (req, res) => {
//   try {
//     const body = req.body || {};
//     const {
//       name,
//       phoneNumber,
//       tagline,
//       description,
//       locations,
//       establishDate,
//       email,
//       panCard,
//       gstNumber,
//       highlights,
//       instituteType,
//     } = body;
//     console.log("Received data:", body);

//     const parseMaybeJson = (value, fallback) => {
//       if (value == null || value === "") {
//         return fallback;
//       }

//       if (typeof value === "object") {
//         return value;
//       }

//       if (typeof value !== "string") {
//         return fallback;
//       }

//       return JSON.parse(value);
//     };

//     const normalizePhoneNumber = (value) =>
//       String(value || "")
//         .trim()
//         .replace(/[\s()-]/g, "");

//     const normalizeHighlightValue = (value) => {
//       if (Array.isArray(value)) {
//         return value.filter(Boolean).map((item) => String(item).trim());
//       }

//       if (value instanceof Set) {
//         return Array.from(value)
//           .filter(Boolean)
//           .map((item) => String(item).trim());
//       }

//       if (value && typeof value === "object") {
//         return Object.values(value)
//           .flatMap((item) => normalizeHighlightValue(item))
//           .filter(Boolean);
//       }

//       if (value == null || value === "") {
//         return [];
//       }

//       return [String(value).trim()];
//     };

//     // ---------- Form validation ----------
//     if (!name || !tagline || !description || !establishDate) {
//       return res.status(400).json({
//         success: false,
//         message: "name, tagline, description and establishDate are required",
//       });
//     }

//     // ---------- Media validation ----------
//     const files = req.files || {};

//     // if (!files.logo || files.logo.length === 0) {
//     //   return res
//     //     .status(400)
//     //     .json({ success: false, message: "Logo is required (upload first)" });
//     // }

//     // if (!files.photos || files.photos.length < 2 || files.photos.length > 15) {
//     //   return res
//     //     .status(400)
//     //     .json({ success: false, message: "Upload between 2 and 15 photos" });
//     // }

//     if (files.video && files.video[0].size > 50 * 1024 * 1024) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Video too large (max ~1 minute)" });
//     }

//     // ---------- Locations validation ----------
//     if (!locations) {
//       return res
//         .status(400)
//         .json({ success: false, message: "locations is required" });
//     }

//     const parsedLocations = parseMaybeJson(locations, []);

//     if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
//       return res
//         .status(400)
//         .json({ success: false, message: "At least one location is required" });
//     }

//     for (const loc of parsedLocations) {
//       if (
//         !(loc.addressLine1 || loc.address1) ||
//         !loc.city ||
//         !(loc.zipCode || loc.zip) ||
//         !loc.state ||
//         !loc.country
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Each location requires addressLine1, city, zipCode, state and country",
//         });
//       }
//     }

//     const parsedHighlights = parseMaybeJson(highlights, {});
//     const normalizedHighlights =
//       parsedHighlights &&
//       typeof parsedHighlights === "object" &&
//       !Array.isArray(parsedHighlights)
//         ? Object.fromEntries(
//             Object.entries(parsedHighlights).map(([category, value]) => [
//               category,
//               normalizeHighlightValue(value),
//             ]),
//           )
//         : {};

//     // ---------- Verification fields validation ----------
//     const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
//     if (
//       !normalizedPhoneNumber ||
//       !/^\+?[0-9]{10,15}$/.test(normalizedPhoneNumber)
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Valid phone number is required" });
//     }
//     if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Valid email is required" });
//     }
//     const normalizedPanCard = String(panCard || "")
//       .trim()
//       .toUpperCase();
//     if (
//       !normalizedPanCard ||
//       !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPanCard)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid PAN card is required (e.g. ABCDE1234F)",
//       });
//     }
//     const normalizedGstNumber = String(gstNumber || "")
//       .trim()
//       .toUpperCase();
//     if (
//       !normalizedGstNumber ||
//       !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
//         normalizedGstNumber,
//       )
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Valid GST number is required" });
//     }

//     // ---------- Upload media to Firebase Storage ----------
//     let logoUrl = null;
//     if (files.logo?.[0]) {
//       logoUrl = await uploadFile(files.logo[0], "institutes/logos");
//     }

//     let photoUrls = [];
//     if (files.photos?.length) {
//       photoUrls = await Promise.all(
//         files.photos.map((p) => uploadFile(p, "institutes/photos")),
//       );
//     }

//     let videoUrl = null;
//     if (files.video?.[0]) {
//       videoUrl = await uploadFile(files.video[0], "institutes/videos");
//     }

//     const processedLocations = await Promise.all(
//       parsedLocations.map(async (loc) => {
//         const googleMapLink = loc.googleMapLink || loc.mapLink || "";
//         const coordinates = googleMapLink
//           ? await extractCoordinates(googleMapLink)
//           : null;

//         return {
//           addressLine1: loc.addressLine1 || loc.address1,
//           addressLine2: loc.addressLine2 || loc.address2 || "",
//           city: loc.city,
//           zipCode: loc.zipCode || loc.zip,
//           state: loc.state,
//           country: loc.country,
//           googleMapLink,
//           latitude: coordinates?.latitude ?? null,
//           longitude: coordinates?.longitude ?? null,
//         };
//       }),
//     );
//     // ---------- Save to "institutes" collection ----------
//     const instituteRef = db.collection("institutes").doc();
//     const userRef = db.collection("users").doc(req.user.uid);
//     const ownerDoc = await userRef.get();
//     const ownerDetails = ownerDoc.exists
//       ? ownerDoc.data()
//       : { name: "Unknown" };
//     const instituteData = {
//       instituteId: instituteRef.id,
//       ownerUid: req.user.uid,
//       media: {
//         logo: logoUrl,
//         video: videoUrl,
//         photos: photoUrls,
//       },
//       name,
//       tagline,
//       description,
//       instituteType,
//       highlights: normalizedHighlights,
//       locations: processedLocations,
//       establishDate,
//       ownerName: ownerDetails.name,
//       verification: {
//         phoneNumber: { value: normalizedPhoneNumber, verified: false },
//         email: { value: String(email).trim(), verified: false },
//         panCard: { value: normalizedPanCard, verified: false },
//         gstNumber: { value: normalizedGstNumber, verified: false },
//       },
//       status: "pending",
//       // view tracking
//       totalViews: 0,
//       viewerIds: [],
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//       updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//     };

//     await instituteRef.set(instituteData);

//     return res.status(201).json({
//       success: true,
//       message: "Institute created successfully",
//       institute: instituteData,
//     });
//   } catch (error) {
//     console.error("Create Institute Error:", error);
//     if (error instanceof SyntaxError) {
//       return res
//         .status(400)
//         .json({ success: false, message: "locations must be valid JSON" });
//     }
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };

// Get a single institute

//get institute by owner uid (for institute dashboard)

exports.getMyInstitute = async (req, res) => {
  try {
    const ownerUid = req.user?.uid;

    if (!ownerUid) {
      return res.status(400).json({
        success: false,
        message: "Owner UID is required",
      });
    }

    const snapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", ownerUid)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        institute: null,
      });
    }

    const institute = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))[0];

    return res.status(200).json({
      success: true,
      institute,
    });
  } catch (error) {
    console.error("ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getInstitute = async (req, res) => {
  try {
    const id = req.params.instituteId;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Institute ID is required" });
    }
    let doc = await db.collection("institutes").doc(id).get();

    if (!doc.exists) {
      // Fallback: search by ownerUid if document ID not found
      const snapshot = await db
        .collection("institutes")
        .where("ownerUid", "==", id)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res
          .status(404)
          .json({ success: false, message: "Institute not found" });
      }
      doc = snapshot.docs[0];
    }

    return res.status(200).json({ success: true, institute: doc.data() });
  } catch (error) {
    console.error("Get Institute Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Great-circle distance between two lat/lng points, in kilometers.
const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// An institute can have multiple locations; use the closest one to the user.
const getNearestDistanceKm = (institute, userLat, userLng) => {
  const locations = Array.isArray(institute.locations) ? institute.locations : [];
  const distances = locations
    .map((loc) => {
      const lat = parseFloat(loc?.latitude);
      const lng = parseFloat(loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return haversineDistanceKm(userLat, userLng, lat, lng);
    })
    .filter((distance) => distance !== null);

  return distances.length ? Math.min(...distances) : null;
};

const shuffleArray = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

exports.getAllInstitutes = async (req, res) => {
  try {
    const snapshot = await db.collection("institutes").get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "No institutes found",
      });
    }

    const reviewSnapshot = await db.collection("instituteReviews").get();

    const reviewStatsByInstitute = {};
    reviewSnapshot.docs.forEach((doc) => {
      const { instituteId, rating } = doc.data();
      if (!instituteId) return;

      if (!reviewStatsByInstitute[instituteId]) {
        reviewStatsByInstitute[instituteId] = { total: 0, count: 0 };
      }
      reviewStatsByInstitute[instituteId].total += Number(rating) || 0;
      reviewStatsByInstitute[instituteId].count += 1;
    });

    let institutes = snapshot.docs.map((doc) => {
      const stats = reviewStatsByInstitute[doc.id];
      return {
        id: doc.id,
        ...doc.data(),
        avgRating: stats ? Number((stats.total / stats.count).toFixed(1)) : 0,
        reviewCount: stats ? stats.count : 0,
      };
    });

    const { type, lat, lng } = req.query;

    if (type) {
      const normalizedType = String(type).trim().toLowerCase();
      institutes = institutes.filter(
        (institute) =>
          String(institute.instituteType || "").toLowerCase() === normalizedType,
      );
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    if (Number.isFinite(userLat) && Number.isFinite(userLng)) {
      // Nearest-first; institutes without usable coordinates sort last.
      institutes = institutes
        .map((institute) => ({
          ...institute,
          distanceKm: getNearestDistanceKm(institute, userLat, userLng),
        }))
        .sort((a, b) => {
          if (a.distanceKm === null && b.distanceKm === null) return 0;
          if (a.distanceKm === null) return 1;
          if (b.distanceKm === null) return -1;
          return a.distanceKm - b.distanceKm;
        });
    } else {
      // No location available — shuffle so results aren't always the same order.
      institutes = shuffleArray(institutes);
    }

    return res.status(200).json({
      success: true,
      institutes,
    });
  } catch (error) {
    console.error("Get All Institutes Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const VALID_INSTITUTION_TYPES = [
  "Institute",
  "Academy",
  "School",
  "College",
  "University",
];

exports.createInstitute = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      name,
      ownerName,
      phoneNumber,
      tagline,
      description,
      locations,
      establishDate,
      email,
      panCard,
      gstNumber,
      highlights,
      instituteType,
      faculties,
      customInputs,
    } = body;
    console.log("Received data:", body);

    const parseMaybeJson = (value, fallback) => {
      if (value == null || value === "") {
        return fallback;
      }

      if (typeof value === "object") {
        return value;
      }

      if (typeof value !== "string") {
        return fallback;
      }

      return JSON.parse(value);
    };

    const normalizePhoneNumber = (value) =>
      String(value || "")
        .trim()
        .replace(/[\s()-]/g, "");

    const normalizeHighlightValue = (value) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean).map((item) => String(item).trim());
      }

      if (value instanceof Set) {
        return Array.from(value)
          .filter(Boolean)
          .map((item) => String(item).trim());
      }

      if (value && typeof value === "object") {
        return Object.values(value)
          .flatMap((item) => normalizeHighlightValue(item))
          .filter(Boolean);
      }

      if (value == null || value === "") {
        return [];
      }

      return [String(value).trim()];
    };

    // ---------- Form validation ----------
    if (!name || !tagline || !description || !establishDate) {
      return res.status(400).json({
        success: false,
        message: "name, tagline, description and establishDate are required",
      });
    }

    if (!instituteType || !VALID_INSTITUTION_TYPES.includes(instituteType)) {
      return res.status(400).json({
        success: false,
        message: `instituteType is required and must be one of: ${VALID_INSTITUTION_TYPES.join(", ")}`,
      });
    }

    // ---------- Media validation ----------
    const files = req.files || {};

    // if (!files.logo || files.logo.length === 0) {
    //   return res
    //     .status(400)
    //     .json({ success: false, message: "Logo is required (upload first)" });
    // }

    // if (!files.photos || files.photos.length < 2 || files.photos.length > 15) {
    //   return res
    //     .status(400)
    //     .json({ success: false, message: "Upload between 2 and 15 photos" });
    // }

    if (files.video && files.video[0].size > 50 * 1024 * 1024) {
      return res
        .status(400)
        .json({ success: false, message: "Video too large (max ~1 minute)" });
    }

    // ---------- Locations validation ----------
    if (!locations) {
      return res
        .status(400)
        .json({ success: false, message: "locations is required" });
    }

    const parsedLocations = parseMaybeJson(locations, []);

    if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "At least one location is required" });
    }

    for (const loc of parsedLocations) {
      if (
        !(loc.addressLine1 || loc.address1) ||
        !loc.city ||
        !(loc.zipCode || loc.zip) ||
        !loc.state ||
        !loc.country
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each location requires addressLine1, city, zipCode, state and country",
        });
      }
    }

    const parsedHighlights = parseMaybeJson(highlights, {});
    const normalizedHighlights =
      parsedHighlights &&
        typeof parsedHighlights === "object" &&
        !Array.isArray(parsedHighlights)
        ? Object.fromEntries(
          Object.entries(parsedHighlights).map(([category, value]) => [
            category,
            normalizeHighlightValue(value),
          ]),
        )
        : {};

    // ---------- Faculties / custom inputs ----------
    const facultyImageFiles = files.facultyImages || [];
    const facultyImageUrls = facultyImageFiles.length
      ? await Promise.all(
        facultyImageFiles.map((file) => uploadFile(file, "institutes/faculties")),
      )
      : [];

    const parsedFaculties = parseMaybeJson(faculties, []);
    let facultyImageIndex = 0;
    const normalizedFaculties = Array.isArray(parsedFaculties)
      ? parsedFaculties
        .filter(
          (faculty) =>
            faculty &&
            (faculty.name ||
              faculty.facultyCode ||
              faculty.experience ||
              (Array.isArray(faculty.subjects) && faculty.subjects.length) ||
              faculty.profileImage),
        )
        .map((faculty) => {
          let profileImage = null;

          if (faculty.profileImage?.hasNewImage) {
            const uploadedFile = facultyImageFiles[facultyImageIndex];
            const uploadedUrl = facultyImageUrls[facultyImageIndex];

            if (uploadedFile && uploadedUrl) {
              profileImage = {
                name: uploadedFile.originalname || "",
                url: uploadedUrl,
              };
            }

            facultyImageIndex++;
          } else if (faculty.profileImage) {
            profileImage = {
              name: faculty.profileImage.name || "",
              url: faculty.profileImage.url || "",
            };
          }

          return {
            profileImage,
            name: faculty.name || "",
            facultyCode: faculty.facultyCode || "",
            subjects: Array.isArray(faculty.subjects)
              ? faculty.subjects.filter(Boolean).map((s) => String(s).trim())
              : [],
            experience: faculty.experience || "",
          };
        })
      : [];

    const normalizedCustomInputs = parseMaybeJson(customInputs, {});

    // ---------- Verification fields validation ----------
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (
      !normalizedPhoneNumber ||
      !/^\+?[0-9]{10,15}$/.test(normalizedPhoneNumber)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Valid phone number is required" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res
        .status(400)
        .json({ success: false, message: "Valid email is required" });
    }
    const normalizedPanCard = String(panCard || "")
      .trim()
      .toUpperCase();
    if (
      !normalizedPanCard ||
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPanCard)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid PAN card is required (e.g. ABCDE1234F)",
      });
    }
    const normalizedGstNumber = String(gstNumber || "")
      .trim()
      .toUpperCase();
    if (
      !normalizedGstNumber ||
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
        normalizedGstNumber,
      )
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Valid GST number is required" });
    }

    // ---------- Upload media to Cloudinary ----------
    let logo = null;

    if (files.logo?.length) {
      logo = await uploadFile(files.logo[0], "institutes/logos");
    }

    let photos = [];

    if (files.photos?.length) {
      photos = await Promise.all(
        files.photos.map((photo) => uploadFile(photo, "institutes/photos")),
      );
    }

    let video = null;

    if (files.video?.length) {
      video = await uploadFile(files.video[0], "institutes/videos");
    }
    const processedLocations = await Promise.all(
      parsedLocations.map(async (loc) => {
        const googleMapLink = loc.googleMapLink || loc.mapLink || "";
        const coordinates = googleMapLink
          ? await extractCoordinates(googleMapLink)
          : null;

        return {
          addressLine1: loc.addressLine1 || loc.address1,
          addressLine2: loc.addressLine2 || loc.address2 || "",
          city: loc.city,
          zipCode: loc.zipCode || loc.zip,
          state: loc.state,
          country: loc.country,
          googleMapLink,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
        };
      }),
    );
    // ---------- Save to "institutes" collection ----------
    const instituteRef = db.collection("institutes").doc();
    const userRef = db.collection("users").doc(req.user.uid);
    const ownerDoc = await userRef.get();
    const ownerDetails = ownerDoc.exists
      ? ownerDoc.data()
      : { name: "Unknown" };
    const instituteData = {
      instituteId: instituteRef.id,
      ownerUid: req.user.uid,
      media: {
        logo,
        video,
        photos,
      },
      name,
      tagline,
      description,
      instituteType,
      highlights: normalizedHighlights,
      faculties: normalizedFaculties,
      customInputs: normalizedCustomInputs,
      locations: processedLocations,
      establishDate,
      ownerName: ownerName ? String(ownerName).trim() : "Unknown",
      verification: {
        phoneNumber: { value: normalizedPhoneNumber, verified: false },
        email: { value: String(email).trim(), verified: false },
        panCard: { value: normalizedPanCard, verified: false },
        gstNumber: { value: normalizedGstNumber, verified: false },
      },
      status: "pending",
      // view tracking
      totalViews: 0,
      viewerIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await instituteRef.set(instituteData);

    if (ownerName) {
      await userRef.update({
        name: String(ownerName).trim(),
        displayName: String(ownerName).trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(201).json({
      success: true,
      message: "Institute created successfully",
      institute: instituteData,
    });
  } catch (error) {
    console.error("Create Institute Error:", error);
    if (error instanceof SyntaxError) {
      return res
        .status(400)
        .json({ success: false, message: "locations must be valid JSON" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateInstitute = async (req, res) => {
  try {
    const { instituteId } = req.params;

    let instituteRef = db.collection("institutes").doc(instituteId);
    let instituteDoc = await instituteRef.get();

    if (!instituteDoc.exists) {
      // Fallback: search by ownerUid if document ID not found
      const snapshot = await db
        .collection("institutes")
        .where("ownerUid", "==", instituteId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({
          success: false,
          message: "Institute may not found",
        });
      }

      instituteDoc = snapshot.docs[0];
      instituteRef = instituteDoc.ref;
    }

    const institute = instituteDoc.data();

    // Check authorization: must be admin or the owner of the institute
    if (req.user.role !== "admin" && institute.ownerUid !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this institute profile",
      });
    }

    const parseMaybeJson = (value, fallback) => {
      if (value == null || value === "") {
        return fallback;
      }

      if (typeof value === "object") {
        return value;
      }

      if (typeof value !== "string") {
        return fallback;
      }

      return JSON.parse(value);
    };

    const normalizePhoneNumber = (value) =>
      String(value || "")
        .trim()
        .replace(/[\s()-]/g, "");

    const normalizeHighlightValue = (value) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean).map((item) => String(item).trim());
      }

      if (value instanceof Set) {
        return Array.from(value)
          .filter(Boolean)
          .map((item) => String(item).trim());
      }

      if (value && typeof value === "object") {
        return Object.values(value)
          .flatMap((item) => normalizeHighlightValue(item))
          .filter(Boolean);
      }

      if (value == null || value === "") {
        return [];
      }

      return [String(value).trim()];
    };

    const updates = { ...req.body };
    const newOwnerName = updates.ownerName;
    const files = req.files || {};

    const facultyImageUrls = files.facultyImages?.length
      ? await Promise.all(
        files.facultyImages.map((file) =>
          uploadFile(file, "institutes/faculties"),
        ),
      )
      : [];
    delete updates.instituteId;
    delete updates.ownerUid;
    delete updates.createdAt;
    delete updates.totalViews;
    delete updates.viewerIds;
    delete updates.plan;

    if (updates.locations !== undefined) {
      const parsedLocations = parseMaybeJson(updates.locations, []);

      if (!Array.isArray(parsedLocations) || parsedLocations.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one location is required",
        });
      }

      for (const loc of parsedLocations) {
        if (
          !(loc.addressLine1 || loc.address1) ||
          !loc.city ||
          !(loc.zipCode || loc.zip) ||
          !loc.state ||
          !loc.country
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Each location requires addressLine1, city, zipCode, state and country",
          });
        }
      }

      const processedLocations = await Promise.all(
        parsedLocations.map(async (loc) => {
          const googleMapLink = loc.googleMapLink || loc.mapLink || "";
          const coordinates = googleMapLink
            ? await extractCoordinates(googleMapLink)
            : null;

          return {
            addressLine1: loc.addressLine1 || loc.address1,
            addressLine2: loc.addressLine2 || loc.address2 || "",
            city: loc.city,
            zipCode: loc.zipCode || loc.zip,
            state: loc.state,
            country: loc.country,
            googleMapLink,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
          };
        }),
      );

      updates.locations = processedLocations;
    }

    if (updates.highlights !== undefined) {
      const parsedHighlights = parseMaybeJson(updates.highlights, {});
      updates.highlights =
        parsedHighlights &&
          typeof parsedHighlights === "object" &&
          !Array.isArray(parsedHighlights)
          ? Object.fromEntries(
            Object.entries(parsedHighlights).map(([category, value]) => [
              category,
              normalizeHighlightValue(value),
            ]),
          )
          : {};
    }

    // ---------- Faculties / custom inputs ----------
    if (updates.faculties !== undefined) {
      const parsedFaculties = parseMaybeJson(updates.faculties, []);

      let imageIndex = 0;

      updates.faculties = Array.isArray(parsedFaculties)
        ? parsedFaculties
          .filter(
            (faculty) =>
              faculty &&
              (faculty.name ||
                faculty.facultyCode ||
                faculty.experience ||
                (Array.isArray(faculty.subjects) &&
                  faculty.subjects.length) ||
                faculty.profileImage),
          )
          .map((faculty) => {
            // FIX: previously this stored the raw frontend object
            // (including the transient `hasNewImage` flag) whenever a
            // faculty member kept their existing image. Now we always
            // persist the same clean { name, url } shape regardless of
            // whether the image is new or unchanged.
            let profileImage = null;

            if (faculty.profileImage?.hasNewImage) {
              const uploadedFile = files.facultyImages?.[imageIndex];
              const uploadedUrl = facultyImageUrls[imageIndex];

              if (uploadedFile && uploadedUrl) {
                profileImage = {
                  name: uploadedFile.originalname || "",
                  url: uploadedUrl,
                };
              }

              imageIndex++;
            } else if (faculty.profileImage) {
              profileImage = {
                name: faculty.profileImage.name || "",
                url: faculty.profileImage.url || "",
              };
            }

            return {
              name: faculty.name || "",
              facultyCode: faculty.facultyCode || "",
              subjects: Array.isArray(faculty.subjects)
                ? faculty.subjects
                : [],
              experience: faculty.experience || "",
              profileImage,
            };
          })
        : [];
    }

    if (updates.customInputs !== undefined) {
      updates.customInputs = parseMaybeJson(updates.customInputs, {});
    }

    if (updates.instituteType !== undefined) {
      if (!VALID_INSTITUTION_TYPES.includes(updates.instituteType)) {
        return res.status(400).json({
          success: false,
          message: `instituteType must be one of: ${VALID_INSTITUTION_TYPES.join(", ")}`,
        });
      }
    }

    // ---------- Verification-sensitive fields ----------
    // FIX: previously these always reset `verified` to false on every save,
    // even when the value submitted was identical to what was already
    // stored (which happens constantly since these fields are read-only
    // in the UI but still resubmitted with the rest of the form). Now we
    // only touch `.value` / reset `.verified` when the value actually
    // changed, so an already-verified field stays verified across unrelated
    // profile edits.

    if (updates.phoneNumber) {
      const normalizedPhoneNumber = normalizePhoneNumber(updates.phoneNumber);

      if (!/^[\+]?[0-9]{10,15}$/.test(normalizedPhoneNumber)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number",
        });
      }

      const existingPhone = institute.verification?.phoneNumber?.value;

      if (normalizedPhoneNumber !== existingPhone) {
        updates["verification.phoneNumber.value"] = normalizedPhoneNumber;
        updates["verification.phoneNumber.verified"] = false;
      }

      delete updates.phoneNumber;
    }

    // validations
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email",
      });
    }

    if (
      updates.panCard &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(updates.panCard.toUpperCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid PAN",
      });
    }

    if (
      updates.gstNumber &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
        updates.gstNumber.toUpperCase(),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST",
      });
    }

    if (updates.email) {
      const normalizedEmail = String(updates.email).trim();
      const existingEmail = institute.verification?.email?.value;

      if (normalizedEmail !== existingEmail) {
        updates["verification.email.value"] = normalizedEmail;
        updates["verification.email.verified"] = false;
      }

      delete updates.email;
    }

    if (updates.panCard) {
      const normalizedPan = updates.panCard.toUpperCase();
      const existingPan = institute.verification?.panCard?.value;

      if (normalizedPan !== existingPan) {
        updates["verification.panCard.value"] = normalizedPan;
        updates["verification.panCard.verified"] = false;
      }

      delete updates.panCard;
    }

    if (updates.gstNumber) {
      const normalizedGst = updates.gstNumber.toUpperCase();
      const existingGst = institute.verification?.gstNumber?.value;

      if (normalizedGst !== existingGst) {
        updates["verification.gstNumber.value"] = normalizedGst;
        updates["verification.gstNumber.verified"] = false;
      }

      delete updates.gstNumber;
    }

    // ---------- Media: only touch fields for which a new file was uploaded.
    // Requires the update route to use the same multer `upload.fields([...])`
    // middleware as create. If that isn't wired up yet, req.files is simply
    // undefined and this whole block is skipped — existing media is left as-is.

    const existingMedia = institute.media || {
      logo: null,
      video: null,
      photos: [],
    };

    const media = { ...existingMedia };

    if (files.video?.[0] && files.video[0].size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Video too large (max 50MB)",
      });
    }

    // Upload logo
    if (files.logo?.length) {
      media.logo = await uploadFile(files.logo[0], "institutes/logos");
    }

    // Upload video
    if (files.video?.length) {
      media.video = await uploadFile(files.video[0], "institutes/videos");
    }

    // Upload photos
    if (files.photos?.length) {
      const uploadedPhotos = await Promise.all(
        files.photos.map((file) => uploadFile(file, "institutes/photos")),
      );

      media.photos = [...(media.photos || []), ...uploadedPhotos];
    }

    // Save media only if any file was uploaded
    if (files.logo?.length || files.video?.length || files.photos?.length) {
      updates.media = media;
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await instituteRef.update(updates);

    if (newOwnerName && String(newOwnerName).trim() !== "") {
      const userRef = db.collection("users").doc(req.user.uid);
      await userRef.update({
        name: String(newOwnerName).trim(),
        displayName: String(newOwnerName).trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    const updatedDoc = await instituteRef.get();

    return res.status(200).json({
      success: true,
      message: "Institute updated successfully",
      institute: updatedDoc.data(),
    });
  } catch (error) {
    console.error("Update Institute Error:", error);

    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        message:
          "One of the JSON fields (locations/highlights/faculties/customInputs) is invalid",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateInstituteStatus = async (req, res) => {
  try {
    const { instituteId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // Role check: Only admin can change status
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. Only admins can update institute status.",
      });
    }

    let instituteRef = db.collection("institutes").doc(instituteId);
    let instituteDoc = await instituteRef.get();

    if (!instituteDoc.exists) {
      // Fallback: search by ownerUid if document ID not found
      const snapshot = await db
        .collection("institutes")
        .where("ownerUid", "==", instituteId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({
          success: false,
          message: "Institute not found",
        });
      }
      instituteDoc = snapshot.docs[0];
      instituteRef = instituteDoc.ref;
    }

    // Optional: Allow only specific statuses
    const allowedStatuses = ["pending", "approved", "rejected"];

    if (!allowedStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    await instituteRef.update({
      status: status.toLowerCase(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await instituteRef.get();

    return res.status(200).json({
      success: true,
      message: "Institute status updated successfully",
      institute: updatedDoc.data(),
    });
  } catch (error) {
    console.error("Update Institute Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Increment institute view and track student ids (one-time per user)
exports.incrementInstituteView = async (req, res) => {
  try {
    const { instituteId } = req.params;

    if (!instituteId) {
      return res
        .status(400)
        .json({ success: false, message: "Institute ID is required" });
    }

    let instRef = db.collection("institutes").doc(instituteId);
    let instDoc = await instRef.get();

    if (!instDoc.exists) {
      // Fallback: search by ownerUid if document ID not found
      const snapshot = await db
        .collection("institutes")
        .where("ownerUid", "==", instituteId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res
          .status(404)
          .json({ success: false, message: "Institute not found" });
      }
      instDoc = snapshot.docs[0];
      instRef = instDoc.ref;
    }

    const institute = instDoc.data();

    const userId = req.user?.uid || null;
    if (userId) {
      const alreadyViewed =
        Array.isArray(instDoc.data().viewerIds) &&
        instDoc.data().viewerIds.includes(userId);
      if (!alreadyViewed) {
        await instRef.update({
          totalViews: admin.firestore.FieldValue.increment(1),
          viewerIds: admin.firestore.FieldValue.arrayUnion(userId),
        });
        await createActivity({
          ownerUid: institute.ownerUid,
          studentUid: userId,
          type: "institute_view",
          entityType: "institute",
          entityId: instituteId,
          entityName: institute.instituteName,
          instituteId,
          instituteName: institute.instituteName,
        });
      }
    } else {
      await instRef.update({
        totalViews: admin.firestore.FieldValue.increment(1),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("INCREMENT INSTITUTE VIEW ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyFaculties = async (req, res) => {
  try {
    const ownerUid = req.user?.uid;

    if (!ownerUid) {
      return res.status(400).json({
        success: false,
        message: "Owner UID is required",
      });
    }

    const snapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", ownerUid)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const institute = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))[0];

    const faculties = institute.faculties || [];

    return res.status(200).json({
      success: true,
      faculties,
    });
  } catch (error) {
    console.error("GET MY FACULTIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * Saves the compliance step (GST/PAN/Aadhaar + logo) shown right after
 * institute signup, before the institute has a full profile yet. Stored on
 * the owner's `users` doc as `pendingInstitute` so it can be carried over
 * once they complete their full profile via createInstitute.
 * POST /api/institute/onboarding
 */
exports.saveInstituteOnboarding = async (req, res) => {
  try {
    const { gstNumber, panCard, aadhaarNumber } = req.body;
    const files = req.files || {};

    let logo = null;
    if (files.logo?.length) {
      logo = await uploadFile(files.logo[0], "institutes/logos");
    }

    const pendingInstitute = {
      gstNumber: gstNumber ? String(gstNumber).trim().toUpperCase() : "",
      panCard: panCard ? String(panCard).trim().toUpperCase() : "",
      aadhaarNumber: aadhaarNumber ? String(aadhaarNumber).trim() : "",
      ...(logo ? { logo } : {}),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db
      .collection("users")
      .doc(req.user.uid)
      .set({ pendingInstitute }, { merge: true });

    return res.status(200).json({
      success: true,
      message: "Onboarding details saved.",
      data: pendingInstitute,
    });
  } catch (error) {
    console.error("Save Institute Onboarding Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/institute/onboarding
 */
exports.getInstituteOnboarding = async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    const pendingInstitute = userDoc.exists ? userDoc.data().pendingInstitute || null : null;

    return res.status(200).json({
      success: true,
      data: pendingInstitute,
    });
  } catch (error) {
    console.error("Get Institute Onboarding Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
