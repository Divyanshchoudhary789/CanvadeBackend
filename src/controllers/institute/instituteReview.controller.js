const { admin, db } = require("../../services/firebase");
const {createActivity}  = require("../activity/activity.controller");

exports.addInstituteReview = async (req, res) => {
  try {
    const { instituteId } = req.params;
    const { rating, review } = req.body;
    const uid = req.user.uid;

    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "Institute ID is required",
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    if (!review || !review.trim()) {
      return res.status(400).json({
        success: false,
        message: "Review is required",
      });
    }

    // Check institute exists
    const instituteRef = db.collection("institutes").doc(instituteId);
    const instituteDoc = await instituteRef.get();

    if (!instituteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    // Student should have purchased at least one course of this institute
    const courseSnapshot = await db
      .collection("courses")
      .where("instituteId", "==", instituteId)
      .get();

    if (courseSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "No courses found for this institute.",
      });
    }

    const courseIds = courseSnapshot.docs.map((doc) => doc.id);

    // let enrolled = false;

    // for (let i = 0; i < courseIds.length; i += 10) {
    //   const enrollmentSnapshot = await db
    //     .collection("enrollments")
    //     .where("userId", "==", uid)
    //     .where("courseId", "in", courseIds.slice(i, i + 10))
    //     .limit(1)
    //     .get();

    //   if (!enrollmentSnapshot.empty) {
    //     enrolled = true;
    //     break;
    //   }
    // }

    // if (!enrolled) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Only enrolled students can review this institute.",
    //   });
    // }

    // Duplicate review
    const existingReview = await db
      .collection("instituteReviews")
      .where("instituteId", "==", instituteId)
      .where("studentUid", "==", uid)
      .limit(1)
      .get();

    if (!existingReview.empty) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this institute.",
      });
    }

    // Student details
    const userDoc = await db.collection("users").doc(uid).get();
    const user = userDoc.exists ? userDoc.data() : {};
    const institute = instituteDoc.data();

    const reviewRef = db.collection("instituteReviews").doc();

    await reviewRef.set({
      reviewId: reviewRef.id,
      instituteId,
      studentUid: uid,
      studentName: user.displayName || "Anonymous",
      studentImage: user.profileImage || "",
      rating: Number(rating),
      review: review.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await createActivity({
    ownerUid: institute.ownerUid,
    studentUid: uid,
    type: "institute_review",
    entityType: "institute",
    entityId: instituteId,
    entityName: institute.name,
    instituteId,
    instituteName: institute.name,
});

    return res.status(201).json({
      success: true,
      message: "Institute review submitted successfully.",
    });
  } catch (error) {
    console.error("ADD INSTITUTE REVIEW ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getInstituteReviews = async (req, res) => {
  try {
    const uid = req.user.uid;

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found for the current user.",
      });
    }

    const instituteId = instituteSnapshot.docs[0].id;
    const reviewSnapshot = await db
      .collection("instituteReviews")
      .where("instituteId", "==", instituteId)
      .orderBy("createdAt", "desc")
      .get();

    const reviews = reviewSnapshot.docs.map((doc) => doc.data());

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("GET INSTITUTE REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getReviewsForInstitute = async (req, res) => {
  try {
    const { instituteId } = req.params;

    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "Institute ID is required",
      });
    }

    const reviewSnapshot = await db
      .collection("instituteReviews")
      .where("instituteId", "==", instituteId)
      .orderBy("createdAt", "desc")
      .get();

    const reviews = reviewSnapshot.docs.map((doc) => doc.data());

    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("GET INSTITUTE REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};