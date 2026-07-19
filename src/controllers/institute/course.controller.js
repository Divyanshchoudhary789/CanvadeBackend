const { admin, db } = require("../../services/firebase");
const slugify = require("slugify");
const { uploadFile } = require("../../services/storage");
const {createActivity}  = require("../activity/activity.controller");
const { createGroupForCourse } = require("../chat/group.controller");
const { getEffectivePlan, countActiveCourses } = require("../../utils/planHelper");
const parseField = (field, defaultValue) => {
  try {
    if (!field) return defaultValue;
    return typeof field === "string" ? JSON.parse(field) : field;
  } catch {
    return defaultValue;
  }
};

const parseBoolean = (value, defaultValue = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return defaultValue;
};

exports.createCourse = async (req, res) => {
  try {
    const basicDetails = parseField(req.body.basicDetails, {});
    const priceDetails = parseField(req.body.priceDetails, {});
    const curriculumDetails = parseField(req.body.curriculumDetails, []);
    const batchPlanRaw = parseField(req.body.batchPlan, []);
    const faculty = parseField(req.body.faculty, []);
    const faqs = parseField(req.body.faqs, []);

    basicDetails.isEmiAvailable = parseBoolean(
      basicDetails.isEmiAvailable,
      false,
    );
    priceDetails.isEmiAvailable = parseBoolean(
      priceDetails.isEmiAvailable,
      false,
    );

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", req.user.uid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const instituteId = instituteSnapshot.docs[0].id;

    const effectivePlan = getEffectivePlan(instituteSnapshot.docs[0].data());
    if (effectivePlan.limits.courses !== Infinity) {
      const activeCourseCount = await countActiveCourses(db, instituteId);
      if (activeCourseCount >= effectivePlan.limits.courses) {
        return res.status(403).json({
          success: false,
          code: "PLAN_LIMIT_COURSES",
          message: `Your Free plan allows up to ${effectivePlan.limits.courses} active courses. Upgrade to Pro for unlimited courses.`,
          data: {
            limit: effectivePlan.limits.courses,
            used: activeCourseCount,
            plan: effectivePlan.tier,
          },
        });
      }
    }

    if (!basicDetails.courseTitle?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Course title is required",
      });
    }

    if (!basicDetails.courseCode?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Course code is required",
      });
    }

    basicDetails.courseCode = basicDetails.courseCode.trim().toUpperCase();

    const existingCourse = await db
      .collection("courses")
      .where("basicDetails.courseCode", "==", basicDetails.courseCode)
      .limit(1)
      .get();

    if (!existingCourse.empty) {
      return res.status(409).json({
        success: false,
        message: "Course code already exists",
      });
    }

    const courseRef = db.collection("courses").doc();
    const courseId = courseRef.id;

    const slug = `${slugify(basicDetails.courseTitle, {
      lower: true,
      strict: true,
    })}-${courseId}`;

    // Every batch plan (pricing/seat tier) needs a stable planId so the Batch
    // Planner can reference exactly which tier a real batch was booked under.
    // Assign one to any plan that doesn't already have one; keep existing
    // planIds untouched (relevant on course updates).
    const batchPlan = batchPlanRaw.map((plan) => ({
      ...plan,
      planId:
        plan.planId && String(plan.planId).trim()
          ? String(plan.planId).trim()
          : db.collection("courses").doc().id,
    }));

    // ---------- Upload media to Cloudinary ----------
    const files = req.files || {};

    const thumbnail = files.thumbnail?.[0]
      ? await uploadFile(files.thumbnail[0], "courses/thumbnails")
      : "";

    const images = files.images?.length
      ? await Promise.all(
          files.images.map((file) => uploadFile(file, "courses/images")),
        )
      : [];

    const video = files.video?.[0]
      ? await uploadFile(files.video[0], "courses/videos")
      : "";

    const instituteDocuments = files.documents?.length
      ? await Promise.all(
          files.documents.map(async (file) => ({
            name: file.originalname,
            url: await uploadFile(file, "courses/documents"),
          })),
        )
      : [];

    const studentMaterials = files.materials?.length
      ? await Promise.all(
          files.materials.map(async (file) => ({
            name: file.originalname,
            url: await uploadFile(file, "courses/materials"),
          })),
        )
      : [];

    const now = admin.firestore.FieldValue.serverTimestamp();

    const courseData = {
      courseId,
      instituteId,
      slug,
      status: "draft",
      isDeleted: false,

      createdBy: req.user.uid,
      createdByEmail: req.user.email,
      createdByRole: req.user.role,
      createdByName: req.user.displayName || "",

      basicDetails,

      priceDetails: {
        actualPrice: Number(priceDetails.actualPrice) || 0,
        discount: Number(priceDetails.discount) || 0,
        currentPrice: Number(priceDetails.currentPrice) || 0,
        priceBreakReasons: priceDetails.priceBreakReasons || [],
        courseExpenses: priceDetails.courseExpenses || [],
        scholarships: priceDetails.scholarships || [],
        isEmiAvailable: parseBoolean(priceDetails.isEmiAvailable, false),
      },

      curriculumDetails,
      batchPlan,

      // Faculty is stored and matched by facultyCode everywhere in the app
      // (institute faculty records don't carry a separate document id in the
      // API responses this app receives). This was previously accepted from
      // the client but never actually read or persisted.
      faculty: Array.isArray(faculty) ? faculty.filter(Boolean) : [],

      uploadMaterials: {
        thumbnail,
        images,
        video,
        instituteDocuments,
        studentMaterials,
      },

      faqs,

      totalViews: 0,
      viewerIds: [],
      totalEnquiries: 0,
      totalStudents: 0,

      createdAt: now,
      updatedAt: now,
    };

    await courseRef.set(courseData);

    // Auto-create the course's chat group. A group-creation failure
    // shouldn't fail course creation — the course itself already saved
    // successfully, so this is best-effort and logged, not re-thrown.
    try {
      await createGroupForCourse({
        courseId,
        courseTitle: basicDetails.courseTitle,
        ownerUid: req.user.uid,
        photo: thumbnail,
      });
    } catch (groupError) {
      console.error("Auto-create course group error:", groupError);
    }

    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: {
        courseId,
        slug,
      },
    });
  } catch (error) {
    console.error("Create Course Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Increment course view and track student ids (one-time per user)
exports.incrementCourseView = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res
        .status(400)
        .json({ success: false, message: "Course ID is required" });
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const courseData = courseDoc.data();
    const userId = req.user?.uid || null;

    // If user is authenticated, only increment once per user (use arrayUnion)
    if (userId) {
      // If user already present in viewerIds, do not increment
      const alreadyViewed =
        Array.isArray(courseData.viewerIds) &&
        courseData.viewerIds.includes(userId);
      if (!alreadyViewed) {
        await courseRef.update({
          totalViews: admin.firestore.FieldValue.increment(1),
          viewerIds: admin.firestore.FieldValue.arrayUnion(userId),
        });

        // Also increment institute stats if course has instituteId
        const instituteId = courseData.instituteId || null;
        if (instituteId) {
          const instRef = db.collection("institutes").doc(instituteId);
          await instRef
            .update({
              totalViews: admin.firestore.FieldValue.increment(1),
              viewerIds: admin.firestore.FieldValue.arrayUnion(userId),
            })
            .catch(() => {});
        }
      }
    } else {
      // Anonymous visitor: increment counts but cannot track uid
      await courseRef.update({
        totalViews: admin.firestore.FieldValue.increment(1),
      });

      await createActivity({
        ownerUid: courseData.createdBy,
        studentUid: userId,
        type: "course_view",
        entityType: "course",
        entityId: courseId,
        entityName: courseData.basicDetails.courseTitle,
        instituteId: courseData.instituteId,
        instituteName: courseData.instituteName,
      });

      const instituteId = courseData.instituteId || null;
      if (instituteId) {
        const instRef = db.collection("institutes").doc(instituteId);
        await instRef
          .update({ totalViews: admin.firestore.FieldValue.increment(1) })
          .catch(() => {});
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("INCREMENT COURSE VIEW ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
function getCreatedAgo(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);

  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;

  const months = Math.floor(diffDays / 30);

  if (months < 12) return `${months} months ago`;

  const years = Math.floor(months / 12);

  return `${years} years ago`;
}
exports.getMyCourses = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection("courses")
      .where("createdBy", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const courses = [];

    snapshot.forEach((doc) => {
      courses.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Get My Courses Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllCourses = async (req, res) => {
  try {
    const courseSnapshot = await db
      .collection("courses")
      .orderBy("createdAt", "desc")
      .get();

    const courses = courseSnapshot.docs
      .map((doc) => doc.data())
      .filter((course) => !course.isDeleted);

    const instituteIds = [
      ...new Set(courses.map((course) => course.instituteId).filter(Boolean)),
    ];

    const institutesMap = {};

    await Promise.all(
      instituteIds.map(async (id) => {
        const instituteDoc = await db.collection("institutes").doc(id).get();

        if (instituteDoc.exists) {
          institutesMap[id] = {
            instituteId: instituteDoc.id,
            ...instituteDoc.data(),
          };
        }
      }),
    );

    const result = courses.map((course) => ({
      ...course,
      createdAgo: getCreatedAgo(course.createdAt),
      institute: institutesMap[course.instituteId] || null,
    }));

    return res.status(200).json({
      success: true,
      total: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Get Courses Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
        data: null,
      });
    }

    const courseDoc = await db.collection("courses").doc(courseId).get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
        data: null,
      });
    }

    const courseData = courseDoc.data();
    const instituteId = courseData.instituteId;
    const instituteDoc = await db
      .collection("institutes")
      .doc(instituteId)
      .get();

    if (!instituteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Course fetched successfully",
      data: {
        id: courseDoc.id,
        ...courseData,
        ...instituteDoc.data(),
      },
    });
  } catch (error) {
    console.error("Get Course By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      data: null,
    });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const existingCourse = courseDoc.data();

    // Ownership check
    if (
      req.user.role !== "admin" &&
      existingCourse.createdBy !== req.user.uid
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this course",
      });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Parse JSON fields safely
    const parseField = (field) => {
      if (!field) return null;

      if (typeof field === "string") {
        return JSON.parse(field);
      }

      return field;
    };

    const basicDetails = parseField(req.body.basicDetails);

    const priceDetails = parseField(req.body.priceDetails);

    const curriculumDetails = parseField(req.body.curriculumDetails);

    const batchPlan = parseField(req.body.batchPlan);

    const faqs = parseField(req.body.faqs);

    const faculty = parseField(req.body.faculty);

    // =====================
    // BASIC DETAILS
    // =====================

    if (basicDetails) {
      Object.keys(basicDetails).forEach((key) => {
        updateData[`basicDetails.${key}`] =
          key === "isEmiAvailable"
            ? parseBoolean(basicDetails[key])
            : basicDetails[key];
      });

      // Regenerate slug if title changed
      if (basicDetails.courseTitle || basicDetails.courseCode) {
        const title =
          basicDetails.courseTitle || existingCourse.basicDetails.courseTitle;

        const code =
          basicDetails.courseCode || existingCourse.basicDetails.courseCode;

        updateData.slug = `${slugify(title, {
          lower: true,
          strict: true,
        })}-${code.toLowerCase()}`;
      }
    }

    // =====================
    // PRICE DETAILS
    // =====================

    if (priceDetails) {
      Object.keys(priceDetails).forEach((key) => {
        updateData[`priceDetails.${key}`] =
          key === "isEmiAvailable"
            ? parseBoolean(priceDetails[key])
            : priceDetails[key];
      });
    }

    // =====================
    // FULL ARRAY REPLACEMENTS
    // =====================

    if (curriculumDetails) {
      updateData.curriculumDetails = curriculumDetails;
    }

    if (batchPlan) {
      updateData.batchPlan = batchPlan.map((plan) => ({
        ...plan,
        planId:
          plan.planId && String(plan.planId).trim()
            ? String(plan.planId).trim()
            : db.collection("courses").doc().id,
      }));
    }
    if (faqs) {
      updateData.faqs = faqs;
    }

    if (faculty) {
      updateData.faculty = Array.isArray(faculty)
        ? faculty.filter(Boolean)
        : [];
    }
    // =====================
    // FILES (Cloudinary)
    // =====================

    const files = req.files || {};

    // Thumbnail
    if (files.thumbnail?.length) {
      updateData["uploadMaterials.thumbnail"] = await uploadFile(
        files.thumbnail[0],
        "courses/thumbnails",
      );
    }

    // Images (append to existing, same as institute photos)
    if (files.images?.length) {
      const uploadedImages = await Promise.all(
        files.images.map((file) => uploadFile(file, "courses/images")),
      );
      updateData["uploadMaterials.images"] =
        admin.firestore.FieldValue.arrayUnion(...uploadedImages);
    }

    // Video
    if (files.video?.length) {
      updateData["uploadMaterials.video"] = await uploadFile(
        files.video[0],
        "courses/videos",
      );
    }

    // Documents
    if (files.documents?.length) {
      updateData["uploadMaterials.instituteDocuments"] = await Promise.all(
        files.documents.map(async (file) => ({
          name: file.originalname,
          url: await uploadFile(file, "courses/documents"),
        })),
      );
    }

    // Student Materials
    if (files.materials?.length) {
      updateData["uploadMaterials.studentMaterials"] = await Promise.all(
        files.materials.map(async (file) => ({
          name: file.originalname,
          url: await uploadFile(file, "courses/materials"),
        })),
      );
    }

    await courseRef.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
    });
  } catch (error) {
    console.error("UPDATE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateCourseStatus = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const allowedStatuses = [
      "pending",
      "active",
      "archived",
      "approved",
      "rejected",
      "draft",
      "inactive",
    ];

    if (!allowedStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    await courseRef.update({
      status: status.toLowerCase(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await courseRef.get();

    return res.status(200).json({
      success: true,
      message: "Course status updated successfully",
      course: updatedDoc.data(),
    });
  } catch (error) {
    console.error("UPDATE COURSE STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateCourseSeats = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { seats } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    if (seats === undefined || seats === null) {
      return res.status(400).json({
        success: false,
        message: "Seats is required",
      });
    }

    if (Number(seats) < 0) {
      return res.status(400).json({
        success: false,
        message: "Seats cannot be negative",
      });
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const course = courseDoc.data();

    if (req.user.role !== "admin" && course.createdBy !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const batchPlan = course.batchPlan || [];

    if (!Array.isArray(batchPlan) || batchPlan.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No batch found",
      });
    }

    batchPlan[0] = {
      ...batchPlan[0],
      openSeats: Number(seats),
    };

    await courseRef.update({
      batchPlan,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Seats updated successfully",
      data: batchPlan,
    });
  } catch (error) {
    console.error("UPDATE SEATS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const courseRef = db.collection("courses").doc(courseId);

    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const courseData = courseDoc.data();

    // Allow only owner or admin
    if (req.user.role !== "admin" && courseData.createdBy !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this course",
      });
    }

    await courseRef.delete();

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully",
      deletedCourseId: courseId,
    });
  } catch (error) {
    console.error("DELETE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.softDeleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const courseRef = db.collection("courses").doc(courseId);

    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    await courseRef.update({
      status: "deleted",
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Course moved to trash successfully",
      courseId,
    });
  } catch (error) {
    console.error("SOFT DELETE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.restoreCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const courseRef = db.collection("courses").doc(courseId);

    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    await courseRef.update({
      status: "active",
      isDeleted: false,
      deletedAt: null,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Course restored successfully",
      courseId,
    });
  } catch (error) {
    console.error("RESTORE COURSE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllActiveCourses = async (req, res) => {
  try {
    const snapshot = await db
      .collection("courses")
      .where("status", "==", "active")
      .get();

    const courses = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        ...data,
        createdAgo: getCreatedAgo(data.createdAt),
      };
    });

    return res.status(200).json({
      success: true,
      data: courses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllInactiveCourses = async (req, res) => {
  try {
    const snapshot = await db
      .collection("courses")
      .where("status", "==", "inactive")
      .get();

    const courses = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        ...data,
        createdAgo: getCreatedAgo(data.createdAt),
      };
    });

    return res.status(200).json({
      success: true,
      data: courses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllDeletedCourses = async (req, res) => {
  try {
    const snapshot = await db
      .collection("courses")
      .where("status", "==", "deleted")
      .get();

    const courses = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        ...data,
        createdAgo: getCreatedAgo(data.createdAt),
      };
    });

    return res.status(200).json({
      success: true,
      data: courses,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyStudents = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    // Get all enrollments for this course
    const enrollmentSnapshot = await db
      .collection("enrollments")
      .where("courseId", "==", courseId)
      .get();

    if (enrollmentSnapshot.empty) {
      return res.status(200).json({
        success: true,
        totalStudents: 0,
        students: [],
      });
    }

    const studentIds = [
      ...new Set(
        enrollmentSnapshot.docs.map((doc) => doc.data().userId).filter(Boolean),
      ),
    ];

    // Fetch student details
    const studentPromises = studentIds.map(async (studentId) => {
      const studentDoc = await db.collection("users").doc(studentId).get();

      if (!studentDoc.exists) return null;

      const student = studentDoc.data();

      return {
        id: studentDoc.id,
        name: student.displayName || "",
        email: student.email || "",
        phone: student.phone || "",
        profileImage: student.profileImage || "",
      };
    });

    const students = (await Promise.all(studentPromises)).filter(Boolean);

    return res.status(200).json({
      success: true,
      totalStudents: students.length,
      students,
    });
  } catch (error) {
    console.error("Get Students Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCourseFaculties = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const courseDoc = await db.collection("courses").doc(courseId).get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const course = courseDoc.data();

    const instituteDoc = await db
      .collection("institutes")
      .doc(course.instituteId)
      .get();

    if (!instituteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const institute = instituteDoc.data();

    const facultyCodes = Array.isArray(course.faculty) ? course.faculty : [];

    const faculty = (institute.faculties || []).filter((item) =>
      facultyCodes.includes(item.facultyCode),
    );

    return res.status(200).json({
      success: true,
      totalFaculty: faculty.length,
      faculty,
    });
  } catch (error) {
    console.error("GET COURSE FACULTIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCourseBatches = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const snapshot = await db
      .collection("batches")
      .where("courseId", "==", courseId)
      .where("isDeleted", "==", false)
      .where("status", "==", "active")
      .get();

    const batches = [];
    snapshot.forEach((doc) => {
      batches.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return res.status(200).json({
      success: true,
      total: batches.length,
      batches,
    });
  } catch (error) {
    console.error("GET COURSE BATCHES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

