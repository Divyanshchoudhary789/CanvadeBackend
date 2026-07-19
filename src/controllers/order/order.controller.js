const razorpay = require("../../config/razorpay");
const crypto = require("crypto");
const { db } = require("../../services/firebase");
const { title } = require("process");
const { createActivity } = require("../activity/activity.controller");
const { addStudentToCourseGroup } = require("../chat/group.controller");

exports.createOrder = async (req, res) => {
  try {
    const { courseId, couponCode, location, studentDetails, batchId } = req.body;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const userId = req.user?.uid;

    const courseRef = await db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const course = courseDoc.data();
    if (
      !course?.priceDetails?.currentPrice ||
      Number(course.priceDetails.currentPrice) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid course fee",
      });
    }

    // The discount amount always comes from the course's own coupon, never
    // from the client, so a tampered request can't buy below the real price.
    let payableAmount = Number(course.priceDetails.currentPrice);
    let appliedCoupon = null;

    if (couponCode) {
      const courseCoupon = course.priceDetails.couponCode;
      const normalizedInput = String(couponCode).trim().toUpperCase();
      const normalizedCourseCode = String(courseCoupon?.code || "")
        .trim()
        .toUpperCase();

      if (!normalizedCourseCode || normalizedInput !== normalizedCourseCode) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon code",
        });
      }

      const discountAmount = Number(courseCoupon.discountAmount || 0);
      payableAmount = Math.max(payableAmount - discountAmount, 1);
      appliedCoupon = { code: normalizedCourseCode, discountAmount };
    }

    // Prevent duplicate enrollment
    const enrollmentSnapshot = await db
      .collection("enrollments")
      .where("userId", "==", userId)
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (!enrollmentSnapshot.empty) {
      return res.status(409).json({
        success: false,
        message: "You are already enrolled in this course",
      });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(payableAmount * 100),
      currency: "INR",
      receipt: `ORD${Date.now()}`,
      notes: {
        courseId,
        userId,
        couponCode: appliedCoupon?.code || "",
      },
    });

    await db
      .collection("orders")
      .doc(order.id)
      .set({
        orderId: order.id,
        userId,
        courseId,
        amount: order.amount / 100,
        currency: order.currency,
        status: "pending",
        couponCode: appliedCoupon?.code || null,
        discountAmount: appliedCoupon?.discountAmount || 0,
        location: location || null,
        batchId: batchId || null,
        studentDetails: studentDetails || null,
        createdAt: new Date(),
      });

    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        course: {
          id: courseDoc.id,
          title: course.title,
          currentPrice: course.priceDetails.currentPrice,
        },
        coupon: appliedCoupon,
      },
    });
  } catch (error) {
    console.error("Create Order:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create order",
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      courseId,
    } = req.body;

    const userId = req.user?.uid;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !courseId
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Fetch payment from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment not captured",
      });
    }

    // Prevent duplicate enrollment
    const enrollmentSnapshot = await db
      .collection("enrollments")
      .where("userId", "==", userId)
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (!enrollmentSnapshot.empty) {
      return res.status(409).json({
        success: false,
        message: "Already enrolled",
      });
    }

    // Save payment
    await db
      .collection("payments")
      .doc(razorpay_payment_id)
      .set({
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        userId,
        courseId,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        createdAt: new Date(),
      });

    // Fetch order to get selected location and student details
    const orderDoc = await db.collection("orders").doc(razorpay_order_id).get();
    const orderData = orderDoc.exists ? orderDoc.data() : null;
    const selectedLocation = orderData?.location || null;
    const selectedBatchId = orderData?.batchId || null;
    const studentDetails = orderData?.studentDetails || null;

    // Create enrollment
    await db.collection("enrollments").add({
      userId,
      courseId,
      paymentId: razorpay_payment_id,
      enrolledAt: new Date(),
      status: "active",
      location: selectedLocation,
      batchId: selectedBatchId,
      studentDetails: studentDetails,
    });

    // Add student to the batch roster
    if (selectedBatchId) {
      try {
        const batchRef = db.collection("batches").doc(selectedBatchId);
        const batchDoc = await batchRef.get();
        if (batchDoc.exists) {
          const batchData = batchDoc.data();
          const studentIds = batchData.studentIds || [];
          const studentNames = batchData.studentNames || [];

          if (!studentIds.includes(userId)) {
            studentIds.push(userId);
            const studentName = studentDetails?.fullName || "Student";
            studentNames.push(studentName);

            await batchRef.update({
              studentIds,
              studentNames,
              updatedAt: new Date(),
            });
          }
        }
      } catch (batchErr) {
        console.error("Error adding student to batch roster:", batchErr);
      }
    }

    await addStudentToCourseGroup(courseId, userId);

    const courseDoc = await db.collection("courses").doc(courseId).get();

    const course = courseDoc.data();

    await createActivity({
      ownerUid: course.createdBy,
      studentUid: userId,
      type: "course_enrolled",
      entityType: "course",
      entityId: courseId,
      entityName: course.basicDetails.courseTitle,
      instituteId: course.instituteId,
      instituteName: course.instituteName,
    });

    await db.collection("orders").doc(razorpay_order_id).update({
      status: "completed",
      updatedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error("Verify Payment:", error);

    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};

exports.checkPendingPayment = async (req, res) => {
  try {
    const userId = req.user?.uid;

    const pendingPaymentSnapshot = await db
      .collection("orders")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();

    if (pendingPaymentSnapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No pending payments",
        data: null,
      });
    }

    const pendingPayment = pendingPaymentSnapshot.docs[0].data();

    if (pendingPayment !== null) {
      const courseRef = await db
        .collection("courses")
        .doc(pendingPayment.courseId);
      const courseDoc = await courseRef.get();
      if (!courseDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Course not found for pending payment",
        });
      }
      const course = courseDoc.data();
      pendingPayment.courseTitle = course.basicDetails?.courseTitle;
      pendingPayment.createdBy = course.createdByName;
    }

    return res.status(200).json({
      success: true,
      message: "Pending payment found",
      data: [
        {
          paymentId: pendingPayment.paymentId,
          orderId: pendingPayment.orderId,
          courseId: pendingPayment.courseId,
          amount: pendingPayment.amount,
          currency: pendingPayment.currency,
          dueDate: pendingPayment.createdAt
            ? new Date(pendingPayment.createdAt.toDate())
            : null,
          status: pendingPayment.status,
          title: pendingPayment.courseTitle || "Course Title Not Found",
          createdAt: pendingPayment.createdAt,
          createdBy: pendingPayment.createdBy || "Creator Not Found",
        },
      ],
    });
  } catch (error) {
    console.error("Check Pending Payment:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check pending payment",
    });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user?.uid;

    const paymentSnapshot = await db
      .collection("payments")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    if (paymentSnapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No payment history found",
        data: [],
      });
    }

    const payments = [];
    for (const doc of paymentSnapshot.docs) {
      const paymentData = doc.data();
      const courseRef = await db
        .collection("courses")
        .doc(paymentData.courseId);
      const courseDoc = await courseRef.get();
      if (!courseDoc.exists) {
        continue;
      }
      const course = courseDoc.data();
      payments.push({
        paymentId: paymentData.paymentId,
        orderId: paymentData.orderId,
        courseId: paymentData.courseId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: paymentData.status,
        createdAt: paymentData.createdAt,
        title: course.basicDetails?.courseTitle || "Course Title Not Found",
        createdBy: course.createdByName || "Creator Not Found",
        image: course.uploadMaterials?.thumbnail || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully",
      data: payments,
    });
  } catch (error) {
    console.error("Get Payment History:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve payment history",
    });
  }
};
