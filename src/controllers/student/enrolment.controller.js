const { db } = require("../../services/firebase");
const { addStudentToCourseGroup } = require("../chat/group.controller");

async function createEnrollmentRecord({
  studentId,
  courseId,
  progressId = null,
  paymentId = null,
}) {
  const enrollmentId = `${studentId}_${courseId}`;
  const enrollmentRef = db.collection("enrollments").doc(enrollmentId);
  const existingEnrollment = await enrollmentRef.get();

  if (existingEnrollment.exists) {
    // Idempotent — no-ops if already a member. Covers the case where the
    // course's group didn't exist yet the first time this student enrolled.
    await addStudentToCourseGroup(courseId, studentId);

    return {
      status: 200,
      body: {
        success: true,
        message: "Course already purchased",
        enrollmentId,
        existing: true,
      },
    };
  }

  await enrollmentRef.set({
    enrollmentId,
    studentId,
    courseId,
    progressId,
    paymentId,
    registrationDate: db.Timestamp.now(),
    status: "active",
    createdAt: db.Timestamp.now(),
    updatedAt: db.Timestamp.now(),
  });

  await addStudentToCourseGroup(courseId, studentId);

  return {
    status: 201,
    body: {
      success: true,
      message: "Enrollment created successfully",
      enrollmentId,
      existing: false,
    },
  };
}

// exports.createEnrollment = async (req, res) => {
//   try {
//     const studentId = req.user.uid;
//     const { courseId, progressId, paymentId } = req.body;

//     if (!courseId) {
//       return res.status(400).json({
//         success: false,
//         message: "courseId is required",
//       });
//     }

//     const result = await createEnrollmentRecord({
//       studentId,
//       courseId,
//       progressId,
//       paymentId,
//     });

//     return res.status(result.status).json(result.body);
//   } catch (error) {
//     console.error("Enrollment Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

exports.createEnrollmentRecord = createEnrollmentRecord;

exports.getMyEnrollments = async (req, res) => {
  try {
    const studentId = req.user?.uid;

    const snapshot = await db
      .collection("enrollments")
      .where("userId", "==", studentId)
      .get();

    const enrollments = [];

    for (const doc of snapshot.docs) {
      const enrollment = doc.data();

      const courseDoc = await db
        .collection("courses")
        .doc(enrollment.courseId)
        .get();

      enrollments.push({
        enrollmentId: enrollment.enrollmentId,
        registrationDate: enrollment.registrationDate,
        status: enrollment.status,
        course: courseDoc.exists ? courseDoc.data() : null,
      });
    }

    return res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getInstituteEnrollments = async (req, res) => {
  try {
    const uid = req.user.uid;

    // Get all institute courses
    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const courseMap = {};
    const courseIds = [];

    courseSnapshot.docs.forEach((doc) => {
      const course = doc.data();
      courseIds.push(doc.id);
      courseMap[doc.id] = {
        courseId: doc.id,
        title: course.basicDetails?.courseTitle || "",
        thumbnail: course.uploadMaterials?.thumbnail || "",
        price: course.priceDetails?.currentPrice || 0,
        category: course.basicDetails?.category || "",
      };
    });

    // Firestore "in" supports max 10 values per query
    const chunk = (arr, size) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );

    const enrollmentSnapshots = await Promise.all(
      chunk(courseIds, 10).map((idsChunk) =>
        db.collection("enrollments").where("courseId", "in", idsChunk).get()
      )
    );

    // Flatten all enrollment docs
    const enrollmentDocs = enrollmentSnapshots.flatMap((snap) => snap.docs);

    // Collect unique student uids so we only fetch each user once
    const studentUids = [
      ...new Set(enrollmentDocs.map((doc) => doc.data().userId).filter(Boolean)),
    ];

    // Batch-fetch users (10 per "in" query), in parallel
    const userSnapshots = await Promise.all(
      chunk(studentUids, 10).map((idsChunk) =>
        db.collection("users").where("uid", "in", idsChunk).get()
      )
    );

    const userMap = {};
    userSnapshots.forEach((snap) => {
      snap.docs.forEach((doc) => {
        userMap[doc.id] = doc.data();
      });
    });

    const enrollments = enrollmentDocs.map((doc) => {
      const enrollment = doc.data();
      const user = userMap[enrollment.userId] || {};
      const address = user.address || {};

      const registrationDate =
        enrollment.registrationDate || enrollment.enrolledAt;

      const formattedRegistrationDate = registrationDate
        ? registrationDate.toDate().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "";

      return {
        enrollmentId: doc.id,
        registrationDate: formattedRegistrationDate,
        status: enrollment.status,

        student: {
          uid: user.uid,
          studentId: user.studentId,
          name: user.displayName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          profileImage: user.profileImage || "",

          location: {
            city: address.city || "",
            state: address.state || "",
            addressLine1: address.addressLine1 || "",
            addressLine2: address.addressLine2 || "",
            zipCode: address.zipCode || "",
          },
        },

        course: {
          courseId: courseMap[enrollment.courseId]?.courseId,
          title: courseMap[enrollment.courseId]?.title,
          thumbnail: courseMap[enrollment.courseId]?.thumbnail,
          price: courseMap[enrollment.courseId]?.price,
          category: courseMap[enrollment.courseId]?.category,
        },
      };
    });

    return res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
