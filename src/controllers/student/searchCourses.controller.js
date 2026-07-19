const { db } = require("../../services/firebase");
const { uploadsBlogImages } = require("../../middleware/upload");

exports.searchCourses = async (req, res) => {
  try {
    const {
      keyword,
      mode,
      minFee,
      maxFee,
      durationMonths,
      category,
      organization,
      level,
    } = req.body;

    let query = db
      .collection("courses")
      .where("isDeleted", "==", false);

    if (mode) {
      query = query.where("mode", "==", mode);
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    if (organization) {
      query = query.where("organization", "==", organization);
    }

    if (level) {
      query = query.where("level", "==", level);
    }

    if (durationMonths) {
      query = query.where(
        "durationMonths",
        "==",
        Number(durationMonths)
      );
    }

    const snapshot = await query.get();

    let courses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Keyword Search
    if (keyword) {
      const search = keyword.toLowerCase();

      courses = courses.filter(
        (course) =>
          course.title?.toLowerCase().includes(search) ||
          course.description?.toLowerCase().includes(search) ||
          course.organization?.toLowerCase().includes(search)
      );
    }

    // Fee Range Filter
    if (minFee !== undefined) {
      courses = courses.filter(
        (course) => course.final_price >= Number(minFee)
      );
    }

    if (maxFee !== undefined) {
      courses = courses.filter(
        (course) => course.final_price <= Number(maxFee)
      );
    }

    return res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Search Courses Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};