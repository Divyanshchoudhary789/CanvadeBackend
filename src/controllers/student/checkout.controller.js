const { randomUUID: uuidv4 } = require("crypto");
const { db, admin } = require("../../services/firebase");
const enrollmentController = require("./enrolment.controller");
const { createActivity } = require("../activity/activity.controller");

function buildCheckoutResponse(checkoutId, checkoutData) {
  return {
    checkoutId,
    ...checkoutData,
  };
}

exports.createCheckout = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "courseId is required",
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
    const currentPrice = Number(courseData?.priceDetails?.currentPrice || 0);
    const currency = courseData?.priceDetails?.currency || "INR";

    const enrollmentId = `${studentId}_${courseId}`;
    const existingEnrollment = await db
      .collection("enrollments")
      .doc(enrollmentId)
      .get();

    if (existingEnrollment.exists) {
      return res.status(409).json({
        success: false,
        message: "Course already purchased",
      });
    }

    const existingPendingCheckout = await db
      .collection("checkouts")
      .where("studentId", "==", studentId)
      .where("courseId", "==", courseId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingPendingCheckout.empty) {
      const checkoutDoc = existingPendingCheckout.docs[0];
      return res.status(200).json({
        success: true,
        message: "Checkout already created",
        data: buildCheckoutResponse(checkoutDoc.id, checkoutDoc.data()),
      });
    }

    const checkoutRef = db.collection("checkouts").doc();
    const checkoutId = checkoutRef.id;
    const mockOrderId = `mock_order_${uuidv4().replace(/-/g, "")}`;

    const checkoutData = {
      checkoutId,
      studentId,
      courseId,
      courseSnapshot: {
        courseId,
        courseTitle:
          courseData?.basicDetails?.courseTitle ||
          courseData?.courseTitle ||
          "Untitled Course",
        courseCode: courseData?.basicDetails?.courseCode || null,
        instituteId: courseData?.instituteId || null,
        slug: courseData?.slug || null,
      },
      amount: currentPrice,
      currency,
      status: "pending",
      paymentGateway: "mock",
      gatewayOrderId: mockOrderId,
      gatewayPaymentId: null,
      paymentMethod: null,
      paymentSignature: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await checkoutRef.set(checkoutData);

    return res.status(201).json({
      success: true,
      message: "Checkout created successfully",
      data: {
        checkoutId,
        studentId,
        courseId,
        amount: currentPrice,
        currency,
        status: "pending",
        paymentGateway: "mock",
        gatewayOrderId: mockOrderId,
        instructions:
          "Call POST /api/checkout/confirm with checkoutId to simulate payment success.",
      },
    });
  } catch (error) {
    console.error("Create Checkout Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.confirmCheckout = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { checkoutId } = req.body;

    if (!checkoutId) {
      return res.status(400).json({
        success: false,
        message: "checkoutId is required",
      });
    }

    const checkoutRef = db.collection("checkouts").doc(checkoutId);
    const checkoutDoc = await checkoutRef.get();

    if (!checkoutDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Checkout not found",
      });
    }

    const checkoutData = checkoutDoc.data();

    if (checkoutData.studentId !== studentId) {
      return res.status(403).json({
        success: false,
        message: "You cannot confirm this checkout",
      });
    }

    if (checkoutData.status === "paid") {
      const enrollmentResult =
        await enrollmentController.createEnrollmentRecord({
          studentId,
          courseId: checkoutData.courseId,
          paymentId: checkoutData.gatewayPaymentId || null,
        });

      return res.status(200).json({
        success: true,
        message: "Checkout already completed",
        data: {
          checkoutId,
          status: checkoutData.status,
          enrollment: enrollmentResult.body,
        },
      });
    }

    const paymentId = `mock_pay_${uuidv4().replace(/-/g, "")}`;

    await checkoutRef.update({
      status: "paid",
      gatewayPaymentId: paymentId,
      paymentMethod: "mock",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const enrollmentResult = await enrollmentController.createEnrollmentRecord({
      studentId,
      courseId: checkoutData.courseId,
      paymentId,
    });

    const courseDoc = await db
      .collection("courses")
      .doc(checkoutData.courseId)
      .get();

    const course = courseDoc.data();

    await createActivity({
      ownerUid: course.createdBy,
      studentUid: studentId,
      type: "course_enrolled",
      entityType: "course",
      entityId: checkoutData.courseId,
      entityName: course.basicDetails.courseTitle,
      instituteId: course.instituteId,
      instituteName: course.instituteName,
    });
	
    return res.status(200).json({
      success: true,
      message: "Payment confirmed and enrollment created",
      data: {
        checkoutId,
        status: "paid",
        gatewayPaymentId: paymentId,
        enrollment: enrollmentResult.body,
      },
    });
  } catch (error) {
    console.error("Confirm Checkout Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCheckoutById = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { checkoutId } = req.params;

    if (!checkoutId) {
      return res.status(400).json({
        success: false,
        message: "checkoutId is required",
      });
    }

    const checkoutDoc = await db.collection("checkouts").doc(checkoutId).get();

    if (!checkoutDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Checkout not found",
      });
    }

    const checkoutData = checkoutDoc.data();

    if (checkoutData.studentId !== studentId) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this checkout",
      });
    }

    return res.status(200).json({
      success: true,
      data: buildCheckoutResponse(checkoutDoc.id, checkoutData),
    });
  } catch (error) {
    console.error("Get Checkout Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
