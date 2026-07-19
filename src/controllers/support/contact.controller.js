const { sendContactMail } = require("../../config/mailer");

exports.sendContactMessage = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const name = req.user.displayName
      ? `${req.user.displayName} (${req.user.email})`
      : req.user.email;

    await sendContactMail({ name, message: message.trim() });

    return res.status(200).json({ success: true, message: "Message sent to support" });
  } catch (error) {
    console.error("Contact mail error:", error);
    return res.status(500).json({ success: false, message: "Failed to send message" });
  }
};
