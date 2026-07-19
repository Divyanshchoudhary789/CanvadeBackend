const { db } = require("../../services/firebase");

exports.searchCourses = async (req, res) => {
  try {
    const {
      q,
      learningMode,
      duration,
      difficulty,
      courseLevel,
      language,
      qualification,
      emi,
      location,
      status,
      instituteId,
      priceMin,
      priceMax,
    } = req.query;

    let ref = db.collection("courses");

    // Exact match filters (Firestore)
    if (learningMode) {
      ref = ref.where(
        "basicDetails.learningMode",
        "==",
        learningMode
      );
    }

    if (duration) {
      ref = ref.where(
        "basicDetails.duration",
        "==",
        duration
      );
    }

    if (status) {
      ref = ref.where("status", "==", status);
    }

    if (instituteId) {
      ref = ref.where("instituteId", "==", instituteId);
    }

    if (difficulty) {
      ref = ref.where(
        "basicDetails.courseInformation.difficulty",
        "==",
        difficulty
      );
    }

    if (courseLevel) {
      ref = ref.where(
        "basicDetails.courseInformation.courseLevel",
        "==",
        courseLevel
      );
    }

    if (language) {
      ref = ref.where(
        "basicDetails.courseInformation.language",
        "==",
        language
      );
    }

    if (qualification) {
      ref = ref.where(
        "basicDetails.minimumQualification",
        "==",
        qualification
      );
    }

    if (emi !== undefined) {
      ref = ref.where(
        "isEmiAvailable",
        "==",
        emi === "true"
      );
    }

    const snapshot = await ref.get();

    let courses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Keyword Search
    if (q) {
      const keyword = q.toLowerCase();

      courses = courses.filter(course => {

        const searchText = [
          course.basicDetails?.courseTitle,
          course.basicDetails?.aboutCourse,
          course.courseCode,
          ...(course.basicDetails?.keywords || [])
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(keyword);
      });
    }

    // Location
    if (location) {
      courses = courses.filter(course =>
        course.basicDetails?.locations?.includes(location)
      );
    }

    // Price
    if (priceMin) {
      courses = courses.filter(
        c =>
          Number(c.priceDetails?.currentPrice) >=
          Number(priceMin)
      );
    }

    if (priceMax) {
      courses = courses.filter(
        c =>
          Number(c.priceDetails?.currentPrice) <=
          Number(priceMax)
      );
    }

    const instituteCache = {};

    courses = await Promise.all(
      courses.map(async (course) => {
        const id = course.instituteId;

        if (id && !(id in instituteCache)) {
          const instituteSnapshot = await db
            .collection("institutes")
            .doc(id)
            .get();
          instituteCache[id] = instituteSnapshot.exists
            ? instituteSnapshot.data()?.name
            : null;
        }

        return {
          ...course,
          instituteName: id ? instituteCache[id] : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.searchCoursesByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const snapshot = await db
      .collection("courses")
      .where("basicDetails.category", "==", category)
      .get();

    let courses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    const instituteCache = {};

    courses = await Promise.all(
      courses.map(async (course) => {
        const id = course.instituteId;

        if (id && !(id in instituteCache)) {
          const instituteSnapshot = await db
            .collection("institutes")
            .doc(id)
            .get();
          instituteCache[id] = instituteSnapshot.exists
            ? instituteSnapshot.data()?.name
            : null;
        }

        return {
          ...course,
          instituteName: id ? instituteCache[id] : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
