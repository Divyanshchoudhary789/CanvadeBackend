const express = require("express");
const swaggerUi = require("swagger-ui-express");
const cors = require("cors");
require("dotenv").config();

const userRoutes = require("./src/routes/student/user.routes");
const enrollmentRoutes = require("./src/routes/student/enrollment.routes");
const checkoutRoutes = require("./src/routes/student/checkout.routes");
const cartRoutes = require("./src/routes/student/cart.routes");
const enquiryRoutes = require("./src/routes/student/enquire.routes");
const saveCourse = require("./src/routes/student/saveCourse.routes");
const searchCoursesRoutes = require("./src/routes/student/searchCourses.route");
const compareRoutes = require("./src/routes/student/compare.routes");
const updateRoutes = require('./src/routes/institute/updates.routes');
const courseRoutes = require("./src/routes/institute/course.routes");
const instituteRoutes = require("./src/routes/institute/institute.routes");
const orderRoutes = require("./src/routes/order/order.routes");
const planRoutes = require("./src/routes/plan/plan.routes");
const authRoutes = require("./src/routes/auth.routes");
const swaggerSpec = require("./swagger");
const batchRoutes = require("./src/routes/batch/batch.routes");
const searchRoutes = require("./src/routes/search/search.routes");
const analyticsRoutes = require("./src/routes/institute/analytics.routes");
const courseReviewRoutes = require("./src/routes/institute/courseReview.routes");
const instituteReviewRoutes = require("./src/routes/institute/instituteReview.routes");
const activityRoutes = require("./src/routes/activity/activity.routes");
const revenueRoutes = require("./src/routes/revenue/revenue.routes");
const chatRoutes = require("./src/routes/chat/chat.routes");
const supportRoutes = require("./src/routes/support.routes");
const app = express();
app.use(express.json());

const allowedOrigins = ["http://localhost:5173", "https://canvade.com", "https://canvade-frontend.vercel.app", "https://canvade-frontend-tawny.vercel.app"];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/institute", instituteRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/enquiries", enquiryRoutes);
app.use("/api/saved-courses", saveCourse);
app.use("/api/search", searchCoursesRoutes);
app.use('/api/updates', updateRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/course-reviews", courseReviewRoutes);
app.use("/api/institute-reviews", instituteReviewRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/support", supportRoutes);
app.use("/uploads", express.static("uploads"));
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
