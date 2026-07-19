const { db } = require("../../services/firebase");
const { uploadsBlogImages } = require("../../middleware/upload");
const { createActivity } = require("../activity/activity.controller");

exports.addToCart = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    // Check course exists
    const courseSnapshot = await db
      .collection("courses")
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (courseSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }
    const course = courseSnapshot.docs[0].data();

    const cartRef = db
      .collection("cart")
      .doc(studentId)
      .collection("items")
      .doc(courseId);

    const cartDoc = await cartRef.get();

    if (cartDoc.exists) {
      return res.status(409).json({
        success: false,
        message: "Course already in cart",
      });
    }

    await cartRef.set({
      courseId,
      addedAt: new Date(),
    });

    await createActivity({
      ownerUid: course.createdBy,
      studentUid: studentId,
      type: "cart_added",
      entityType: "course",
      entityId: courseId,
      entityName: course.basicDetails.courseTitle,
      instituteId: course.instituteId,
      instituteName: course.instituteName,
    });
    return res.status(201).json({
      success: true,
      message: "Course added to learning list successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCartItems = async (req, res) => {
  try {
    const studentId = req.user.uid;

    const cartSnapshot = db
      .collection("cart")
      .doc(studentId)
      .collection("items")
      .get();

    if ((await cartSnapshot).empty) {
      return res.status(200).json({
        success: true,
        cart: [],
      });
    }

    const courseIds = (await cartSnapshot).docs.map((doc) => doc.id);

    const courses = [];

    for (const courseId of courseIds) {
      const courseSnapshot = await db
        .collection("courses")
        .where("courseId", "==", courseId)
        .limit(1)
        .get();

      if (!courseSnapshot.empty) {
        courses.push(courseSnapshot.docs[0].data());
      }
    }

    return res.status(200).json({
      success: true,
      cart: courses,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const cartRef = db
      .collection("cart")
      .doc(studentId)
      .collection("items")
      .doc(courseId);

    const cartDoc = await cartRef.get();

    if (!cartDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found in cart",
      });
    }

    await cartRef.delete();

    return res.status(200).json({
      success: true,
      message: "Course removed from cart successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
