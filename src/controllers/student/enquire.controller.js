const { db, admin } = require("../../services/firebase");
const { uploadsBlogImages } = require("../../middleware/upload");
const { getOrCreateEnquiryConversation } = require("../../utils/enquiryChat");

exports.createEnquiry = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can send enquiries. Please use a student account.",
      });
    }

    const studentId = req.user.uid;
    const studentName = req.user.displayName || "A student";
    const { courseId, instituteId, message } = req.body;

    if (!courseId && !instituteId) {
      return res.status(400).json({
        success: false,
        message: "courseId or instituteId is required",
      });
    }

    let course = null;
    let resolvedInstituteId = instituteId;

    if (courseId) {
      const courseDoc = await db.collection("courses").doc(courseId).get();
      if (!courseDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Course not found",
        });
      }
      course = courseDoc.data();
      resolvedInstituteId = course.instituteId;
    }

    if (!resolvedInstituteId) {
      return res.status(404).json({
        success: false,
        message: "Institute not found for this enquiry",
      });
    }

    const instituteDoc = await db.collection("institutes").doc(resolvedInstituteId).get();
    if (!instituteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }
    const institute = instituteDoc.data();
    const instituteUid = institute.ownerUid;
    const instituteName = institute.name || "the institute";

    let systemText;
    let defaultUserText;

    if (course) {
      const courseTitle = course.basicDetails?.courseTitle || "this course";
      const currentPrice = course.priceDetails?.currentPrice;
      systemText =
        `📘 Enquiry about: ${courseTitle}\n🏫 ${instituteName}` +
        (currentPrice ? `\n💰 ₹${currentPrice}` : "");
      defaultUserText = "Hi, I'm interested in this course. Can you share more details?";
    } else {
      systemText = `🏫 Enquiry about: ${instituteName}`;
      defaultUserText = "Hi, I'm interested in your institute. Can you share more details?";
    }

    const userText = message?.trim() || defaultUserText;

    const conversationId = await getOrCreateEnquiryConversation({
      studentUid: studentId,
      studentName,
      instituteUid,
      instituteName,
      systemText,
      userText,
    });

    let enquiryId = null;
    if (courseId) {
      const enquiryRef = db.collection("course_enquiries").doc();
      enquiryId = enquiryRef.id;
      await enquiryRef.set({
        enquiryId,
        studentId,
        courseId,
        instituteId: resolvedInstituteId,
        message: userText,
        status: "pending",
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Enquiry submitted successfully",
      data: { enquiryId, conversationId },
    });
  } catch (error) {
    console.error("Enquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyEnquiries = async (req, res) => {
  try {
    const studentId = req.user.uid;

    const snapshot = await db
      .collection("course_enquiries")
      .where("studentId", "==", studentId)
      .orderBy("createdAt", "desc")
      .get();

    const enquiries = [];

    snapshot.forEach((doc) => {
      enquiries.push(doc.data());
    });

    return res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateEnquiry = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { enquiryId } = req.params;
    const { courseId, message } = req.body;
    if (!courseId || !message) {
      return res.status(400).json({
        success: false,
        message: "Course ID and message are required",
      });
    }

    const enquiryRef = db
      .collection("course_enquiries")
      .doc(enquiryId);

    const enquiryDoc = await enquiryRef.get();
    if (!enquiryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    const enquiryData = enquiryDoc.data();

    if (enquiryData.studentId !== studentId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this enquiry",
      });
    }

    if (enquiryData.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending enquiries can be modified",
      });
    }

    await enquiryRef.update({
      courseId,
      message,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return res.status(200).json({
      success: true,
      message: "Enquiry updated successfully",
    });
  } catch (error) {
    console.error("Update Enquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteEnquiry = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { enquiryId } = req.params;

    const enquiryRef = db
      .collection("course_enquiries")
      .doc(enquiryId);

    const enquiryDoc = await enquiryRef.get();

    if (!enquiryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    const enquiryData = enquiryDoc.data();

    if (enquiryData.studentId !== studentId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this enquiry",
      });
    }

    if (enquiryData.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending enquiries can be modified",
      });
    }

    await enquiryRef.delete();

    return res.status(200).json({
      success: true,
      message: "Enquiry deleted successfully",
    });
  } catch (error) {
    console.error("Delete Enquiry Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllEnquiries = async (req, res) => {
  try {
    const snapshot = await db
      .collection("course_enquiries")
      .orderBy("createdAt", "desc")
      .get();

    const enquiries = [];

    snapshot.forEach((doc) => {
      enquiries.push(doc.data());
    });

    return res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries,
    });
  } catch (error) {
    console.error("Get All Enquiries Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getEnquiriesByCourseId = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: "Course ID is required",
      });
    }

    const snapshot = await db
      .collection("course_enquiries")
      .where("courseId", "==", courseId)
      .orderBy("createdAt", "desc")
      .get();

    const enquiries = [];

    snapshot.forEach((doc) => {
      enquiries.push(doc.data());
    });

    return res.status(200).json({
      success: true,
      count: enquiries.length,
      data: enquiries,
    });
  } catch (error) {
    console.error("Get Course Enquiries Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
