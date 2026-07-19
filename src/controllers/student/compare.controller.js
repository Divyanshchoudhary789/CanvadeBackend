const { db } = require("../../services/firebase");

exports.addToCompare = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ success: false, message: "Course ID is required" });
    }

    // Check course exists
    const courseSnapshot = await db
      .collection("courses")
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (courseSnapshot.empty) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    const compareRef = db
      .collection("compare")
      .doc(studentId)
      .collection("items")
      .doc(courseId);

    const compareDoc = await compareRef.get();

    if (compareDoc.exists) {
      return res.status(409).json({ success: false, message: "Course already in compare list" });
    }

    await compareRef.set({ courseId, addedAt: new Date() });

    return res.status(201).json({ success: true, message: "Course added to compare list" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCompareItems = async (req, res) => {
  try {
    const studentId = req.user.uid;

    const compareSnapshot = db
      .collection("compare")
      .doc(studentId)
      .collection("items")
      .get();

    if ((await compareSnapshot).empty) {
      return res.status(200).json({ success: true, compare: [] });
    }

    const courseIds = (await compareSnapshot).docs.map((doc) => doc.id);

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

    return res.status(200).json({ success: true, compare: courses });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeFromCompare = async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ success: false, message: "Course ID is required" });
    }

    const compareRef = db
      .collection("compare")
      .doc(studentId)
      .collection("items")
      .doc(courseId);

    const compareDoc = await compareRef.get();

    if (!compareDoc.exists) {
      return res.status(404).json({ success: false, message: "Course not found in compare list" });
    }

    await compareRef.delete();

    return res.status(200).json({ success: true, message: "Course removed from compare list" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
