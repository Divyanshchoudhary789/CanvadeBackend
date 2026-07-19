const jwt = require("jsonwebtoken");
const { uploadFile } = require("../../services/storage");
const bcrypt = require("bcryptjs");
const extractCoordinates = require("../../utils/extractCoordinates");

const { admin, db } = require("../../services/firebase");

const isValidDate = (date) => {
  return !isNaN(new Date(date).getTime());
};

const isValidTimeRange = (startTime, endTime) => {
  return startTime < endTime;
};

const normalizeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(Boolean))];
};

exports.createBatch = async (req, res) => {
  try {
    const uid = req.user.uid;

    let {
      batchName,
      batchCode,
      courseId,
      teacherId,
      capacity,
      startDate,
      endDate,
      startTime,
      endTime,
      days = [],
      studentIds = [],
      studentNames = [],
      status = "active",
      locations = [],
    } = req.body;

    if (
      !batchName ||
      !batchCode ||
      !courseId ||
      !teacherId ||
      capacity === undefined ||
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    batchName = String(batchName).trim();
    batchCode = String(batchCode).trim().toUpperCase();
    capacity = Number(capacity);
    days = normalizeArray(days);
    studentIds = normalizeArray(studentIds);
    studentNames = normalizeArray(studentNames);

    // de-dupe while keeping the name paired to its id
    const studentIdToName = {};
    studentIds.forEach((id, idx) => {
      studentIdToName[id] = studentNames[idx] || "";
    });
    const uniqueStudentIds = [...new Set(studentIds)];

    if (!Number.isInteger(capacity) || capacity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Capacity must be greater than zero.",
      });
    }

    if (uniqueStudentIds.length > capacity) {
      return res.status(400).json({
        success: false,
        message: "Students cannot exceed batch capacity.",
      });
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dates.",
      });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date.",
      });
    }

    if (!isValidTimeRange(startTime, endTime)) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time.",
      });
    }

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "Only approved institute owners can create batches.",
      });
    }

    const institute = instituteSnapshot.docs[0].data();

    const duplicateBatch = await db
      .collection("batches")
      .where("ownerUid", "==", uid)
      .where("batchCode", "==", batchCode)
      .where("isDeleted", "==", false)
      .limit(1)
      .get();

    if (!duplicateBatch.empty) {
      return res.status(409).json({
        success: false,
        message: "Batch code already exists.",
      });
    }

    const teacher = institute.faculties.find(
      (t) =>
        t.facultyCode.toUpperCase().trim() === teacherId.toUpperCase().trim(),
    );

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found.",
      });
    }

    const courseDoc = await db.collection("courses").doc(courseId).get();

    if (!courseDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    const course = courseDoc.data();

    if (course.createdBy !== uid || course.isDeleted === true) {
      return res.status(403).json({
        success: false,
        message: "Invalid course.",
      });
    }

    const courseName = course?.basicDetails?.courseTitle || course.name || "";

    // studentIds are user uids — look them up directly in the users collection
    // if (uniqueStudentIds.length) {
    //   const studentDocs = await Promise.all(
    //     uniqueStudentIds.map((studentUid) =>
    //       db.collection("users").doc(studentUid).get(),
    //     ),
    //   );

    //   for (let i = 0; i < studentDocs.length; i += 1) {
    //     const studentDoc = studentDocs[i];
    //     const studentUid = uniqueStudentIds[i];

    //     if (!studentDoc.exists) {
    //       return res.status(404).json({
    //         success: false,
    //         message: `Student ${studentUid} not found.`,
    //       });
    //     }

    //     const student = studentDoc.data();

    //     if (student.isDeleted === true) {
    //       return res.status(403).json({
    //         success: false,
    //         message: `Invalid student ${studentUid}.`,
    //       });
    //     }

    //     // trust the DB name over whatever the client sent, but keep the client's
    //     // name as a fallback if the user doc doesn't have one
    //     studentIdToName[studentUid] =
    //       student.name || student.fullName || studentIdToName[studentUid] || "";
    //   }
    // }

    const finalStudentNames = uniqueStudentIds.map(
      (id) => studentIdToName[id] || "",
    );

    const batchRef = db.collection("batches").doc();

    const batchData = {
      batchId: batchRef.id,
      ownerUid: uid,
      instituteId: institute.instituteId,
      instituteName: institute.name,
      batchName,
      batchCode,
      courseId,
      courseName,
      teacherId: teacher.facultyCode,
      teacherName: teacher.name || "",
      capacity,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      studentIds: uniqueStudentIds,
      studentNames: finalStudentNames,
      status,
      locations: normalizeArray(locations),
      isDeleted: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await batchRef.set(batchData);

    const created = await batchRef.get();

    return res.status(201).json({
      success: true,
      message: "Batch created successfully.",
      batch: created.data(),
    });
  } catch (error) {
    console.error("Create Batch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const uid = req.user.uid;

    const batchRef = db.collection("batches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    const batch = batchDoc.data();

    if (batch.ownerUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (batch.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Batch has already been deleted.",
      });
    }

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "Institute not found.",
      });
    }

    const institute = instituteSnapshot.docs[0].data();

    const allowedFields = [
      "batchName",
      "batchCode",
      "courseId",
      "teacherId",
      "capacity",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "days",
      "studentIds",
      "status",
      "locations",
    ];

    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (updates.locations !== undefined) {
      updates.locations = normalizeArray(updates.locations);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided.",
      });
    }

    if (updates.batchName !== undefined) {
      updates.batchName = String(updates.batchName).trim();

      if (!updates.batchName) {
        return res.status(400).json({
          success: false,
          message: "Batch name cannot be empty.",
        });
      }
    }

    if (updates.batchCode !== undefined) {
      updates.batchCode = String(updates.batchCode).trim().toUpperCase();

      const duplicate = await db
        .collection("batches")
        .where("ownerUid", "==", uid)
        .where("batchCode", "==", updates.batchCode)
        .where("isDeleted", "==", false)
        .limit(1)
        .get();

      if (!duplicate.empty && duplicate.docs[0].id !== batchId) {
        return res.status(409).json({
          success: false,
          message: "Batch code already exists.",
        });
      }
    }

    if (updates.capacity !== undefined) {
      updates.capacity = Number(updates.capacity);

      if (!Number.isInteger(updates.capacity) || updates.capacity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid capacity.",
        });
      }
    }

    if (updates.courseId !== undefined) {
      const courseDoc = await db
        .collection("courses")
        .doc(updates.courseId)
        .get();

      if (!courseDoc.exists) {
        return res.status(404).json({
          success: false,
          message: "Course not found.",
        });
      }

      const course = courseDoc.data();

      if (course.createdBy !== uid || course.isDeleted === true) {
        return res.status(403).json({
          success: false,
          message: "Invalid course.",
        });
      }

      updates.courseName =
        course?.basicDetails?.courseTitle || course.name || "";
    }

    if (updates.days !== undefined && !Array.isArray(updates.days)) {
      return res.status(400).json({
        success: false,
        message: "Days must be an array.",
      });
    }

    if (updates.studentIds !== undefined) {
      if (!Array.isArray(updates.studentIds)) {
        return res.status(400).json({
          success: false,
          message: "studentIds must be an array.",
        });
      }

      const incomingNames = Array.isArray(req.body.studentNames)
        ? req.body.studentNames
        : [];
      const studentIdToName = {};
      updates.studentIds.forEach((id, idx) => {
        studentIdToName[id] = incomingNames[idx] || "";
      });

      updates.studentIds = [...new Set(updates.studentIds)];

      // if (updates.studentIds.length) {
      //   const studentDocs = await Promise.all(
      //     updates.studentIds.map((studentUid) =>
      //       db.collection("users").doc(studentUid).get(),
      //     ),
      //   );

      //   for (let i = 0; i < studentDocs.length; i += 1) {
      //     const studentDoc = studentDocs[i];
      //     const studentUid = updates.studentIds[i];

      //     if (!studentDoc.exists) {
      //       return res.status(404).json({
      //         success: false,
      //         message: `Student ${studentUid} not found.`,
      //       });
      //     }

      //     const student = studentDoc.data();

      //     if (student.isDeleted === true) {
      //       return res.status(403).json({
      //         success: false,
      //         message: `Invalid student ${studentUid}.`,
      //       });
      //     }

      //     studentIdToName[studentUid] =
      //       student.name ||
      //       student.fullName ||
      //       studentIdToName[studentUid] ||
      //       "";
      //   }
      // }

      updates.studentNames = updates.studentIds.map(
        (id) => studentIdToName[id] || "",
      );

      const capacityLimit = updates.capacity ?? batch.capacity;

      if (updates.studentIds.length > capacityLimit) {
        return res.status(400).json({
          success: false,
          message: "Students cannot exceed batch capacity.",
        });
      }
    }

    if (updates.teacherId !== undefined) {
      const teacher = institute.faculties.find(
        (faculty) =>
          faculty.facultyCode.trim().toUpperCase() ===
          updates.teacherId.trim().toUpperCase(),
      );

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Faculty not found.",
        });
      }

      updates.teacherId = teacher.facultyCode;
      updates.teacherName = teacher.name;
    }

    if (updates.status !== undefined) {
      const allowedStatus = ["active", "inactive", "completed", "cancelled"];

      if (!allowedStatus.includes(updates.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status.",
        });
      }
    }

    const finalStartDate = updates.startDate || batch.startDate;
    const finalEndDate = updates.endDate || batch.endDate;

    if (new Date(finalEndDate) < new Date(finalStartDate)) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date.",
      });
    }

    const finalStartTime = updates.startTime || batch.startTime;
    const finalEndTime = updates.endTime || batch.endTime;

    if (finalStartTime >= finalEndTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time.",
      });
    }

    updates.instituteId = institute.instituteId;
    updates.instituteName = institute.name;
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await batchRef.update(updates);

    const updated = await batchRef.get();

    return res.status(200).json({
      success: true,
      message: "Batch updated successfully.",
      batch: updated.data(),
    });
  } catch (error) {
    console.error("Update Batch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const uid = req.user.uid;

    const batchRef = db.collection("batches").doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    const batch = batchDoc.data();

    if (batch.ownerUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (batch.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Batch has already been deleted.",
      });
    }

    await batchRef.update({
      isDeleted: true,
      status: "deleted",
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      message: "Batch deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Batch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const uid = req.user.uid;

    const doc = await db.collection("batches").doc(batchId).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    const batch = doc.data();

    if (batch.ownerUid !== uid) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (batch.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Batch not found.",
      });
    }

    return res.status(200).json({
      success: true,
      batch,
    });
  } catch (error) {
    console.error("Get Batch Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMyBatches = async (req, res) => {
  try {
    const uid = req.user.uid;

    let query = db
      .collection("batches")
      .where("ownerUid", "==", uid)
      .where("isDeleted", "==", false);

    const snapshot = await query.orderBy("createdAt", "desc").get();

    let batches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: batches.length,
      batches,
    });
  } catch (error) {
    console.error("Get Batches Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllBatches = async (req, res) => {
  try {
    const uid = req.user.uid;

    let { page = 1, limit = 10, status } = req.query;

    page = Number(page);
    limit = Number(limit);

    let query = db
      .collection("batches")
      .where("ownerUid", "==", uid)
      .where("isDeleted", "==", false);

    if (status) {
      query = query.where("status", "==", status);
    }

    query = query.orderBy("createdAt", "desc");

    const snapshot = await query.get();

    let batches = snapshot.docs.map((doc) => doc.data());

    const total = batches.length;

    const start = (page - 1) * limit;

    batches = batches.slice(start, start + limit);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      batches,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
