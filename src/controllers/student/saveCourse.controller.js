const { db } = require("../../services/firebase");
const { uploadsBlogImages } = require("../../middleware/upload");

exports.saveCourse = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const existing = await db
      .collection("saved_courses")
      .where("studentId", "==", studentId)
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({
        success: false,
        message: "Course already saved",
      });
    }

    const savedRef = db
      .collection("saved_courses")
      .doc();

    await savedRef.set({
      savedId: savedRef.id,
      studentId,
      courseId,
      createdAt: db.Timestamp.now(),
    });

    return res.status(201).json({
      success: true,
      message: "Course saved successfully",
      savedId: savedRef.id,
    });
  } catch (error) {
    console.error("Save Course Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMySavedCourses = async (req, res) => {
  try {
    const studentId = req.user.uid;

    const snapshot = await db
      .collection("saved_courses")
      .where("studentId", "==", studentId)
      .orderBy("createdAt", "desc")
      .get();

    const courses = [];

    snapshot.forEach((doc) => {
      courses.push(doc.data());
    });

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Get Saved Courses Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.removeSavedCourse = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.params;

    const snapshot = await db
      .collection("saved_courses")
      .where("studentId", "==", studentId)
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Saved course not found",
      });
    }

    const docId = snapshot.docs[0].id;

    await db
      .collection("saved_courses")
      .doc(docId)
      .delete();

    return res.status(200).json({
      success: true,
      message: "Course removed from saved list",
    });
  } catch (error) {
    console.error("Remove Saved Course Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.isCourseSaved = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.params;

    const snapshot = await db
      .collection("saved_courses")
      .where("studentId", "==", studentId)
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    return res.status(200).json({
      success: true,
      isSaved: !snapshot.empty,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};