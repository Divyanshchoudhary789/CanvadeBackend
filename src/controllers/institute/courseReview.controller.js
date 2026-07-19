const { admin, db } = require("../../services/firebase");
const {createActivity}  = require("../activity/activity.controller");

exports.addCourseReview = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { rating, review } = req.body;
    const uid = req.user.uid;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    if (!rating || !review?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rating and review are required",
      });
    }

    // Check course exists
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check enrollment
    const enrollmentSnapshot = await db
      .collection("enrollments")
      .where("courseId", "==", courseId)
      .where("userId", "==", uid)
      .limit(1)
      .get();

    if (enrollmentSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "Only enrolled students can review this course.",
      });
    }

    // Check duplicate review
    const existingReview = await db
      .collection("courseReviews")
      .where("courseId", "==", courseId)
      .where("userId", "==", uid)
      .limit(1)
      .get();

    if (!existingReview.empty) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this course.",
      });
    }

    // Get student details
    const userDoc = await db.collection("users").doc(uid).get();

    const user = userDoc.exists ? userDoc.data() : {};
    const course = courseDoc.data();

    const reviewRef = db.collection("courseReviews").doc();

    await reviewRef.set({
      reviewId: reviewRef.id,
      courseId,
      studentUid: uid,
      studentName: user.displayName || user.name || "Anonymous",
      rating: Number(rating),
      review: review.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await createActivity({
      ownerUid: course.createdBy,
      studentUid: uid,
      type: "course_review",
      entityType: "course",
      entityId: courseId,
      entityName: course.basicDetails.courseTitle,
      instituteId: course.instituteId,
      instituteName: course.instituteName,
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
    });
  } catch (error) {
    console.error("ADD REVIEW ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCourseReviews = async (req, res) => {
  try {
    const uid = req.user.uid;

    // Step 1: Get all courses created by this institute
    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "No courses found.",
      });
    }

    // Store course ids and titles
    const courseMap = {};

    courseSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      courseMap[doc.id] = {
        courseId: doc.id,
        courseTitle: data.basicDetails?.courseTitle || "",
      };
    });
    const courseIds = Object.keys(courseMap);

    let allReviews = [];

    // Firestore "in" supports max 10 values, so chunk them
    for (let i = 0; i < courseIds.length; i += 10) {
      const ids = courseIds.slice(i, i + 10);

      const reviewSnapshot = await db
        .collection("courseReviews")
        .where("courseId", "in", ids)
        .orderBy("createdAt", "desc")
        .get();

      reviewSnapshot.forEach((doc) => {
        const review = doc.data();

        allReviews.push({
          reviewId: doc.id,
          ...review,
          courseTitle: courseMap[review.courseId]?.courseTitle || "",
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",
      reviews: allReviews,
    });
  } catch (error) {
    console.error("GET COURSE REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getReviewsForCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const reviewSnapshot = await db
      .collection("courseReviews")
      .where("courseId", "==", courseId)
      .orderBy("createdAt", "desc")
      .get();

    const reviews = reviewSnapshot.docs.map((doc) => doc.data());

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",
      reviews,
    });
  } catch (error) {
    console.error("GET REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
